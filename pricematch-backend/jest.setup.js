/**
 * Jest Setup File
 * Runs before all tests
 */

// Disable console methods in test output to reduce noise
global.console = {
  ...console,
  // uncomment to suppress a specific log level
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long-for-testing';
process.env.COUPON_ENCRYPTION_KEY = 'test-encryption-key-32-chars-long';

// Mock MongoDB connection if needed
jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue({}),
  disconnect: jest.fn().mockResolvedValue({}),
  connection: {
    on: jest.fn(),
  },
  Types: {
    ObjectId: {
      isValid: (id) => typeof id === 'string' && id.length === 24,
    },
  },
}), { virtual: true });
