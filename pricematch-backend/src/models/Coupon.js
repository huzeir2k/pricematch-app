import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    // Hashed coupon code for security (never expose plaintext)
    codeHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Encrypted coupon code (for secure transmission to wallets only)
    encryptedCode: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: String,
      enum: ['grocery', 'household', 'personal-care', 'other'],
      default: 'grocery',
    },
    // Discount amount or percentage
    discountType: {
      type: String,
      enum: ['fixed', 'percentage'],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    // Minimum purchase requirement
    minimumPurchase: {
      type: Number,
      default: 0,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    // Coupon validity window
    validFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    // Redemption limits
    maxRedemptions: {
      type: Number,
      required: true,
      min: 1,
    },
    maxRedemptionsPerUser: {
      type: Number,
      default: 1,
      min: 1,
    },
    currentRedemptions: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Security & compliance
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    requiresAuthentication: {
      type: Boolean,
      default: true,
    },
    // Wallet pass generation
    walletEnabled: {
      type: Boolean,
      default: true,
    },
    appleWalletPassId: {
      type: String,
      sparse: true,
      index: true,
    },
    googleWalletPassId: {
      type: String,
      sparse: true,
      index: true,
    },
    // Audit trail
    createdBy: {
      type: String,
      default: 'system',
    },
    lastModifiedAt: {
      type: Date,
      default: Date.now,
    },
    // GDPR-relevant fields
    dataClassification: {
      type: String,
      enum: ['public', 'internal', 'confidential'],
      default: 'internal',
    },
  },
  {
    timestamps: true,
    collection: 'coupons',
  }
);

// Index for quick lookup of active, non-expired coupons
couponSchema.index({ isActive: 1, expiryDate: 1 });

// Index for store-specific coupon lookups
couponSchema.index({ storeId: 1, isActive: 1 });

// Prevent concurrent modification by tracking version
couponSchema.set('versionKey', '__v');

export default mongoose.model('Coupon', couponSchema);
