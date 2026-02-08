import express from 'express';
import Joi from 'joi';
import Deal from '../models/Deal.js';
import Store from '../models/Store.js';
import User from '../models/User.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

const updateUserSchema = Joi.object({
  firstName: Joi.string(),
  lastName: Joi.string(),
  postalCode: Joi.string(),
  latitude: Joi.number(),
  longitude: Joi.number(),
  favoriteStores: Joi.array().items(Joi.string()),
  notificationPreferences: Joi.object({
    enabled: Joi.boolean(),
    categories: Joi.array().items(Joi.string()),
  }),
});

/**
 * PUT /api/users/profile
 * Update user profile
 */
router.put('/profile', verifyToken, async (req, res, next) => {
  try {
    const { error, value } = updateUserSchema.validate(req.body);

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const updateData = { ...value };

    // Handle coordinates update
    if (value.latitude && value.longitude) {
      updateData.coordinates = {
        type: 'Point',
        coordinates: [value.longitude, value.latitude],
      };
      delete updateData.latitude;
      delete updateData.longitude;
    }

    const user = await User.findByIdAndUpdate(req.userId, updateData, {
      new: true,
      runValidators: true,
    }).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/profile
 * Get user profile
 */
router.get('/profile', verifyToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId)
      .populate('favoriteStores', 'storeName chainName postalCode')
      .select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users/favorite-stores
 * Add store to favorites
 */
router.post('/favorite-stores/:storeId', verifyToken, async (req, res, next) => {
  try {
    const { storeId } = req.params;

    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $addToSet: { favoriteStores: storeId } },
      { new: true }
    ).populate('favoriteStores', 'storeName chainName');

    res.json({
      message: 'Store added to favorites',
      favoriteStores: user.favoriteStores,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/users/favorite-stores/:storeId
 * Remove store from favorites
 */
router.delete('/favorite-stores/:storeId', verifyToken, async (req, res, next) => {
  try {
    const { storeId } = req.params;

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $pull: { favoriteStores: storeId } },
      { new: true }
    ).populate('favoriteStores', 'storeName chainName');

    res.json({
      message: 'Store removed from favorites',
      favoriteStores: user.favoriteStores,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
