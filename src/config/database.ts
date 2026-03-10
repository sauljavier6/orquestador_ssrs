import { Sequelize } from "sequelize-typescript";
import dotenv from "dotenv";

import SyncControl from "../models/SyncControl";
import Vendor from "../models/Vendor";
import VendorStaging from "../models/VendorStaging";
import VendorInvoiceStaging from "../models/VendorInvoiceStaging";
import VendorInvoice from "../models/VendorInvoice";
import VendorInvoiceLine from "../models/VendorInvoiceLine";
import VendorInvoiceLineStaging from "../models/VendorInvoiceLineStaging";
import VendorInvoicePaymentStaging from "../models/VendorInvoicePaymentStaging";
import VendorInvoicePayment from "../models/VendorInvoicePayment";

dotenv.config();

const sequelize = new Sequelize({
  dialect: "mssql",
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 1433,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  models: [
    SyncControl,
    Vendor,
    VendorStaging,
    VendorInvoiceStaging,
    VendorInvoice,
    VendorInvoiceLine,
    VendorInvoiceLineStaging,
    VendorInvoicePayment,
    VendorInvoicePaymentStaging
  ],

  logging: false,
  pool: {
    max: 20,
    min: 2,
    idle: 10000,
    acquire: 60000
  },

  dialectOptions: {
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      requestTimeout: 300000 // ✅ 5 minutos
    }
  },

  benchmark: true
});

export default sequelize;