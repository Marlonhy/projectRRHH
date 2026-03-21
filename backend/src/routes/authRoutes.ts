import { Router } from 'express';
import AuthController from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Rutas públicas
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);

// Rutas protegidas
router.get('/profile', authMiddleware, AuthController.getProfile);
router.post('/change-password', authMiddleware, AuthController.changePassword);
router.get('/directores', authMiddleware, AuthController.getDirectores);

export default router;
