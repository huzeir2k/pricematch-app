import mongoose from 'mongoose';

const notificationQueueSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'delivered', 'failed'],
      default: 'pending',
      index: true,
    },
    notificationData: {
      title: String,
      body: String,
      dealTitle: String,
      salePrice: Number,
      priceAfterTax: Number,
      discountPercentage: Number,
      storeName: String,
      imageUrl: String,
      expiryDate: Date,
    },
    deliveredAt: Date,
    failureReason: String,
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

notificationQueueSchema.index({ userId: 1, status: 1 });

export default mongoose.model('NotificationQueue', notificationQueueSchema);
