import { Router } from "express";
import multer from "multer";
import { getTicketsBase0 } from "../../controllers/ConsultasSql/consultaController";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/netsuite/tickets/base0",
  upload.single("file"),
  getTicketsBase0
);

export default router;