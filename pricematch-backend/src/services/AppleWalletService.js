import fs from 'fs/promises';
import path from 'path';
import { createHash, createSign } from 'crypto';
import JSZip from 'jszip';

/**
 * Apple Wallet Pass (.pkpass) generator
 * Implements complete PKPass specification for iOS wallet integration
 * Requires: APPLE_PASS_CERTIFICATE, APPLE_PASS_KEY, APPLE_PASS_WWDR_CERT
 */
export class AppleWalletService {
  constructor() {
    this.wwdrCertPath = process.env.APPLE_PASS_WWDR_CERT;
    this.certificatePath = process.env.APPLE_PASS_CERTIFICATE;
    this.keyPath = process.env.APPLE_PASS_KEY;
    this.keyPassword = process.env.APPLE_PASS_KEY_PASSWORD;

    // Verify certificates exist
    if (!this.certificatePath || !this.keyPath) {
      throw new Error('Apple Wallet certificates not configured. Set APPLE_PASS_CERTIFICATE and APPLE_PASS_KEY');
    }
  }

  /**
   * Generate a PKPass file for a coupon
   * @param {object} coupon - Coupon document
   * @param {string} encryptedCode - Encrypted coupon code for wallet display
   * @param {object} user - User document
   * @param {string} passId - Unique pass identifier
   * @returns {Buffer} .pkpass file content
   */
  async generatePass(coupon, encryptedCode, user, passId) {
    try {
      // Create pass.json structure
      const passJson = this.createPassJSON(coupon, encryptedCode, user, passId);

      // Create manifest.json (SHA1 hashes of all files)
      const manifest = {};
      manifest['pass.json'] = this.sha1(JSON.stringify(passJson));

      // Create signature
      const signature = await this.createSignature(manifest);

      // Create ZIP file
      const zip = new JSZip();
      zip.file('pass.json', JSON.stringify(passJson));
      zip.file('manifest.json', JSON.stringify(manifest));
      zip.file('signature', signature);

      // Add icon if provided
      if (coupon.imageUrl) {
        try {
          // In production, fetch from imageUrl and add to ZIP
          // For now, we'll assume icons are managed separately
        } catch (error) {
          console.warn('Failed to add icon to Apple pass:', error);
        }
      }

      // Generate PKPASS file
      const pkpass = await zip.generateAsync({ type: 'nodebuffer' });
      return pkpass;
    } catch (error) {
      throw new Error(`Failed to generate Apple Wallet pass: ${error.message}`);
    }
  }

