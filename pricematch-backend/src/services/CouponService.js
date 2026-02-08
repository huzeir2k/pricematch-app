import Coupon from '../models/Coupon.js';
import CouponUsage from '../models/CouponUsage.js';
import { CouponSecurityService } from './CouponSecurityService.js';
import { ObjectId } from 'mongodb';

/**
 * Service for coupon management with fraud prevention
 */
export class CouponService {
  constructor(encryptionKey) {
    this.securityService = new CouponSecurityService(encryptionKey);
  }

  /**
   * Create a new coupon with security
   * @param {object} couponData - Coupon details
   * @param {string} storeId - Store reference
   * @returns {object} Created coupon document
   */
  async createCoupon(couponData, storeId) {
    // Generate and hash coupon code
    const couponCode = this.securityService.generateCouponCode();
    const codeHash = this.securityService.hashCouponCode(couponCode);
    const encryptedCode = this.securityService.encryptCouponCode(couponCode);

    // Validate coupon doesn't already exist (unlikely, but check)
    const existing = await Coupon.findOne({ codeHash });
    if (existing) {
      throw new Error('Coupon code collision detected, please retry');
    }

    const coupon = new Coupon({
      storeId,
      codeHash,
      encryptedCode,
      title: couponData.title,
      description: couponData.description,
      category: couponData.category || 'grocery',
      discountType: couponData.discountType,
      discountValue: couponData.discountValue,
      minimumPurchase: couponData.minimumPurchase || 0,
      imageUrl: couponData.imageUrl,
      validFrom: couponData.validFrom || new Date(),
      expiryDate: couponData.expiryDate,
      maxRedemptions: couponData.maxRedemptions,
      maxRedemptionsPerUser: couponData.maxRedemptionsPerUser || 1,
      walletEnabled: couponData.walletEnabled !== false,
      createdBy: couponData.createdBy || 'admin',
    });

    await coupon.save();

    // Return coupon without code or encrypted code
    return this.sanitizeCoupon(coupon.toObject());
  }

  /**
   * Get coupon details (for authenticated users)
   * @param {string} couponId - Coupon ID
   * @returns {object} Coupon document
   */
  async getCoupon(couponId) {
    const coupon = await Coupon.findById(couponId).populate('storeId', 'storeName chainName');
    if (!coupon) {
      throw new Error('Coupon not found');
    }
    return this.sanitizeCoupon(coupon.toObject());
  }

  /**
   * Get all active coupons for a store
   * @param {string} storeId - Store ID
   * @returns {array} Array of coupons
   */
  async getCouponsByStore(storeId) {
    const coupons = await Coupon.find({
      storeId,
      isActive: true,
      expiryDate: { $gt: new Date() },
    }).select('-codeHash -encryptedCode');

    return coupons.map((c) => this.sanitizeCoupon(c.toObject()));
  }

  /**
   * Get nearby coupons for a user based on location and preferences
   * @param {object} userLocation - User coordinates {latitude, longitude}
   * @param {string} maxDistance - Distance in meters (default: 25km)
   * @param {array} favoriteStoreIds - User's favorite stores
   * @returns {array} Nearby active coupons
   */
  async getNearbyUserCoupons(userLocation, maxDistance = 25000, favoriteStoreIds = []) {
    try {
      const coupons = await Coupon.aggregate([
        {
          $match: {
            isActive: true,
            expiryDate: { $gt: new Date() },
            currentRedemptions: { $lt: '$maxRedemptions' },
          },
        },
        {
          $lookup: {
            from: 'stores',
            localField: 'storeId',
            foreignField: '_id',
            as: 'storeDetails',
          },
        },
        {
          $unwind: '$storeDetails',
        },
        {
          $addFields: {
            distance: {
              $function: {
                body: `function(lon, lat) {
                  const userLon = ${userLocation.longitude};
                  const userLat = ${userLocation.latitude};
                  const R = 6371000; // Earth radius in meters
                  const dLat = (lat - userLat) * Math.PI / 180;
                  const dLon = (lon - userLon) * Math.PI / 180;
                  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(userLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
                  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                  return R * c;
                }`,
                args: ['$storeDetails.coordinates.coordinates.0', '$storeDetails.coordinates.coordinates.1'],
                lang: 'js',
              },
            },
            isFavorite: {
              $in: ['$storeId', favoriteStoreIds.map((id) => new ObjectId(id))],
            },
          },
        },
        {
          $match: {
            distance: { $lte: maxDistance },
          },
        },
        {
          $sort: {
            isFavorite: -1,
            distance: 1,
            discountValue: -1,
          },
        },
        {
          $project: {
            codeHash: 0,
            encryptedCode: 0,
          },
        },
      ]);

      return coupons;
    } catch (error) {
      throw new Error(`Failed to fetch nearby coupons: ${error.message}`);
    }
  }

