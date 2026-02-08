import express from 'express';
import Store from '../models/Store.js';

const router = express.Router();

/**
 * GET /api/stores
 * Get all active stores with filtering
 * Query params: chainName, province, limit, skip
 */
router.get('/', async (req, res, next) => {
  try {
    const { chainName, province, limit = 50, skip = 0 } = req.query;

    let query = { isActive: true };

    if (chainName) {
      query.chainName = chainName;
    }

    if (province) {
      query.province = province;
    }

    const stores = await Store.find(query)
      .limit(Math.min(parseInt(limit), 100))
      .skip(parseInt(skip));

    const total = await Store.countDocuments(query);

    res.json({
      stores,
      pagination: {
        total,
        limit: Math.min(parseInt(limit), 100),
        skip: parseInt(skip),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stores/:storeId
 * Get store details with recent deals
 */
router.get('/:storeId', async (req, res, next) => {
  try {
    const { storeId } = req.params;

    const store = await Store.findById(storeId);

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Get recent deals for this store
    const { Deal } = await import('../models/Deal.js');
    const deals = await Deal.find({
      storeId: store._id,
      isActive: true,
      expiryDate: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      store,
      recentDeals: deals,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stores/nearby
 * Get stores near a location
 * Query params: lat, lon, maxDistance (default 25km)
 */
router.get('/location/nearby', async (req, res, next) => {
  try {
    const { lat, lon, maxDistance = 25000 } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'lat and lon query parameters required' });
    }

    const stores = await Store.find({
      isActive: true,
      coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lon), parseFloat(lat)],
          },
          $maxDistance: parseInt(maxDistance),
        },
      },
    });

    res.json({ stores });
  } catch (error) {
    next(error);
  }
});

export default router;
