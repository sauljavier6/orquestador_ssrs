import { Router } from "express";
import { syncCustomerInvoiceLines, syncCustomerInvoices } from "../../controllers/CobranzaPro/syncCustomerInvoicesController";

const router = Router();


router.get("/", syncCustomerInvoiceLines);

export default router;
