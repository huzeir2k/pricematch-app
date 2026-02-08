import jwt from 'jsonwebtoken';
import fs from 'fs/promises';

/**
 * Google Wallet API integration service
 * Generates JWT tokens and manages digital coupon passes for Android
 * Requires: GOOGLE_WALLET_SERVICE_ACCOUNT_JSON (path or inline)
 */
export class GoogleWalletService {
  constructor() {
    const serviceAccountPath = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT;

    if (!serviceAccountPath) {
      throw new Error('Google Wallet service account not configured. Set GOOGLE_WALLET_SERVICE_ACCOUNT');
    }

    // Load service account credentials
    try {
      const credentials = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      this.projectId = credentials.project_id;
      this.privateKey = credentials.private_key;
      this.clientEmail = credentials.client_email;

      if (!this.privateKey || !this.projectId) {
        throw new Error('Invalid Google service account credentials');
      }
    } catch (error) {
      throw new Error(`Failed to load Google Wallet credentials: ${error.message}`);
    }

    this.issuerId = process.env.GOOGLE_WALLET_ISSUER_ID || this.projectId;
    this.classId = process.env.GOOGLE_WALLET_CLASS_ID || 'pricematch_coupon';
    this.apiUrl = 'https://walletobjects.googleapis.com/walletobjects/v1';
  }

