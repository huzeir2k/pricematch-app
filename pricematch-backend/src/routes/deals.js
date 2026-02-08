import express from 'express';
import Deal from '../models/Deal.js';
import Store from '../models/Store.js';
import { verifyToken, optionalAuth } from '../middleware/auth.js';
import { validateLocationCoordinates, validatePagination } from '../middleware/validation.js';
import { NotificationService } from '../services/NotificationService.js';

const router = express.Router();
const notificationService = new NotificationService();

/**
 * GET /api/deals/nearby
 * Get top 5 stores by number of active deals near the user
 * Optional auth - uses user location if authenticated, otherwise requires query params
 */
router.get('/nearby', optionalAuth, validateLocationCoordinates, async (req, res, next) => {
  try {
    let userLocation = null;

    if (req.userId) {
      // User authenticated - get their location from profile
      const { User } = await import('../models/User.js');
      const user = await User.findById(req.userId);
      if (user) {
        userLocation = user.coordinates;
      }
    } else {
      // Not authenticated - require lat/lon query params
      const { lat, lon } = req.query;
      if (!lat || !lon) {
        return res
          .status(400)
          .json({ error: 'Must be authenticated or provide lat/lon query parameters' });
      }
      userLocation = {
        type: 'Point',
        coordinates: [parseFloat(lon), parseFloat(lat)],
      };
    }

    if (!userLocation) {
      return res.status(400).json({ error: 'Unable to determine user location' });
    }

    // Find stores near user and count active deals
    const stores = await Store.aggregate([
      {
        $geoNear: {
          near: userLocation,
          distanceField: 'distance',
          maxDistance: 25000, // 25km
          query: { isActive: true },
        },
      },
      {
        $lookup: {
          from: 'deals',
          localField: '_id',
          foreignField: 'storeId',
          as: 'deals',
        },
      },
      {
        $addFields: {
          dealCount: {
            $size: {
              $filter: {
                input: '$deals',
                as: 'deal',
                cond: {
                  $and: [{ $eq: ['$$deal.isActive', true] }, { $gt: ['$$deal.expiryDate', new Date()] }],
                },
              },
            },
          },
        },
      },
      {
        $sort: { dealCount: -1 },
      },
      {
        $limit: 5,
      },
      {
        $project: {
          _id: 1,
          storeName: 1,
          chainName: 1,
          postalCode: 1,
          address: 1,
          dealCount: 1,
          distance: 1,
        },
      },
    ]);

    res.json({
      stores,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/deals
 * Get deals with filtering
 * Query params: storeId, category, search, limit, skip, sortBy
 */
router.get('/', optionalAuth, validatePagination, async (req, res, next) => {
  try {
    const { storeId, category, search, limit = 20, skip = 0, sortBy = '-createdAt' } = req.query;

    let query = {
      isActive: true,
      expiryDate: { $gt: new Date() }, // Only active deals
    };

    if (storeId) {
      query.storeId = storeId;
    }

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$text = { $search: search };
    }

    // Safely parse pagination parameters with validation
    const parsedLimit = Math.min(parseInt(limit) || 20, 100);
    const parsedSkip = Math.max(0, parseInt(skip) || 0);

    const deals = await Deal.find(query)
      .populate('storeId', 'storeName chainName postalCode')
      .sort(sortBy)
      .limit(parsedLimit)
      .skip(parsedSkip);

    const total = await Deal.countDocuments(query);

    res.json({
      deals,
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
 * GET /api/deals/:dealId
 * Get deal details
 */
router.get('/:dealId', async (req, res, next) => {
  try {
    const { dealId } = req.params;

    const deal = await Deal.findById(dealId).populate('storeId');

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json({ deal });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/deals/search
 * Full-text search on deals
 */
router.post('/search', async (req, res, next) => {
  try {
    const { query, category, limit = 20 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    let searchQuery = {
      $text: { $search: query },
      isActive: true,
      expiryDate: { $gt: new Date() },
    };

    if (category) {
      searchQuery.category = category;
    }

    const deals = await Deal.find(searchQuery)
      .populate('storeId', 'storeName chainName')
      .limit(Math.min(parseInt(limit), 100));

    res.json({ deals });
  } catch (error) {
    next(error);
  }
});

export default router;
