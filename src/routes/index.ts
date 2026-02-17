import { Router } from 'express';
import authRoutes from './auth/authRoutes';

const router = Router();


// Prefijos para cada grupo de rutas
router.use('/auth', authRoutes);


export default router;