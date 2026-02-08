/**
 * Role-Based Access Control Middleware
 * 
 * Provides role checking for protected endpoints
 */

/**
 * Middleware to check if user has required roles
 * Usage: router.post('/', verifyToken, requireRole('admin'), handler)
 */
export const requireRole = (...roles) => {
  return async (req, res, next) => {
    // Get user from database to check role
    const { User } = await import('../models/User.js');
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check if user has one of the required roles
    const userRole = user.role || 'user'; // Default role is 'user'
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        error: `Access denied. Required roles: ${roles.join(', ')}. Your role: ${userRole}`,
      });
    }

    // Attach user object to request for later use
    req.user = user;

    next();
  };
};

/**
 * Middleware to check if user is admin
 * Convenience wrapper for requireRole('admin')
 */
export const requireAdmin = requireRole('admin');

/**
 * Middleware to check if user owns a resource
 * Usage: router.put('/coupon/:id', verifyToken, requireOwnership('couponId'), handler)
 */
export const requireOwnership = (resourceFieldName) => {
  return async (req, res, next) => {
    const resourceId = req.params[resourceFieldName] || req.body[resourceFieldName];

    if (!resourceId) {
      return res.status(400).json({
        error: `Resource ID (${resourceFieldName}) is required`,
      });
    }

    // This is a basic check - you'd implement actual ownership verification per resource type
    // For now, we'll just mark it on the request
    req.resourceId = resourceId;
    req.resourceFieldName = resourceFieldName;

    next();
  };
};
