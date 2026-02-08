import express from 'express';
import AppleWalletService from '../services/AppleWalletService.js';
import GoogleWalletService from '../services/GoogleWalletService.js';
import CouponSecurityService from '../services/CouponSecurityService.js';
import { verifyToken } from '../middleware/auth.js';
import Coupon from '../models/Coupon.js';
import User from '../models/User.js';

const router = express.Router();

// Initialize wallet services (lazy-loaded to ensure env is loaded)
let appleWallet = null;
let googleWallet = null;
let couponSecurity = null;

function getCouponSecurity() {
  if (!couponSecurity) {
    couponSecurity = new CouponSecurityService(process.env.COUPON_ENCRYPTION_KEY);
  }
  return couponSecurity;
}

// Initialize services with error handling
try {
  if (process.env.APPLE_PASS_CERTIFICATE && process.env.APPLE_PASS_KEY) {
    appleWallet = new AppleWalletService();
  }
} catch (error) {
  console.warn('Apple Wallet service not available:', error.message);
}

try {
  if (process.env.GOOGLE_WALLET_SERVICE_ACCOUNT) {
    googleWallet = new GoogleWalletService();
  }
} catch (error) {
  console.warn('Google Wallet service not available:', error.message);
}

/**
 * POST /api/wallet/apple/generate
 * Generate an Apple Wallet (.pkpass) file for a coupon
 * Returns binary .pkpass file that user can download
 */
router.post('/apple/generate', verifyToken, async (req, res) => {
  try {
    if (!appleWallet) {
      return res.status(503).json({
        error: 'Apple Wallet service is not available',
      });
    }

    const { couponId } = req.body;

    if (!couponId) {
      return res.status(400).json({ error: 'couponId is required' });
    }

    // Fetch coupon and user
    const [coupon, user] = await Promise.all([
      Coupon.findById(couponId).populate('storeId'),
      User.findById(req.userId),
    ]);

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    if (!coupon.walletEnabled) {
      return res.status(400).json({ error: 'This coupon does not support Apple Wallet' });
    }

    // Generate unique pass ID
    const passId = `${coupon._id}-${user._id}-${Date.now()}`;

    // Get decrypted code for wallet display
    let decryptedCode = '';
    try {
      decryptedCode = getCouponSecurity().decryptCouponCode(coupon.encryptedCode);
    } catch (error) {
      console.error('Code decryption failed:', error);
      return res.status(500).json({ error: 'Failed to process coupon' });
    }

    // Generate pass
    const pkpassBuffer = await appleWallet.generatePass(coupon, decryptedCode, user, passId);

    // Update coupon with pass ID
    if (!coupon.appleWalletPassId) {
      coupon.appleWalletPassId = passId;
      await coupon.save();
    }

    // Return as binary file
    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="${coupon.title}.pkpass"`);
    res.send(pkpassBuffer);
  } catch (error) {
    console.error('Apple Wallet generation error:', error);
    res.status(500).json({
      error: 'Failed to generate Apple Wallet pass',
    });
  }
});

/**
 * POST /api/wallet/google/generate
 * Generate a Google Wallet JWT for adding coupon to Android wallet
 * Returns JWT that can be added to "Add to Google Wallet" button
 */
router.post('/google/generate', verifyToken, async (req, res) => {
  try {
    if (!googleWallet) {
      return res.status(503).json({
        error: 'Google Wallet service is not available',
      });
    }

    const { couponId } = req.body;

    if (!couponId) {
      return res.status(400).json({ error: 'couponId is required' });
    }

    // Fetch coupon and user
    const [coupon, user] = await Promise.all([
      Coupon.findById(couponId).populate('storeId'),
      User.findById(req.userId),
    ]);

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    if (!coupon.walletEnabled) {
      return res.status(400).json({ error: 'This coupon does not support Google Wallet' });
    }

    // Generate unique object ID
    const objectId = `${coupon._id}-${user._id}-${Date.now()}`;

    // Get decrypted code for wallet display
    let decryptedCode = '';
    try {
      decryptedCode = getCouponSecurity().decryptCouponCode(coupon.encryptedCode);
    } catch (error) {
      console.error('Code decryption failed:', error);
      return res.status(500).json({ error: 'Failed to process coupon' });
    }

    // Generate wallet JWT
    const walletJwt = await googleWallet.generateWalletLink(coupon, decryptedCode, user, objectId);

    // Update coupon with pass ID
    if (!coupon.googleWalletPassId) {
      coupon.googleWalletPassId = objectId;
      await coupon.save();
    }

    // Return JWT and configuration for button
    const saveLink = googleWallet.generateSaveLink(walletJwt);
    const buttonConfig = googleWallet.generateSaveButtonConfig(walletJwt);

    res.json({
      success: true,
      jwt: walletJwt,
      saveLink,
      buttonConfig,
    });
  } catch (error) {
    console.error('Google Wallet generation error:', error);
    res.status(500).json({
      error: 'Failed to generate Google Wallet link',
    });
  }
});

/**
 * POST /api/wallet/apple/webhook
 * Webhook endpoint for Apple Wallet pass updates
 * Apple calls this when users update or delete a pass
 */
router.post('/apple/webhook', async (req, res) => {
  try {
    if (!appleWallet) {
      return res.status(503).json({ error: 'Apple Wallet service unavailable' });
    }

    const { serialNumbers, passTypeIdentifier, lastUpdatedTimestamp } = req.body;

    // Log webhook for debugging
    console.log('Apple Wallet webhook:', {
      serialNumbers,
      passTypeIdentifier,
      timestamp: lastUpdatedTimestamp,
    });

    // In production: update pass data, send notifications, etc.
    // For now, acknowledge receipt
    res.json({ success: true });
  } catch (error) {
    console.error('Apple Wallet webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/wallet/google/webhook
 * Webhook endpoint for Google Wallet pass updates
 * Google calls this when users add/remove/modify a pass
 */
router.post('/google/webhook', async (req, res) => {
  try {
    if (!googleWallet) {
      return res.status(503).json({ error: 'Google Wallet service unavailable' });
    }

    // Validate webhook payload
    const payload = googleWallet.validateGoogleWebhook(req);

    // Extract coupon code from webhook
    const couponCode = googleWallet.extractCouponFromWebhook(payload);

    // Log webhook for debugging
    console.log('Google Wallet webhook:', {
      couponCode: couponCode.substring(0, 8) + '...',
      timestamp: new Date(),
    });

    // In production: update pass state, send notifications, etc.
    // For now, acknowledge receipt
    res.json({ success: true });
  } catch (error) {
    console.error('Google Wallet webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * GET /api/wallet/status/:couponId
 * Check wallet pass generation status
 * Returns whether pass is available for iOS/Android
 */
router.get('/status/:couponId', verifyToken, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.couponId);

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    res.json({
      success: true,
      walletStatus: {
        enabled: coupon.walletEnabled,
        apple: {
          available: !!appleWallet,
          generated: !!coupon.appleWalletPassId,
        },
        google: {
          available: !!googleWallet,
          generated: !!coupon.googleWalletPassId,
        },
      },
    });
  } catch (error) {
    console.error('Wallet status check error:', error);
    res.status(500).json({ error: 'Failed to check wallet status' });
  }
});

export default router;
