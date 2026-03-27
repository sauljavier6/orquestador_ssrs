// src/workers/vendorPipeline.worker.ts
import cron from "node-cron";

import { syncVendorInvoices } from "../../services/SSRS/syncVendorInvoices.services";
import { syncVendorInvoiceLines } from "../../services/SSRS/syncVendorInvoices.services";
import { syncVendorInvoicePayments } from "../../services/SSRS/syncVendorInvoices.services";

cron.schedule(
  "*/10 * * * *", // cada 15 min
  async () => {
    console.log("🚀 Pipeline Vendor transactions iniciado");

    const globalStart = Date.now();

    try {
      // =========================
      // 1. INVOICES
      // =========================
      console.log("🧾 Invoices...");
      const startInvoices = Date.now();

      const invoices = await syncVendorInvoices();

      console.log(
        `✅ Invoices OK (${(Date.now() - startInvoices) / 1000}s)`
      );

      // Si falla, cortamos pipeline
      if (!invoices.success) throw new Error("Invoices falló");

      // =========================
      // 2. LINES
      // =========================
      console.log("📦 Lines...");
      const startLines = Date.now();

      const lines = await syncVendorInvoiceLines();

      console.log(
        `✅ Lines OK (${(Date.now() - startLines) / 1000}s)`
      );

      if (!lines.success) throw new Error("Lines falló");

      // =========================
      // 3. PAYMENTS
      // =========================
      console.log("💰 Payments...");
      const startPayments = Date.now();

      const payments = await syncVendorInvoicePayments();

      console.log(
        `✅ Payments OK (${(Date.now() - startPayments) / 1000}s)`
      );

      if (!payments.success) throw new Error("Payments falló");

      // =========================
      // FIN
      // =========================
      console.log(
        `🎯 Pipeline completo en ${(Date.now() - globalStart) / 1000}s`
      );

    } catch (error) {
      console.error("❌ Error en pipeline:", error);
    }
  },
  {
    timezone: "America/Tijuana",
  }
);