  /**
   * Validate coupon by ID for redemption (frontend mobile app)
   * @param {string} couponId - Coupon ID
   * @param {string} userId - User attempting redemption
   * @param {string} storeId - Store where redemption occurs
   * @param {number} purchaseAmount - Purchase total (for minimum purchase validation)
   * @returns {object} Validation result {valid: boolean, error?: string, coupon?: object}
   */
  async validateCouponByIdForRedemption(couponId, userId, storeId, purchaseAmount = 0) {
    const validationErrors = [];

    try {
      // Find coupon by ID
      const coupon = await Coupon.findById(couponId).lean();

      if (!coupon) {
        return { valid: false, error: 'Coupon not found' };
      }

      // 3. Check if coupon is active
      if (!coupon.isActive) {
        validationErrors.push('Coupon is no longer active');
      }

      // 4. Check expiration
      if (coupon.expiryDate < new Date()) {
        validationErrors.push('Coupon has expired');
      }

      // 5. Check max global redemptions
      if (coupon.currentRedemptions >= coupon.maxRedemptions) {
        validationErrors.push('Coupon redemption limit reached');
      }

      // 6. Check if user has reached per-user limit
      const userRedemptions = await CouponUsage.countDocuments({
        userId,
        couponId: coupon._id,
        status: 'redeemed',
      });

      if (userRedemptions >= coupon.maxRedemptionsPerUser) {
        validationErrors.push('You have reached the redemption limit for this coupon');
      }

      // 7. Check store match
      if (coupon.storeId.toString() !== storeId.toString()) {
        validationErrors.push('Coupon is not valid at this store');
      }

      // 8. Check minimum purchase requirement
      if (purchaseAmount < coupon.minimumPurchase) {
        validationErrors.push(
          `Minimum purchase of $${coupon.minimumPurchase.toFixed(2)} required`
        );
      }

      // 9. Check valid from date
      if (coupon.validFrom > new Date()) {
        validationErrors.push('Coupon is not yet valid');
      }

      if (validationErrors.length > 0) {
        return { valid: false, error: validationErrors.join('; ') };
      }

      return { valid: true, coupon };
    } catch (error) {
      return { valid: false, error: `Validation error: ${error.message}` };
    }
  }

  /**
   * Validate coupon for redemption with comprehensive checks
   * @param {string} couponCode - Coupon code provided by user
   * @param {string} userId - User attempting redemption
   * @param {string} storeId - Store where redemption occurs
   * @param {number} purchaseAmount - Purchase total (for minimum purchase validation)
   * @returns {object} Validation result {valid: boolean, error?: string}
   */
  async validateCouponForRedemption(couponCode, userId, storeId, purchaseAmount = 0) {
    const validationErrors = [];

    try {
      // 1. Validate code format
      if (!this.securityService.isValidCouponFormat(couponCode)) {
        return { valid: false, error: 'Invalid coupon code format' };
      }

      // 2. Find coupon by code hash
      const codeHash = this.securityService.hashCouponCode(couponCode);
      const coupon = await Coupon.findOne({ codeHash }).lean();

      if (!coupon) {
        return { valid: false, error: 'Coupon not found' };
      }

      // 3. Check if coupon is active
      if (!coupon.isActive) {
        validationErrors.push('Coupon is no longer active');
      }

      // 4. Check expiration
      if (coupon.expiryDate < new Date()) {
        validationErrors.push('Coupon has expired');
      }

      // 5. Check max global redemptions
      if (coupon.currentRedemptions >= coupon.maxRedemptions) {
        validationErrors.push('Coupon redemption limit reached');
      }

      // 6. Check if user has reached per-user limit
      const userRedemptions = await CouponUsage.countDocuments({
        userId,
        couponId: coupon._id,
        status: 'redeemed',
      });

      if (userRedemptions >= coupon.maxRedemptionsPerUser) {
        validationErrors.push('You have reached the redemption limit for this coupon');
      }

      // 7. Check store match
      if (coupon.storeId.toString() !== storeId.toString()) {
        validationErrors.push('Coupon is not valid at this store');
      }

      // 8. Check minimum purchase requirement
      if (purchaseAmount < coupon.minimumPurchase) {
        validationErrors.push(
          `Minimum purchase of $${coupon.minimumPurchase.toFixed(2)} required`
        );
      }

      // 9. Check valid from date
      if (coupon.validFrom > new Date()) {
        validationErrors.push('Coupon is not yet valid');
      }

      if (validationErrors.length > 0) {
        return { valid: false, error: validationErrors.join('; ') };
      }

      return { valid: true, coupon };
    } catch (error) {
      return { valid: false, error: `Validation error: ${error.message}` };
    }
  }

