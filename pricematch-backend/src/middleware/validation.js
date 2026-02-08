/**
 * Input Validation Middleware
 * 
 * Validates query parameters, body, and params for common issues
 * - Location coordinate ranges
 * - Pagination limits
 * - MongoDB ObjectId format
 */

import mongoose from 'mongoose';

/**
 * Validates latitude coordinate
 * @param {number} latitude
 * @returns {boolean}
 */
export const isValidLatitude = (latitude) => {
  const lat = parseFloat(latitude);
  return !isNaN(lat) && lat >= -90 && lat <= 90;
};

/**
 * Validates longitude coordinate
 * @param {number} longitude
 * @returns {boolean}
 */
export const isValidLongitude = (longitude) => {
  const lon = parseFloat(longitude);
  return !isNaN(lon) && lon >= -180 && lon <= 180;
};

/**
 * Validates MongoDB ObjectId
 * @param {string} id
 * @returns {boolean}
 */
export const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Middleware to validate location coordinates
 * Checks lat/lon in query or body
 */
export const validateLocationCoordinates = (req, res, next) => {
  const { latitude, longitude } = req.query || req.body;

  if (latitude && !isValidLatitude(latitude)) {
    return res.status(400).json({
      error: 'Invalid latitude. Must be between -90 and 90.',
    });
  }

  if (longitude && !isValidLongitude(longitude)) {
    return res.status(400).json({
      error: 'Invalid longitude. Must be between -180 and 180.',
    });
  }

  if ((latitude && !longitude) || (longitude && !latitude)) {
    return res.status(400).json({
      error: 'Both latitude and longitude are required when providing coordinates.',
    });
  }

  next();
};

/**
 * Middleware to validate and sanitize pagination parameters
 */
export const validatePagination = (req, res, next) => {
  const { limit, skip } = req.query;

  if (limit) {
    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      return res.status(400).json({
        error: 'limit must be a positive integer',
      });
    }
    // Cap maximum limit
    req.query.limit = Math.min(parsedLimit, 100).toString();
  }

  if (skip) {
    const parsedSkip = parseInt(skip, 10);
    if (isNaN(parsedSkip) || parsedSkip < 0) {
      return res.status(400).json({
        error: 'skip must be a non-negative integer',
      });
    }
    req.query.skip = parsedSkip.toString();
  }

  next();
};

/**
 * Middleware to validate MongoDB ObjectId in params
 * Usage: app.get('/resource/:id', validateObjectIdParam('id'), handler)
 */
export const validateObjectIdParam = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        error: `Invalid ${paramName} format. Must be a valid MongoDB ObjectId.`,
      });
    }

    next();
  };
};

/**
 * Middleware to validate multiple ObjectIds
 * Usage: validateObjectIds(['storeId', 'userId'])
 */
export const validateObjectIds = (fieldNames) => {
  return (req, res, next) => {
    const source = { ...req.params, ...req.body, ...req.query };

    for (const fieldName of fieldNames) {
      const value = source[fieldName];
      if (value && !isValidObjectId(value)) {
        return res.status(400).json({
          error: `Invalid ${fieldName}. Must be a valid MongoDB ObjectId.`,
        });
      }
    }

    next();
  };
};

/**
 * Middleware to sanitize numeric query parameters
 */
export const sanitizeNumericParams = (...paramNames) => {
  return (req, res, next) => {
    for (const param of paramNames) {
      if (req.query[param]) {
        const parsed = parseFloat(req.query[param]);
        if (isNaN(parsed)) {
          return res.status(400).json({
            error: `Invalid ${param}. Must be a number.`,
          });
        }
        req.query[param] = parsed;
      }
    }

    next();
  };
};
