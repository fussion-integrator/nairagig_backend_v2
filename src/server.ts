import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import passport from '@/config/passport';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import { errorHandler } from '@/middleware/errorHandler';
import { notFoundHandler } from '@/middleware/notFoundHandler';

// Enterprise Security Middleware
import { EnterpriseSessionSecurity } from '@/middleware/sessionSecurity';
import { csrfProtection } from '@/middleware/csrf';
import { SecurityMonitoring } from '@/middleware/securityMonitoring';

// Routes
import { authRoutes } from '@/routes/auth.routes';
import { userRoutes } from '@/routes/user.routes';
import { jobRoutes } from '@/routes/job.routes';
import { challengeRoutes } from '@/routes/challenge.routes';
import { projectRoutes } from '@/routes/project.routes';
import { messageRoutes } from '@/routes/message.routes';
import { transactionRoutes } from '@/routes/transaction.routes';
import { walletRoutes } from '@/routes/wallet.routes';
import categoryRoutes from '@/routes/category.routes';
import { fileRoutes } from '@/routes/file.routes';
import { paymentRoutes } from '@/routes/payment.routes';
import sponsorshipTierRoutes from '@/routes/sponsorship-tier.routes';
import sponsorshipRoutes from '@/routes/sponsorship.routes';
import { notificationRoutes } from '@/routes/notification.routes';
import { settingsRoutes } from '@/routes/settings.routes';
import { billingRoutes } from '@/routes/billing.routes';
import rewardRoutes from '@/routes/reward.routes';
import { adminRewardRoutes } from '@/routes/admin-reward.routes';
import { adminJobRoutes } from '@/routes/admin-job.routes';
import { verificationRoutes } from '@/routes/verification.routes';
import { proposalRoutes } from '@/routes/proposal.routes';
import { contractRoutes } from '@/routes/contract.routes';
import { disputeRoutes } from '@/routes/dispute.routes';
import { reviewRoutes } from '@/routes/review.routes';
import { supportRoutes } from '@/routes/support.routes';
import { scheduledJobsRoutes } from '@/routes/scheduled-jobs.routes';
import adminAuthRoutes from '@/routes/admin.routes';
import adminManagementRoutes from '@/routes/adminManagement.routes';
import { platformEventsRoutes } from '@/routes/platform-events.routes';
import { marketingRoutes } from '@/routes/marketing.routes';
import contactRoutes from '@/routes/contact.routes';
import { notificationBulkRoutes } from '@/routes/notification-bulk.routes';
import { setupSocketIO } from '@/config/socket';
import searchRoutes from '@/routes/search.routes';
import securityRoutes from '@/routes/security.routes';
import testRoutes from '@/routes/test.routes';
import { sessionTimeoutMiddleware } from '@/middleware/session-timeout.middleware';
import { logRoutes } from '@/routes/logs.routes';
import interviewRoutes from '@/routes/interview.routes';
import { subscriptionRoutes } from '@/routes/subscription.routes';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['polling', 'websocket']
});

// Setup Socket.IO
setupSocketIO(io);

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security Monitoring (Monitor All Requests)
app.use(SecurityMonitoring.monitor);

// Enhanced Helmet Configuration
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS with strict configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = config.corsOrigin; // Already an array
    console.log('🌐 CORS Check - Origin:', origin, 'Allowed:', allowedOrigins);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ CORS Blocked - Origin not allowed:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With']
}));

// Session middleware with enhanced security
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  name: 'nairagig.sid', // Custom session name
  cookie: {
    secure: config.nodeEnv === 'production',
    httpOnly: true,
    maxAge: 15 * 60 * 1000, // 15 minutes
    sameSite: 'strict'
  },
  rolling: true // Reset expiry on activity
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Body parsing middleware with enhanced security
app.use(compression());
app.use(cookieParser(config.sessionSecret)); // Sign cookies
app.use(express.json({ 
  limit: '1mb',
  verify: (req, res, buf) => {
    (req as any).rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '1mb',
  parameterLimit: 100
}));

// Enhanced session security
app.use(EnterpriseSessionSecurity.validateSession);

// Static file serving with security headers
app.use('/uploads', 
  express.static('uploads', {
    maxAge: '1d',
    etag: false,
    lastModified: false
  })
);

// Logging middleware
app.use(morgan('combined', { 
  stream: { write: (message) => logger.info(message.trim()) },
  skip: (req) => req.path === '/health' // Skip health check logs
}));

// CSRF Protection (Applied to state-changing requests)
app.use(csrfProtection.middleware());

// Session timeout middleware
app.use('/api/', sessionTimeoutMiddleware);

// Health check endpoint (with minimal logging)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
    security: 'ENTERPRISE'
  });
});