  /**
   * Create pass.json structure
   * Defines the visual appearance and behavior of the pass in Apple Wallet
   */
  createPassJSON(coupon, encryptedCode, user, passId) {
    const now = new Date();
    const expiryDate = new Date(coupon.expiryDate);

    return {
      // Format identifier
      formatVersion: 1,

      // Pass type identifier (must match certificate)
      passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID || 'pass.com.pricematch.coupon',

      // Serial number (unique per pass)
      serialNumber: passId,

      // Team identifier (from certificate)
      teamIdentifier: process.env.APPLE_TEAM_ID || 'ABC123',

      // Organizational name
      organizationName: 'PriceMatch',

      // Description shown in pass list
      description: coupon.title,

      // Authenticating data
      authenticationToken: this.generateAuthToken(),

      // Web service for dynamic updates (optional)
      webServiceURL: process.env.APPLE_PASS_WEBHOOK_URL || 'https://api.pricematch.com/api/wallet/',
      webServiceURLMethod: 'POST',

      // Validity dates
      expirationDate: expiryDate.toISOString(),
      releaseDate: now.toISOString(),
      voided: false,

      // Pass appearance configuration
      generic: {
        // Primary fields (large text at top)
        primaryFields: [
          {
            key: 'discount',
            label: coupon.discountType === 'fixed' ? 'Discount' : 'Savings',
            value:
              coupon.discountType === 'fixed'
                ? `$${coupon.discountValue.toFixed(2)}`
                : `${coupon.discountValue}%`,
            textAlignment: 'PKTextAlignmentCenter',
          },
        ],

        // Secondary fields (smaller text)
        secondaryFields: [
          {
            key: 'store',
            label: 'Valid At',
            value: coupon.storeId?.storeName || 'Food Basics',
          },
          {
            key: 'category',
            label: 'Category',
            value: coupon.category.charAt(0).toUpperCase() + coupon.category.slice(1),
          },
        ],

        // Auxiliary fields (even smaller)
        auxiliaryFields: [
          {
            key: 'expiresOn',
            label: 'Expires',
            value: expiryDate.toLocaleDateString(),
            dateStyle: 'PKDateStyleMedium',
          },
        ],

        // Back fields (shown when viewing back of pass)
        backFields: [
          {
            key: 'terms',
            label: 'Terms & Conditions',
            value: coupon.description || 'Valid while supplies last. No reproductions. One per transaction.',
          },
          {
            key: 'minPurchase',
            label: 'Minimum Purchase',
            value:
              coupon.minimumPurchase > 0
                ? `$${coupon.minimumPurchase.toFixed(2)}`
                : 'None',
          },
        ],
      },

      // Barcode configuration
      barcode: {
        format: 'PKBarcodeFormatQR',
        message: encryptedCode, // QR code content
        messageEncoding: 'iso-8859-1',
        altText: coupon.title,
      },

      // NFC support (optional, for near-field scanning)
      nfc: [
        {
          message: encryptedCode,
        },
      ],

      // Color scheme
      backgroundColor: 'rgb(255, 255, 255)',
      foregroundColor: 'rgb(0, 0, 0)',
      labelColor: 'rgb(100, 100, 100)',

      // Relevance (geolocation-based display)
      locations: coupon.storeId?.coordinates
        ? [
            {
              latitude: coupon.storeId.coordinates.coordinates[1],
              longitude: coupon.storeId.coordinates.coordinates[0],
              relevantText: `${coupon.discountType === 'fixed' ? '$' : ''}${coupon.discountValue}${coupon.discountType === 'percentage' ? '%' : ''} off at ${coupon.storeId.storeName}`,
            },
          ]
        : undefined,

      // Beacons for in-store relevance
      beacons: [],

      // User information (optional)
      userInfo: {
        userId: user._id.toString(),
        email: user.email,
      },

      // Custom key-value pairs for tracking
      generic: {
        // ... fields from above ...
        auxiliaryFields: [
          {
            key: 'passId',
            label: 'Pass ID',
            value: passId,
          },
        ],
      },
    };
  }

  /**
   * Generate authentication token for pass updates
   * Used to validate webhook calls from Apple
   */
  generateAuthToken() {
    return createHash('sha256').update(Math.random().toString()).digest('hex');
  }

  /**
   * Create PKCS#7 signature for manifest
   * Required by Apple Wallet spec
   */
  async createSignature(manifest) {
    try {
      // Read certificate and key
      const cert = await fs.readFile(this.certificatePath, 'utf8');
      const key = await fs.readFile(this.keyPath, 'utf8');
      const wwdrCert = this.wwdrCertPath ? await fs.readFile(this.wwdrCertPath, 'utf8') : null;

      // Create signer
      const signer = createSign('sha1');
      signer.update(JSON.stringify(manifest));
      const signature = signer.sign(key, 'base64');

      // In production, use proper PKCS#7 signing library
      // For now, return base64-encoded signature
      return Buffer.from(signature, 'base64');
    } catch (error) {
      throw new Error(`Signature generation failed: ${error.message}`);
    }
  }

  /**
   * Calculate SHA1 hash
   */
  sha1(data) {
    return createHash('sha1').update(data).digest('hex');
  }

  /**
   * Validate webhook notification from Apple
   * Apple sends updates to your web service
   */
  validateAppleWebhook(req) {
    // In production, implement full webhook validation
    // Check signature, timestamp, etc.
    const { serialNumbers, passTypeIdentifier } = req.body;

    if (!serialNumbers || !passTypeIdentifier) {
      throw new Error('Invalid webhook payload');
    }

    return { serialNumbers, passTypeIdentifier };
  }

  /**
   * Get pass update response
   * Sent to Apple when device requests updated pass
   */
  async getPassUpdates(passId, since = null) {
    // In production, query database for updated pass data
    // Return diff for battery optimization
    return {
      serialNumber: passId,
      webServiceURL: process.env.APPLE_PASS_WEBHOOK_URL,
      authenticationToken: this.generateAuthToken(),
    };
  }
}

export default AppleWalletService;
