import { Router } from 'express';
import authRoutes from './auth/authRoutes';
import homeRoutes from './customers/homeRoutes';
import cuentasRoutes from './customers/cuentasRoutes';
import syncRoutes from './sync/syncRoutes';
import facturasRoutes from './customers/facturasRoutes';

const router = Router();


// Prefijos para cada grupo de rutas
router.use('/auth', authRoutes);

//customer routes
router.use('/customer/home', homeRoutes);
router.use('/customer/cuentas', cuentasRoutes);
router.use('/customer/facturas', facturasRoutes);


//sincronizacion con netsuite(poblado de tablas)
router.use('/sync/facturas', syncRoutes);

export default router;