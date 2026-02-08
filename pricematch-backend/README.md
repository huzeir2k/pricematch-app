# PriceMatch Backend - README

This is the backend for the PriceMatch grocery deal aggregator app. It provides:

- **Authentication**: Email/password registration and login with JWT
- **Web Scrapers**: Food Basics (with adapter pattern for other chains)
- **Polling Notifications**: Users poll for new deals with filtering by location/preferences
- **Deal Management**: CRUD operations for deals with geospatial queries
- **Store Management**: Store locations and deal counts

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Installation

```bash
npm install
```

### Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update `.env` with your configuration:
```
MONGODB_URI=mongodb://localhost:27017/pricematch
JWT_SECRET=your-secret-key-here
```

### Running the Server

Development (with auto-reload):
```bash
npm run dev
```

Production:
```bash
npm start
```

### API Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user (requires auth)

#### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/favorite-stores/:storeId` - Add favorite store
- `DELETE /api/users/favorite-stores/:storeId` - Remove favorite store

#### Deals
- `GET /api/deals` - List deals (with filtering)
- `GET /api/deals/:dealId` - Get deal details
- `GET /api/deals/nearby` - Get top 5 stores by deal count near user
- `POST /api/deals/search` - Full-text search

#### Notifications
- `GET /api/notifications/poll` - Poll for new deals (requires auth)
- `POST /api/notifications/mark-delivered/:dealId` - Mark as delivered

#### Stores
- `GET /api/stores` - List stores
- `GET /api/stores/:storeId` - Get store details
- `GET /api/stores/location/nearby` - Find nearby stores

## Architecture

### Models
- **User**: Authentication and preferences
- **Store**: Grocery chain locations
- **Deal**: Scraped deals with pricing and expiry
- **ScrapeLog**: Audit trail of scraping runs
- **NotificationQueue**: Pending notifications for users

### Services
- **ScraperAdapter**: Abstract base class for store chain scrapers
- **FoodBasicsAdapter**: Implementation for Food Basics flyers
- **NotificationService**: Polling-based notification delivery
- **ScraperJobScheduler**: Scheduled scraping and cleanup tasks

### Scheduled Jobs
- **Food Basics Scraper**: Weekly (default: Sunday 2 AM UTC)
- **Notification Cleanup**: Daily (default: 3 AM UTC) - removes delivered notifications older than 30 days
- **Deal Cleanup**: Daily (default: 4 AM UTC) - marks expired deals as inactive

## Extending to New Chains

1. Create new adapter in `src/services/scrapers/`:
```javascript
import { ScraperAdapter } from './ScraperAdapter.js';

export class NewChainAdapter extends ScraperAdapter {
  constructor() {
    super('New Chain');
  }

  async fetchFlyers(store) {
    // Implement flyer fetching
  }

  async parseDeals(source, sourceType) {
    // Implement deal parsing
  }
}
```

2. Register in `ScraperJobScheduler`:
```javascript
scheduleNewChainWeekly() {
  // Similar to scheduleFood BasicsWeekly
}
```

3. Add to main server startup in `src/index.js`

## Database Indexes

The models include indexes for:
- User geospatial queries (location-based)
- Store geospatial queries (location-based)
- Deal queries (storeId, category, expiry, creation date)
- Notification queue (userId, dealId, status)
- Scrape logs (chainName, timestamp)

## Security

- JWT-based authentication with 30-day tokens
- Password hashing with bcryptjs
- Helmet for HTTP security headers
- CORS protection
- Rate limiting (100 requests per 15 minutes per IP)
- Input validation with Joi
- Sentry integration for error tracking (optional)

## Error Handling

All errors are caught and logged. In development, stack traces are returned. In production, only error messages are sent to clients.

## Environment Variables

See `.env.example` for all available options. Key variables:

- `NODE_ENV`: development/production
- `MONGODB_URI`: Database connection string
- `JWT_SECRET`: Secret key for JWT signing (use strong key in production)
- `SENTRY_DSN`: Optional error tracking
- Cron expressions for scheduled jobs

## Testing

Currently no automated tests. To add tests:

```bash
npm install --save-dev jest @types/jest
```

Then create test files in a `tests/` directory.
