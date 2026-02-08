import mongoose from 'mongoose';

const scrapeLogSchema = new mongoose.Schema(
  {
    chainName: {
      type: String,
      required: true,
      index: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
    },
    status: {
      type: String,
      enum: ['success', 'partial', 'failed'],
      default: 'pending',
    },
    dealsFound: {
      type: Number,
      default: 0,
    },
    dealsInserted: {
      type: Number,
      default: 0,
    },
    dealsDuplicate: {
      type: Number,
      default: 0,
    },
    errorMessage: String,
    source: {
      type: String,
      enum: ['html', 'pdf', 'api'],
    },
    rawData: mongoose.Schema.Types.Mixed, // Store raw response for debugging
    duration: Number, // milliseconds
    scrapedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

scrapeLogSchema.index({ chainName: 1, scrapedAt: -1 });

export default mongoose.model('ScrapeLog', scrapeLogSchema);
