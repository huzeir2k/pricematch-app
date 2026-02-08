import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'express-async-errors';
import Sentry from '@sentry/node';
import dotenv from 'dotenv';

// Load environment variables FIRST, before any other imports that might use them
dotenv.config();

import { connectDatabase } from './config/database.js';
import { verifyToken } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { schedulerInstance } from './services/ScraperJobScheduler.js';

// Routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import dealRoutes from './routes/deals.js';
import notificationRoutes from './routes/notifications.js';
import storeRoutes from './routes/stores.js';
import couponRoutes from './routes/coupons.js';
import walletRoutes from './routes/wallet.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Sentry if configured
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 1.0,
  });

  app.use(Sentry.Handlers.requestHandler());
}

// Validate critical environment variables at startup
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('ERROR: JWT_SECRET must be set and at least 32 characters long');
  process.exit(1);
}

// Middleware
app.use(helmet());
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
if (corsOrigin === '*') {
  console.warn('WARNING: CORS origin is wildcard (*). Credentials will not be sent. Set CORS_ORIGIN to specific domain for production.');
}
app.use(cors({
  origin: corsOrigin,
  credentials: corsOrigin !== '*', // Don't allow credentials with wildcard origin
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/wallet', walletRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler middleware
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}
app.use(errorHandler);

// Initialize database and start server
const startServer = async () => {
  try {
    // Connect to MongoDB BEFORE starting Express server
    await connectDatabase();
    console.log('Database connected successfully');

    // Only start the Express server after DB is connected
    const server = app.listen(PORT, () => {
      console.log(`PriceMatch Backend running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Initialize scheduled jobs
    schedulerInstance.scheduleFoodBasicsWeekly(process.env.FOOD_BASICS_CRON || '0 2 * * 0');
    schedulerInstance.scheduleNotificationCleanup(process.env.NOTIFICATION_CLEANUP_CRON || '0 3 * * *');
    schedulerInstance.scheduleDealCleanup(process.env.DEAL_CLEANUP_CRON || '0 4 * * *');

    // Graceful shutdown for both SIGINT (Ctrl+C) and SIGTERM (container/process termination)
    const gracefulShutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      schedulerInstance.stopAll();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
      // Force shutdown after 30 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
