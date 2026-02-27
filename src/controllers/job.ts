// controller sincronización facturas
import { NetSuiteService } from "../services/nsAuth.service";

export const consumirNetsuite = async (req: any, res: any) => {
  try {
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 1000);
    const offset = (page - 1) * pageSize;

    const sql = `
      SELECT
          t.id,
          t.tranid                          AS numero_factura,
          v.entityid                        AS proveedor,
          t.trandate                        AS fecha_factura,
          t.duedate                         AS fecha_vencimiento,
          ABS(t.foreigntotal)               AS importe_factura,
          ABS(t.foreignamountunpaid)        AS importe_adeudado,
          t.memo
      FROM transaction t
      JOIN vendor v ON v.id = t.entity
      WHERE t.type = 'VendBill'
        AND t.foreignamountunpaid > 0
      ORDER BY t.trandate
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageSize} ROWS ONLY
    `;

    const data = (await NetSuiteService.getdata(sql)).map(
      ({ links, ...rest }: any) => rest,
    );

    res.status(200).json({
      page,
      pageSize,
      records: data.length,
      hasMore: data.length === pageSize,
      data,
    });
  } catch (error: any) {
    console.error("Error sincronizando:", error);
    res.status(500).json({
      message: "Error sincronizando",
      error: error.message,
    });
  }
};
