import express from 'express';
import Joi from 'joi';
import CouponService from '../services/CouponService.js';
import { verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Initialize coupon service with encryption key from env (lazy-loaded to ensure env is loaded)
let couponService;

function getCouponService() {
  if (!couponService) {
    couponService = new CouponService(process.env.COUPON_ENCRYPTION_KEY);
  }
  return couponService;
}

/**
 * Rate limiter specifically for coupon redemption
 * Stricter than general API rate limit to prevent abuse
 */
const redemptionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 attempts per minute per IP
  message: 'Too many redemption attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/coupons
 * Create a new coupon (admin only)
 * Body: {title, description, category, discountType, discountValue, minimumPurchase, 
 *        expiryDate, maxRedemptions, maxRedemptionsPerUser, imageUrl}
 */
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    // Validate request body
    const schema = Joi.object({
      storeId: Joi.string().required(),
      title: Joi.string().max(200).required(),
      description: Joi.string().max(500),
      category: Joi.string().valid('grocery', 'household', 'personal-care', 'other'),
      discountType: Joi.string().valid('fixed', 'percentage').required(),
      discountValue: Joi.number().positive().required(),
      minimumPurchase: Joi.number().default(0),
      maxRedemptions: Joi.number().integer().min(1).required(),
      maxRedemptionsPerUser: Joi.number().integer().min(1).default(1),
      expiryDate: Joi.date().iso().required(),
      imageUrl: Joi.string().uri(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Check if user is admin (simplified - in production, use proper role-based access)
    // For now, we'll require the user to have proper permissions
    // This should be enforced by middleware in production
    const coupon = await getCouponService().createCoupon(value, value.storeId);

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      coupon,
    });
  } catch (error) {
    console.error('Coupon creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create coupon',
    });
  }
});

/**
 * GET /api/coupons/:couponId
 * Get coupon details (authenticated users only)
 */