  /**
   * Generate a JWT object containing coupon pass for Android
   * User scans this JWT with Google Wallet app
   * @param {object} coupon - Coupon document
   * @param {string} encryptedCode - Encrypted coupon code
   * @param {string} user - User document
   * @param {string} objectId - Unique object ID for this pass
   * @returns {string} JWT token containing pass data
   */
  async generateWalletLink(coupon, encryptedCode, user, objectId) {
    try {
      // Create offer object
      const offerObject = {
        id: `${this.issuerId}.${objectId}`,
        classId: `${this.issuerId}.${this.classId}`,
        state: 'ACTIVE',

        // Offer class data
        classReference: {
          id: `${this.issuerId}.${this.classId}`,
          issuerName: 'PriceMatch',
          reviewStatus: 'APPROVED',
          homepageUrl: 'https://pricematch.com',

          // Offer-specific details
          title: coupon.title,
          shortTitle: coupon.title.substring(0, 20),
          description: coupon.description || `Save on ${coupon.category}`,

          // Value proposition
          redemptionChannel: 'ONLINE',
          redemptionIssuerId: this.issuerId,

          // Restrictions
          provider: {
            name: coupon.storeId?.chainName || 'Food Basics',
          },
          helpUrl: 'https://support.pricematch.com',
          helpPhone: {
            number: '+1-800-PRICEMATCH',
          },

          // Styling
          colorScheme: {
            backgroundColor: {
              color: '#FFFFFF',
            },
            foregroundColor: {
              color: '#000000',
            },
          },

          // Logo and images
          wideLogo: {
            sourceUri: {
              uri: coupon.imageUrl || 'https://pricematch.com/logo.png',
            },
          },
          logo: {
            sourceUri: {
              uri: coupon.imageUrl || 'https://pricematch.com/icon.png',
            },
          },

          // Geolocation
          locations: coupon.storeId?.coordinates
            ? [
                {
                  latitude: {
                    microdegrees: Math.round(coupon.storeId.coordinates.coordinates[1] * 1e6),
                  },
                  longitude: {
                    microdegrees: Math.round(coupon.storeId.coordinates.coordinates[0] * 1e6),
                  },
                },
              ]
            : undefined,

          // Expiration
          reviewComments: 'Food coupon for promotional campaign',
          activationOptions: {
            activationUrl: 'https://pricematch.com/activate',
          },
        },

        // Instance-specific data
        state: 'ACTIVE',
        validTimeInterval: {
          start: {
            date: new Date(coupon.validFrom).toISOString().split('T')[0],
          },
          end: {
            date: new Date(coupon.expiryDate).toISOString().split('T')[0],
          },
        },

        // Barcode/code
        barcode: {
          type: 'QR_CODE',
          value: encryptedCode,
          showCodeText: {
            defaultValue: {
              language: 'en-US',
              value: `Code: ${encryptedCode.substring(0, 8)}...`,
            },
          },
        },

        // Savings amount
        hasUsers: true,
        discountDetails: {
          percentOff: coupon.discountType === 'percentage' ? coupon.discountValue : undefined,
          moneyOffMicros:
            coupon.discountType === 'fixed' ? Math.round(coupon.discountValue * 1000000) : undefined,
          softwareName: 'PriceMatch',
          temporalUnit: 'DAYS',
          temporalAmount: Math.ceil(
            (new Date(coupon.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)
          ),
        },

        // User information
        linkedUsers: [
          {
            userId: user._id.toString(),
            email: user.email,
          },
        ],

        // Pass metadata
        heroImage: {
          sourceUri: {
            uri: coupon.imageUrl || 'https://pricematch.com/hero.png',
          },
        },

        // Textual representation
        textModulesData: [
          {
            header: 'Terms',
            body: coupon.description || 'No reproductions. Valid one per transaction. While supplies last.',
          },
          {
            header: 'Minimum Purchase',
            body: `$${coupon.minimumPurchase.toFixed(2)}`,
          },
          {
            header: 'Store',
            body: coupon.storeId?.storeName || 'Food Basics',
          },
        ],

        // Security & tracking
        passConstraints: {
          nfcConstraint: [
            {
              encryptionPublicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
              humanReadableAccountIdentifier: encryptedCode,
            },
          ],
        },

        // Custom properties
        customProperties: {
          couponId: coupon._id.toString(),
          storeId: coupon.storeId?.toString(),
          discountType: coupon.discountType,
          discountValue: coupon.discountValue.toString(),
          maximumRedemptions: coupon.maxRedemptions.toString(),
        },
      };

      // Create JWT payload
      const jwtPayload = {
        iss: this.clientEmail,
        aud: 'google',
        origins: ['https://pricematch.com'],
        typ: 'savetowallet',
        payload: {
          offerObjects: [offerObject],
        },
      };

      // Sign JWT
      const token = jwt.sign(jwtPayload, this.privateKey, {
        algorithm: 'RS256',
        keyid: this.privateKey,
      });

      return token;
    } catch (error) {
      throw new Error(`Failed to generate Google Wallet link: ${error.message}`);
    }
  }

  /**
   * Generate a deep link for adding pass to Google Wallet
   * User can scan QR code or click link to add pass
   * @param {string} walletJwt - JWT from generateWalletLink
   * @returns {string} Deep link URL
   */
  generateSaveLink(walletJwt) {
    // Google Wallet deep link format
    const baseUrl = 'https://pay.google.com/gp/v/save/';
    return `${baseUrl}${walletJwt}`;
  }

  /**
   * Generate save button configuration for frontend
   * Used by React Native to show "Add to Google Wallet" button
   * @param {string} walletJwt - JWT from generateWalletLink
   * @returns {object} Configuration for Save to Wallet button
   */
  generateSaveButtonConfig(walletJwt) {
    return {
      provider: 'google-wallet',
      jwt: walletJwt,
      deepLink: this.generateSaveLink(walletJwt),
      buttonText: 'Add to Google Wallet',
      buttonColor: '#1f2937',
      width: 200,
      height: 48,
    };
  }

  /**
   * Update pass in Google Wallet
   * Push updates to users who have saved the pass
   * @param {string} objectId - Pass object ID
   * @param {object} updates - Updated pass data
   */
  async updatePass(objectId, updates) {
    try {
      // Get access token
      const accessToken = await this.getAccessToken();

      const response = await fetch(`${this.apiUrl}/offerobject/${objectId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Google Wallet API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to update Google Wallet pass: ${error.message}`);
    }
  }

  /**
   * Revoke/expire a pass
   * Makes pass inactive in all users' wallets
   * @param {string} objectId - Pass object ID
   */
  async revokePass(objectId) {
    return this.updatePass(objectId, {
      state: 'EXPIRED',
    });
  }

  /**
   * Get OAuth 2.0 access token for Google Wallet API
   * @private
   */
  async getAccessToken() {
    try {
      const jwtPayload = {
        iss: this.clientEmail,
        sub: this.clientEmail,
        scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
        aud: 'https://oauth2.googleapis.com/token',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = jwt.sign(jwtPayload, this.privateKey, {
        algorithm: 'RS256',
      });

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`,
      });

      const data = await response.json();

      if (!data.access_token) {
        throw new Error('Failed to obtain access token');
      }

      return data.access_token;
    } catch (error) {
      throw new Error(`OAuth token retrieval failed: ${error.message}`);
    }
  }

  /**
   * Validate webhook notification from Google Wallet
   * Called when users update or remove pass
   */
  validateGoogleWebhook(req) {
    // In production, verify JWT signature from Google
    const { jwt: incomingJwt } = req.body;

    if (!incomingJwt) {
      throw new Error('Missing JWT in webhook payload');
    }

    // Decode and validate (signature verification recommended)
    const decoded = jwt.decode(incomingJwt);

    if (!decoded || !decoded.payload) {
      throw new Error('Invalid webhook JWT');
    }

    return decoded.payload;
  }

  /**
   * Extract coupon code from Google Wallet webhook
   * Used when user redeems pass in Google Wallet
   */
  extractCouponFromWebhook(webhookPayload) {
    if (!webhookPayload.offerObjects || webhookPayload.offerObjects.length === 0) {
      throw new Error('No offer objects in webhook');
    }

    const offerObject = webhookPayload.offerObjects[0];
    const couponCode = offerObject.barcode?.value;

    if (!couponCode) {
      throw new Error('No coupon code in webhook payload');
    }

    return couponCode;
  }
}

export default GoogleWalletService;
