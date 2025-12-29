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
import rateLimit from 'express-rate-limit';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import { errorHandler } from '@/middleware/errorHandler';
import { notFoundHandler } from '@/middleware/notFoundHandler';
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
import { debugRoutes } from '@/routes/debug.routes';
import rewardRoutes from '@/routes/reward.routes';
import { adminRewardRoutes } from '@/routes/admin-reward.routes';
import { verificationRoutes } from '@/routes/verification.routes';
import { proposalRoutes } from '@/routes/proposal.routes';
import { contractRoutes } from '@/routes/contract.routes';
import { disputeRoutes } from '@/routes/dispute.routes';
import { reviewRoutes } from '@/routes/review.routes';
import { supportRoutes } from '@/routes/support.routes';
import { scheduledJobsRoutes } from '@/routes/scheduled-jobs.routes';
import { adminRoutes } from '@/routes/admin.routes';
import { platformEventsRoutes } from '@/routes/platform-events.routes';
import { marketingRoutes } from '@/routes/marketing.routes';
import contactRoutes from '@/routes/contact.routes';
import { notificationBulkRoutes } from '@/routes/notification-bulk.routes';
import { setupSocketIO } from '@/config/socket';
import searchRoutes from '@/routes/search.routes';
import securityRoutes from '@/routes/security.routes';
import testRoutes from '@/routes/test.routes';
import { sessionTimeoutMiddleware } from '@/middleware/session-timeout.middleware';

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

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigin,
  credentials: true
}));

// Session middleware
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.nodeEnv === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploads
app.use('/uploads', express.static('uploads'));

// Logging middleware
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Session timeout middleware (apply to all API routes)
app.use('/api/', sessionTimeoutMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv
  });
});

// API routes
app.use(`/api/${config.apiVersion}/auth`, authRoutes);
app.use(`/api/${config.apiVersion}/users`, userRoutes);
app.use(`/api/${config.apiVersion}/jobs`, jobRoutes);
app.use(`/api/${config.apiVersion}/challenges`, challengeRoutes);
app.use(`/api/${config.apiVersion}/projects`, projectRoutes);
app.use(`/api/${config.apiVersion}/messages`, messageRoutes);
app.use(`/api/${config.apiVersion}/transactions`, transactionRoutes);
app.use(`/api/${config.apiVersion}/wallets`, walletRoutes);
app.use(`/api/${config.apiVersion}/categories`, categoryRoutes);
app.use(`/api/${config.apiVersion}/files`, fileRoutes);
app.use(`/api/${config.apiVersion}/payments`, paymentRoutes);
app.use(`/api/${config.apiVersion}/sponsorship-tiers`, sponsorshipTierRoutes);
app.use(`/api/${config.apiVersion}/sponsorship`, sponsorshipRoutes);
app.use(`/api/${config.apiVersion}/notifications`, notificationRoutes);
app.use(`/api/${config.apiVersion}/settings`, settingsRoutes);
app.use(`/api/${config.apiVersion}/billing`, billingRoutes);
app.use(`/api/${config.apiVersion}/rewards`, rewardRoutes);
app.use(`/api/${config.apiVersion}/admin/rewards`, adminRewardRoutes);
app.use(`/api/${config.apiVersion}/verifications`, verificationRoutes);
app.use(`/api/${config.apiVersion}/proposals`, proposalRoutes);
app.use(`/api/${config.apiVersion}/contracts`, contractRoutes);
app.use(`/api/${config.apiVersion}/disputes`, disputeRoutes);
app.use(`/api/${config.apiVersion}/reviews`, reviewRoutes);
app.use(`/api/${config.apiVersion}/support`, supportRoutes);
app.use(`/api/${config.apiVersion}/webhooks/scheduled`, scheduledJobsRoutes);
app.use(`/api/${config.apiVersion}/admin`, adminRoutes);
app.use(`/api/${config.apiVersion}/platform-events`, platformEventsRoutes);
app.use(`/api/${config.apiVersion}/marketing`, marketingRoutes);
app.use(`/api/${config.apiVersion}/contact`, contactRoutes);
app.use(`/api/${config.apiVersion}/search`, searchRoutes);
app.use(`/api/${config.apiVersion}/security`, securityRoutes);
app.use(`/api/${config.apiVersion}/test`, testRoutes);
app.use(`/api/${config.apiVersion}/notifications/bulk`, notificationBulkRoutes);
app.use(`/api/${config.apiVersion}/debug`, debugRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = config.port || 3000;

server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT} in ${config.nodeEnv} mode`);
});

export { app, io };
export default app;