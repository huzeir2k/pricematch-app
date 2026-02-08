import NotificationQueue from '../models/NotificationQueue.js';
import Deal from '../models/Deal.js';
import Store from '../models/Store.js';
import User from '../models/User.js';

/**
 * Notification Service
 * Handles polling-based notifications for users
 * Users query for new deals since their last poll
 */
export class NotificationService {
  /**
   * Get new deals for a user since their last poll
   * Filters by user location, preferences, and expiry
   *
   * @param {string} userId - MongoDB ObjectId of the user
   * @returns {Promise<Array>} Array of new deals with notification data
   */
  async getNewDealsForUser(userId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error('User not found');
      }

      // If notifications disabled, return empty
      if (!user.notificationPreferences.enabled) {
        return [];
      }

      // Get the user's last poll timestamp
      const lastPolledAt = user.lastPolledAt || new Date(0);

      // Query for deals created since last poll
      let dealQuery = {
        createdAt: { $gt: lastPolledAt },
        isActive: true,
        expiryDate: { $gt: new Date() }, // Only active deals
      };

      // Filter by user's favorite stores if they exist
      if (user.favoriteStores.length > 0) {
        dealQuery.storeId = { $in: user.favoriteStores };
      } else {
        // Otherwise, find deals from stores near the user (within 25km)
        const nearbyStores = await Store.find({
          coordinates: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: user.coordinates.coordinates,
              },
              $maxDistance: 25000, // 25km in meters
            },
          },
          isActive: true,
        });

        const storeIds = nearbyStores.map((s) => s._id);
        if (storeIds.length === 0) {
          return []; // No nearby stores
        }
        dealQuery.storeId = { $in: storeIds };
      }

      // Filter by preferred categories if specified
      if (user.notificationPreferences.categories.length > 0) {
        dealQuery.category = { $in: user.notificationPreferences.categories };
      }

      // Fetch deals
      const deals = await Deal.find(dealQuery)
        .populate('storeId', 'storeName chainName')
        .sort({ createdAt: -1 })
        .limit(50); // Limit to prevent overwhelming the user

      // Update user's last polled timestamp
      await User.findByIdAndUpdate(userId, { lastPolledAt: new Date() });

      // Format notification data
      const notifications = deals.map((deal) => ({
        dealId: deal._id,
        title: `New deal at ${deal.storeId.storeName}!`,
        body: `${deal.title} - ${deal.priceAfterTax.toFixed(2)} (After Tax)`,
        deal: {
          title: deal.title,
          salePrice: deal.salePrice,
          priceAfterTax: deal.priceAfterTax,
          discountPercentage: deal.discountPercentage,
          originalPrice: deal.originalPrice,
          category: deal.category,
          expiryDate: deal.expiryDate,
          imageUrl: deal.imageUrl,
          storeName: deal.storeId.storeName,
          storeId: deal.storeId._id,
        },
      }));

      return notifications;
    } catch (error) {
      console.error('Error getting new deals for user:', error);
      throw error;
    }
  }

  /**
   * Queue notifications for all users who match deal criteria
   * Called after new deals are scraped
   *
   * @param {string} dealId - MongoDB ObjectId of the new deal
   * @param {Object} deal - Deal document with storeId
   */
  async queueNotificationForDeal(dealId, deal) {
    try {
      const store = await Store.findById(deal.storeId);

      if (!store) {
        throw new Error('Store not found');
      }

      // Find users using aggregation pipeline for complex geospatial queries
      const matchedUsers = await User.aggregate([
        {
          $match: {
            'notificationPreferences.enabled': true,
          },
        },
        {
          $addFields: {
            // Check if user has this store in favorites or is nearby
            hasFavoriteStore: { $in: [deal.storeId, '$favoriteStores'] },
            // Calculate distance to store
            distanceToStore: {
              $function: {
                body: `function(userCoords, storeCoords) {
                  const R = 6371000; // Earth radius in meters
                  const lat1 = userCoords.coordinates[1] * Math.PI / 180;
                  const lat2 = storeCoords.coordinates[1] * Math.PI / 180;
                  const dLat = (storeCoords.coordinates[1] - userCoords.coordinates[1]) * Math.PI / 180;
                  const dLon = (storeCoords.coordinates[0] - userCoords.coordinates[0]) * Math.PI / 180;
                  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2) * Math.sin(dLon/2);
                  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                  return R * c;
                }`,
                args: ['$coordinates', store.coordinates],
                lang: 'js',
              },
            },
          },
        },
        {
          $match: {
            $expr: {
              $or: [
                { $eq: ['$hasFavoriteStore', true] },
                { $lte: ['$distanceToStore', 25000] }, // 25km radius
              ],
            },
          },
        },
        {
          $match: {
            $expr: {
              $or: [
                { $eq: [{ $size: '$notificationPreferences.categories' }, 0] },
                { $in: [deal.category, '$notificationPreferences.categories'] },
              ],
            },
          },
        },
        {
          $project: {
            _id: 1,
            email: 1,
          },
        },
      ]);

      // Create queue entries for each matched user
      const queueEntries = matchedUsers.map((user) => ({
        userId: user._id,
        dealId: dealId,
        status: 'pending',
        notificationData: {
          title: `New deal at ${store.storeName}!`,
          body: `${deal.title} - $${deal.priceAfterTax.toFixed(2)} (After Tax)`,
          dealTitle: deal.title,
          salePrice: deal.salePrice,
          priceAfterTax: deal.priceAfterTax,
          discountPercentage: deal.discountPercentage,
          storeName: store.storeName,
          imageUrl: deal.imageUrl,
          expiryDate: deal.expiryDate,
        },
      }));

      if (queueEntries.length > 0) {
        await NotificationQueue.insertMany(queueEntries);
        console.log(`Queued notifications for ${queueEntries.length} users`);
      }

      return queueEntries.length;
    } catch (error) {
      console.error('Error queueing notification for deal:', error);
      throw error;
    }
  }

  /**
   * Mark a notification as delivered
   */
  async markNotificationAsDelivered(notificationId) {
    try {
      await NotificationQueue.findByIdAndUpdate(notificationId, {
        status: 'delivered',
        deliveredAt: new Date(),
      });
    } catch (error) {
      console.error('Error marking notification as delivered:', error);
      throw error;
    }
  }

  /**
   * Get pending notifications for a user (for polling endpoint)
   */
  async getPendingNotifications(userId) {
    try {
      const notifications = await NotificationQueue.find({
        userId,
        status: 'pending',
      })
        .populate('dealId', 'title salePrice priceAfterTax category imageUrl expiryDate')
        .populate('dealId.storeId', 'storeName')
        .sort({ createdAt: -1 })
        .limit(20);

      return notifications;
    } catch (error) {
      console.error('Error getting pending notifications:', error);
      throw error;
    }
  }

  /**
   * Clean up old delivered/failed notifications (older than 30 days)
   */
  async cleanupOldNotifications() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await NotificationQueue.deleteMany({
        status: { $in: ['delivered', 'failed'] },
        deliveredAt: { $lt: thirtyDaysAgo },
      });

      console.log(`Cleaned up ${result.deletedCount} old notifications`);
      return result.deletedCount;
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      throw error;
    }
  }
}
