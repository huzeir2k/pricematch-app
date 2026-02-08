## PriceMatch App Overview

PriceMatch is a mobile-first grocery deal aggregation and coupon management platform designed to help users discover and access promotional offers from grocery retailers in their location.

### Purpose and Core Function

The application aggregates real-time grocery deals and coupons from retail stores, presenting them to users based on geographic proximity. It combines deal discovery with digital wallet integration to enable users to save coupons directly to their mobile devices (iOS and Android).

### Architecture

**Backend**: Node.js/Express API with MongoDB database, running on the ES6 module system. The backend handles all business logic, data persistence, and external integrations.

**Frontend**: React Native application built with Expo, providing cross-platform support for iOS, Android, and web. The frontend consumes the backend API and presents deals and coupons to users.

### Key Features

**Authentication System**
The application implements multiple authentication methods including email/password registration, Google authentication, Apple authentication, and SMS-based login. Authentication uses JWT tokens with a required minimum entropy of 32 characters. User roles support basic role-based access control with three tiers: user, moderator, and admin.

**Deal Management**
Deals are collected from retail chains and stored with comprehensive metadata including sale price, original price, tax-adjusted pricing, category classification, expiry dates, and flyer sources. The system includes deduplication using content hashing to prevent duplicate entries. Deals are retrieved with geospatial queries to show users offers relevant to their location. The database indexes expiry dates for efficient time-based filtering.

**Coupon System**
Coupons feature a sophisticated security layer. Coupon codes are stored using one-way hashing with an additional layer of encryption for secure transmission. The service prevents code collision through uniqueness constraints and tracks coupon redemptions per user with configurable maximum redemption limits. Coupons support both fixed-amount and percentage-based discounts with optional minimum purchase requirements.

**Digital Wallet Integration**
The application integrates with Apple Wallet and Google Wallet, enabling users to add coupons directly to their mobile devices. The Apple Wallet implementation generates compliant PKPass files with cryptographic signatures. User data and postal codes indicate geographic targeting for location-specific wallet passes.

**Data Scraping**
The backend includes a scheduled scraper system built on node-cron for automated deal collection. The scraping architecture uses an adapter pattern for extensibility, with Food Basics as the initial implemented adapter. The scraper can process both HTML and PDF sources and includes throttling to manage server load respectfully.

**Notifications and Polling**
The system implements a polling-based notification model where authenticated users periodically fetch new deals matching their preferences. Deal notifications can be filtered by store location, category, and expiry windows. The notification system tracks which deals have been delivered to users to avoid repetition.

**Store Management**
Stores are represented with location data (coordinates via geospatial points), chain information, and aggregated deal counts. Users can designate favorite stores to filter deals according to their preferences.

**User Preferences**
User profiles store postal codes and geographic coordinates for location-based filtering. The system maintains user preferences for favorite stores and tracks coupon usage history through the CouponUsage model.

### Technical Stack

**Dependencies**: Express for HTTP routing, Mongoose for MongoDB ODM, Helmet for security headers, rate limiting via express-rate-limit, bcryptjs for password hashing, nodemailer for email communications, Cheerio for HTML parsing, pdf-parse for PDF extraction, JSZip for PKPass generation, and Sentry for error tracking. The codebase includes ESLint for code quality and Jest for testing.

**Security Measures**
- Helmet middleware for HTTP headers hardening
- Rate limiting with configurable thresholds (general API and stricter redemption-specific limits)
- Password hashing with bcryptjs
- JWT-based authentication with token validation middleware
- Coupon code encryption and one-way hashing
- Input validation using Joi schemas
- Async error handling to prevent unhandled rejections
- Environment variable validation at startup to ensure critical settings are configured

### Database Structure

The MongoDB schema includes models for User, Deal, Coupon, CouponUsage, Store, NotificationQueue, and ScrapeLog. Indexes are created on frequently queried fields including store IDs, expiry dates, geospatial coordinates, and coupon code hashes. A TTL index is implemented on the NotificationQueue for automatic cleanup of processed records.

### Testing and Code Quality

The project includes automated test coverage with Jest for middleware validation, API route testing, and security service verification. ESLint is configured for code style enforcement.

### Deployment Considerations

The backend is configured for environment-based deployment with support for development (with file-watching via Nodemon) and production modes. Sentry integration is optional for error tracking. The frontend uses Expo's deployment infrastructure supporting native iOS/Android builds and web deployment.

This architecture represents a complete e-commerce solution focused on the specific domain of grocery retail deal aggregation with modern mobile wallet integration capabilities.
