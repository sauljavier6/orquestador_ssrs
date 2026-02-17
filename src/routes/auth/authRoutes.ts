// src/routes/authRoutes.ts
import express from 'express';
import { login, logout, refreshAccessToken, register, requestPasswordReset, resetPassword } from '../../controllers/auth/authController';
import { verifyAccessToken } from '../../middlewares/authMiddleware';
import { uploadProfile } from '../../middlewares/uploadProfile';
import { resizeProfileImage } from '../../middlewares/resizeProfileImage ';

const router = express.Router();

router.post('/login', login);
router.post('/register',uploadProfile, resizeProfileImage, register);
router.post('/refresh', refreshAccessToken);
router.post("/logout", verifyAccessToken, logout);
router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", resetPassword);

export default router;