  /**
   * Redeem a coupon with fraud detection
   * @param {string} couponCode - Coupon code
   * @param {string} userId - User redeeming
   * @param {string} storeId - Store location
   * @param {string} ipAddress - Request IP for fraud detection
   * @param {string} redemptionMethod - 'wallet' | 'barcode-scan' | 'manual'
   * @param {object} additionalData - {purchaseAmount, transactionId, deviceFingerprint, location}
   * @returns {object} Redemption result
   */
  async redeemCoupon(
    couponCode,
    userId,
    storeId,
    ipAddress,
    redemptionMethod,
    additionalData = {}
  ) {
    const codeHash = this.securityService.hashCouponCode(couponCode);

    try {
      // Validate coupon first
      const validation = await this.validateCouponForRedemption(
        couponCode,
        userId,
        storeId,
        additionalData.purchaseAmount || 0
      );

      if (!validation.valid) {
        // Log failed attempt
        await CouponUsage.create({
          userId,
          couponId: null,
          storeId,
          status: 'failed',
          codeHashUsed: codeHash,
          redemptionMethod,
          failureReason: validation.error.includes('Coupon is no longer active')
            ? 'coupon-inactive'
            : validation.error.includes('expired')
              ? 'expired'
              : validation.error.includes('limit')
                ? 'maximum-redemptions-exceeded'
                : validation.error.includes('minimum')
                  ? 'insufficient-purchase'
                  : 'other',
          ipAddress,
          deviceFingerprint: additionalData.deviceFingerprint,
        });

        return { success: false, error: validation.error };
      }

      const coupon = validation.coupon;

      // Fraud detection: check for suspicious patterns
      const fraudCheck = await this.detectFraudulentRedemption(
        userId,
        coupon._id,
        ipAddress,
        additionalData.deviceFingerprint,
        additionalData.location
      );

      if (fraudCheck.suspected) {
        // Log suspicious activity
        const usage = await CouponUsage.create({
          userId,
          couponId: coupon._id,
          storeId,
          status: 'failed',
          codeHashUsed: codeHash,
          redemptionMethod,
          failureReason: 'fraud-detected',
          fraudSuspected: true,
          fraudReason: fraudCheck.reason,
          ipAddress,
          deviceFingerprint: additionalData.deviceFingerprint,
          redeemLocation: additionalData.location
            ? {
                type: 'Point',
                coordinates: [additionalData.location.longitude, additionalData.location.latitude],
              }
            : undefined,
        });

        return {
          success: false,
          error: 'Redemption could not be processed. Please contact support.',
          usageId: usage._id,
        };
      }

      // Create usage record
      const usage = await CouponUsage.create({
        userId,
        couponId: coupon._id,
        storeId,
        status: 'redeemed',
        codeHashUsed: codeHash,
        redemptionMethod,
        redeemedAt: new Date(),
        transactionId: additionalData.transactionId,
        discountApplied: this.calculateDiscount(
          coupon,
          additionalData.purchaseAmount || 0
        ),
        ipAddress,
        deviceFingerprint: additionalData.deviceFingerprint,
        redeemLocation: additionalData.location
          ? {
              type: 'Point',
              coordinates: [additionalData.location.longitude, additionalData.location.latitude],
            }
          : undefined,
      });

      // Update coupon redemption count using atomic operation
      // This prevents race conditions where multiple requests could exceed maxRedemptions
      const updatedCoupon = await Coupon.findByIdAndUpdate(
        coupon._id,
        {
          $inc: { currentRedemptions: 1 },
          lastModifiedAt: new Date(),
        },
        { new: true }
      );

      // Check if redemption count now exceeds the maximum (atomic safety check)
      if (updatedCoupon.currentRedemptions > coupon.maxRedemptions) {
        // We incremented but exceeded the limit - revert the usage record to failed
        await CouponUsage.findByIdAndUpdate(usage._id, {
          status: 'revoked',
          failureReason: 'maximum-redemptions-exceeded',
        });

        // Revert the increment
        await Coupon.findByIdAndUpdate(coupon._id, {
          $inc: { currentRedemptions: -1 },
        });

        return {
          success: false,
          error: 'This coupon has reached its redemption limit. Please contact support.',
          usageId: usage._id,
        };
      }

      return {
        success: true,
        discountApplied: usage.discountApplied,
        usageId: usage._id,
      };
    } catch (error) {
      console.error('Coupon redemption error:', error);
      return { success: false, error: 'Redemption failed. Please try again.' };
    }
  }

