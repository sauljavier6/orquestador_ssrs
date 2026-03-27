// src/controllers/vendors.controller.ts
import { QueryTypes } from "sequelize";
import VendorStaging from "../../models/SSRS/VendorStaging";
import sequelizeSSRS from "../../config/dbSSRS";
import SyncControl from "../../models/SSRS/SyncControl";
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

// Helper retry por batch
async function bulkInsertWithRetry(batch: any[], maxRetries = 3) {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      await VendorStaging.bulkCreate(batch);
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
      const result = await sequelizeSSRS.query(
        "EXEC sp_merge_vendors",
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

export const syncVendors = async (req: any, res: any) => {
  let cn;
  const startTime = new Date();

  try {
    console.log("Iniciando sincronización vendors enterprise...");

    //Lock y watchdog
    const transaction = await sequelizeSSRS.transaction();
    const sync = await SyncControl.findOne({
      where: { process_name: "vendor" },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!sync) throw new Error("No existe registro en SyncControl");

    if (
      sync.is_running &&
      (new Date().getTime() - new Date(sync.updated_at).getTime()) / 60000 < 10
    ) {
      await transaction.rollback();
      return res
        .status(200)
        .json({ success: false, message: "Proceso en ejecución" });
    }

    await SyncControl.update(
      { is_running: true, updated_at: new Date() },
      { where: { process_name: "vendor" }, transaction }
    );
    await transaction.commit();

    //Conexión NetSuite
    cn = await getNetSuiteConnection();
    const lastSyncDate = sync.last_sync_date || new Date("2024-01-01");
    const safeDate = new Date(lastSyncDate.getTime() - 5 * 60000);
    const formattedDate = safeDate
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const query = `
    SELECT
        id,
        entityid,
        companyname,
        legalname,
        fullname,
        email,
        phone,
        custentity_rfc,
        balance,
        payablesaccount,
        BUILTIN.DF(terms) AS terms,
        BUILTIN.DF(currency) AS currency,
        datecreated,
        lastmodifieddate,
        isinactive,
        BUILTIN.DF(custentity_nso_clasificacion_proveedor) AS custentity_nso_clasificacion_proveedor,
        BUILTIN.DF(custentityes_acreedor) AS custentityes_acreedor
    FROM vendor
    WHERE lastmodifieddate >= TO_DATE('${formattedDate}','YYYY-MM-DD HH24:MI:SS')
    `;
    const result = await cn.query(query);
    const cleanResult = serializeBigInt(result);

    console.log(`Vendors obtenidos: ${cleanResult.length}`);

    //Insert en staging por batch con retry y logging
    const batchSize = 300;
    for (let i = 0; i < cleanResult.length; i += batchSize) {
      const batch = cleanResult.slice(i, i + batchSize).map((v: any) => ({
        id: v.id,
        entityid: v.entityid,
        companyname: v.companyname,
        legalname: v.legalname,
        fullname: v.fullname,
        email: v.email,
        phone: v.phone,
        rfc: v.custentity_rfc,
        balance: v.balance,
        payablesaccount: v.payablesaccount,
        terms: v.terms,
        currency: v.currency,
        datecreated: v.datecreated,
        lastmodifieddate: v.lastmodifieddate,
        isinactive: v.isinactive === "T",
        clasificacionProveedor: v.custentity_nso_clasificacion_proveedor,
        tipoProveedor: v.custentityes_acreedor,
      }));

      const batchStart = new Date();
      await bulkInsertWithRetry(batch);
      const batchEnd = new Date();
      console.log(
        `Batch ${i / batchSize + 1}: ${batch.length} rows en ${(batchEnd.getTime() - batchStart.getTime()) / 1000
        }s`
      );
    }

    console.log("Datos cargados en staging");

    //Merge dentro de SP (tipado seguro)
    const mergeStart = new Date();
    const mergeResult = await executeMergeWithRetry();
    const mergeEnd = new Date();

    const duration = (mergeEnd.getTime() - startTime.getTime()) / 1000;
    const mergeDuration = (mergeEnd.getTime() - mergeStart.getTime()) / 1000;

    console.log(
      `Merge completado: insert ${mergeResult.inserted} / update ${mergeResult.updated
      } en ${mergeDuration}s`
    );

    //Actualizar SyncControl
    await SyncControl.update(
      {
        last_sync_date: new Date(),
        last_status: "SUCCESS",
        last_message: `Sync completado en ${duration}s (merge ${mergeDuration}s)`,
        updated_at: new Date(),
        is_running: false,
      },
      { where: { process_name: "vendor" } }
    );

    return res.status(200).json({
      success: true,
      total: cleanResult.length,
      duration,
      mergeStats: mergeResult
    });
  } catch (error: any) {
    console.error("Error en sincronización:", error);
    await SyncControl.update(
      {
        last_status: "FAILED",
        last_message: error.message,
        updated_at: new Date(),
        is_running: false,
      },
      { where: { process_name: "vendor" } }
    );
    return res.status(500).json({ success: false, error: error.message });
  } finally {
    if (cn) {
      await cn.close();
      console.log("ODBC cerrado");
    }
  }
};