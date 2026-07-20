import { getNetSuiteConnection } from "../../config/odbc";

type MergeStats = {
    inserted: number;
    updated: number;
};

function serializeBigInt(data: any) {
    return JSON.parse(
        JSON.stringify(data, (_, value) =>
            typeof value === "bigint" ? Number(value) : value
        )
    );
}

//Helper para reconexion 
async function queryWithReconnect(cn: any, query: string, retries = 2) {
    try {
        const result = await cn.query(query);
        return { result, connection: cn };

    } catch (error: any) {

        if (error?.odbcErrors?.[0]?.state === "08S01" && retries > 0) {

            console.warn(`💀 ODBC murió, reintentando (${retries})...`);

            try { await cn.close(); } catch { }

            const newConnection = await getNetSuiteConnection();

            return queryWithReconnect(newConnection, query, retries - 1);
        }

        throw error;
    }
}


export const syncDebug = async (req: any, res: any) => {
    let cn;

    try {
        console.log("DEBUG: Explorando estructura...");

        cn = await getNetSuiteConnection();

        // 🔹 Query de prueba
        const queryColumns = `
            SELECT
            *
            FROM transaction t
            WHERE t.type = 'CustInvc'
            AND t.memorized = 'F'
            AND t.id = 1137998
            AND UPPER(BUILTIN.DF(t.entity)) NOT LIKE '%PUBLICO EN GENERAL%'
            ORDER BY t.lastmodifieddate ASC, t.id ASC
        `;

        const response = await queryWithReconnect(cn, queryColumns);
        let result = response.result;
        cn = response.connection;

        // 🔹 Convertir BigInt → string
        result = serializeBigInt(result);

        if (!result || result.length === 0) {
            return res.status(200).json({
                success: false,
                message: "No hay datos"
            });
        }

        return res.status(200).json({
            success: true,
            result,
        });

    } catch (error: any) {

        console.error("Error debug:", error);

        return res.status(500).json({
            success: false,
            error: error.message
        });

    } finally {
        if (cn) {
            await cn.close();
            console.log("ODBC cerrado");
        }
    }
};