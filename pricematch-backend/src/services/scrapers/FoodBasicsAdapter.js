import { load } from 'cheerio';
import pdfParse from 'pdf-parse';
import { createApiClient } from '../../config/axios.js';
import { ScraperAdapter } from './ScraperAdapter.js';

/**
 * Food Basics Scraper Adapter
 * Scrapes Food Basics Canada flyers and deals
 * Supports HTML parsing and PDF extraction
 */
export class FoodBasicsAdapter extends ScraperAdapter {
  constructor() {
    super('Food Basics');
    this.apiClient = createApiClient();
    this.baseUrl = 'https://www.loblaws.ca'; // Food Basics is owned by Loblaws
  }

  /**
   * Fetch Food Basics flyers from Loblaws website
   * In production, this would either:
   * 1. Parse Loblaws.ca website for Food Basics weekly flyer links
   * 2. Use Loblaws API if available
   * 3. Parse email-delivered PDF flyers
   *
   * For now, returns a template structure
   */
  async fetchFlyers(store) {
    const flyers = [];

    try {
      // Attempt to fetch from Loblaws website
      // This is a simplified example; real implementation depends on site structure
      const flyerUrl = `${this.baseUrl}/food-basics/${store.postalCode}/weekly-flyer`;

      try {
        const response = await this.apiClient.get(flyerUrl);
        flyers.push({
          sourceUrl: flyerUrl,
          sourceType: 'html',
          content: response.data,
          store,
        });
      } catch (error) {
        console.warn(`Could not fetch HTML flyer for store ${store.storeName}:`, error.message);
        // In production, fallback to alternative sources or PDF parsing
      }

      return flyers;
    } catch (error) {
      console.error(`Error fetching flyers for ${store.storeName}:`, error);
      throw error;
    }
  }

  /**
   * Parse deals from HTML flyer content
   * Parses Loblaws/Food Basics HTML structure to extract deal information
   */
  async parseDealsFromHTML(htmlContent) {
    const deals = [];

    try {
      const $ = load(htmlContent);

      // Common selectors for grocery store flyers (adjust based on actual HTML)
      // This is an example structure that would need to be updated based on real site
      const dealElements = $('[data-testid="flyer-item"], .flyer-item, .deal-card');

      dealElements.each((index, element) => {
        const $element = $(element);

        const title = $element.find('.deal-title, [data-testid="item-title"]').text().trim();
        const priceText = $element.find('.price, [data-testid="item-price"]').text().trim();
        const originalPriceText = $element.find('.original-price').text().trim();
        const imageUrl = $element.find('img').attr('src');

        // Parse price (handle formats like "$5.99", "$5.99/lb", etc.)
        const salePrice = this.parsePrice(priceText);
        const originalPrice = this.parsePrice(originalPriceText);

        if (!title || salePrice === null) {
          return; // Skip invalid deals
        }

        // Category detection based on keywords
        const category = this.detectCategory(title);

        deals.push({
          title,
          originalPrice,
          salePrice,
          priceAfterTax: this.calculateAfterTax(salePrice), // 13% HST for Ontario
          category,
          imageUrl: imageUrl ? new URL(imageUrl, this.baseUrl).href : null,
          expiryDate: this.getFlyerExpiryDate(),
          sourceType: 'html',
          flyerUrl: null,
        });
      });

      return deals;
    } catch (error) {
      console.error('Error parsing HTML flyer:', error);
      throw error;
    }
  }

  /**
   * Parse deals from PDF flyer content
   * Extracts text from PDF and parses deal information
   */
  async parseDealsFromPDF(pdfBuffer) {
    const deals = [];

    try {
      const pdfData = await pdfParse(pdfBuffer);
      const text = pdfData.text;

      // Parse PDF text to extract deals
      // This is highly dependent on PDF structure and would require OCR for images
      // For now, basic text extraction approach

      const lines = text.split('\n');
      let currentDeal = {};

      for (const line of lines) {
        const trimmed = line.trim();

        // Look for price patterns (e.g., "$5.99")
        const priceMatch = trimmed.match(/\$[\d.]+/g);
        if (priceMatch) {
          currentDeal.salePrice = this.parsePrice(priceMatch[0]);

          if (priceMatch[1]) {
            currentDeal.originalPrice = this.parsePrice(priceMatch[1]);
          }

          if (currentDeal.title && currentDeal.salePrice) {
            currentDeal.category = this.detectCategory(currentDeal.title);
            currentDeal.priceAfterTax = this.calculateAfterTax(currentDeal.salePrice);
            currentDeal.expiryDate = this.getFlyerExpiryDate();
            currentDeal.sourceType = 'pdf';

            deals.push({ ...currentDeal });
            currentDeal = {};
          }
        } else if (trimmed.length > 3 && !trimmed.match(/^\d+$/) && !currentDeal.title) {
          currentDeal.title = trimmed;
        }
      }

      return deals;
    } catch (error) {
      console.error('Error parsing PDF flyer:', error);
      throw error;
    }
  }

  /**
   * Main parse method - routes to HTML or PDF parser
   */
  async parseDeals(source, sourceType) {
    if (sourceType === 'html') {
      return this.parseDealsFromHTML(source);
    } else if (sourceType === 'pdf') {
      return this.parseDealsFromPDF(source);
    } else {
      throw new Error(`Unsupported source type: ${sourceType}`);
    }
  }

  /**
   * Helper: Parse price from string
   */
  parsePrice(priceString) {
    if (!priceString) return null;
    const match = priceString.match(/\d+\.\d{2}/);
    return match ? parseFloat(match[0]) : null;
  }

  /**
   * Helper: Detect product category from title
   */
  detectCategory(title) {
    const lowerTitle = title.toLowerCase();

    if (lowerTitle.match(/milk|yogurt|cheese|butter|cream|dairy/)) return 'dairy';
    if (lowerTitle.match(/beef|chicken|pork|meat|steak|ground|salmon|fish/))
      return 'meat';
    if (lowerTitle.match(/bread|bagel|pastry|donut|cake|bake/)) return 'bakery';
    if (lowerTitle.match(/phone|laptop|tv|computer|electronic|camera|headphone/))
      return 'electronics';
    if (lowerTitle.match(/soap|shampoo|toothpaste|deodorant|lotion|hygiene/))
      return 'personal-care';
    if (lowerTitle.match(/paper|towel|soap|detergent|cleaner|plastic/)) return 'household';

    return 'grocery';
  }

  /**
   * Helper: Calculate price after tax (13% HST for Ontario - adjust by province)
   */
  calculateAfterTax(price, taxRate = 0.13) {
    if (!price) return null;
    return parseFloat((price * (1 + taxRate)).toFixed(2));
  }

  /**
   * Helper: Get flyer expiry date (typically 2 weeks from now for weekly flyers)
   */
  getFlyerExpiryDate() {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 14);
    return expiryDate;
  }
}