// Development endpoint to clear rate limits
if (config.nodeEnv === 'development') {
  app.post('/api/dev/clear-security', (req, res) => {
    SecurityMonitoring.cleanup();
    res.json({ success: true, message: 'Security monitoring cleared' });
  });
}

// API routes with version prefix
const apiPrefix = `/api/${config.apiVersion}`;

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/users`, userRoutes);
app.use(`${apiPrefix}/jobs`, jobRoutes);
app.use(`${apiPrefix}/challenges`, challengeRoutes);
app.use(`${apiPrefix}/projects`, projectRoutes);
app.use(`${apiPrefix}/messages`, messageRoutes);
app.use(`${apiPrefix}/transactions`, transactionRoutes);
app.use(`${apiPrefix}/wallets`, walletRoutes);
app.use(`${apiPrefix}/categories`, categoryRoutes);
app.use(`${apiPrefix}/files`, fileRoutes);
app.use(`${apiPrefix}/payments`, paymentRoutes);
app.use(`${apiPrefix}/sponsorship-tiers`, sponsorshipTierRoutes);
app.use(`${apiPrefix}/sponsorship`, sponsorshipRoutes);
app.use(`${apiPrefix}/notifications`, notificationRoutes);
app.use(`${apiPrefix}/settings`, settingsRoutes);
app.use(`${apiPrefix}/billing`, billingRoutes);
app.use(`${apiPrefix}/rewards`, rewardRoutes);
app.use(`${apiPrefix}/admin/rewards`, adminRewardRoutes);
app.use(`${apiPrefix}/admin/jobs`, adminJobRoutes);
app.use(`${apiPrefix}/verifications`, verificationRoutes);
app.use(`${apiPrefix}/proposals`, proposalRoutes);
app.use(`${apiPrefix}/contracts`, contractRoutes);
app.use(`${apiPrefix}/disputes`, disputeRoutes);
app.use(`${apiPrefix}/reviews`, reviewRoutes);
app.use(`${apiPrefix}/support`, supportRoutes);
app.use(`${apiPrefix}/webhooks/scheduled`, scheduledJobsRoutes);
app.use(`${apiPrefix}/admin/auth`, adminAuthRoutes);
app.use(`${apiPrefix}/admin`, adminManagementRoutes);
app.use(`${apiPrefix}/platform-events`, platformEventsRoutes);
app.use(`${apiPrefix}/marketing`, marketingRoutes);
app.use(`${apiPrefix}/contact`, contactRoutes);
app.use(`${apiPrefix}/search`, searchRoutes);
app.use(`${apiPrefix}/security`, securityRoutes);
app.use(`${apiPrefix}/test`, testRoutes);
app.use(`${apiPrefix}/interview`, interviewRoutes);
app.use(`${apiPrefix}/logs`, logRoutes);
app.use(`${apiPrefix}/subscriptions`, subscriptionRoutes);
app.use(`${apiPrefix}/notifications/bulk`, notificationBulkRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Cleanup intervals for security components
setInterval(() => {
  EnterpriseSessionSecurity.cleanupExpiredSessions();
}, 5 * 60 * 1000); // Every 5 minutes

const PORT = config.port || 3000;

server.listen(PORT, () => {
  logger.info(`🚀 NairaGig Enterprise Server running on port ${PORT}`);
  logger.info(`🔒 Security Level: ENTERPRISE`);
  logger.info(`🛡️  Environment: ${config.nodeEnv}`);
});

export { app, io };
export default app;