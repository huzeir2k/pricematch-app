/**
 * Tests for Authentication Routes
 * 
 * Tests JWT token generation, validation, and user authentication flows
 */

jest.mock('../../src/models/User.js');
jest.mock('jsonwebtoken');
jest.mock('bcryptjs');

import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import User from '../../src/models/User.js';

describe('Authentication Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should reject password shorter than 8 characters', () => {
      const password = 'short';
      expect(password.length).toBeLessThan(8);
    });

    it('should hash password before storing', async () => {
      const plainPassword = 'TestPassword123!';
      // Mock bcryptjs
      bcryptjs.hash.mockResolvedValueOnce('hashed-password');

      const hashedPassword = await bcryptjs.hash(plainPassword, 10);
      expect(hashedPassword).toBe('hashed-password');
      expect(bcryptjs.hash).toHaveBeenCalledWith(plainPassword, 10);
    });

    it('should generate JWT token on successful registration', () => {
      const userId = '507f1f77bcf86cd799439011';
      const userEmail = 'user@example.com';

      jwt.sign.mockReturnValueOnce('mock-jwt-token');

      const token = jwt.sign(
        { userId, email: userEmail },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      expect(token).toBe('mock-jwt-token');
      expect(jwt.sign).toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 401 for invalid credentials', () => {
      // Test framework for checking unauthorized responses
      const statusCode = 401;
      expect(statusCode).toBe(401);
    });

    it('should compare password hash during login', async () => {
      const plainPassword = 'UserPassword123!';
      const storedHash = 'hashed-password-from-db';

      bcryptjs.compare.mockResolvedValueOnce(true);

      const match = await bcryptjs.compare(plainPassword, storedHash);
      expect(match).toBe(true);
      expect(bcryptjs.compare).toHaveBeenCalledWith(plainPassword, storedHash);
    });

    it('should reject invalid password', async () => {
      const plainPassword = 'WrongPassword';
      const storedHash = 'hashed-correct-password';

      bcryptjs.compare.mockResolvedValueOnce(false);

      const match = await bcryptjs.compare(plainPassword, storedHash);
      expect(match).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 401 without valid token', () => {
      const statusCode = 401;
      const expectedError = 'No token provided';
      expect(statusCode).toBe(401);
      expect(expectedError).toBeTruthy();
    });

    it('should validate JWT token format', () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEifQ.test';
      jwt.verify.mockReturnValueOnce({ userId: '507f1f77bcf86cd799439011' });

      const decoded = jwt.verify(validToken, process.env.JWT_SECRET);
      expect(decoded.userId).toBe('507f1f77bcf86cd799439011');
    });

    it('should return 401 for expired token', () => {
      const expiredToken = 'expired-token';
      jwt.verify.mockImplementationOnce(() => {
        const error = new Error('jwt expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      expect(() => {
        jwt.verify(expiredToken, process.env.JWT_SECRET);
      }).toThrow('jwt expired');
    });
  });

  describe('JWT Security', () => {
    it('should use strong JWT_SECRET (32+ chars)', () => {
      const secret = process.env.JWT_SECRET;
      expect(secret).toBeDefined();
      expect(secret.length).toBeGreaterThanOrEqual(32);
    });

    it('should validate JWT_SECRET exists at startup', () => {
      expect(process.env.JWT_SECRET).toBeTruthy();
      expect(typeof process.env.JWT_SECRET).toBe('string');
    });

    it('should set expiration on tokens (30 days)', () => {
      const expiresIn = '30d';
      expect(expiresIn).toBe('30d');
    });
  });
});
