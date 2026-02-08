import Sentry from '@sentry/node';

export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Log to Sentry if configured
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