  /**
   * Redeem a coupon by ID with fraud detection (frontend mobile app)
   * @param {string} couponId - Coupon ID
   * @param {string} userId - User redeeming
   * @param {string} storeId - Store location
   * @param {string} ipAddress - Request IP for fraud detection
   * @param {string} redemptionMethod - 'wallet' | 'barcode-scan' | 'manual'
   * @param {object} additionalData - {purchaseAmount, transactionId, deviceFingerprint, location}
   * @returns {object} Redemption result
   */
  async redeemCouponById(
    couponId,
    userId,
    storeId,
    ipAddress,
    redemptionMethod,
    additionalData = {}
  ) {
    try {
      // Validate coupon first
      const validation = await this.validateCouponByIdForRedemption(
        couponId,
        userId,
        storeId,
        additionalData.purchaseAmount || 0
      );

      if (!validation.valid) {
        // Log failed attempt
        await CouponUsage.create({
          userId,
          couponId,
          storeId,
          status: 'failed',
          redemptionMethod,
          failureReason: validation.error.includes('Coupon is no longer active')
            ? 'coupon-inactive'
            : validation.error.includes('expired')
              ? 'expired'
              : validation.error.includes('limit')
                ? 'maximum-redemptions-exceeded'
                : validation.error.includes('minimum')
                  ? 'insufficient-purchase'
                  : 'other',
          ipAddress,
          deviceFingerprint: additionalData.deviceFingerprint,
        });

        return { success: false, error: validation.error };
      }

      const coupon = validation.coupon;

      // Fraud detection: check for suspicious patterns
      const fraudCheck = await this.detectFraudulentRedemption(
        userId,
        coupon._id,
        ipAddress,
        additionalData.deviceFingerprint,
        additionalData.location
      );

      if (fraudCheck.suspected) {
        // Log suspicious activity
        const usage = await CouponUsage.create({
          userId,
          couponId: coupon._id,
          storeId,
          status: 'failed',
          redemptionMethod,
          failureReason: 'fraud-detected',
          fraudSuspected: true,
          fraudReason: fraudCheck.reason,
          ipAddress,
          deviceFingerprint: additionalData.deviceFingerprint,
          redeemLocation: additionalData.location
            ? {
                type: 'Point',
                coordinates: [additionalData.location.longitude, additionalData.location.latitude],
              }
            : undefined,
        });

        return {
          success: false,
          error: 'Redemption could not be processed. Please contact support.',
          usageId: usage._id,
        };
      }

      // Create usage record
      const usage = await CouponUsage.create({
        userId,
        couponId: coupon._id,
        storeId,
        status: 'redeemed',
        redemptionMethod,
        redeemedAt: new Date(),
        transactionId: additionalData.transactionId,
        discountApplied: this.calculateDiscount(
          coupon,
          additionalData.purchaseAmount || 0
        ),
        ipAddress,
        deviceFingerprint: additionalData.deviceFingerprint,
        redeemLocation: additionalData.location
          ? {
              type: 'Point',
              coordinates: [additionalData.location.longitude, additionalData.location.latitude],
            }
          : undefined,
      });

      // Update coupon redemption count
      await Coupon.findByIdAndUpdate(coupon._id, {
        $inc: { currentRedemptions: 1 },
        lastModifiedAt: new Date(),
      });

      return {
        success: true,
        discountApplied: usage.discountApplied,
        usageId: usage._id,
      };
    } catch (error) {
      console.error('Coupon redemption by ID error:', error);
      return { success: false, error: 'Redemption failed. Please try again.' };
    }
  }

