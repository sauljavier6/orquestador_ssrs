import { Router } from 'express';
import syncVendorsRoutes from './SSRS/syncVendorsRoutes';
import syncVendorInvoicesRoutes from './SSRS/syncVendorInvoicesRoutes';
import syncCustomersRoutes from './CobranzaPro/syncCustomersRoutes';
import syncCustomerInvoicesRoutes from './CobranzaPro/syncCustomerInvoicesRoutes';

const router = Router();

//sincronizacion con netsuite(poblado de tablas) para ssrs
router.use('/syncvendors', syncVendorsRoutes);
router.use('/syncvendorinvoices', syncVendorInvoicesRoutes);

//sincronizacion con netsuite(poblado de tablas) para CobranzaPro
router.use('/synccustomer', syncCustomersRoutes);
router.use('/synccustomerinvoices', syncCustomerInvoicesRoutes);

export default router;