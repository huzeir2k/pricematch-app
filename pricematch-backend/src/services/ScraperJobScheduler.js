import cron from 'node-cron';
import Deal from '../models/Deal.js';
import Store from '../models/Store.js';
import { FoodBasicsAdapter } from './scrapers/FoodBasicsAdapter.js';
import { NotificationService } from './NotificationService.js';

/**
 * Scraper Job Scheduler
 * Manages scheduled scraping tasks for different store chains
 */
export class ScraperJobScheduler {
  constructor() {
    this.jobs = {};
    this.notificationService = new NotificationService();
  }

  /**
   * Schedule the Food Basics scraper to run weekly
   * By default, runs on Sunday at 2:00 AM UTC
   */
  scheduleFoodBasicsWeekly(cronExpression = '0 2 * * 0') {
    // 0 2 * * 0 = Sunday 2:00 AM UTC
    if (this.jobs.foodBasics) {
      this.jobs.foodBasics.stop();
      console.log('Stopped existing Food Basics job');
    }

    console.log(`Scheduling Food Basics scraper: ${cronExpression}`);

    this.jobs.foodBasics = cron.schedule(cronExpression, async () => {
      console.log(`[Food Basics] Scrape job started at ${new Date().toISOString()}`);
      await this.runFoodBasicsScrape();
    });

    // Also run on startup for testing
    console.log('[Food Basics] Running initial scrape...');
    this.runFoodBasicsScrape();
  }

  /**
   * Run Food Basics scraper
   */
  async runFoodBasicsScrape() {
    const adapter = new FoodBasicsAdapter();

    try {
      // Get all active Food Basics stores
      const stores = await Store.find({
        chainName: 'Food Basics',
        isActive: true,
      });

      if (stores.length === 0) {
        console.log('No active Food Basics stores to scrape');
        return;
      }

      console.log(`Found ${stores.length} Food Basics stores to scrape`);

      // Run the scraper
      const results = await adapter.scrapeAndInsert(stores, Deal);

      // Log results
      results.forEach((result) => {
        console.log(
          `[Food Basics] ${result.store}: Found=${result.dealsFound}, Inserted=${result.dealsInserted}, Duplicate=${result.dealsDuplicate}, Status=${result.status}`
        );
      });

      // For newly inserted deals, queue notifications
      const newDeals = await Deal.find({
        createdAt: { $gt: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
      });

      for (const deal of newDeals) {
        try {
          await this.notificationService.queueNotificationForDeal(deal._id, deal);
        } catch (error) {
          console.error(`Error queueing notification for deal ${deal._id}:`, error);
        }
      }

      console.log(`[Food Basics] Scrape job completed at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('[Food Basics] Scrape job failed:', error);
    }
  }

  /**
   * Schedule daily cleanup of old notifications (3:00 AM UTC)
   */
  scheduleNotificationCleanup(cronExpression = '0 3 * * *') {
    console.log(`Scheduling notification cleanup: ${cronExpression}`);

    this.jobs.notificationCleanup = cron.schedule(cronExpression, async () => {
      console.log('Running notification cleanup...');
      try {
        await this.notificationService.cleanupOldNotifications();
      } catch (error) {
        console.error('Notification cleanup failed:', error);
      }
    });
  }

  /**
   * Schedule daily cleanup of expired deals (4:00 AM UTC)
   */
  scheduleDealCleanup(cronExpression = '0 4 * * *') {
    console.log(`Scheduling deal cleanup: ${cronExpression}`);

    this.jobs.dealCleanup = cron.schedule(cronExpression, async () => {
      console.log('Running deal cleanup...');
      try {
        const result = await Deal.updateMany(
          { expiryDate: { $lt: new Date() } },
          { isActive: false }
        );
        console.log(`Marked ${result.modifiedCount} expired deals as inactive`);
      } catch (error) {
        console.error('Deal cleanup failed:', error);
      }
    });
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll() {
    Object.values(this.jobs).forEach((job) => {
      if (job) {
        job.stop();
      }
    });
    console.log('All scheduled jobs stopped');
  }
}

/**
 * Create and export a singleton instance
 */
export const schedulerInstance = new ScraperJobScheduler();
