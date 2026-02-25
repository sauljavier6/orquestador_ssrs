import { Router } from "express";
import { verifyAccessToken } from "../../middlewares/authMiddleware";
import { getCuentas } from "../../controllers/customers/cuentascontroller/CuentasController";

const router = Router();

router.get("/", verifyAccessToken, getCuentas);

export default router;
