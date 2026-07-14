// src/controllers/vendors.controller.ts
import { QueryTypes } from "sequelize";
import { getNetSuiteConnection } from "../../config/odbc";
import sequelizeCP from "../../config/dbCobranzaPro";
import CustomerStaging from "../../models/CobranzaPro/CustomerStaging";

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

// Helper retry por batch
async function bulkInsertWithRetry(batch: any[], maxRetries = 3) {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      await CustomerStaging.bulkCreate(batch);
      return;
    } catch (err) {
      attempts++;
      console.warn(`Bulk insert fallo en intento ${attempts}: ${err}`);
      if (attempts === maxRetries) throw err;
      await new Promise(res => setTimeout(res, 1000 * attempts));
    }
  }
}

// Helper retry para sp
async function executeMergeWithRetry(maxRetries = 3): Promise<MergeStats> {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      const result = await sequelizeCP.query(
        "EXEC sp_merge_customers",
        { type: QueryTypes.SELECT }
      );

      // Tomamos el primer objeto y hacemos cast a MergeStats
      const mergeResult = Array.isArray(result) && result.length > 0
        ? (result[0] as unknown as MergeStats)
        : { inserted: 0, updated: 0 };

      // Aseguramos que sean números
      return {
        inserted: Number(mergeResult.inserted) || 0,
        updated: Number(mergeResult.updated) || 0,
      };
    } catch (err) {
      attempts++;
      console.warn(`Merge SP fallo en intento ${attempts}: ${err}`);
      if (attempts === maxRetries) throw err;
      await new Promise(res => setTimeout(res, 1000 * attempts)); // espera exponencial
    }
  }

  throw new Error("Merge SP falló después de todos los intentos");
}

export const syncCustomers = async () => {
  let cn;
  const startTime = new Date();

  try {
    console.log("Iniciando sincronización customers enterprise...");

    // NETSUITE CONNECTION
    cn = await getNetSuiteConnection();

      const query = `
      SELECT 
          id,
          entityid,
          companyname,
          altname AS fullname,
          email,
          phone,
          custentity_rfc,
          receivablesaccount,
          creditlimit,
          BUILTIN.DF(terms) AS terms,
          BUILTIN.DF(currency) AS currency,
          datecreated,
          lastmodifieddate,
          isinactive,
          BUILTIN.DF(custentity_nso_clasificacion_cliente) AS custentity_nso_clasificacion_cliente,
          salesrep, 
          balancesearch,
          overduebalancesearch, 
          daysoverduesearch
      FROM customer
      WHERE category = 3
      ORDER BY
            lastmodifieddate ASC,
            id ASC
    `;

      console.log("Ejecutando query batch...");

      const result = await cn.query(query);

      const cleanResult = serializeBigInt(result);

      const batch = cleanResult.map((v: any) => ({
        id: v.id,
        entityid: v.entityid,
        companyname: v.companyname,
        fullname: v.fullname,
        email: v.email,
        phone: v.phone,
        rfc: v.custentity_rfc,
        balance: v.balancesearch,
        creditlimit: v.creditlimit,
        duebalance: v.overduebalancesearch,
        receivablesaccount: v.receivablesaccount,
        terms: v.terms,
        currency: v.currency,
        datecreated: v.datecreated,
        lastmodifieddate: v.lastmodifieddate,
        isinactive: v.isinactive,
        clasificacionCliente: v.custentity_nso_clasificacion_cliente,
        salesrep: v.salesrep,
        daysoverdue: v.daysoverduesearch
      }));

      await bulkInsertWithRetry(batch);

      console.log(`Batch procesado: ${cleanResult.length} registros`);
    

    console.log("Datos cargados en staging");

    //Merge dentro de SP (tipado seguro)
    const mergeStart = new Date();
    const mergeResult = await executeMergeWithRetry();
    const mergeEnd = new Date();

    const duration = (mergeEnd.getTime() - startTime.getTime()) / 1000;
    const mergeDuration = (mergeEnd.getTime() - mergeStart.getTime()) / 1000;

    console.log(
      `Merge completado: insert ${mergeResult.inserted} / update ${mergeResult.updated} en ${mergeDuration}s`
    );

    return {
      success: true,
      duration
    };
  } catch (error: any) {
    console.error("Error en sincronización:", error);
    return { success: false, error: error.message };
  } finally {
    if (cn) {
      await cn.close();
      console.log("ODBC cerrado");
    }
  }
};