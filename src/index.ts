import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import sequelizeSSRS from "./config/dbSSRS";
import sequelizeFP from "./config/dbCobranzaPro";
import indexRoutes from "./routes/index";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";

dotenv.config();

const FRONTEND = process.env.FRONTEND_ORIGINS;
const PORT = process.env.PORT ? Number(process.env.PORT) : 4580;

const app = express();

app.use(morgan("dev"));

app.use(
  cors({
    origin: FRONTEND,
    credentials: true,
  })
);

app.use(express.json());

app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"))
);

app.use(cookieParser());

app.use("/api", indexRoutes);

async function startServer() {
  try {
    await sequelizeSSRS.authenticate();
    await sequelizeFP.authenticate();

    console.log("✅ Conexiones a SQL Server OK");

      await sequelizeSSRS.sync({ alter: true });
      await sequelizeFP.sync({ alter: true });
    console.log("✅ Tablas sincronizadas");

    const server = app.listen(PORT, "0.0.0.0", async () => {
      console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);

      try {
        await import("./workers");
        console.log("✅ Workers cargados correctamente");
      } catch (workerError) {
        console.error("❌ Error al cargar workers:", workerError);
      }
    });

    server.on("error", (error) => {
      console.error("❌ Error del servidor HTTP:", error);
    });
  } catch (error) {
    console.error("❌ Error al iniciar:", error);
    process.exit(1);
  }
}

void startServer();