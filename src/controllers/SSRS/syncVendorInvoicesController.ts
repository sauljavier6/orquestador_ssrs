// src/controllers/vendors.controller.ts
import { QueryTypes } from "sequelize";
import VendorInvoiceStaging from "../../models/SSRS/VendorInvoiceStaging";
import sequelizeSSRS from "../../config/dbSSRS";
import SyncControl from "../../models/SSRS/SyncControl";
import VendorInvoiceLineStaging from "../../models/SSRS/VendorInvoiceLineStaging";
import { getNetSuiteConnection } from "../../config/odbc";
import VendorInvoicePaymentStaging from "../../models/SSRS/VendorInvoicePaymentStaging";


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


//Listooooooooooooooooooo
// Helper retry por batch
async function bulkInsertWithRetry(batch: any[], maxRetries = 3) {
  const chunkSize = 200; // puedes ajustar según tu DB y tamaño de batch

  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize);

    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        await VendorInvoiceStaging.bulkCreate(chunk, {
          validate: false,  // desactiva validaciones si quieres más velocidad
          returning: false, // evita traer registros insertados si no es necesario
        });

        break; // chunk insertado correctamente, salimos del while

      } catch (err) {
        attempts++;
        console.warn(`Bulk insert fallo intento ${attempts} para chunk ${i / chunkSize + 1}:`, err);

        if (attempts >= maxRetries) throw err;

        // Espera exponencial antes de reintentar
        await new Promise(res => setTimeout(res, 1000 * attempts));
      }
    }
  }
}
// Helper retry para sp
async function executeMergeWithRetry(maxRetries = 3): Promise<MergeStats> {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      const result = await sequelizeSSRS.query(
        "EXEC sp_merge_vendorInvoices",
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
// src/controllers/vendors.controller.ts
export const syncVendorInvoices = async (req: any, res: any) => {
  let cn;
  const startTime = new Date();

  try {
    console.log("Iniciando sincronización vendors invoices enterprise...");

    // LOCK
    const transaction = await sequelizeSSRS.transaction();
    const sync = await SyncControl.findOne({
      where: { process_name: "vendorinvoice" },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!sync) throw new Error("No existe registro en SyncControl");

    if (
      sync.is_running &&
      sync.updated_at &&
      (Date.now() - new Date(sync.updated_at).getTime()) / 60000 < 10
    ) {
      await transaction.rollback();
      return res.status(200).json({
        success: false,
        message: "Proceso en ejecución"
      });
    }

    await SyncControl.update(
      { is_running: true, updated_at: new Date() },
      { where: { process_name: "vendorinvoice" }, transaction }
    );
    await transaction.commit();

    // NETSUITE
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

    const batchSize = 1000;
    let totalFetched = 0;
    let hasMore = true;
    let resultadostest;

    while (hasMore) {

      const formattedDate = lastSyncDate;
      console.log('Iniciando sync con fecha:', formattedDate)

      // Query paginada por batch
      const query = `
        SELECT TOP ${batchSize}
            t.id,
            t.tranid,
            t.entity,
            t.trandate,
            t.duedate,
            t.foreigntotal,
            t.foreignamountpaid,
            t.foreignamountunpaid,
            t.custbody_taxtotal,
            BUILTIN.DF(tl.location) AS location,
            BUILTIN.DF(tl.createdfrom) AS purchaseorder,
            t.custbody_nso_fecha_pago,
            t.custbody_nso_fecha_cancelacion,
            BUILTIN.DF(t.custbody_nso_tipo_compra) AS custbody_nso_tipo_compra,
            BUILTIN.DF(t.custbody_status_po_budget) AS custbody_status_po_budget,
            t.custbody_nso_causa_dev_proveedor,
            t.status,
            BUILTIN.DF(t.currency) AS currency,
            t.lastmodifieddate,
            t.voided
        FROM transaction t
        LEFT JOIN transactionline tl 
            ON t.id = tl.transaction
            --AND tl.mainline = 'T'
        WHERE t.type = 'VendBill'
        AND t.voided = 'F'
        AND t.id = 78619280
        AND (
              t.lastmodifieddate > {ts '${formattedDate}'}
              OR (t.lastmodifieddate = {ts '${formattedDate}'} AND t.id > ${lastId})
            )
        ORDER BY t.lastmodifieddate ASC, t.id ASC
      `;

      console.log("Ejecutando query batch...");
      const result = await cn.query(query);
      const cleanResult = serializeBigInt(result);
      resultadostest = cleanResult

      if (cleanResult.length === 0) {
        hasMore = false;
        break;
      }

      // Mapear y preparar batch
      const batch = cleanResult.map((v: any) => {

        const amount = v.foreigntotal != null ? Math.abs(Number(v.foreigntotal)) : 0;
        const tax = v.custbody_taxtotal != null ? Math.abs(Number(v.custbody_taxtotal)) : 0;
        const amountPaid = v.foreignamountpaid != null ? Math.abs(Number(v.foreignamountpaid)) : 0;
        const balance = v.foreignamountunpaid != null ? Math.abs(Number(v.foreignamountunpaid)) : 0;

        return {
          id: Number(v.id),
          tranid: v.tranid || "",
          entity: v.entity != null ? Number(v.entity) : null,
          trandate: v.trandate ? new Date(v.trandate) : null,
          duedate: v.duedate ? new Date(v.duedate) : null,
          amount: amount,
          tax: tax,
          subtotal: amount - tax,
          amountpaid: amountPaid,
          balance: balance,
          location: v.location,
          purchaseorder: v.purchaseorder,
          fechapago: v.custbody_nso_fecha_pago,
          fechacancelacion: v.custbody_nso_fecha_cancelacion,
          tipocompra: v.custbody_nso_tipo_compra || null,
          estatuspresupuesto: v.custbody_status_po_budget || null,
          causadevolucionproveedor: v.custbody_nso_causa_dev_proveedor || null,
          status: v.status || "",
          currency: v.currency,
          lastmodifieddate: v.lastmodifieddate,
          isinactive: v.voided === "T" ? 1 : 0
        };
      });

      // Insert con retry
      await bulkInsertWithRetry(batch);

      // Actualizamos lastId y totalFetched
      const lastRecord = cleanResult[cleanResult.length - 1];
      lastId = lastRecord.id;
      lastSyncDate = lastRecord.lastmodifieddate;

      console.log('fecha netsuite', lastRecord.lastmodifieddate, 'ULTIMO ID', lastId)

      totalFetched += cleanResult.length;
      console.log(`Batch procesado: ${cleanResult.length} registros`);
    }

    console.log("Todos los datos cargados en staging");

    // MERGE
    const mergeStart = new Date();
    const mergeResult = await executeMergeWithRetry();
    const mergeEnd = new Date();

    const duration = (mergeEnd.getTime() - startTime.getTime()) / 1000;
    const mergeDuration = (mergeEnd.getTime() - mergeStart.getTime()) / 1000;

    console.log(
      `Merge completado: insert ${mergeResult.inserted} / update ${mergeResult.updated} en ${mergeDuration}s`
    );

    // UPDATE SYNC CONTROL
    if (totalFetched === 0) {
      console.log("⚠️ No hubo datos, NO se actualiza last_sync_date");
    }

    // UPDATE SYNC CONTROL
    await SyncControl.update(
      {
        last_sync_date: new Date(Date.now() - 5 * 60 * 1000),
        last_internal_id: lastId,
        last_status: "SUCCESS",
        last_message: `Sync completado en ${duration}s (merge ${mergeDuration}s)`,
        updated_at: new Date(),
        is_running: false
      },
      { where: { process_name: "vendorinvoice" } }
    );


    return res.status(200).json({
      success: true,
      total: totalFetched,
      duration,
      mergeStats: mergeResult,
      resultadostest
    });

  } catch (error: any) {

    console.error("Error en sincronización:", error);

    await SyncControl.update(
      {
        last_status: "FAILED",
        last_message: error.message,
        updated_at: new Date(),
        is_running: false
      },
      { where: { process_name: "vendorinvoice" } }
    );

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


//Listooooooooooooooooooo
// Helper retry por batch
async function bulkInsertWithRetryForLines(batch: any[], maxRetries = 3) {

  const chunkSize = 100;

  for (let i = 0; i < batch.length; i += chunkSize) {

    const chunk = batch.slice(i, i + chunkSize);

    let attempts = 0;

    while (attempts < maxRetries) {
      try {

        await VendorInvoiceLineStaging.bulkCreate(chunk, {
          validate: false,
          returning: false
        });

        break;

      } catch (err) {

        attempts++;

        console.warn(`Bulk insert fallo intento ${attempts}:`, err);

        if (attempts >= maxRetries) throw err;

        await new Promise(r => setTimeout(r, 1000 * attempts));
      }
    }
  }
}
// Helper retry para sp
async function executeMergeWithRetryForLines(maxRetries = 3): Promise<MergeStats> {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      const result = await sequelizeSSRS.query(
        "EXEC sp_merge_vendorInvoiceLines",
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
//endpoint para lineas de facturas
export const syncVendorInvoiceLines = async (req: any, res: any) => {
  let cn;
  const startTime = new Date();

  try {

    console.log("Iniciando sincronización vendor invoice lines...");

    // LOCK
    const transaction = await sequelizeSSRS.transaction();

    const sync = await SyncControl.findOne({
      where: { process_name: "vendorinvoicelines" },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!sync) throw new Error("No existe registro en SyncControl");

    if (
      sync.is_running &&
      sync.updated_at &&
      (Date.now() - new Date(sync.updated_at).getTime()) / 60000 < 10
    ) {
      await transaction.rollback();
      return res.status(200).json({
        success: false,
        message: "Proceso en ejecución"
      });
    }

    await SyncControl.update(
      { is_running: true, updated_at: new Date() },
      { where: { process_name: "vendorinvoicelines" }, transaction }
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

    const batchSize = 1000;

    let totalFetched = 0;
    let hasMore = true;

    while (hasMore) {
      const formattedDate = lastSyncDate;
      console.log('Iniciando sync con fecha:', formattedDate)

      const query = `
        SELECT TOP ${batchSize}
            tl.uniquekey AS lineuniquekey,
            tl.transaction AS vendor_invoice_id,

            tl.id AS lineorder,
            BUILTIN.DF(tl.item) AS item,
            tl.memo AS description,

            tl.quantity,
            BUILTIN.DF(tl.units) AS units,

            tl.rate,
            tl.netamount AS amount,

            BUILTIN.DF(tl.taxcode) AS taxcode,

            tl.ratepercent,
            tl.taxtype,
            tl.itemtype,

            BUILTIN.DF(tl.expenseaccount) AS account,
            BUILTIN.DF(tl.department) AS department,
            BUILTIN.DF(tl.class) AS class,
            BUILTIN.DF(tl.location) AS location,

            t.createddate AS createddate,
            t.lastmodifieddate AS lastmodifieddate

        FROM transactionline tl
        JOIN transaction t
            ON t.id = tl.transaction
        WHERE t.type = 'VendBill'
        AND tl.mainline = 'F'
        AND tl.item <> 34452
        AND 
         (
            t.lastmodifieddate > {ts '${formattedDate}'}
            OR (
                t.lastmodifieddate = {ts '${formattedDate}'}
                AND tl.uniquekey > ${lastId}
            )
        )
        ORDER BY
            t.lastmodifieddate ASC, tl.uniquekey ASC
      `;

      console.log("Ejecutando query batch...");

      const response = await queryWithReconnect(cn, query);

      const result = response.result;
      cn = response.connection;

      const cleanResult = serializeBigInt(result);

      if (cleanResult.length === 0) {
        hasMore = false;
        break;
      }

      const batch = cleanResult.map((l: any) => ({
        lineuniquekey: Number(l.lineuniquekey),
        lineorder: Number(l.lineorder),
        vendor_invoice_id: Number(l.vendor_invoice_id),
        item: l.item || "",
        description: l.description || "",
        quantity: l.quantity != null ? Number(l.quantity) : 0,
        units: l.units || "",
        rate: l.rate != null ? Math.abs(Number(l.rate)) : 0,
        amount: l.amount != null ? Math.abs(Number(l.amount)) : 0,
        taxcode: l.taxcode,
        ratepercent: l.ratepercent != null ? Math.abs(Number(l.ratepercent)) : 0,
        taxtype: l.taxtype,
        itemtype: l.itemtype,
        account: l.account || "",
        department: l.department || "",
        class: l.class || "",
        location: l.location || "",
        createddate: l.createddate,
        lastmodifieddate: l.lastmodifieddate,
      }));

      await bulkInsertWithRetryForLines(batch);

      const lastRecord = cleanResult[cleanResult.length - 1];
      lastId = lastRecord.lineuniquekey;
      lastSyncDate = lastRecord.lastmodifieddate;

      console.log('fecha netsuite', lastRecord.lastmodifieddate, 'ULTIMO ID', lastId)

      totalFetched += cleanResult.length;

      console.log(`Batch procesado: ${cleanResult.length} registros`);
    }

    console.log("Todos los datos cargados en staging (lines)");

    // MERGE
    const mergeStart = new Date();
    const mergeResult = await executeMergeWithRetryForLines();
    const mergeEnd = new Date();

    const duration = (mergeEnd.getTime() - startTime.getTime()) / 1000;
    const mergeDuration = (mergeEnd.getTime() - mergeStart.getTime()) / 1000;

    console.log(
      `Merge completado: insert ${mergeResult.inserted} / update ${mergeResult.updated} en ${mergeDuration}s`
    );

    if (totalFetched === 0) {
      console.log("⚠️ No hubo datos, NO se actualiza last_sync_date");
    }

    await SyncControl.update(
      {
        last_sync_date: new Date(lastSyncDate.replace(" ", "T") + "Z"),
        last_internal_id: lastId,
        last_status: "SUCCESS",
        last_message: `Sync lines completado en ${duration}s`,
        updated_at: new Date(),
        is_running: false
      },
      { where: { process_name: "vendorinvoicelines" } }
    );



    return res.status(200).json({
      success: true,
      total: totalFetched,
      duration
    });

  } catch (error: any) {

    console.error("Error en sincronización lines:", error);

    await SyncControl.update(
      {
        last_status: "FAILED",
        last_message: error.message,
        updated_at: new Date(),
        is_running: false
      },
      { where: { process_name: "vendorinvoicelines" } }
    );

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


//Listooooooooooooooooooo
// Helper retry por batch
async function bulkInsertWithRetryForPayments(batch: any[], maxRetries = 3) {

  const chunkSize = 100;

  for (let i = 0; i < batch.length; i += chunkSize) {

    const chunk = batch.slice(i, i + chunkSize);

    let attempts = 0;

    while (attempts < maxRetries) {
      try {

        await VendorInvoicePaymentStaging.bulkCreate(chunk, {
          validate: false,
          returning: false
        });

        break;

      } catch (err) {

        attempts++;

        console.warn(`Bulk insert fallo intento ${attempts}:`, err);

        if (attempts >= maxRetries) throw err;

        await new Promise(r => setTimeout(r, 1000 * attempts));
      }
    }
  }
}
// Helper retry para sp
async function executeMergeWithRetryForPayments(maxRetries = 3): Promise<MergeStats> {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      const result = await sequelizeSSRS.query(
        "EXEC sp_merge_vendorInvoicePayments",
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
//endpoint para pagos de facturas
export const syncVendorInvoicePayments = async (req: any, res: any) => {
  let cn;
  const startTime = new Date();

  try {

    console.log("Iniciando sincronización vendor invoice payments...");

    // LOCK
    const transaction = await sequelizeSSRS.transaction();

    const sync = await SyncControl.findOne({
      where: { process_name: "vendorinvoicepayments" },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!sync) throw new Error("No existe registro en SyncControl");

    if (
      sync.is_running &&
      sync.updated_at &&
      (Date.now() - new Date(sync.updated_at).getTime()) / 60000 < 10
    ) {
      await transaction.rollback();
      return res.status(200).json({
        success: false,
        message: "Proceso en ejecución"
      });
    }

    await SyncControl.update(
      { is_running: true, updated_at: new Date() },
      { where: { process_name: "vendorinvoicepayments" }, transaction }
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

    const batchSize = 1000;

    let totalFetched = 0;
    let hasMore = true;

    while (hasMore) {
      const formattedDate = lastSyncDate;
      console.log('Iniciando sync con fecha:', formattedDate)

      const query = `
        SELECT TOP ${batchSize}

            cb.id                        AS link_id,
            p.id                         AS payment_id,
            b.id                         AS invoice_id,

            p.tranid                     AS payment_tranid,
            p.trandate                   AS payment_trandate,
            p.foreignpaymentamountused   AS foreigntotal,
            BUILTIN.DF(p.currency)       AS currency,
            p.foreignpaymentamountunused AS balance,
            p.lastmodifieddate           AS payment_lastmodified,
            p.status                     AS payment_status,

            b.entity                     AS vendor,
            
            b.tranid                     AS invoice_tranid,
            b.trandate                   AS invoice_trandate,
            b.duedate                    AS invoice_duedate,

            cb.custrecord_amountremaining,
            cb.lastmodified              AS link_lastmodified

        FROM transaction p

        JOIN customrecord_ap_pagos_bills cb
            ON cb.custrecord_vendorpayment = p.id

        JOIN transaction b
            ON b.id = cb.custrecord_paying_bill
          AND b.type = 'VendBill'

        WHERE p.type = 'VendPymt'
        AND p.voided = 'F'
        AND p.memo NOT LIKE '%DONACION%'
        AND (
            cb.lastmodified > {ts '${formattedDate}'}
            OR (
                cb.lastmodified = {ts '${formattedDate}'}
                AND cb.id > ${lastId}
            )
        )

        ORDER BY
            cb.lastmodified ASC,
            cb.id ASC
      `;

      console.log("Ejecutando query batch...");

      const response = await queryWithReconnect(cn, query);

      const result = response.result;
      cn = response.connection;

      const cleanResult = serializeBigInt(result);

      if (cleanResult.length === 0) {
        hasMore = false;
        break;
      }

      const batch = cleanResult.map((l: any) => ({
        // Claves primarias
        link_id: l.link_id,
        payment_id: l.payment_id,
        invoice_id: l.invoice_id,

        // Información del pago
        payment_tranid: l.payment_tranid,
        payment_trandate: l.payment_trandate,
        foreigntotal: l.foreigntotal,
        balance: l.balance,
        currency: l.currency,
        payment_status: l.payment_status,
        payment_lastmodified: l.payment_lastmodified,

        // Vendor
        vendor: l.vendor,

        // Información de la factura
        invoice_tranid: l.invoice_tranid,
        invoice_trandate: l.invoice_trandate,
        invoice_duedate: l.invoice_duedate,

        // Amount remaining en el custom record
        custrecord_amountremaining: l.custrecord_amountremaining,
        link_lastmodified: l.link_lastmodified,
      }));

      await bulkInsertWithRetryForPayments(batch);

      const lastRecord = cleanResult[cleanResult.length - 1];

      // Cursor para siguiente batch
      lastId = lastRecord.link_id;
      lastSyncDate = lastRecord.link_lastmodified;
      console.log('fecha netsuite', lastRecord.link_id)

      totalFetched += cleanResult.length;

      console.log(`Batch procesado: ${cleanResult.length} registros`);
      console.log(`Cursor -> date:${lastSyncDate} line:${lastId}`);
    }

    console.log("Todos los datos cargados en staging (payments)");

    // MERGE
    const mergeStart = new Date();
    const mergeResult = await executeMergeWithRetryForPayments();
    const mergeEnd = new Date();

    const duration = (mergeEnd.getTime() - startTime.getTime()) / 1000;
    const mergeDuration = (mergeEnd.getTime() - mergeStart.getTime()) / 1000;

    console.log(
      `Merge completado: insert ${mergeResult.inserted} / update ${mergeResult.updated} en ${mergeDuration}s`
    );

    if (totalFetched === 0) {
      console.log("⚠️ No hubo datos, NO se actualiza last_sync_date");
    }

    await SyncControl.update(
      {
        last_sync_date: new Date(lastSyncDate.replace(" ", "T") + "Z"),
        last_internal_id: lastId,
        last_status: "SUCCESS",
        last_message: `Sync payments completado en ${duration}s`,
        updated_at: new Date(),
        is_running: false
      },
      { where: { process_name: "vendorinvoicepayments" } }
    );

    return res.status(200).json({
      success: true,
      total: totalFetched,
      duration
    });

  } catch (error: any) {

    console.error("Error en sincronización pagos:", error);

    await SyncControl.update(
      {
        last_status: "FAILED",
        last_message: error.message,
        updated_at: new Date(),
        is_running: false
      },
      { where: { process_name: "vendorinvoicepayments" } }
    );

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

// Helper retry por batch
async function bulkInsertWithRetryForCreditMemo(batch: any[], maxRetries = 3) {

  const chunkSize = 100;

  for (let i = 0; i < batch.length; i += chunkSize) {

    const chunk = batch.slice(i, i + chunkSize);

    let attempts = 0;

    while (attempts < maxRetries) {
      try {

        await VendorInvoicePaymentStaging.bulkCreate(chunk, {
          validate: false,
          returning: false
        });

        break;

      } catch (err) {

        attempts++;

        console.warn(`Bulk insert fallo intento ${attempts}:`, err);

        if (attempts >= maxRetries) throw err;

        await new Promise(r => setTimeout(r, 1000 * attempts));
      }
    }
  }
}
// Helper retry para sp
async function executeMergeWithRetryForCreditMemo(maxRetries = 3): Promise<MergeStats> {
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      const result = await sequelizeSSRS.query(
        "EXEC sp_merge_vendorInvoicePayments",
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
//endpoint para pagos de facturas
export const syncVendorInvoiceCreditMemo = async (req: any, res: any) => {
  let cn;
  const startTime = new Date();

  try {

    console.log("Iniciando sincronización vendor invoice payments...");

    // LOCK
    const transaction = await sequelizeSSRS.transaction();

    const sync = await SyncControl.findOne({
      where: { process_name: "vendorinvoicepayments" },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!sync) throw new Error("No existe registro en SyncControl");

    if (
      sync.is_running &&
      sync.updated_at &&
      (Date.now() - new Date(sync.updated_at).getTime()) / 60000 < 10
    ) {
      await transaction.rollback();
      return res.status(200).json({
        success: false,
        message: "Proceso en ejecución"
      });
    }

    await SyncControl.update(
      { is_running: true, updated_at: new Date() },
      { where: { process_name: "vendorinvoicepayments" }, transaction }
    );

    await transaction.commit();

    // NETSUITE CONNECTION
    cn = await getNetSuiteConnection();

    let lastSyncDate: string;

    lastSyncDate = sync.last_sync_date
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    let lastId = sync.last_internal_id || 0;

    const batchSize = 1500;

    let totalFetched = 0;
    let hasMore = true;

    while (hasMore) {

      const formattedDate = lastSyncDate.trim();
      console.log('Iniciando sync con fecha:', formattedDate)

      const query = `
        SELECT TOP ${batchSize}

            cb.id                        AS link_id,
            p.id                         AS payment_id,
            b.id                         AS invoice_id,

            p.tranid                     AS payment_tranid,
            p.trandate                   AS payment_trandate,
            p.foreignpaymentamountused   AS foreigntotal,
            BUILTIN.DF(p.currency)       AS currency,
            p.foreignpaymentamountunused AS balance,
            p.lastmodifieddate           AS payment_lastmodified,
            p.status                     AS payment_status,

            b.entity                     AS vendor,
            
            b.tranid                     AS invoice_tranid,
            b.trandate                   AS invoice_trandate,
            b.duedate                    AS invoice_duedate,

            cb.custrecord_amountremaining,
            cb.lastmodified              AS link_lastmodified

        FROM transaction p

        JOIN customrecord_ap_pagos_bills cb
            ON cb.custrecord_vendorpayment = p.id

        JOIN transaction b
            ON b.id = cb.custrecord_paying_bill
          AND b.type = 'VendBill'

        WHERE p.type = 'VendPymt'
        AND p.voided = 'F'
        AND p.memo NOT LIKE '%DONACION%'
        AND (
            cb.lastmodified > {ts '${formattedDate}'}
            OR (
                cb.lastmodified = {ts '${formattedDate}'}
                AND cb.id > ${lastId}
            )
        )

        ORDER BY
            cb.lastmodified ASC,
            cb.id ASC
      `;

      console.log("Ejecutando query batch...");

      const result = await cn.query(query);

      const cleanResult = serializeBigInt(result);

      if (cleanResult.length === 0) {
        hasMore = false;
        break;
      }

      const batch = cleanResult.map((l: any) => ({
        // Claves primarias
        link_id: l.link_id,
        payment_id: l.payment_id,
        invoice_id: l.invoice_id,
        // Información del pago
        payment_tranid: l.payment_tranid,
        payment_trandate: l.payment_trandate,
        foreigntotal: l.foreigntotal,
        balance: l.balance,
        currency: l.currency,
        payment_status: l.payment_status,
        payment_lastmodified: l.payment_lastmodified,
        // Vendor
        vendor: l.vendor,
        // Información de la factura
        invoice_tranid: l.invoice_tranid,
        invoice_trandate: l.invoice_trandate,
        invoice_duedate: l.invoice_duedate,

        // Amount remaining en el custom record
        custrecord_amountremaining: l.custrecord_amountremaining,
        link_lastmodified: l.link_lastmodified,
      }));

      await bulkInsertWithRetryForCreditMemo(batch);

      const lastRecord = cleanResult[cleanResult.length - 1];

      // Cursor para siguiente batch
      lastId = lastRecord.link_id;
      lastSyncDate = lastRecord.link_lastmodified;
      console.log('fecha netsuite', lastRecord.link_lastmodified)

      totalFetched += cleanResult.length;

      console.log(`Batch procesado: ${cleanResult.length} registros`);
      console.log(`Cursor -> date:${lastSyncDate} line:${lastId}`);
    }

    console.log("Todos los datos cargados en staging (payments)");

    // MERGE
    const mergeStart = new Date();
    const mergeResult = await executeMergeWithRetryForCreditMemo();
    const mergeEnd = new Date();

    const duration = (mergeEnd.getTime() - startTime.getTime()) / 1000;
    const mergeDuration = (mergeEnd.getTime() - mergeStart.getTime()) / 1000;

    console.log(
      `Merge completado: insert ${mergeResult.inserted} / update ${mergeResult.updated} en ${mergeDuration}s`
    );

    await SyncControl.update(
      {
        last_sync_date: lastSyncDate,
        last_internal_id: lastId,
        last_status: "SUCCESS",
        last_message: `Sync payments completado en ${duration}s`,
        updated_at: new Date(),
        is_running: false
      },
      { where: { process_name: "vendorinvoicepayments" } }
    );

    return res.status(200).json({
      success: true,
      total: totalFetched,
      duration
    });

  } catch (error: any) {

    console.error("Error en sincronización pagos:", error);

    await SyncControl.update(
      {
        last_status: "FAILED",
        last_message: error.message,
        updated_at: new Date(),
        is_running: false
      },
      { where: { process_name: "vendorinvoicepayments" } }
    );

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