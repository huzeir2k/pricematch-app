import mongoose from 'mongoose';

const storeSchema = new mongoose.Schema(
  {
    chainName: {
      type: String,
      required: true,
      enum: ['Food Basics'], // Will expand: 'Sobeys', 'Metro', etc.
    },
    storeName: {
      type: String,
      required: true,
    },
    postalCode: {
      type: String,
      required: true,
    },
    province: {
      type: String,
      required: true,
      enum: ['ON', 'BC', 'AB', 'MB', 'SK', 'QC', 'NB', 'NS', 'PE', 'NL'], // Canadian provinces
    },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    address: String,
    phoneNumber: String,
    website: String,
    lastScrapedAt: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

storeSchema.index({ coordinates: '2dsphere' });
storeSchema.index({ chainName: 1, province: 1 });

export default mongoose.model('Store', storeSchema);
