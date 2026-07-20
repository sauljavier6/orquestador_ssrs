import cron from "node-cron";
import {
  syncCustomerContacts,
  syncCustomerInvoiceLines,
  syncCustomerInvoicePayments,
  syncCustomerInvoices,
  syncCustomerPaymentAplication,
} from "../../services/CobranzaPro/syncCustomerInvoices.service";
import SyncControl from "../../models/CobranzaPro/SyncControl";
import sequelizeCP from "../../config/dbCobranzaPro";
import { syncCustomers } from "../../services/CobranzaPro/syncCustomers.services";

const PROCESS_NAME = "customer_pipeline";

const runCustomerPipeline = async (): Promise<void> => {
  let transaction;

  try {
    // =========================
    // 🔒 LOCK
    // =========================
    transaction = await sequelizeCP.transaction();

    const sync = await SyncControl.findOne({
      where: { process_name: PROCESS_NAME },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!sync) {
      throw new Error("No existe customer_pipeline en SyncControl");
    }

    if (sync.is_running) {
      console.log("⛔ Pipeline ya corriendo, se omite");
      await transaction.rollback();
      transaction = undefined;
      return;
    }

    await sync.update(
      {
        is_running: true,
        updated_at: new Date(),
        last_status: "RUNNING",
        last_message: "Pipeline iniciado",
      },
      { transaction }
    );

    await transaction.commit();
    transaction = undefined;

    // El log va después de tomar el lock.
    console.log("🚀 Pipeline Customer transactions iniciado");

    // =========================
    // 🚀 EJECUCIÓN
    // =========================
    const globalStart = Date.now();

    console.log("🧾 Customer...");
    const customer = await syncCustomers();
    if (!customer.success) {
      throw new Error("Customer falló");
    }

    console.log("🧾 Contacts...");
    const customerContacts = await syncCustomerContacts();
    if (!customerContacts.success) {
      throw new Error("Customer Contacts falló");
    }

    console.log("🧾 Invoices...");
    const invoices = await syncCustomerInvoices();
    if (!invoices.success) {
      throw new Error("Customer Invoices falló");
    }

    console.log("📦 Lines...");
    const lines = await syncCustomerInvoiceLines();
    if (!lines.success) {
      throw new Error("Customer Lines falló");
    }

    console.log("💰 Payments...");
    const payments = await syncCustomerInvoicePayments();
    if (!payments.success) {
      throw new Error("Customer Payments falló");
    }

    console.log("💰 Application...");
    const application = await syncCustomerPaymentAplication();
    if (!application.success) {
      throw new Error("Customer Payments Application falló");
    }

    const elapsedSeconds = (Date.now() - globalStart) / 1000;

    console.log(`🎯 Pipeline completo en ${elapsedSeconds}s`);

    await SyncControl.update(
      {
        is_running: false,
        last_status: "SUCCESS",
        last_message: `Pipeline completado en ${elapsedSeconds}s`,
        updated_at: new Date(),
      },
      {
        where: { process_name: PROCESS_NAME },
      }
    );
  } catch (error: any) {
    console.error("❌ Error en pipeline:", error);

    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        // La transacción pudo haberse cerrado previamente.
      }
    }

    try {
      await SyncControl.update(
        {
          is_running: false,
          last_status: "FAILED",
          last_message: error?.message ?? "Error desconocido",
          updated_at: new Date(),
        },
        {
          where: { process_name: PROCESS_NAME },
        }
      );
    } catch (updateError) {
      console.error(
        "❌ No se pudo actualizar el estado del pipeline:",
        updateError
      );
    }
  }
};

// Ejecutar una vez al iniciar el servidor.
void runCustomerPipeline();

// Ejecutar posteriormente cada 30 minutos.
cron.schedule(
  "*/15 * * * *",
  () => {
    void runCustomerPipeline();
  },
  {
    timezone: "America/Tijuana",
  }
);