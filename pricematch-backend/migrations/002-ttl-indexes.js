/**
 * Migration 002: Add TTL Index for Data Cleanup
 * 
 * Adds TTL (Time To Live) index to automatically delete expired records
 * Run with: node migrations/002-ttl-indexes.js
 */

import mongoose from 'mongoose';
import NotificationQueue from '../src/models/NotificationQueue.js';
import ScrapeLog from '../src/models/ScrapeLog.js';

const runMigration = async () => {
  try {
    console.log('Migration 002: Creating TTL indexes for automatic cleanup...\n');

    // NotificationQueue: Delete delivered notifications after 30 days
    console.log('Creating NotificationQueue TTL indexes...');
    try {
      await NotificationQueue.collection.dropIndex('createdAt_1');
    } catch (error) {
      // Index doesn't exist yet, that's fine
    }
    
    await NotificationQueue.collection.createIndex(
      { createdAt: 1 },
      { 
        expireAfterSeconds: 2592000, // 30 days
        partialFilterExpression: { status: 'delivered' }
      }
    );
    console.log('  ✓ NotificationQueue.createdAt TTL index (30 days for delivered)');

    // ScrapeLog: Delete old scrape logs after 90 days
    console.log('\nCreating ScrapeLog TTL indexes...');
    try {
      await ScrapeLog.collection.dropIndex('scrapedAt_1');
    } catch (error) {
      // Index doesn't exist yet, that's fine
    }
    
    await ScrapeLog.collection.createIndex(
      { scrapedAt: 1 },
      { expireAfterSeconds: 7776000 } // 90 days
    );
    console.log('  ✓ ScrapeLog.scrapedAt TTL index (90 days)');

    console.log('\n✅ Migration 002 completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration 002 failed:', error);
    process.exit(1);
  }
};

// Connect to database and run migration
const main = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pricematch';
  
  try {
    await mongoose.connect(mongoUri);
    console.log(`Connected to MongoDB: ${mongoUri}\n`);
    await runMigration();
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

main();
