import mongoose from 'mongoose';

const couponUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
      index: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    // Status of redemption
    status: {
      type: String,
      enum: ['pending', 'redeemed', 'failed', 'revoked'],
      default: 'pending',
      index: true,
    },
    // Security: Hash of coupon code used (for verification, not plaintext)
    codeHashUsed: {
      type: String,
      required: true,
    },
    // For tracking in-store vs. digital redemptions
    redemptionMethod: {
      type: String,
      enum: ['wallet', 'barcode-scan', 'manual'],
      required: true,
    },
    // Timestamp of actual redemption at store
    redeemedAt: {
      type: Date,
      sparse: true,
    },
    // Receipt/transaction ID for audit purposes
    transactionId: {
      type: String,
      sparse: true,
      index: true,
    },
    // Discount amount applied
    discountApplied: {
      type: Number,
      sparse: true,
      min: 0,
    },
    // IP address that initiated the redemption (security audit trail)
    ipAddress: {
      type: String,
      required: true,
    },
    // Device fingerprint (optional: for fraud detection)
    deviceFingerprint: {
      type: String,
      sparse: true,
    },
    // Reason if redemption failed
    failureReason: {
      type: String,
      enum: [
        'expired',
        'maximum-redemptions-exceeded',
        'user-maximum-exceeded',
        'insufficient-purchase',
        'coupon-inactive',
        'store-mismatch',
        'fraud-detected',
        'other',
      ],
      sparse: true,
    },
    // Automatic fraud detection flag
    fraudSuspected: {
      type: Boolean,
      default: false,
      index: true,
    },
    fraudReason: {
      type: String,
      sparse: true,
    },
    // Notes from store staff/system
    notes: {
      type: String,
      sparse: true,
      maxlength: 500,
    },
    // Geolocation when coupon was redeemed
    redeemLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        sparse: true,
      },
    },
  },
  {
    timestamps: true,
    collection: 'coupon_usages',
  }
);

// Geospatial index for redemption location tracking
couponUsageSchema.index({ 'redeemLocation': '2dsphere' }, { sparse: true });

// Compound index for user-coupon combinations to enforce max redemptions
couponUsageSchema.index(
  { userId: 1, couponId: 1, status: 1 },
  { name: 'user_coupon_status_idx' }
);

// Index for fraud detection queries
couponUsageSchema.index({ fraudSuspected: 1, createdAt: 1 });

// Index for audit trails
couponUsageSchema.index({ userId: 1, status: 1, createdAt: 1 });

// Prevent concurrent modifications
couponUsageSchema.set('versionKey', '__v');

export default mongoose.model('CouponUsage', couponUsageSchema);
