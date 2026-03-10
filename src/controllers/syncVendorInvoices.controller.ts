// src/controllers/vendors.controller.ts

import { getNetSuiteConnection } from "../config/odbc";
import SyncControl from "../models/SyncControl";
import sequelize from "../config/database";
import { QueryTypes } from "sequelize";
import VendorInvoiceStaging from "../models/VendorInvoiceStaging";
import VendorInvoiceLineStaging from "../models/VendorInvoiceLineStaging";
import VendorInvoicePaymentStaging from "../models/VendorInvoicePaymentStaging";

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
      const result = await sequelize.query(
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
    const transaction = await sequelize.transaction();
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

    let lastSyncDate = sync.last_sync_date || new Date("2024-01-01");
    let lastId = sync.last_internal_id || 0;

    const batchSize = 1000;
    let totalFetched = 0;
    let hasMore = true;
    let resultadostest;

    while (hasMore) {
      const safeDate = new Date(lastSyncDate.getTime() - 5 * 60000);
      const formattedDate = safeDate
        .toISOString()
        .slice(0, 19)   // 'YYYY-MM-DDTHH:MM:SS'
        .replace("T", " "); // 'YYYY-MM-DD HH:MM:SS'

      console.log('formattedDate', formattedDate)
      console.log('lastId', lastId)

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
            AND tl.mainline = 'T'
        WHERE t.type = 'VendBill'
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

          // 💰 FINANCIERO
          amount: amount,
          tax: tax,
          subtotal: amount - tax,
          amountpaid: amountPaid,
          balance: balance,

          // 📍 Ubicación
          location: v.location,

          //orden dse compra
          purchaseorder: v.purchaseorder,

          // 📅 Fechas custom
          fechapago: v.custbody_nso_fecha_pago ? new Date(v.custbody_nso_fecha_pago) : null,
          fechacancelacion: v.custbody_nso_fecha_cancelacion ? new Date(v.custbody_nso_fecha_cancelacion) : null,

          // 🏷️ Campos custom texto (si no usas BUILTIN.DF vendrán como ID)
          tipocompra: v.custbody_nso_tipo_compra || null,
          estatuspresupuesto: v.custbody_status_po_budget || null,
          causadevolucionproveedor: v.custbody_nso_causa_dev_proveedor || null,

          // 📊 Generales
          status: v.status || "",
          currency: v.currency,
          lastmodifieddate: v.lastmodifieddate ? new Date(v.lastmodifieddate) : new Date(),

          // ❌ Cancelado
          isinactive: v.voided === "T"
        };
      });

      // Insert con retry
      await bulkInsertWithRetry(batch);

      // Actualizamos lastId y totalFetched
      const lastRecord = cleanResult[cleanResult.length - 1];
      lastId = lastRecord.id;
      lastSyncDate = new Date(lastRecord.lastmodifieddate);
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
    await SyncControl.update(
      {
        last_sync_date: lastSyncDate,
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
      const result = await sequelize.query(
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
    const transaction = await sequelize.transaction();

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

    let lastSyncDate = sync.last_sync_date || new Date("2024-01-01");
    let lastId = sync.last_internal_id || 0;

    const batchSize = 500;

    let totalFetched = 0;
    let hasMore = true;

    while (hasMore) {

      const safeDate = new Date(lastSyncDate.getTime() - 5 * 60000);

      const formattedDate = safeDate
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      console.log("formattedDate", formattedDate);
      console.log("lastId", lastId);

      const query = `
        SELECT TOP ${batchSize}

            tl.id AS lineuniquekey,
            tl.transaction AS vendor_invoice_id,

            BUILTIN.DF(tl.item) AS item,
            tl.memo AS description,
           

            tl.quantity,
            BUILTIN.DF(tl.units) AS units,

            tl.rate,
            tl.netamount AS amount,

            tl.taxcode,

            tl.ratepercent,
            tl.taxtype,
            tl.itemtype,

            BUILTIN.DF(tl.expenseaccount) AS account,
            BUILTIN.DF(tl.department) AS department,
            BUILTIN.DF(tl.class) AS class,
            BUILTIN.DF(tl.location) AS location,

            t.createddate AS created_at,
            t.lastmodifieddate AS updated_at

        FROM transactionline tl

        JOIN transaction t
            ON t.id = tl.transaction

        WHERE t.type = 'VendBill'
        AND tl.mainline = 'F'

        AND (
            t.lastmodifieddate > {ts '${formattedDate}'}
            OR (
                t.lastmodifieddate = {ts '${formattedDate}'}
                AND tl.id > ${lastId}
            )
        )

        ORDER BY
            t.lastmodifieddate ASC,
            tl.id ASC
      `;

      console.log("Ejecutando query batch...");

      const result = await cn.query(query);

      const cleanResult = serializeBigInt(result);

      if (cleanResult.length === 0) {
        hasMore = false;
        break;
      }

      const batch = cleanResult.map((l: any) => ({

        lineuniquekey: Number(l.lineuniquekey),

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

        created_at: l.created_at ? new Date(l.created_at) : null,
        updated_at: l.updated_at ? new Date(l.updated_at) : null

      }));

      await bulkInsertWithRetryForLines(batch);

      const lastRecord = cleanResult[cleanResult.length - 1];

      lastId = Number(lastRecord.lineuniquekey);
      lastSyncDate = new Date(lastRecord.updated_at);

      totalFetched += cleanResult.length;

      console.log(`Batch procesado: ${cleanResult.length} registros`);
      console.log(`Cursor -> date:${lastSyncDate.toISOString()} line:${lastId}`);
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

    await SyncControl.update(
      {
        last_sync_date: lastSyncDate,
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
      const result = await sequelize.query(
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
    const transaction = await sequelize.transaction();

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

    let lastSyncDate = sync.last_sync_date || new Date("2024-01-01");
    let lastId = sync.last_internal_id || 0;

    const batchSize = 1500;

    let totalFetched = 0;
    let hasMore = true;

    while (hasMore) {

      const safeDate = new Date(lastSyncDate.getTime() - 5 * 60000);

      const formattedDate = safeDate
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      console.log("formattedDate", formattedDate);
      console.log("lastId", lastId);

      const query = `
        SELECT TOP ${batchSize}
            pay.id AS payment_id,
            pay.tranid AS payment_number,
            pay.trandate AS payment_date,
            pay.entity AS vendor,
            pay.currency,
            pay.foreignpaymentamountused AS payment_total,
            pay.foreignpaymentamountunused AS balance, 
            pay.lastmodifieddate AS payment_lastmodified,
            pay.status AS payment_status,

            grp.id AS payment_group_id,
            grp.custrecord_nsvp_app_date AS date_group,

            bills.custrecord_paying_bill AS invoice_id,
            bills.custrecord_amountremaining AS amount_applied_to_invoice,
            bills.custrecord_trandate_bill AS invoice_date,
            bills.custrecord_duedate_bill AS invoice_due_date

        FROM transaction pay
        LEFT JOIN customrecord_aplicacion_pagos grp
            ON grp.id = pay.custbody_nso_payment_group_ref
        LEFT JOIN customrecord_ap_pagos_bills bills
            ON bills.custrecord_ap_pago_parent = grp.id
        WHERE
            pay.type = 'VendPymt'
            --AND pay.id = 59988068
            AND (
                pay.lastmodifieddate > {ts '${formattedDate}'}
                OR (
                    pay.lastmodifieddate = {ts '${formattedDate}'}
                    AND pay.id > ${lastId}
                )
            )
        ORDER BY
            pay.lastmodifieddate ASC,
            pay.id ASC
      `;

      console.log("Ejecutando query batch...");

      const result = await cn.query(query);

      const cleanResult = serializeBigInt(result);

      console.log(cleanResult[0])

      if (cleanResult.length === 0) {
        hasMore = false;
        break;
      }

      const batch = cleanResult.map((l: any) => ({
        // Claves primarias
        payment_id: l.payment_id,

        // Datos de pago
        payment_number: l.payment_number,
        payment_date: l.payment_date ? new Date(l.payment_date) : null,
        vendor: l.vendor != null ? Number(l.vendor) : 0,
        currency: l.currency ?? "",
        payment_total: l.payment_total != null ? Number(l.payment_total) : 0,
        balance: l.balance != null ? Number(l.balance) : 0,
        payment_status: l.payment_status ?? "",  // 👈 estatus agregado

        // Grupo de pago
        payment_group_id: l.payment_group_id != null ? Number(l.payment_group_id) : 0,
        date_group: l.date_group ? new Date(l.date_group) : null, // 👈 fecha del grupo de pago

        // Aplicaciones de pago
        invoice_id: l.invoice_id != null ? Number(l.invoice_id) : 0,
        amount_applied_to_invoice: l.amount_applied_to_invoice != null ? Number(l.amount_applied_to_invoice) : 0,
        invoice_date: l.invoice_date ? new Date(l.invoice_date) : null,
        invoice_due_date: l.invoice_due_date ? new Date(l.invoice_due_date) : null,

        // Fecha de última modificación
        payment_lastmodified: l.payment_lastmodified ? new Date(l.payment_lastmodified) : new Date(),

        // Fechas de control
        created_at: l.created_at ? new Date(l.created_at) : new Date(),
        updated_at: l.updated_at ? new Date(l.updated_at) : new Date()
      }));

      await bulkInsertWithRetryForPayments(batch);

      const lastRecord = cleanResult[cleanResult.length - 1];

      lastId = Number(lastRecord.payment_id);
      lastSyncDate = new Date(lastRecord.payment_lastmodified);

      totalFetched += cleanResult.length;

      console.log(`Batch procesado: ${cleanResult.length} registros`);
      console.log(`Cursor -> date:${lastSyncDate.toISOString()} line:${lastId}`);
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