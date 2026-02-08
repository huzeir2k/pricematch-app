import crypto from 'crypto';

/**
 * Security service for coupon code management
 * Handles encryption, hashing, and validation of coupon codes
 * with AES-256-GCM for authenticated encryption
 */
export class CouponSecurityService {
  constructor(encryptionKey) {
    // Ensure key is exactly 32 bytes for AES-256
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('Encryption key must be at least 32 bytes');
    }
    // Use first 32 bytes of key for consistency
    this.encryptionKey = Buffer.from(encryptionKey).slice(0, 32);
  }

  /**
   * Generate a secure random coupon code
   * Format: STORE-XXXXX-XXXXX (e.g., FB-A3K2M-9L7N2)
   * @param {string} storePrefix - 2-letter store prefix
   * @returns {string} Generated coupon code
   */
  generateCouponCode(storePrefix = 'FB') {
    const generateSegment = () => {
      return crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
    };
    return `${storePrefix}-${generateSegment()}-${generateSegment()}`;
  }

  /**
   * Hash coupon code for database storage
   * Uses SHA-256 with salt for one-way hashing
   * @param {string} couponCode - The coupon code to hash
   * @returns {string} SHA-256 hash (hex)
   */
  hashCouponCode(couponCode) {
    return crypto
      .createHash('sha256')
      .update(couponCode + 'pricematch-salt')
      .digest('hex');
  }

  /**
   * Encrypt coupon code for secure transmission to wallet systems
   * Uses AES-256-GCM with authentication tag
   * @param {string} couponCode - The coupon code to encrypt
   * @returns {string} Base64-encoded IV::ciphertext::authTag
   */
  encryptCouponCode(couponCode) {
    try {
      // Generate random IV (initialization vector)
      const iv = crypto.randomBytes(16);

      // Create cipher with GCM mode for authenticated encryption
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

      // Encrypt the coupon code
      let encrypted = cipher.update(couponCode, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      // Return formatted string: base64(IV::ciphertext::authTag)
      const combined = Buffer.concat([iv, Buffer.from(encrypted, 'hex'), authTag]);
      return combined.toString('base64');
    } catch (error) {
      throw new Error(`Coupon encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt coupon code from wallet system
   * @param {string} encryptedCode - Base64-encoded encrypted code
   * @returns {string} Decrypted coupon code
   */
  decryptCouponCode(encryptedCode) {
    try {
      // Decode base64
      const combined = Buffer.from(encryptedCode, 'base64');

      // Extract components
      const iv = combined.slice(0, 16);
      const authTag = combined.slice(combined.length - 16);
      const ciphertext = combined.slice(16, combined.length - 16);

      // Create decipher
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(ciphertext);
      decrypted += decipher.final();

      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error(`Coupon decryption failed: ${error.message}`);
    }
  }

  /**
   * Verify coupon code against stored hash
   * @param {string} providedCode - Code provided by user/wallet
   * @param {string} storedHash - Hash from database
   * @returns {boolean} True if code matches
   */
  verifyCouponCode(providedCode, storedHash) {
    const calculatedHash = this.hashCouponCode(providedCode);
    return crypto.timingSafeEqual(
      Buffer.from(calculatedHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  }

  /**
   * Validate coupon code format
   * @param {string} code - Coupon code to validate
   * @returns {boolean} True if format is valid
   */
  isValidCouponFormat(code) {
    // Format: XX-XXXXX-XXXXX (2 letters, 2 segments of 5 alphanumeric)
    const couponRegex = /^[A-Z]{2}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;
    return couponRegex.test(code);
  }

  /**
   * Generate a secure token for wallet pass generation
   * Used to prevent unauthorized pass generation
   * @param {string} couponId - MongoDB coupon ID
   * @param {string} userId - MongoDB user ID
   * @returns {string} Signed token
   */
  generateWalletPassToken(couponId, userId) {
    const payload = `${couponId}:${userId}:${Date.now()}`;
    return crypto
      .createHmac('sha256', this.encryptionKey)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify wallet pass token
   * Note: This is basic; for production, use JWT
   * @param {string} couponId - Coupon ID
   * @param {string} userId - User ID
   * @param {string} token - Token to verify
   * @returns {boolean} True if valid
   */
  verifyWalletPassToken(couponId, userId, token) {
    const expectedToken = this.generateWalletPassToken(couponId, userId);
    return crypto.timingSafeEqual(
      Buffer.from(token, 'hex'),
      Buffer.from(expectedToken, 'hex')
    );
  }

  /**
   * Hash IP address for fraud detection (privacy-preserving)
   * Allows tracking patterns without storing full IPs
   * @param {string} ipAddress - IP address to hash
   * @returns {string} SHA-256 hash
   */
  hashIpAddress(ipAddress) {
    return crypto
      .createHash('sha256')
      .update(ipAddress + 'pricematch-ip-salt')
      .digest('hex');
  }
}

export default CouponSecurityService;