router.get('/:couponId', verifyToken, async (req, res) => {
  try {
    const coupon = await getCouponService().getCoupon(req.params.couponId);
    res.json({ success: true, coupon });
  } catch (error) {
    console.error('Coupon retrieval error:', error);
    res.status(error.message === 'Coupon not found' ? 404 : 500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/coupons/store/:storeId
 * Get all active coupons for a store
 */
router.get('/store/:storeId', async (req, res) => {
  try {
    const coupons = await getCouponService().getCouponsByStore(req.params.storeId);
    res.json({ success: true, coupons });
  } catch (error) {
    console.error('Store coupons retrieval error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/coupons/nearby/user
 * Get coupons near the user's location
 * Query: {latitude, longitude, maxDistance (meters)}
 */
router.get('/nearby/user', verifyToken, async (req, res) => {
  try {
    const { latitude, longitude, maxDistance } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        error: 'latitude and longitude are required',
      });
    }

    const coupons = await getCouponService().getNearbyUserCoupons(
      {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      },
      parseInt(maxDistance) || 25000,
      req.user.favoriteStores || []
    );

    res.json({ success: true, coupons });
  } catch (error) {
    console.error('Nearby coupons error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/coupons/validate
 * Validate coupon before redemption
 * Body: {couponCode, storeId, purchaseAmount} OR {couponId, storeId, purchaseAmount}
 * Supports both code-based (legacy) and ID-based (frontend) validation
 */
router.post('/validate', verifyToken, async (req, res) => {
  try {
    const schema = Joi.object({
      couponCode: Joi.string(),
      couponId: Joi.string(),
      storeId: Joi.string().required(),
      purchaseAmount: Joi.number().default(0),
    }).xor('couponCode', 'couponId');

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    let validation;
    
    if (value.couponCode) {
      // Legacy code-based validation
      validation = await getCouponService().validateCouponForRedemption(
        value.couponCode,
        req.userId,
        value.storeId,
        value.purchaseAmount
      );
    } else {
      // New ID-based validation (for frontend mobile app)
      validation = await getCouponService().validateCouponByIdForRedemption(
        value.couponId,
        req.userId,
        value.storeId,
        value.purchaseAmount
      );
    }

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    res.json({
      success: true,
      message: 'Coupon is valid',
      coupon: validation.coupon,
    });
  } catch (error) {
    console.error('Coupon validation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/coupons/redeem
 * Redeem a coupon
 * Body: {couponCode, storeId, redemptionMethod, purchaseAmount, transactionId, location} OR
 *       {couponId, storeId, redemptionMethod, purchaseAmount, transactionId, location}
 * Supports both code-based (legacy/POS) and ID-based (frontend mobile) redemption
 * Rate limited to prevent abuse
 */
router.post('/redeem', verifyToken, redemptionLimiter, async (req, res) => {
  try {
    const schema = Joi.object({
      couponCode: Joi.string(),
      couponId: Joi.string(),
      storeId: Joi.string().required(),
      redemptionMethod: Joi.string().valid('wallet', 'barcode-scan', 'manual').required(),
      purchaseAmount: Joi.number().default(0),
      transactionId: Joi.string(),
      deviceFingerprint: Joi.string(),
      location: Joi.object({
        latitude: Joi.number().required(),
        longitude: Joi.number().required(),
      }),
    }).xor('couponCode', 'couponId');

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Get user's IP address (properly handle proxy headers)
    let ipAddress = req.connection.remoteAddress || '0.0.0.0';
    if (req.headers['x-forwarded-for']) {
      // Take the first IP if multiple are present (client IP is first)
      ipAddress = req.headers['x-forwarded-for'].split(',')[0].trim();
    } else if (req.headers['cf-connecting-ip']) {
      // Cloudflare header
      ipAddress = req.headers['cf-connecting-ip'];
    }

    let result;
    
    if (value.couponCode) {
      // Legacy code-based redemption (from POS systems)
      result = await getCouponService().redeemCoupon(
        value.couponCode,
        req.userId,
        value.storeId,
        ipAddress,
        value.redemptionMethod,
        {
          purchaseAmount: value.purchaseAmount,
          transactionId: value.transactionId,
          deviceFingerprint: value.deviceFingerprint,
          location: value.location,
        }
      );
    } else {
      // New ID-based redemption (from frontend mobile app)
      result = await getCouponService().redeemCouponById(
        value.couponId,
        req.userId,
        value.storeId,
        ipAddress,
        value.redemptionMethod,
        {
          purchaseAmount: value.purchaseAmount,
          transactionId: value.transactionId,
          deviceFingerprint: value.deviceFingerprint,
          location: value.location,
        }
      );
    }

    if (!result.success) {
      // Don't expose internal error details to prevent coupon exploitation information leakage
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      message: 'Coupon redeemed successfully',
      discountApplied: result.discountApplied,
      usageId: result.usageId,
    });
  } catch (error) {
    console.error('Coupon redemption error:', error);
    res.status(500).json({
      success: false,
      error: 'Redemption failed. Please try again.',
    });
  }
});

/**
 * GET /api/coupons/history/:couponId
 * Get redemption history for a coupon (admin only)
 * Query: {status, fraudSuspected, startDate, endDate}
 */
router.get('/history/:couponId', verifyToken, async (req, res) => {
  try {
    // In production, check if user is admin
    const history = await getCouponService().getCouponRedemptionHistory(req.params.couponId, {
      status: req.query.status,
      fraudSuspected: req.query.fraudSuspected === 'true',
      startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
    });

    res.json({ success: true, history });
  } catch (error) {
    console.error('History retrieval error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/coupons/:couponId
 * Revoke a coupon (soft delete)
 */
router.delete('/:couponId', verifyToken, async (req, res) => {
  try {
    // In production, check if user is admin
    const result = await getCouponService().revokeCoupon(req.params.couponId, req.body.reason);

    res.json({
      success: true,
      message: 'Coupon revoked successfully',
      coupon: result,
    });
  } catch (error) {
    console.error('Coupon revocation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
