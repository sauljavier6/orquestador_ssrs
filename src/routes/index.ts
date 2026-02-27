import { Router } from 'express';
import syncRoutes from './syncRoutes';
const router = Router();

//sincronizacion con netsuite(poblado de tablas)
router.use('/sync', syncRoutes);

export default router;