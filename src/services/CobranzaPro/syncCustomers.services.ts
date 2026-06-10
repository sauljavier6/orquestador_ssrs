// src/controllers/vendors.controller.ts
import { QueryTypes } from "sequelize";
import SyncControl from "../../models/CobranzaPro/SyncControl";
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

    //Lock y watchdog
    const transaction = await sequelizeCP.transaction();
    const sync = await SyncControl.findOne({
      where: { process_name: "customer" },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!sync) throw new Error("No existe registro en SyncControl");

    if (
      sync.is_running &&
      (new Date().getTime() - new Date(sync.updated_at).getTime()) / 60000 < 10
    ) {
      await transaction.rollback();
      return { success: false, message: "Proceso en ejecución" };
    }

    await SyncControl.update(
      { is_running: true, updated_at: new Date() },
      { where: { process_name: "customer" }, transaction }
    );
    await transaction.commit();

    // NETSUITE CONNECTION
    cn = await getNetSuiteConnection();

    let lastSyncDate: string;

    const d = new Date(sync.last_sync_date);

    lastSyncDate =
      d.getUTCFullYear() + "-" +
      String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(d.getUTCDate()).padStart(2, "0") + " " +
      String(d.getUTCHours()).padStart(2, "0") + ":" +
      String(d.getUTCMinutes()).padStart(2, "0") + ":" +
      String(d.getUTCSeconds()).padStart(2, "0");

    let lastId = sync.last_internal_id || 0;

    const batchSize = 1500;

    let totalFetched = 0;
    let hasMore = true;

    while (hasMore) {
      const formattedDate = lastSyncDate;
      console.log('Iniciando sync con fecha:', formattedDate)

      const query = `
      SELECT TOP ${batchSize}
          id,
          entityid,
          companyname,
          altname AS fullname,
          email,
          phone,
          balancesearch as balance,
          custentity_rfc,
          receivablesaccount,
          overduebalancesearch,
          creditlimit,
          BUILTIN.DF(terms) AS terms,
          BUILTIN.DF(currency) AS currency,
          datecreated,
          lastmodifieddate,
          isinactive,
          BUILTIN.DF(custentity_nso_clasificacion_cliente) AS custentity_nso_clasificacion_cliente,
          salesrep
      FROM customer
      WHERE
      (
        lastmodifieddate > {ts '${formattedDate}'}
        OR (
        lastmodifieddate = {ts '${formattedDate}'}
                AND id > ${lastId}
        )
      )
      AND category = 3
      ORDER BY
            lastmodifieddate ASC,
            id ASC
    `;

      console.log("Ejecutando query batch...");

      const result = await cn.query(query);

      const cleanResult = serializeBigInt(result);

      if (cleanResult.length === 0) {
        hasMore = false;
        break;
      }

      const batch = cleanResult.map((v: any) => ({
        id: v.id,
        entityid: v.entityid,
        companyname: v.companyname,
        fullname: v.fullname,
        email: v.email,
        phone: v.phone,
        rfc: v.custentity_rfc,
        balance: v.balance,
        creditlimit: v.creditlimit,
        duebalance: v.overduebalancesearch,
        receivablesaccount: v.receivablesaccount,
        terms: v.terms,
        currency: v.currency,
        datecreated: v.datecreated,
        lastmodifieddate: v.lastmodifieddate,
        isinactive: v.isinactive,
        clasificacionCliente: v.custentity_nso_clasificacion_cliente,
        salesrep: v.salesrep
      }));

      await bulkInsertWithRetry(batch);

      const lastRecord = cleanResult[cleanResult.length - 1];

      lastId = lastRecord.id;
      lastSyncDate = lastRecord.lastmodifieddate;
      console.log('fecha netsuite', lastRecord.lastmodifieddate)

      totalFetched += cleanResult.length;

      console.log(`Batch procesado: ${cleanResult.length} registros`);
      console.log(`Cursor -> date:${lastSyncDate} line:${lastId}`);
    }

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

    await SyncControl.update(
      {
        last_sync_date: new Date(),
        last_status: "SUCCESS",
        last_message: `Sync completado en ${duration}s (merge ${mergeDuration}s)`,
        updated_at: new Date(),
        is_running: false
      },
      { where: { process_name: "customer" } }
    );

    return {
      success: true,
      total: totalFetched,
      duration
    };
  } catch (error: any) {
    console.error("Error en sincronización:", error);
    await SyncControl.update(
      {
        last_status: "FAILED",
        last_message: error.message,
        updated_at: new Date(),
        is_running: false,
      },
      { where: { process_name: "customer" } }
    );
    return { success: false, error: error.message };
  } finally {
    if (cn) {
      await cn.close();
      console.log("ODBC cerrado");
    }
  }
};