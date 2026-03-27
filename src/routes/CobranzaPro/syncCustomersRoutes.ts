import { Router } from "express";
import { syncCustomers } from "../../controllers/CobranzaPro/syncCustomersController";

const router = Router();


router.get("/", syncCustomers);

export default router;
