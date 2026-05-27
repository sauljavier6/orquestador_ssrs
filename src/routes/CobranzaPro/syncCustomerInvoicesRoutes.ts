import { Router } from "express";
import { syncCustomerInvoiceLines, syncCustomerInvoicePayments, syncCustomerPaymentAplication, syncCustomerInvoices } from "../../controllers/CobranzaPro/syncCustomerInvoicesController";

const router = Router();


router.get("/", syncCustomerInvoicePayments);

export default router;
