// src/config/netsuite.ts
import odbc from "odbc";
import dotenv from "dotenv";

dotenv.config();

export async function getNetSuiteConnection() {
  const connectionString = `
    DSN=${process.env.NS_ODBC_DSN};
    UID=${process.env.NS_ODBC_USER};
    PWD=${process.env.NS_ODBC_PASSWORD};
  `;

  return odbc.connect(connectionString);
}