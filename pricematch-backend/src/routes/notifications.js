import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { NotificationService } from '../services/NotificationService.js';

const router = express.Router();
const notificationService = new NotificationService();

/**
 * GET /api/notifications/poll
 * Polling endpoint - user checks for new deals
 * Returns new deals since last poll, filtered by user preferences
 */
router.get('/poll', verifyToken, async (req, res, next) => {
  try {
    const notifications = await notificationService.getNewDealsForUser(req.userId);

    res.json({
      notifications,
      count: notifications.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/notifications/mark-delivered/:dealId
 * Mark a deal notification as delivered
 */
router.post('/mark-delivered/:dealId', verifyToken, async (req, res, next) => {
  try {
    const { dealId } = req.params;

    const NotificationQueue = (await import('../models/NotificationQueue.js')).default;
    await NotificationQueue.findOneAndUpdate(
      { userId: req.userId, dealId },
      { status: 'delivered', deliveredAt: new Date() }
    );

    res.json({ message: 'Notification marked as delivered' });
  } catch (error) {
    next(error);
  }
});

export default router;
