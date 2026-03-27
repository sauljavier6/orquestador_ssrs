//database.ts

import { Sequelize } from "sequelize-typescript";
import dotenv from "dotenv";

import SyncControl from "../models/SSRS/SyncControl";
import Vendor from "../models/SSRS/Vendor";
import VendorStaging from "../models/SSRS/VendorStaging";
import VendorInvoiceStaging from "../models/SSRS/VendorInvoiceStaging";
import VendorInvoice from "../models/SSRS/VendorInvoice";
import VendorInvoiceLine from "../models/SSRS/VendorInvoiceLine";
import VendorInvoiceLineStaging from "../models/SSRS/VendorInvoiceLineStaging";
import VendorInvoicePaymentStaging from "../models/SSRS/VendorInvoicePaymentStaging";
import VendorInvoicePayment from "../models/SSRS/VendorInvoicePayment";

dotenv.config();

const sequelizeSSRS = new Sequelize({
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

export default sequelizeSSRS;