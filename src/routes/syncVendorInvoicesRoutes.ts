import { Router } from "express";
import {  syncVendorInvoiceLines, syncVendorInvoicePayments, syncVendorInvoices } from "../controllers/syncVendorInvoices.controller";

const router = Router();


router.get("/", syncVendorInvoicePayments);
//router.get("/test", queryTest);


export default router;
