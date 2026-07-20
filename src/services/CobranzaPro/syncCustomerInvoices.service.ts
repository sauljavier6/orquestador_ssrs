// src/controllers/vendors.controller.ts
import { QueryTypes } from "sequelize";
import SyncControl from "../../models/CobranzaPro/SyncControl";
import { getNetSuiteConnection } from "../../config/odbc";
import sequelizeCP from "../../config/dbCobranzaPro";
import CustomerInvoiceStaging from "../../models/CobranzaPro/CustomerInvoiceStaging";
import CustomerInvoiceLineStaging from "../../models/CobranzaPro/CustomerInvoiceLineStaging";
import CustomerInvoicePaymentStaging from "../../models/CobranzaPro/CustomerInvoicePaymentStaging";
import CustomerPaymentAplicationStaging from "../../models/CobranzaPro/CustomerPaymentAplicationStaging";
import CustomerContactStaging from "../../models/CobranzaPro/CustomerContactStaging";

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


////listooooooooooooooooooooooooo
// Helper retry por batch
async function bulkInsertWithRetry(batch: any[], maxRetries = 3) {
    const chunkSize = 200; // puedes ajustar según tu DB y tamaño de batch

    for (let i = 0; i < batch.length; i += chunkSize) {
        const chunk = batch.slice(i, i + chunkSize);

        let attempts = 0;

        while (attempts < maxRetries) {
            try {
                await CustomerInvoiceStaging.bulkCreate(chunk, {
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
            const result = await sequelizeCP.query(
                "EXEC sp_merge_CustomerInvoices",
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
export const syncCustomerInvoices = async () => {
    let cn;
    const startTime = new Date();

    try {
        console.log("Iniciando sincronización customer invoices enterprise...");

        // LOCK
        const transaction = await sequelizeCP.transaction();
        const sync = await SyncControl.findOne({
            where: { process_name: "customerinvoice" },
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
            return {
                success: false,
                message: "Proceso en ejecución"
            };
        }

        await SyncControl.update(
            { is_running: true, updated_at: new Date() },
            { where: { process_name: "customerinvoice" }, transaction }
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

        const batchSize = 5000;
        let totalFetched = 0;
        let hasMore = true;

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
                t.custbody_uuid,
                t.custbody_rfc,
                t.custbody_rfc_emisor,
                t.foreignamountunpaid AS balance,
                t.custbody_taxtotal AS taxtotal,
                BUILTIN.DF(t.location) AS location, 
                t.custbody_nso_ct_metodo_pago AS metododepago,
                BUILTIN.DF(t.status) AS status,
                BUILTIN.DF(t.currency) AS currency,
                t.lastmodifieddate,
                t.voided,
                t.custbody_uuid,
                t.custbody_refpdf,
                t.custbody_xml_file
            FROM transaction t
            WHERE t.type = 'CustInvc'
            AND t.memorized = 'F'
            AND UPPER(BUILTIN.DF(t.entity)) NOT LIKE '%PUBLICO EN GENERAL%'
            AND (
                t.lastmodifieddate > {ts '${formattedDate}'}
                OR (t.lastmodifieddate = {ts '${formattedDate}'} AND t.id > ${lastId} )
                )
            ORDER BY t.lastmodifieddate ASC, t.id ASC
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

            // Mapear y preparar batch
            const batch = cleanResult.map((v: any) => {

                const amount = v.foreigntotal != null ? Math.abs(Number(v.foreigntotal)) : 0;
                const tax = v.taxtotal != null ? Math.abs(Number(v.taxtotal)) : 0;
                const amountPaid = v.foreignamountpaid != null ? Math.abs(Number(v.foreignamountpaid)) : 0;
                const balance = v.balance != null ? Math.abs(Number(v.balance)) : 0;

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
                    metododepago: v.metododepago,
                    estatuspresupuesto: v.custbody_status_po_budget,
                    status: v.status || "",
                    currency: v.currency,
                    lastmodifieddate: v.lastmodifieddate,
                    isinactive: v.voided,
                    uuid: v.custbody_uuid || null,
                    idpdf: v.custbody_refpdf || null,
                    idxml: v.custbody_xml_file || null,
                };
            });

            // Insert con retry
            await bulkInsertWithRetry(batch);

            const lastRecord = cleanResult[cleanResult.length - 1];

            lastId = lastRecord.id;
            lastSyncDate = lastRecord.lastmodifieddate;

            totalFetched += cleanResult.length;

            console.log(`Batch procesado: ${cleanResult.length} registros`);
            console.log(`Cursor Invoices -> date:${lastSyncDate} , 'ULTIMO ID'`, lastId);

            if (cleanResult.length < 50) {
                console.log("✅ Último batch detectado");
                hasMore = false;
                break;
            }
        }

        console.log("Todos los datos cargados en staging");

        // MERGE
        const mergeStart = new Date();
        const mergeResult = await executeMergeWithRetry();
        const mergeEnd = new Date();

        const duration = (mergeEnd.getTime() - startTime.getTime()) / 1000;
        const mergeDuration = (mergeEnd.getTime() - mergeStart.getTime()) / 1000;

        console.log(`Merge completado: insert ${mergeResult.inserted} / update ${mergeResult.updated} en ${mergeDuration}s`);

        // UPDATE SYNC CONTROL
        if (totalFetched === 0) {
            console.log("⚠️ No hubo datos, NO se actualiza last_sync_date");
        }

        await SyncControl.update(
            {
                last_sync_date: new Date(),
                last_status: "SUCCESS",
                last_message: `Sync completado en ${duration}s (merge ${mergeDuration}s)`,
                updated_at: new Date(),
                is_running: false
            },
            { where: { process_name: "customerinvoice" } }
        );

        return {
            success: true,
            total: totalFetched,
            duration,
        };

    } catch (error: any) {

        console.error("Error en sincronización:", error);

        await SyncControl.update(
            {
                last_status: "FAILED",
                last_message: error.message,
                updated_at: new Date(),
                is_running: false
            },
            { where: { process_name: "customerinvoice" } }
        );

        return {
            success: false,
            error: error.message
        };

    } finally {
        if (cn) {
            await cn.close();
            console.log("ODBC cerrado");
        }
    }
};


////listooooooooooooooooooooooooo
// Helper retry por batch
async function bulkInsertWithRetryForLines(batch: any[], maxRetries = 3) {

    const chunkSize = 100;

    for (let i = 0; i < batch.length; i += chunkSize) {

        const chunk = batch.slice(i, i + chunkSize);

        let attempts = 0;

        while (attempts < maxRetries) {
            try {

                await CustomerInvoiceLineStaging.bulkCreate(chunk, {
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
            const result = await sequelizeCP.query(
                "EXEC sp_merge_CustomerInvoiceLines",
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
export const syncCustomerInvoiceLines = async () => {
    let cn;
    const startTime = new Date();

    try {

        console.log("Iniciando sincronización vendor invoice lines...");

        // LOCK
        const transaction = await sequelizeCP.transaction();

        const sync = await SyncControl.findOne({
            where: { process_name: "customerinvoicelines" },
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
            return {
                success: false,
                message: "Proceso en ejecución"
            };
        }

        await SyncControl.update(
            { is_running: true, updated_at: new Date() },
            { where: { process_name: "customerinvoicelines" }, transaction }
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
        let lastTransactionId = 0;

        const batchSize = 5000;

        let totalFetched = 0;
        let hasMore = true;

        while (hasMore) {
            const formattedDate = lastSyncDate;
            console.log('Iniciando sync con fecha:', formattedDate)

            const query = `
            SELECT TOP ${batchSize}
                tl.uniquekey AS lineuniquekey,
                tl.transaction AS customer_invoice_id,
                tl.id AS lineorder,
                BUILTIN.DF(tl.item) AS item,
                tl.memo AS description,
                ABS(tl.quantity) AS quantity,
                BUILTIN.DF(tl.units) AS units,
                tl.rate,
                ABS(tl.netamount) AS amount,
                tl.custcol_nso_descuento_pos AS descuento,
                tl.taxcode,
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
            JOIN transaction t ON t.id = tl.transaction
            WHERE t.type = 'CustInvc'
            AND t.memorized = 'F'
            AND t.voided = 'F'
            AND UPPER(BUILTIN.DF(t.entity)) NOT LIKE '%PUBLICO EN GENERAL%'
            AND tl.mainline = 'F'
            AND tl.item <> 34452
            AND (
                t.lastmodifieddate > {ts '${formattedDate}'}
                OR (
                    t.lastmodifieddate = {ts '${formattedDate}'}
                    AND (
                        tl.transaction > ${lastTransactionId}
                        OR (
                            tl.transaction = ${lastTransactionId}
                            AND tl.uniquekey > ${lastId}
                        )
                    )
                )
            )
            ORDER BY
                t.lastmodifieddate ASC,
                tl.transaction ASC,
                tl.uniquekey ASC
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
                lineuniquekey: l.lineuniquekey,
                lineorder: l.lineorder,
                customer_invoice_id: l.customer_invoice_id,
                item: l.item,
                description: l.description,
                quantity: l.quantity,
                units: l.units,
                rate: l.rate,
                amount: l.amount,
                descuento: l.descuento,
                taxcode: l.taxcode,
                ratepercent: l.ratepercent,
                taxtype: l.taxtype,
                itemtype: l.itemtype,
                account: l.account,
                department: l.department,
                class: l.class,
                location: l.location,
                createddate: l.createddate,
                lastmodifieddate: l.lastmodifieddate,
            }));

            await bulkInsertWithRetryForLines(batch);

            const lastRecord = cleanResult[cleanResult.length - 1];

            lastId = lastRecord.lineuniquekey;
            lastSyncDate = lastRecord.lastmodifieddate;
            lastTransactionId = lastRecord.customer_invoice_id;

            totalFetched += cleanResult.length;

            console.log(`Batch procesado: ${cleanResult.length} registros`);
            console.log(`Cursor Lines-> date:${lastSyncDate} , 'ULTIMO ID'`, lastId);

            if (cleanResult.length < 2250) {
                console.log("✅ Último batch detectado");
                hasMore = false;
                break;
            }
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
                last_sync_date: new Date(),
                last_status: "SUCCESS",
                last_message: `Sync lines completado en ${duration}s`,
                updated_at: new Date(),
                is_running: false
            },
            { where: { process_name: "customerinvoicelines" } }
        );

        return {
            success: true,
            total: totalFetched,
            duration
        };

    } catch (error: any) {

        console.error("Error en sincronización lines:", error);

        await SyncControl.update(
            {
                last_status: "FAILED",
                last_message: error.message,
                updated_at: new Date(),
                is_running: false
            },
            { where: { process_name: "customerinvoicelines" } }
        );

        return {
            success: false,
            error: error.message
        };

    } finally {

        if (cn) {
            await cn.close();
            console.log("ODBC cerrado");
        }

    }
};


//Listooooooooooooooooooooooo
// Helper retry por batch
async function bulkInsertWithRetryForPayments(batch: any[], maxRetries = 3) {

    const chunkSize = 100;

    for (let i = 0; i < batch.length; i += chunkSize) {

        const chunk = batch.slice(i, i + chunkSize);

        let attempts = 0;

        while (attempts < maxRetries) {
            try {

                await CustomerInvoicePaymentStaging.bulkCreate(chunk, {
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

async function executeMergeWithRetryForPayments(maxRetries = 3): Promise<MergeStats> {
    let attempts = 0;

    while (attempts < maxRetries) {
        try {
            const result = await sequelizeCP.query(
                "EXEC sp_merge_CustomerInvoicePayments",
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
export const syncCustomerInvoicePayments = async () => {
    let cn;
    const startTime = new Date();

    try {

        console.log("Iniciando sincronización vendor invoice payments...");

        const transaction = await sequelizeCP.transaction();

        const sync = await SyncControl.findOne({
            where: { process_name: "customerinvoicepayments" },
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
            return {
                success: false,
                message: "Proceso en ejecución"
            };
        }

        await SyncControl.update(
            { is_running: true, updated_at: new Date() },
            { where: { process_name: "customerinvoicepayments" }, transaction }
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

        const batchSize = 5000;

        let totalFetched = 0;
        let hasMore = true;

        while (hasMore) {

            const formattedDate = lastSyncDate;
            console.log('Iniciando sync con fecha:', formattedDate)

            const query = `
            SELECT TOP ${batchSize}
                id,
                tranid,
                transactionnumber,
                trandate,
                createddate,
                lastmodifieddate,
                createdby,
                lastmodifiedby,
                total,
                foreigntotal,
                foreignpaymentamountused,
                foreignpaymentamountunused,
                BUILTIN.DF(t.status) AS status,
                posting,
                voided,
                memo,
                entity,
                BUILTIN.DF(t.currency) AS currency,
                BUILTIN.DF(t.paymentmethod) AS paymentmethod,
                postingperiod,
                custbody_refjournalentry_iva,
                customform,
                isreversal,
                memorized,
                custbody_uuid,
                custbody_refpdf
            FROM transaction t
            WHERE t.type = 'CustPymt'
            AND t.memorized = 'F'
            AND UPPER(BUILTIN.DF(t.entity)) NOT LIKE '%PUBLICO EN GENERAL%'
            AND (
                    t.lastmodifieddate > {ts '${formattedDate}'}
                    OR (
                        t.lastmodifieddate = {ts '${formattedDate}'}
                        AND t.id > ${lastId}
                    )
                )                                                           
            ORDER BY t.lastmodifieddate ASC, t.id ASC
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
                id: l.id,
                tranid: l.tranid,
                transactionnumber: l.transactionnumber,
                trandate: l.trandate,
                createddate: l.createddate,
                lastmodifieddate: l.lastmodifieddate,
                createdby: l.createdby,
                lastmodifiedby: l.lastmodifiedby,
                total: l.total,
                foreigntotal: l.foreigntotal,
                foreignpaymentamountused: l.foreignpaymentamountused,
                foreignpaymentamountunused: l.foreignpaymentamountunused,
                status: l.status,
                posting: l.posting,
                voided: l.voided,
                memo: l.memo,
                entity: l.entity,
                currency: l.currency,
                paymentmethod: l.paymentmethod,
                postingperiod: l.postingperiod,
                custbody_refjournalentry_iva: l.custbody_refjournalentry_iva,
                customform: l.customform,
                isreversal: l.isreversal,
                memorized: l.memorized,
                uuid: l.custbody_uuid || null,
                idpdf: l.custbody_refpdf || null,
            }));

            await bulkInsertWithRetryForPayments(batch);

            const lastRecord = cleanResult[cleanResult.length - 1];

            lastId = lastRecord.id;
            lastSyncDate = lastRecord.lastmodifieddate;

            totalFetched += cleanResult.length;

            console.log(`Batch procesado: ${cleanResult.length} registros`);
            console.log(`Cursor Payments -> date:${lastSyncDate} , 'ULTIMO ID'`, lastId);

            if (cleanResult.length < 50) {
                console.log("✅ Último batch detectado");
                hasMore = false;
                break;
            }
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
                last_sync_date: new Date(),
                last_status: "SUCCESS",
                last_message: `Sync payments completado en ${duration}s`,
                updated_at: new Date(),
                is_running: false
            },
            { where: { process_name: "customerinvoicepayments" } }
        );

        return {
            success: true,
            total: totalFetched,
            duration
        };

    } catch (error: any) {

        console.error("Error en sincronización pagos:", error);

        await SyncControl.update(
            {
                last_status: "FAILED",
                last_message: error.message,
                updated_at: new Date(),
                is_running: false
            },
            { where: { process_name: "customerinvoicepayments" } }
        );

        return {
            success: false,
            error: error.message
        };

    } finally {

        if (cn) {
            await cn.close();
            console.log("ODBC cerrado");
        }
    }
};


//Listooooooooooooooooooooooo
// Helper retry por batch
async function bulkInsertWithRetryForPaymentAplication(batch: any[], maxRetries = 3) {

    const chunkSize = 100;

    for (let i = 0; i < batch.length; i += chunkSize) {

        const chunk = batch.slice(i, i + chunkSize);

        let attempts = 0;

        while (attempts < maxRetries) {
            try {

                await CustomerPaymentAplicationStaging.bulkCreate(chunk, {
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
async function executeMergeWithRetryForPaymentAplication(maxRetries = 3): Promise<MergeStats> {
    let attempts = 0;

    while (attempts < maxRetries) {
        try {
            const result = await sequelizeCP.query(
                "EXEC sp_merge_CustomerPaymentAplication",
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
//endpoint para aplicacion de pagos
export const syncCustomerPaymentAplication = async () => {
    let cn;
    const startTime = new Date();

    try {

        console.log("Iniciando sincronización customer payments aplication...");

        const transaction = await sequelizeCP.transaction();

        const sync = await SyncControl.findOne({
            where: { process_name: "customerpaymentaplication" },
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
            return {
                success: false,
                message: "Proceso en ejecución"
            };
        }

        await SyncControl.update(
            { is_running: true, updated_at: new Date() },
            { where: { process_name: "customerpaymentaplication" }, transaction }
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

        let lastPreviousDoc = 0;
        let lastNextDoc = 0;

        const batchSize = 5000;
        let totalFetched = 0;
        let hasMore = true;

        while (hasMore) {

            const formattedDate = lastSyncDate;
            console.log(
                `Iniciando sync -> fecha: ${formattedDate}`);

            const query = `
                SELECT TOP ${batchSize}
                    nextdoc AS payment_id,
                    previousdoc AS invoice_id,
                    foreignamount AS amount,
                    nexttype,
                    previoustype,
                    nextdate AS payment_trandate,
                    previousdate AS invoice_trandate,
                    discount AS status,
                    lastmodifieddate
                FROM NextTransactionLineLink
                WHERE linktype = 'Payment'
                AND nexttype = 'CustPymt'
                AND previoustype = 'CustInvc'
                AND (
                    lastmodifieddate > {ts '${formattedDate}'}
                    OR (
                        lastmodifieddate = {ts '${formattedDate}'}
                        AND (
                            previousdoc > ${lastPreviousDoc}
                            OR (
                                previousdoc = ${lastPreviousDoc}
                                AND nextdoc > ${lastNextDoc}
                            )
                        )
                    )
                )                                                   
                ORDER BY lastmodifieddate ASC, nextdoc ASC, previousdoc ASC
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
                payment_id: Number(l.payment_id),
                invoice_id: Number(l.invoice_id),
                amount: l.amount,
                nexttype: l.nexttype,
                previoustype: l.previoustype,
                payment_trandate: l.payment_trandate,
                invoice_trandate: l.invoice_trandate,
                status: l.status,
                lastmodifieddate: l.lastmodifieddate,
            }));

            await bulkInsertWithRetryForPaymentAplication(batch);

            const lastRecord = cleanResult[cleanResult.length - 1];

            lastPreviousDoc = lastRecord.invoice_id;
            lastNextDoc = lastRecord.payment_id;
            lastSyncDate = lastRecord.lastmodifieddate;

            totalFetched += cleanResult.length;

            console.log(`Batch procesado: ${cleanResult.length} registros`);
            console.log(`Cursor Aplications -> date:${lastSyncDate} , 'ULTIMO ID_PAYMENT'`, lastNextDoc, 'ULTIMO ID_INVOICE', lastPreviousDoc);

            if (cleanResult.length < 50) {
                console.log("✅ Último batch detectado");
                hasMore = false;
                break;
            }
        }

        console.log("Todos los datos cargados en staging (payments aplication)");

        // MERGE
        const mergeStart = new Date();
        const mergeResult = await executeMergeWithRetryForPaymentAplication();
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
                last_sync_date: new Date(),
                last_status: "SUCCESS",
                last_message: `Sync payments completado en ${duration}s`,
                updated_at: new Date(),
                is_running: false
            },
            { where: { process_name: "customerpaymentaplication" } }
        );

        return {
            success: true,
            total: totalFetched,
            duration
        };

    } catch (error: any) {

        console.error("Error en sincronización aplicacion pagos:", error);

        await SyncControl.update(
            {
                last_status: "FAILED",
                last_message: error.message,
                updated_at: new Date(),
                is_running: false
            },
            { where: { process_name: "customerpaymentaplication" } }
        );

        return {
            success: false,
            error: error.message
        };

    } finally {

        if (cn) {
            await cn.close();
            console.log("ODBC cerrado");
        }
    }
};


//Listooooooooooooooooooooooo
// Helper retry por batch
async function bulkInsertWithRetryForCustomerContacts(batch: any[], maxRetries = 3) {

    const chunkSize = 100;

    for (let i = 0; i < batch.length; i += chunkSize) {

        const chunk = batch.slice(i, i + chunkSize);

        let attempts = 0;

        while (attempts < maxRetries) {
            try {

                await CustomerContactStaging.bulkCreate(chunk, {
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
async function executeMergeWithRetryForCustomerContacts(maxRetries = 3): Promise<MergeStats> {
    let attempts = 0;

    while (attempts < maxRetries) {
        try {
            const result = await sequelizeCP.query(
                "EXEC sp_merge_CustomerContacts",
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
//endpoint para aplicacion de pagos
export const syncCustomerContacts = async () => {
    let cn;
    const startTime = new Date();

    try {

        console.log("Iniciando sincronización customer contacts...");

        const transaction = await sequelizeCP.transaction();

        const sync = await SyncControl.findOne({
            where: { process_name: "customercontacts" },
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
            return {
                success: false,
                message: "Proceso en ejecución"
            };
        }

        await SyncControl.update(
            { is_running: true, updated_at: new Date() },
            { where: { process_name: "customercontacts" }, transaction }
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

        let lastId = 0;

        const batchSize = 5000;
        let totalFetched = 0;
        let hasMore = true;

        while (hasMore) {

            const formattedDate = lastSyncDate;
            console.log(`Iniciando sync -> fecha: ${formattedDate}`);

            const query = `
                SELECT TOP ${batchSize}
                    c.id,
                    c.company,
                    c.email,
                    c.entityid,
                    c.firstname,
                    c.lastname,
                    c.fullname,
                    c.image,
                    c.homephone,
                    c.mobilephone,
                    c.owner,
                    c.lastmodifieddate,
                    c.isinactive
                FROM contact c
                inner join customer u on u.id = c.company 
                WHERE u.category = 3
                AND (
                    c.lastmodifieddate > {ts '${formattedDate}'}
                    OR (
                        c.lastmodifieddate = {ts '${formattedDate}'}
                        AND c.id > ${lastId}
                    )
                )                                                   
                ORDER BY c.lastmodifieddate ASC, c.id ASC
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

            const batch = cleanResult.map((c: any) => ({
                id: Number(c.id),
                company: Number(c.company),
                email: c.email,
                entityid: c.entityid,
                firstname: c.firstname,
                lastname: c.lastname,
                fullname: c.fullname,
                image: c.image,
                homephone: c.homephone,
                mobilephone: c.mobilephone,
                owner: c.owner ? Number(c.owner) : null,
                lastmodifieddate: c.lastmodifieddate,
                isinactive: c.isinactive,
            }));

            await bulkInsertWithRetryForCustomerContacts(batch);

            const lastRecord = cleanResult[cleanResult.length - 1];

            lastId = lastRecord.id;
            lastSyncDate = lastRecord.lastmodifieddate;

            totalFetched += cleanResult.length;

            console.log(`Batch procesado: ${cleanResult.length} registros`);
            console.log(`Cursor Contacts -> date:${lastSyncDate} , 'ULTIMO ID'`, lastId);

            if (cleanResult.length < 50) {
                console.log("✅ Último batch detectado");
                hasMore = false;
                break;
            }
        }

        console.log("Todos los datos cargados en staging (customer contacts)");

        // MERGE
        const mergeStart = new Date();
        const mergeResult = await executeMergeWithRetryForCustomerContacts();
        const mergeEnd = new Date();

        const duration = (mergeEnd.getTime() - startTime.getTime()) / 1000;
        const mergeDuration = (mergeEnd.getTime() - mergeStart.getTime()) / 1000;

        console.log(`Merge completado: insert ${mergeResult.inserted} / update ${mergeResult.updated} en ${mergeDuration}s`);

        if (totalFetched === 0) {
            console.log("⚠️ No hubo datos, NO se actualiza last_sync_date");
        }
        await SyncControl.update(
            {
                last_sync_date: new Date(),
                last_status: "SUCCESS",
                last_message: `Sync contacts completado en ${duration}s`,
                updated_at: new Date(),
                is_running: false
            },
            { where: { process_name: "customercontacts" } }
        );

        return {
            success: true,
            total: totalFetched,
            duration
        };

    } catch (error: any) {

        console.error("Error en sincronización de contactos:", error);

        await SyncControl.update(
            {
                last_status: "FAILED",
                last_message: error.message,
                updated_at: new Date(),
                is_running: false
            },
            { where: { process_name: "customercontacts" } }
        );

        return {
            success: false,
            error: error.message
        };

    } finally {

        if (cn) {
            await cn.close();
            console.log("ODBC cerrado");
        }
    }
};