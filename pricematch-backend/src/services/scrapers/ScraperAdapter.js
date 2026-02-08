import ScrapeLog from '../../models/ScrapeLog.js';
import { hashDeal } from '../../utils/helpers.js';

export class ScraperAdapter {
  constructor(chainName) {
    this.chainName = chainName;
  }

  /**
   * Fetch flyers from the store chain's source(s)
   * @returns {Promise<Array>} Array of flyer objects with sourceUrl, type (html/pdf)
   */
  async fetchFlyers() {
    throw new Error('fetchFlyers() must be implemented by subclass');
  }

  /**
   * Parse deals from flyer source
   * @param {string} source - HTML/PDF content
   * @param {string} sourceType - 'html', 'pdf', or 'api'
   * @returns {Promise<Array>} Array of raw deal objects
   */
  async parseDeals(source, sourceType) {
    throw new Error('parseDeals() must be implemented by subclass');
  }

  /**
   * Validate and normalize a deal object
   * @param {Object} deal - Raw deal object
   * @param {string} storeId - MongoDB ObjectId of the store
   * @returns {Object} Normalized deal object with hash
   */
  validateDeal(deal, storeId) {
    if (!deal.title || !deal.salePrice || !deal.expiryDate || !deal.priceAfterTax) {
      return null;
    }

    const normalized = {
      storeId,
      title: deal.title.trim(),
      description: deal.description || null,
      originalPrice: deal.originalPrice || null,
      salePrice: parseFloat(deal.salePrice),
      priceAfterTax: parseFloat(deal.priceAfterTax),
      category: deal.category || 'other',
      imageUrl: deal.imageUrl || null,
      expiryDate: new Date(deal.expiryDate),
      flyer: {
        url: deal.flyerUrl || null,
        source: deal.sourceType || 'html',
        scrapedAt: new Date(),
      },
      hash: hashDeal(deal.title, storeId, parseFloat(deal.salePrice)),
    };

    return normalized;
  }

  /**
   * Log scraping activity
   */
  async logScrape(storeId, status, metadata) {
    try {
      const log = new ScrapeLog({
        chainName: this.chainName,
        storeId,
        status,
        dealsFound: metadata.dealsFound || 0,
        dealsInserted: metadata.dealsInserted || 0,
        dealsDuplicate: metadata.dealsDuplicate || 0,
        errorMessage: metadata.errorMessage || null,
        source: metadata.source || 'html',
        duration: metadata.duration || 0,
      });

      await log.save();
      return log;
    } catch (error) {
      console.error('Failed to log scrape:', error);
    }
  }

  /**
   * Main scrape method - orchestrates fetch → parse → validate → insert
   */
  async scrapeAndInsert(stores, Deal) {
    const results = [];

    for (const store of stores) {
      const startTime = Date.now();
      let dealsFound = 0;
      let dealsInserted = 0;
      let dealsDuplicate = 0;
      let status = 'success';
      let errorMessage = null;

      try {
        const flyers = await this.fetchFlyers(store);

        for (const flyer of flyers) {
          const rawDeals = await this.parseDeals(flyer.content, flyer.sourceType);
          dealsFound += rawDeals.length;

          for (const rawDeal of rawDeals) {
            const validatedDeal = this.validateDeal(rawDeal, store._id);

            if (!validatedDeal) {
              continue;
            }

            try {
              const result = await Deal.findOneAndUpdate(
                { hash: validatedDeal.hash },
                validatedDeal,
                { upsert: true, new: true }
              );

              if (result.isNew) {
                dealsInserted++;
              } else {
                dealsDuplicate++;
              }
            } catch (dbError) {
              if (dbError.code === 11000) {
                dealsDuplicate++;
              } else {
                throw dbError;
              }
            }
          }
        }
      } catch (error) {
        status = dealsInserted > 0 ? 'partial' : 'failed';
        errorMessage = error.message;
        console.error(`Scrape error for ${this.chainName} - ${store.storeName}:`, error);
      }

      const duration = Date.now() - startTime;
      const log = await this.logScrape(store._id, status, {
        dealsFound,
        dealsInserted,
        dealsDuplicate,
        errorMessage,
        duration,
      });

      results.push({
        store: store.storeName,
        dealsFound,
        dealsInserted,
        dealsDuplicate,
        status,
        error: errorMessage,
      });
    }

    return results;
  }
}
