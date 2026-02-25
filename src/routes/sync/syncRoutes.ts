import { Router } from "express";
import { sincronizarFacturas, sincronizarLocations } from "../../controllers/job";

const router = Router();


router.get("/", sincronizarFacturas);
router.get("/locations", sincronizarLocations);

export default router;
