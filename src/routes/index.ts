import { Router } from 'express';
import syncVendorsRoutes from './syncVendorsRoutes';
import syncVendorInvoicesRoutes from './syncVendorInvoicesRoutes';

const router = Router();

//sincronizacion con netsuite(poblado de tablas)
router.use('/syncvendors', syncVendorsRoutes);
router.use('/syncvendorinvoices', syncVendorInvoicesRoutes);

export default router;