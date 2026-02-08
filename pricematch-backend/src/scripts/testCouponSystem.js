#!/usr/bin/env node

/**
 * Coupon System Integration Test
 * Tests all coupon functionality end-to-end
 * Run: node src/scripts/testCouponSystem.js
 */

import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import User from '../models/User.js';
import Store from '../models/Store.js';
import Coupon from '../models/Coupon.js';
import CouponUsage from '../models/CouponUsage.js';
import CouponService from '../services/CouponService.js';
import { CouponSecurityService } from '../services/CouponSecurityService.js';
import dotenv from 'dotenv';

dotenv.config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  process.stdout.write(`Testing: ${name}... `);
  try {
    await fn();
    console.log(`${colors.green}✓ PASS${colors.reset}`);
    testsPassed++;
  } catch (error) {
    console.log(`${colors.red}✗ FAIL${colors.reset}`);
    console.log(`  Error: ${error.message}`);
    testsFailed++;
  }
}

async function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

async function assertTrue(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

async function main() {
  console.log(`\n${colors.blue}=== PriceMatch Coupon System Tests ===${colors.reset}\n`);

  try {
    // Connect to database
    await connectDatabase();
    console.log(`${colors.green}✓ Database connected${colors.reset}\n`);

    // Initialize services
    const couponService = new CouponService(process.env.COUPON_ENCRYPTION_KEY);
    const securityService = new CouponSecurityService(process.env.COUPON_ENCRYPTION_KEY);

    // Get test data
    const store = await Store.findOne({ chainName: 'Food Basics' });
    let testUser = await User.findOne({ email: 'test@coupon-system.com' });

    if (!testUser) {
      testUser = await User.create({
        email: 'test@coupon-system.com',
        password: 'hashed-password',
        authMethod: 'local',
        postalCode: 'M5V 3A8',
        coordinates: {
          type: 'Point',
          coordinates: [-79.3871, 43.6629], // Toronto
        },
      });
    }

    if (!store) {
      throw new Error('No Food Basics store found. Run seedDatabase.js first.');
    }

    console.log(`${colors.blue}--- Security Tests ---${colors.reset}\n`);

    // Test 1: Coupon code generation
    await test('Generate coupon code', async () => {
      const code = securityService.generateCouponCode('FB');
      assertTrue(/^FB-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(code), 'Invalid code format');
    });

    // Test 2: Coupon code hashing
    await test('Hash coupon code', async () => {
      const code = securityService.generateCouponCode('FB');
      const hash = securityService.hashCouponCode(code);
      assertEqual(hash.length, 64, 'Invalid hash length (should be 64 hex chars)');
    });

    // Test 3: Code encryption/decryption
    await test('Encrypt and decrypt coupon code', async () => {
      const code = securityService.generateCouponCode('FB');
      const encrypted = securityService.encryptCouponCode(code);
      const decrypted = securityService.decryptCouponCode(encrypted);
      assertEqual(decrypted, code, 'Decrypted code does not match original');
    });

    // Test 4: Code format validation
    await test('Validate coupon code format', async () => {
      assertTrue(securityService.isValidCouponFormat('FB-ABC12-XYZ34'), 'Valid code rejected');
      assertTrue(!securityService.isValidCouponFormat('invalid-code'), 'Invalid code accepted');
    });

    // Test 5: IP hashing
    await test('Hash IP address for fraud detection', async () => {
      const ip = '192.168.1.1';
      const hash1 = securityService.hashIpAddress(ip);
      const hash2 = securityService.hashIpAddress(ip);
      assertEqual(hash1, hash2, 'Same IP produces different hashes');
      assertTrue(hash1.length === 64, 'Invalid hash length');
    });

    console.log(`\n${colors.blue}--- Coupon Service Tests ---${colors.reset}\n`);

    // Test 6: Create coupon
    let testCoupon = null;
    await test('Create coupon', async () => {
      testCoupon = await couponService.createCoupon(
        {
          title: 'Test Coupon - $5 Off',
          description: 'Test discount for unit testing',
          category: 'grocery',
          discountType: 'fixed',
          discountValue: 5,
          minimumPurchase: 20,
          maxRedemptions: 100,
          maxRedemptionsPerUser: 2,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
        store._id
      );
      assertTrue(testCoupon._id, 'Coupon not created');
      assertEqual(testCoupon.title, 'Test Coupon - $5 Off', 'Title mismatch');
    });

    // Test 7: Retrieve coupon
    await test('Retrieve coupon by ID', async () => {
      const retrieved = await couponService.getCoupon(testCoupon._id);
      assertEqual(retrieved._id.toString(), testCoupon._id.toString(), 'Coupon ID mismatch');
      assertTrue(!retrieved.codeHash, 'codeHash should not be exposed');
      assertTrue(!retrieved.encryptedCode, 'encryptedCode should not be exposed');
    });

    // Test 8: Get coupons by store
    await test('Get coupons for store', async () => {
      const coupons = await couponService.getCouponsByStore(store._id);
      assertTrue(coupons.length > 0, 'No coupons returned');
    });

    console.log(`\n${colors.blue}--- Validation Tests ---${colors.reset}\n`);

    // Test 9: Validate coupon for redemption (valid)
    await test('Validate coupon - valid case', async () => {
      const validation = await couponService.validateCouponForRedemption(
        securityService.decryptCouponCode(testCoupon.encryptedCode),
        testUser._id,
        store._id,
        25
      );
      assertTrue(validation.valid, `Validation failed: ${validation.error}`);
    });

    // Test 10: Validate coupon - insufficient purchase
    await test('Validate coupon - reject insufficient purchase', async () => {
      const validation = await couponService.validateCouponForRedemption(
        securityService.decryptCouponCode(testCoupon.encryptedCode),
        testUser._id,
        store._id,
        10 // Less than minimum of 20
      );
      assertTrue(!validation.valid, 'Should reject insufficient purchase');
    });

    // Test 11: Validate coupon - invalid code format
    await test('Validate coupon - reject invalid format', async () => {
      const validation = await couponService.validateCouponForRedemption(
        'INVALID-CODE-FORMAT',
        testUser._id,
        store._id,
        25
      );
      assertTrue(!validation.valid, 'Should reject invalid format');
    });

    console.log(`\n${colors.blue}--- Redemption Tests ---${colors.reset}\n`);

    // Test 12: Redeem coupon
    let firstRedemption = null;
    await test('Redeem coupon successfully', async () => {
      const result = await couponService.redeemCoupon(
        securityService.decryptCouponCode(testCoupon.encryptedCode),
        testUser._id,
        store._id,
        '192.168.1.100',
        'wallet',
        {
          purchaseAmount: 50,
          transactionId: 'TXN-001',
          location: { latitude: 43.6629, longitude: -79.3871 },
        }
      );
      assertTrue(result.success, `Redemption failed: ${result.error}`);
      assertEqual(result.discountApplied, 5, 'Discount calculation wrong');
      firstRedemption = result.usageId;
    });

    // Test 13: Check coupon redemption count updated
    await test('Verify coupon redemption count incremented', async () => {
      const updated = await Coupon.findById(testCoupon._id);
      assertEqual(updated.currentRedemptions, 1, 'Redemption count not updated');
    });

    // Test 14: Prevent exceeding per-user limit
    await test('Prevent exceeding per-user redemption limit', async () => {
      // First redemption already done, redeem again
      const result1 = await couponService.redeemCoupon(
        securityService.decryptCouponCode(testCoupon.encryptedCode),
        testUser._id,
        store._id,
        '192.168.1.100',
        'wallet',
        { purchaseAmount: 50, transactionId: 'TXN-002' }
      );
      assertTrue(result1.success, 'Second redemption should succeed (limit is 2)');

      // Try third redemption (should fail, limit is 2)
      const result2 = await couponService.redeemCoupon(
        securityService.decryptCouponCode(testCoupon.encryptedCode),
        testUser._id,
        store._id,
        '192.168.1.100',
        'wallet',
        { purchaseAmount: 50, transactionId: 'TXN-003' }
      );
      assertTrue(!result2.success, 'Third redemption should fail (exceeds limit)');
    });

    console.log(`\n${colors.blue}--- Audit Trail Tests ---${colors.reset}\n`);

    // Test 15: Audit trail creation
    await test('Verify audit trail created', async () => {
      const usage = await CouponUsage.findById(firstRedemption);
      assertTrue(usage, 'Usage record not found');
      assertEqual(usage.status, 'redeemed', 'Status not set to redeemed');
      assertTrue(usage.redeemedAt, 'Redemption timestamp missing');
      assertEqual(usage.transactionId, 'TXN-001', 'Transaction ID mismatch');
    });

    // Test 16: Get redemption history
    await test('Retrieve redemption history', async () => {
      const history = await couponService.getCouponRedemptionHistory(testCoupon._id);
      assertTrue(history.length >= 2, 'History not found');
    });

    console.log(`\n${colors.blue}--- Cleanup ---${colors.reset}\n`);

    // Test 17: Revoke coupon
    await test('Revoke coupon (soft delete)', async () => {
      const revoked = await couponService.revokeCoupon(testCoupon._id, 'Testing');
      assertEqual(revoked.isActive, false, 'Coupon not marked as inactive');
    });

    // Clean up test data
    await User.deleteOne({ email: 'test@coupon-system.com' });
    await Coupon.deleteOne({ _id: testCoupon._id });
    await CouponUsage.deleteMany({ couponId: testCoupon._id });

    console.log(`\n${colors.blue}=== Test Summary ===${colors.reset}`);
    console.log(`${colors.green}✓ Passed: ${testsPassed}${colors.reset}`);
    console.log(`${colors.red}✗ Failed: ${testsFailed}${colors.reset}`);
    console.log(`Total: ${testsPassed + testsFailed}\n`);

    if (testsFailed === 0) {
      console.log(`${colors.green}All tests passed! ✨${colors.reset}\n`);
      process.exit(0);
    } else {
      console.log(`${colors.red}Some tests failed. Review above.${colors.reset}\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(console.error);
