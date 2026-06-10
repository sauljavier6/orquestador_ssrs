import { Router } from "express";
import { syncDebug } from "../../controllers/Test/testController";
import { syncCustomers } from "../../controllers/CobranzaPro/syncCustomersController";
import { syncCustomerInvoiceLines, syncCustomerInvoicePayments, syncCustomerInvoices, syncCustomerPaymentAplication } from "../../controllers/CobranzaPro/syncCustomerInvoicesController";

const router = Router();


router.get("/", syncCustomers);

export default router;
