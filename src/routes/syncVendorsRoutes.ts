import { Router } from "express";
import { syncVendors } from "../controllers/syncVendorsController";

const router = Router();


router.get("/", syncVendors);

export default router;
