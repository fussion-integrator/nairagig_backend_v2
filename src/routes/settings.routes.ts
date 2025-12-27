import { Router } from 'express';
import { SettingsController } from '@/controllers/settings.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();
const settingsController = new SettingsController();

router.use(authenticate);

router.get('/', settingsController.getSettings.bind(settingsController));
router.put('/', settingsController.updateSettings.bind(settingsController));
router.get('/sessions', settingsController.getSessions.bind(settingsController));
router.delete('/sessions/:id', settingsController.endSession.bind(settingsController));
router.delete('/sessions', settingsController.endAllSessions.bind(settingsController));
router.get('/login-history', settingsController.getLoginHistory.bind(settingsController));
router.post('/account-closure', settingsController.requestAccountClosure.bind(settingsController));
router.delete('/account', settingsController.deleteAccount.bind(settingsController));

export { router as settingsRoutes };