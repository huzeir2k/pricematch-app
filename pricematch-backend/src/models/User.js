import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      select: false,
    },
    authMethod: {
      type: String,
      enum: ['email', 'google', 'apple', 'sms'],
      default: 'email',
    },
    role: {
      type: String,
      enum: ['user', 'moderator', 'admin'],
      default: 'user',
    },
    phoneNumber: {
      type: String,
    },
    firstName: String,
    lastName: String,
    postalCode: {
      type: String,
      required: true,
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
    favoriteStores: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store',
      },
    ],
    notificationPreferences: {
      enabled: {
        type: Boolean,
        default: true,
      },
      categories: [String], // ['grocery', 'electronics', 'household']
      storeSpecific: [
        {
          storeId: mongoose.Schema.Types.ObjectId,
          enabled: Boolean,
        },
      ],
    },
    lastPolledAt: Date,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Geospatial index for location-based queries
userSchema.index({ coordinates: '2dsphere' });

export default mongoose.model('User', userSchema);
