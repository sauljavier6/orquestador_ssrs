import type { Connection } from "odbc";
import { getNetSuiteConnection } from "../../config/odbc";
import ExcelJS from "exceljs";

async function getTicketsFromExcel(fileBuffer: Buffer): Promise<string[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    const worksheet = workbook.worksheets[0];

    const tickets: string[] = [];

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const cell = row.getCell(1);

        const value =
            cell.text ||
            cell.value;

        if (value) {
            tickets.push(String(value).trim());
        }
    });

    return tickets;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }

    return chunks;
}

function safeTicket(ticket: string) {
    return String(ticket).replace(/'/g, "''").trim();
}

function buildQuery(tickets: string[]) {
    const inTickets = tickets
        .filter(Boolean)
        .map(t => `'${safeTicket(t)}'`)
        .join(",");

    return `
SELECT
    b.tipo AS TIPO,
    b.ticket AS TICKET,
    b.item AS CODIGO,
    b.description AS DESCRIPCION,
    ABS(b.foreignamount) AS BASE,

    NVL(SUM(
        CASE
            WHEN l.description LIKE 'IEPS%' THEN ABS(l.foreignamount)
            ELSE 0
        END
    ), 0) AS IEPS,

    NVL(SUM(
        CASE
            WHEN l.description LIKE 'D DESC%' THEN ABS(l.foreignamount)
            ELSE 0
        END
    ), 0) AS DESCUENTO,

    ABS(b.foreignamount)
    + NVL(SUM(CASE WHEN l.description LIKE 'IEPS%' THEN ABS(l.foreignamount) ELSE 0 END), 0)
    - NVL(SUM(CASE WHEN l.description LIKE 'D DESC%' THEN ABS(l.foreignamount) ELSE 0 END), 0) AS TOTAL

FROM (
    SELECT
        t.id AS transaction_id,
        BUILTIN.DF(t.type) AS tipo,
        t.tranid AS ticket,
        tl.uniquekey,
        tl.linesequencenumber,
        tl.item,
        COALESCE(tl.memo, i.itemid) AS description,
        tl.foreignamount,
        (
            SELECT MIN(tl2.linesequencenumber)
            FROM Transaction t2
            INNER JOIN TransactionLine tl2
                ON t2.id = tl2.transaction
            LEFT JOIN Item i2
                ON tl2.item = i2.id
            WHERE t2.id = t.id
              AND tl2.linesequencenumber > tl.linesequencenumber
              AND tl2.mainline = 'F'
              AND tl2.taxcode = 11
              AND NVL(tl2.item, 0) != 11
              AND COALESCE(tl2.memo, i2.itemid) NOT LIKE 'D DESC%'
              AND COALESCE(tl2.memo, i2.itemid) NOT LIKE 'IEPS%'
              AND COALESCE(tl2.memo, i2.itemid) != 'Ajuste Ticket'
        ) AS next_base_line
    FROM Transaction t
    INNER JOIN TransactionLine tl
        ON t.id = tl.transaction
    LEFT JOIN Item i
        ON tl.item = i.id
    WHERE t.tranid IN (${inTickets})
      AND t.type IN ('CustInvc', 'CustCred')
      AND t.memorized = 'F'
      AND t.voided = 'F'
      AND tl.mainline = 'F'
      AND tl.taxcode = 11
      AND NVL(tl.item, 0) != 11
      AND COALESCE(tl.memo, i.itemid) NOT LIKE 'D DESC%'
      AND COALESCE(tl.memo, i.itemid) NOT LIKE 'IEPS%'
      AND COALESCE(tl.memo, i.itemid) != 'Ajuste Ticket'
) b

LEFT JOIN (
    SELECT
        t.id AS transaction_id,
        tl.linesequencenumber,
        COALESCE(tl.memo, i.itemid) AS description,
        tl.foreignamount
    FROM Transaction t
    INNER JOIN TransactionLine tl
        ON t.id = tl.transaction
    LEFT JOIN Item i
        ON tl.item = i.id
    WHERE t.tranid IN (${inTickets})
      AND t.type IN ('CustInvc', 'CustCred')
      AND t.memorized = 'F'
      AND t.voided = 'F'
      AND tl.mainline = 'F'
      AND tl.taxcode = 11
      AND NVL(tl.item, 0) != 11
) l
    ON l.transaction_id = b.transaction_id
   AND l.linesequencenumber > b.linesequencenumber
   AND l.linesequencenumber < NVL(b.next_base_line, 999999999)

GROUP BY
    b.tipo,
    b.ticket,
    b.item,
    b.description,
    b.foreignamount,
    b.linesequencenumber

ORDER BY
    b.ticket,
    b.linesequencenumber
`;
}

function normalizeBigInt(value: any): any {
    if (typeof value === "bigint") {
        return value.toString();
    }

    if (Array.isArray(value)) {
        return value.map(normalizeBigInt);
    }

    if (value && typeof value === "object") {
        const obj: any = {};
        for (const key of Object.keys(value)) {
            obj[key] = normalizeBigInt(value[key]);
        }
        return obj;
    }

    return value;
}

export const getTicketsBase0 = async (req: any, res: any) => {
    let connection: Connection | null = null;

    try {
        let tickets: string[] = [];

        console.log("FILE:", req.file?.originalname);
        console.log("SIZE:", req.file?.size);

        if (req.file?.buffer) {
            tickets = await getTicketsFromExcel(req.file.buffer);
        } else {
            tickets = req.body?.tickets || [];
        }

        console.log("TOTAL TICKETS:", tickets.length);
        console.log("PRIMEROS 10:", tickets.slice(0, 10));

        if (!Array.isArray(tickets) || tickets.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Debes enviar un arreglo de tickets",
            });
        }

        connection = await getNetSuiteConnection();

        const chunks = chunkArray(tickets, 500);
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="base0_tickets.xlsx"`
        );

        const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
            stream: res,
            useStyles: true,
            useSharedStrings: false,
        });

        const MAX_ROWS_PER_SHEET = 1_000_000;

        let sheetIndex = 1;
        let rowCountInSheet = 0;
        let worksheet: any;

        function createWorksheet() {
            const ws = workbook.addWorksheet(`Base 0_${sheetIndex}`);

            ws.columns = [
                { header: "TIPO", key: "tipo", width: 22 },
                { header: "TICKET", key: "ticket", width: 32 },
                { header: "CODIGO", key: "codigo", width: 12 },
                { header: "DESCRIPCION", key: "descripcion", width: 55 },
                { header: "BASE", key: "base", width: 14 },
                { header: "IEPS", key: "ieps", width: 14 },
                { header: "DESCUENTO", key: "descuento", width: 14 },
                { header: "TOTAL", key: "total", width: 14 },
            ];

            ws.getRow(1).eachCell((cell) => {
                cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FF1F4E78" },
                };
                cell.alignment = { vertical: "middle", horizontal: "center" };
            });

            ["E", "F", "G", "H"].forEach((col) => {
                ws.getColumn(col).numFmt = '#,##0.00';
            });

            rowCountInSheet = 1; // encabezado
            return ws;
        }

        worksheet = createWorksheet();

        let totalRows = 0;

        for (let index = 0; index < chunks.length; index++) {
            const chunk = chunks[index];

            console.log(`Procesando lote ${index + 1}/${chunks.length}`);
            console.log("Primer ticket:", chunk[0]);

            const query = buildQuery(chunk);
            const data: any[] = await connection.query(query);

            console.log("Resultados encontrados:", data.length);

            for (const r of data) {

                const row = normalizeBigInt(r);
                if (rowCountInSheet >= MAX_ROWS_PER_SHEET) {
                    worksheet.commit();

                    sheetIndex++;
                    worksheet = createWorksheet();
                }

                worksheet.addRow({
                    tipo: row.tipo ?? row.TIPO,
                    ticket: row.ticket ?? row.TICKET,
                    codigo: row.codigo ?? row.CODIGO,
                    descripcion: row.descripcion ?? row.DESCRIPCION,
                    base: Number(row.base ?? row.BASE ?? 0),
                    ieps: Number(row.ieps ?? row.IEPS ?? 0),
                    descuento: Number(row.descuento ?? row.DESCUENTO ?? 0),
                    total: Number(row.total ?? row.TOTAL ?? 0),
                }).commit();

                totalRows++;

                rowCountInSheet++;
            }
        }

        console.log("TOTAL FILAS EXCEL:", totalRows);

        worksheet.commit();
        await workbook.commit();

        return;

    } catch (error: any) {
        console.error("Error ODBC NetSuite:", error);

        return res.status(500).json({
            success: false,
            message: "Error consultando NetSuite por ODBC",
            error: error.message,
        });

    } finally {
        if (connection) {
            await connection.close();
        }
    }
};