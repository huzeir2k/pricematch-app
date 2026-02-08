/**
 * Migration 001: Create Essential Database Indexes
 * 
 * Creates geospatial, text, and compound indexes for optimal query performance
 * Run with: node migrations/001-create-indexes.js
 */

import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Deal from '../src/models/Deal.js';
import Coupon from '../src/models/Coupon.js';
import Store from '../src/models/Store.js';
import CouponUsage from '../src/models/CouponUsage.js';
import NotificationQueue from '../src/models/NotificationQueue.js';

const runMigration = async () => {
  try {
    console.log('Migration 001: Creating database indexes...\n');

    // User indexes
    console.log('Creating User indexes...');
    await User.collection.createIndex({ coordinates: '2dsphere' });
    console.log('  ✓ User.coordinates 2dsphere index');

    await User.collection.createIndex({ email: 1 }, { unique: true });
    console.log('  ✓ User.email unique index');

    // Deal indexes
    console.log('\nCreating Deal indexes...');
    await Deal.collection.createIndex({ storeId: 1, expiryDate: 1 });
    console.log('  ✓ Deal.storeId + expiryDate compound index');

    await Deal.collection.createIndex({ category: 1, isActive: 1 });
    console.log('  ✓ Deal.category + isActive compound index');

    await Deal.collection.createIndex({ title: 'text', description: 'text' });
    console.log('  ✓ Deal.title + description text search index');

    await Deal.collection.createIndex({ expiryDate: 1 });
    console.log('  ✓ Deal.expiryDate index');

    await Deal.collection.createIndex({ isActive: 1 });
    console.log('  ✓ Deal.isActive index');

    await Deal.collection.createIndex({ createdAt: 1 });
    console.log('  ✓ Deal.createdAt index');

    // Coupon indexes
    console.log('\nCreating Coupon indexes...');
    await Coupon.collection.createIndex({ isActive: 1, expiryDate: 1 });
    console.log('  ✓ Coupon.isActive + expiryDate compound index');

    await Coupon.collection.createIndex({ storeId: 1, isActive: 1 });
    console.log('  ✓ Coupon.storeId + isActive compound index');

    await Coupon.collection.createIndex({ codeHash: 1 }, { unique: true, sparse: true });
    console.log('  ✓ Coupon.codeHash unique sparse index');

    // Store indexes
    console.log('\nCreating Store indexes...');
    await Store.collection.createIndex({ coordinates: '2dsphere' });
    console.log('  ✓ Store.coordinates 2dsphere index');

    await Store.collection.createIndex({ chainName: 1, province: 1 });
    console.log('  ✓ Store.chainName + province compound index');

    // CouponUsage indexes
    console.log('\nCreating CouponUsage indexes...');
    await CouponUsage.collection.createIndex({ userId: 1, couponId: 1, storeId: 1 });
    console.log('  ✓ CouponUsage.userId + couponId + storeId compound index');

    await CouponUsage.collection.createIndex({ status: 1, userId: 1 });
    console.log('  ✓ CouponUsage.status + userId compound index');

    // NotificationQueue indexes
    console.log('\nCreating NotificationQueue indexes...');
    await NotificationQueue.collection.createIndex({ userId: 1, status: 1 });
    console.log('  ✓ NotificationQueue.userId + status compound index');

    console.log('\n✅ Migration 001 completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration 001 failed:', error);
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
