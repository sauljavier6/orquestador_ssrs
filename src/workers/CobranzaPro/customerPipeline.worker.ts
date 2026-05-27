import cron from "node-cron";
import { syncCustomerInvoiceLines, syncCustomerInvoicePayments, syncCustomerInvoices, syncCustomerPaymentAplication } from "../../services/CobranzaPro/syncCustomerInvoices.service";
import SyncControl from "../../models/CobranzaPro/SyncControl";
import sequelizeCP from "../../config/dbCobranzaPro";
import { syncCustomers } from "../../services/CobranzaPro/syncCustomers.services";

const PROCESS_NAME = "customer_pipeline";

cron.schedule(
  "*/30 * * * *", // cada 15 minutos
  async () => {
    let transaction;

    try {
      console.log("🚀 Pipeline Customer transactions iniciado");

      // =========================
      // 🔒 LOCK
      // =========================
      transaction = await sequelizeCP.transaction();

      const sync = await SyncControl.findOne({
        where: { process_name: PROCESS_NAME },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!sync) throw new Error("No existe customer_pipeline en SyncControl");

      if (sync.is_running) {
        console.log("⛔ Pipeline ya corriendo, se omite");
        await transaction.rollback();
        return;
      }

      await SyncControl.update(
        {
          is_running: true,
          updated_at: new Date(),
          last_status: "RUNNING"
        },
        {
          where: { process_name: PROCESS_NAME },
          transaction
        }
      );

      await transaction.commit();

      // =========================
      // 🚀 EJECUCIÓN
      // =========================
      const globalStart = Date.now();

      console.log("🧾 Customer...");
      const customer = await syncCustomers();
      if (!customer.success) throw new Error("Customer falló");

      console.log("🧾 Invoices...");
      const invoices = await syncCustomerInvoices();
      if (!invoices.success) throw new Error("Customer Invoices falló");

      console.log("📊 Calculando balances...");
      const balanceStart = Date.now();
      await sequelizeCP.query("EXEC sp_UpdateCustomerBalance");
      console.log(`Balances calculados en ${(Date.now() - balanceStart) / 1000}s`);

      console.log("📦 Lines...");
      const lines = await syncCustomerInvoiceLines();
      if (!lines.success) throw new Error("Customer Lines falló");

      console.log("💰 Payments...");
      const payments = await syncCustomerInvoicePayments();
      if (!payments.success) throw new Error("Customer Payments falló");

      console.log("💰 Aplication...");
      const aplication = await syncCustomerPaymentAplication();
      if (!aplication.success) throw new Error("Customer Payments Aplication falló");

      console.log(
        `🎯 Pipeline completo en ${(Date.now() - globalStart) / 1000}s`
      );

      // =========================
      // 🔓 UNLOCK
      // =========================
      await SyncControl.update(
        {
          is_running: false,
          last_status: "SUCCESS",
          updated_at: new Date()
        },
        { where: { process_name: PROCESS_NAME } }
      );

    } catch (error: any) {
      console.error("❌ Error en pipeline:", error);

      await SyncControl.update(
        {
          is_running: false,
          last_status: "FAILED",
          last_message: error.message,
          updated_at: new Date()
        },
        { where: { process_name: PROCESS_NAME } }
      );

      if (transaction) {
        try { await transaction.rollback(); } catch { }
      }
    }
  },
  {
    timezone: "America/Tijuana",
  }
);