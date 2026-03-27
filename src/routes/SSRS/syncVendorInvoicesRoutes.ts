import { Router } from "express";
import { syncVendorInvoiceLines, syncVendorInvoicePayments, syncVendorInvoices } from "../../controllers/SSRS/syncVendorInvoicesController";

const router = Router();


router.get("/", syncVendorInvoiceLines);


export default router;
