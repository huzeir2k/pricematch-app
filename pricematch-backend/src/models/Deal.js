import mongoose from 'mongoose';

const dealSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    originalPrice: Number,
    salePrice: {
      type: Number,
      required: true,
    },
    discountPercentage: Number,
    priceAfterTax: {
      type: Number,
      required: true,
    },
    category: {
      type: String,
      enum: ['grocery', 'dairy', 'meat', 'bakery', 'electronics', 'household', 'personal-care', 'other'],
      default: 'grocery',
    },
    imageUrl: String,
    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    flyer: {
      url: String,
      source: String, // 'html', 'pdf', 'api'
      scrapedAt: Date,
    },
    hash: {
      type: String,
      unique: true,
      sparse: true,
    }, // Hash to prevent duplicates
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

dealSchema.index({ storeId: 1, expiryDate: 1 });
dealSchema.index({ category: 1, isActive: 1 });
dealSchema.index({ title: 'text', description: 'text' }); // For full-text search

export default mongoose.model('Deal', dealSchema);
