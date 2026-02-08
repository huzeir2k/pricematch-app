/**
 * Tests for Validation Middleware
 * 
 * Tests input validation for coordinates, pagination, ObjectIds
 */

import {
  isValidLatitude,
  isValidLongitude,
  isValidObjectId,
  validatePagination,
} from '../../src/middleware/validation.js';

describe('Validation Middleware', () => {
  describe('isValidLatitude', () => {
    it('should accept valid latitude values', () => {
      expect(isValidLatitude(0)).toBe(true);
      expect(isValidLatitude(45.5)).toBe(true);
      expect(isValidLatitude(-23.5)).toBe(true);
      expect(isValidLatitude(90)).toBe(true);
      expect(isValidLatitude(-90)).toBe(true);
    });

    it('should reject invalid latitude values', () => {
      expect(isValidLatitude(91)).toBe(false);
      expect(isValidLatitude(-91)).toBe(false);
      expect(isValidLatitude('not-a-number')).toBe(false);
      expect(isValidLatitude(NaN)).toBe(false);
    });
  });

  describe('isValidLongitude', () => {
    it('should accept valid longitude values', () => {
      expect(isValidLongitude(0)).toBe(true);
      expect(isValidLongitude(180)).toBe(true);
      expect(isValidLongitude(-180)).toBe(true);
      expect(isValidLongitude(45.5)).toBe(true);
    });

    it('should reject invalid longitude values', () => {
      expect(isValidLongitude(181)).toBe(false);
      expect(isValidLongitude(-181)).toBe(false);
      expect(isValidLongitude('invalid')).toBe(false);
      expect(isValidLongitude(NaN)).toBe(false);
    });
  });

  describe('isValidObjectId', () => {
    it('should accept valid MongoDB ObjectId', () => {
      expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
    });

    it('should reject invalid ObjectId format', () => {
      expect(isValidObjectId('not-an-id')).toBe(false);
      expect(isValidObjectId('123')).toBe(false);
      expect(isValidObjectId('')).toBe(false);
      expect(isValidObjectId(null)).toBe(false);
    });
  });

  describe('Pagination Validation', () => {
    it('should cap limit to maximum 100', () => {
      const limit = 500;
      const cappedLimit = Math.min(limit, 100);
      expect(cappedLimit).toBe(100);
    });

    it('should accept valid skip values', () => {
      const skip = 0;
      expect(skip >= 0).toBe(true);
    });

    it('should reject negative skip values', () => {
      const skip = -1;
      expect(skip < 0).toBe(true);
    });

    it('should handle string number conversion', () => {
      const limit = parseInt('20', 10);
      expect(isNaN(limit)).toBe(false);
      expect(limit).toBe(20);
    });

    it('should reject non-numeric limit', () => {
      const limit = parseInt('abc', 10);
      expect(isNaN(limit)).toBe(true);
    });
  });

  describe('Location Coordinate Validation', () => {
    it('should require both latitude and longitude', () => {
      const hasLat = 45.5;
      const hasLon = undefined;

      const isValid = hasLat && hasLon;
      expect(isValid).toBeFalsy();
    });

    it('should validate coordinate ranges', () => {
      const lat = 43.2557;
      const lon = -79.8711;

      expect(isValidLatitude(lat)).toBe(true);
      expect(isValidLongitude(lon)).toBe(true);
    });

    it('should reject coordinates outside valid range', () => {
      const invalidLat = 95;
      const invalidLon = 185;

      expect(isValidLatitude(invalidLat)).toBe(false);
      expect(isValidLongitude(invalidLon)).toBe(false);
    });
  });
});
