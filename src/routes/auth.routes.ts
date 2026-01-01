import { Router } from 'express';
import passport from 'passport';
import { AuthController } from '@/controllers/auth.controller';
import { validateRequest } from '@/middleware/validateRequest';
import { authenticate } from '@/middleware/auth';

const router = Router();
const authController = new AuthController();

// Current user endpoint
router.get('/me', authenticate, authController.getCurrentUser.bind(authController));

// Token verification (should handle unauthenticated gracefully)
router.get('/verify', authController.verifyToken.bind(authController));

// Token refresh
router.post('/refresh', authController.refreshToken.bind(authController));

// OAuth Routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), authController.oauthCallback.bind(authController));

router.get('/linkedin', passport.authenticate('linkedin', { scope: 'openid profile email' }));
router.get('/linkedin/callback', passport.authenticate('linkedin', { failureRedirect: '/login' }), authController.oauthCallback.bind(authController));

router.get('/apple', passport.authenticate('apple'));
router.get('/apple/callback', passport.authenticate('apple', { failureRedirect: '/login' }), authController.oauthCallback.bind(authController));

// Token management endpoints
router.post('/set-tokens', authController.setTokens.bind(authController));
router.post('/clear-tokens', authController.clearTokens.bind(authController));

export { router as authRoutes };