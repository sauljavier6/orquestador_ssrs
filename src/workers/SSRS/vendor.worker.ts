// src/workers/upc.worker.ts
import cron from "node-cron";
import { syncVendorsService } from "../../services/SSRS/syncVendors.services";

console.log("Worker iniciado", new Date().toLocaleString());

// 10 AM, 2 PM y 5 PM hora Tijuana
cron.schedule(
  "0 10,14,17 * * *",
  async () => {
    console.log("⏰ CRON disparado:", new Date().toLocaleString());

    try {
      await syncVendorsService();
      console.log("Ciclo terminado:", new Date().toLocaleString());
    } catch (error) {
      console.error("Error en worker:", error);
    }
  },
  {
    timezone: "America/Tijuana",
  }
);