/**
 * Tests for CouponSecurityService
 * 
 * Tests encryption/decryption of coupon codes and security validation
 */

import CouponSecurityService from '../../src/services/CouponSecurityService.js';

describe('CouponSecurityService', () => {
  let securityService;
  const testEncryptionKey = 'test-encryption-key-32-chars-long';

  beforeEach(() => {
    securityService = new CouponSecurityService(testEncryptionKey);
  });

  describe('encryptCouponCode', () => {
    it('should encrypt a coupon code', () => {
      const plainCode = 'TEST-COUPON-12345';
      const encrypted = securityService.encryptCouponCode(plainCode);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plainCode);
      expect(typeof encrypted).toBe('string');
    });

    it('should encrypt different codes to different values', () => {
      const code1 = 'CODE-1';
      const code2 = 'CODE-2';

      const encrypted1 = securityService.encryptCouponCode(code1);
      const encrypted2 = securityService.encryptCouponCode(code2);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should throw error if encryption key is invalid', () => {
      const invalidService = new CouponSecurityService('short-key');
      expect(() => {
        invalidService.encryptCouponCode('TEST');
      }).toThrow();
    });
  });

  describe('decryptCouponCode', () => {
    it('should decrypt an encrypted coupon code', () => {
      const plainCode = 'TEST-COUPON-12345';
      const encrypted = securityService.encryptCouponCode(plainCode);
      const decrypted = securityService.decryptCouponCode(encrypted);

      expect(decrypted).toBe(plainCode);
    });

    it('should throw error for corrupted encrypted data', () => {
      expect(() => {
        securityService.decryptCouponCode('corrupted-data');
      }).toThrow();
    });

    it('should throw error if decryption key doesn\'t match', () => {
      const code = 'TEST-CODE';
      const encrypted = securityService.encryptCouponCode(code);

      const wrongKeyService = new CouponSecurityService('different-encryption-key-32-chars');
      expect(() => {
        wrongKeyService.decryptCouponCode(encrypted);
      }).toThrow();
    });
  });

  describe('hashCouponCode', () => {
    it('should create a hash of coupon code', () => {
      const code = 'TEST-COUPON-CODE';
      const hash = securityService.hashCouponCode(code);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should produce same hash for same code', () => {
      const code = 'TEST-CODE';
      const hash1 = securityService.hashCouponCode(code);
      const hash2 = securityService.hashCouponCode(code);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different codes', () => {
      const hash1 = securityService.hashCouponCode('CODE-1');
      const hash2 = securityService.hashCouponCode('CODE-2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validateCouponCodeFormat', () => {
    it('should validate correctly formatted coupon codes', () => {
      const validCodes = [
        'TEST-1234-5678',
        'SAVE50-ABC-DEF',
        'COUPON-123',
      ];

      validCodes.forEach(code => {
        expect(securityService.validateCouponCodeFormat(code)).toBe(true);
      });
    });

    it('should reject invalid coupon codes', () => {
      const invalidCodes = [
        '',
        null,
        undefined,
        'a', // too short
        'VERYLONGCOUPONCODETHATEXCEEDSMAXIMUMLENGTH1234567890',
      ];

      invalidCodes.forEach(code => {
        expect(securityService.validateCouponCodeFormat(code)).toBe(false);
      });
    });
  });

  describe('validateCouponCodeComplexity', () => {
    it('should pass for codes with sufficient complexity', () => {
      const complexCodes = [
        'TEST-CODE-12345',
        'SAVE-50-PERCENT',
        'ABC123DEF456',
      ];

      complexCodes.forEach(code => {
        expect(securityService.validateCouponCodeComplexity(code)).toBe(true);
      });
    });

    it('should reject simple/guessable codes', () => {
      const simpleCodes = [
        '111111111111',
        'AAAAAAAAAA',
        '123123123123',
      ];

      simpleCodes.forEach(code => {
        expect(securityService.validateCouponCodeComplexity(code)).toBe(false);
      });
    });
  });
});