  /**
   * Detect fraudulent redemption patterns
   * Checks for: rapid redemptions, impossible distances, suspicious devices
   * @returns {object} {suspected: boolean, reason: string}
   */
  async detectFraudulentRedemption(userId, couponId, ipAddress, deviceFingerprint, location) {
    try {
      // Check for multiple redemptions in short timeframe (within 5 minutes)
      const recentRedemptions = await CouponUsage.countDocuments({
        userId,
        couponId,
        status: 'redeemed',
        createdAt: {
          $gte: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        },
      });

      if (recentRedemptions > 0) {
        return { suspected: true, reason: 'Multiple redemptions in short timeframe' };
      }

      // Check for impossible distance travel (multiple stores far apart in short time)
      if (location) {
        const recentCouponsByUser = await CouponUsage.aggregate([
          {
            $match: {
              userId: new mongoose.Types.ObjectId(userId),
              status: 'redeemed',
              createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }, // 30 minutes
              'redeemLocation.type': 'Point',
            },
          },
          { $limit: 5 },
        ]);

        for (const prev of recentCouponsByUser) {
          if (prev.redeemLocation?.coordinates) {
            const distance = this.calculateDistance(
              location.latitude,
              location.longitude,
              prev.redeemLocation.coordinates[1],
              prev.redeemLocation.coordinates[0]
            );
            const timeDiff = (Date.now() - new Date(prev.createdAt).getTime()) / (1000 * 60); // minutes
            const maxSpeed = 200; // km/h (reasonable for driving)
            const maxDistance = (maxSpeed / 60) * timeDiff; // km

            if (distance > maxDistance) {
              return {
                suspected: true,
                reason: `Impossible travel distance: ${distance.toFixed(2)}km in ${timeDiff.toFixed(2)}min`,
              };
            }
          }
        }
      }

      return { suspected: false };
    } catch (error) {
      console.error('Fraud detection error:', error);
      // Fail open (don't block on detection error)
      return { suspected: false };
    }
  }

  /**
   * Calculate discount amount based on coupon type
   */
  calculateDiscount(coupon, purchaseAmount) {
    if (coupon.discountType === 'fixed') {
      return Math.min(coupon.discountValue, purchaseAmount);
    } else if (coupon.discountType === 'percentage') {
      return (purchaseAmount * coupon.discountValue) / 100;
    }
    return 0;
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Remove sensitive fields from coupon before returning to user
   */
  sanitizeCoupon(coupon) {
    const { codeHash, encryptedCode, ...sanitized } = coupon;
    return sanitized;
  }

  /**
   * Get coupon redemption history (admin/audit)
   * @param {string} couponId - Coupon ID
   * @param {object} filters - {status, fraudSuspected, startDate, endDate}
   */
  async getCouponRedemptionHistory(couponId, filters = {}) {
    const query = { couponId };

    if (filters.status) query.status = filters.status;
    if (filters.fraudSuspected) query.fraudSuspected = true;
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = filters.startDate;
      if (filters.endDate) query.createdAt.$lte = filters.endDate;
    }

    return await CouponUsage.find(query)
      .populate('userId', 'email')
      .populate('storeId', 'storeName')
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Revoke a coupon (soft delete)
   */
  async revokeCoupon(couponId, reason) {
    return await Coupon.findByIdAndUpdate(
      couponId,
      {
        isActive: false,
        lastModifiedAt: new Date(),
      },
      { new: true }
    );
  }
}

export default CouponService;
