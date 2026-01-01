import { Router } from 'express';
import { TwoFactorController } from '@/controllers/two-factor.controller';
import { getSessionStatus, extendSession } from '@/middleware/session-timeout.middleware';
import { authenticate } from '@/middleware/auth';
import { csrfProtection } from '@/middleware/csrf';
import { SecurityMonitoring } from '@/middleware/securityMonitoring';
import { logger } from '@/utils/logger';
import { prisma } from '@/config/database';

const router = Router();
const twoFactorController = new TwoFactorController();

// CSRF token endpoint
router.get('/csrf-token', csrfProtection.getTokenEndpoint());

// 2FA routes
router.post('/2fa/generate', twoFactorController.generateCode);
router.post('/2fa/verify', twoFactorController.verifyCode);

// Session management routes
router.get('/session/status', authenticate, getSessionStatus);
router.post('/session/extend', authenticate, extendSession);

// Security statistics (admin only)
router.get('/stats', authenticate, (req, res) => {
  if ((req as any).user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  res.json({
    monitoring: SecurityMonitoring.getSecurityStatistics(),
    timestamp: new Date().toISOString()
  });
});

// Security incidents (admin only)
router.get('/incidents', authenticate, async (req, res) => {
  try {
    if ((req as any).user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const severity = req.query.severity as string;
    const type = req.query.type as string;

    const where: any = {};
    if (severity) where.severity = severity;
    if (type) where.type = type;

    const incidents = await prisma.securityIncident.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    });

    const total = await prisma.securityIncident.count({ where });

    res.json({
      success: true,
      data: incidents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Failed to fetch security incidents:', error);
    res.status(500).json({ error: 'Failed to fetch security incidents' });
  }
});

// Clear security monitoring data (development only)
if (process.env.NODE_ENV === 'development') {
  router.post('/clear-monitoring', (req, res) => {
    SecurityMonitoring.cleanup();
    res.json({ success: true, message: 'Security monitoring data cleared' });
  });
}

export default router;