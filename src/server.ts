import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import session from 'express-session';
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
import fileRoutes from '@/routes/file.routes';
import { paymentRoutes } from '@/routes/payment.routes';

const app = express();

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploads
app.use('/uploads', express.static('uploads'));

// Logging middleware
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

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

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = config.port || 3000;

app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT} in ${config.nodeEnv} mode`);
});

export default app;