import { Router } from "express";
import { verifyAccessToken } from "../../middlewares/authMiddleware";
import { getfacturaById } from "../../controllers/customers/facturascontroller/FacturasController";

const router = Router();

router.get("/:id", verifyAccessToken, getfacturaById);

export default router;
