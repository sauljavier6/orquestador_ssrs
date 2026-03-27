//dbFinanzaPro.ts

import { Sequelize } from "sequelize-typescript";
import dotenv from "dotenv";
import CustomerStaging from "../models/CobranzaPro/CustomerStaging";
import Customer from "../models/CobranzaPro/Customer";
import CustomerInvoice from "../models/CobranzaPro/CustomerInvoice";
import CustomerInvoiceStaging from "../models/CobranzaPro/CustomerInvoiceStaging";
import CustomerInvoiceLine from "../models/CobranzaPro/CustomerInvoiceLine";
import CustomerInvoiceLineStaging from "../models/CobranzaPro/CustomerInvoiceLineStaging";
import CustomerInvoicePaymentStaging from "../models/CobranzaPro/CustomerInvoicePaymentStaging";
import CustomerInvoicePayment from "../models/CobranzaPro/CustomerInvoicePayment";
import SyncControl from "../models/CobranzaPro/SyncControl";

dotenv.config();

const sequelizeCP = new Sequelize({
  dialect: "mssql",
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 1433,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_CP_NAME,

  models: [
  SyncControl,
  Customer, CustomerStaging, CustomerInvoice, CustomerInvoiceStaging, CustomerInvoiceLine, CustomerInvoiceLineStaging,
  CustomerInvoicePaymentStaging, CustomerInvoicePayment
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
      requestTimeout: 300000
    }
  },

  benchmark: true
});

export default sequelizeCP;