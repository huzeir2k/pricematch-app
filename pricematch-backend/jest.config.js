/**
 * Jest Configuration for PriceMatch Backend
 */

export default {
  // Test environment
  testEnvironment: 'node',

  // Transform files
  transform: {},

  // Test file patterns
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],

  // Coverage settings
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/config/**',
  ],

  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/migrations/',
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Module name mapper (for module aliases if needed)
  moduleNameMapper: {},

  // Test timeout
  testTimeout: 10000,

  // Verbose output
  verbose: true,

  // Don't collect coverage by default (use --coverage flag)
  collectCoverage: false,

  // Coverage thresholds (will be enforced when you run with --coverage)
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
    './src/services/CouponSecurityService.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/services/CouponService.js': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
    './src/routes/auth.js': {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
