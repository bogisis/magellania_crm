/**
 * Authentication Middleware
 * Protect routes and check permissions
 */

const logger = require('../utils/logger');

/**
 * Require authentication
 * Redirects to login if not authenticated
 */
function requireAuth(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }

    logger.warn('Unauthorized access attempt', {
        path: req.path,
        method: req.method,
        ip: req.ip
    });

    // For API endpoints, return JSON error
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required',
            code: 'UNAUTHORIZED'
        });
    }

    // For page requests, redirect to login
    res.redirect('/login');
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required',
            code: 'UNAUTHORIZED'
        });
    }

    if (!req.user.is_admin) {
        logger.warn('Admin access denied', {
            userId: req.user.id,
            path: req.path
        });

        return res.status(403).json({
            success: false,
            error: 'Admin privileges required',
            code: 'FORBIDDEN'
        });
    }

    next();
}

/**
 * Check if user belongs to organization
 * Ensures multi-tenancy isolation
 */
function requireOrganization(organizationId) {
    return (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            });
        }

        if (req.user.organization_id !== organizationId) {
            logger.warn('Organization access denied', {
                userId: req.user.id,
                userOrg: req.user.organization_id,
                requestedOrg: organizationId
            });

            return res.status(403).json({
                success: false,
                error: 'Access denied to this organization',
                code: 'FORBIDDEN'
            });
        }

        next();
    };
}

/**
 * Attach user organization to request
 * For filtering data by organization
 */
function attachOrganization(req, res, next) {
    if (req.isAuthenticated()) {
        req.organizationId = req.user.organization_id;
        req.userId = req.user.id;
    }
    next();
}

/**
 * Optional authentication
 * Doesn't block if not authenticated, but attaches user if available
 */
function optionalAuth(req, res, next) {
    // User will be attached by passport if session exists
    next();
}

/**
 * Rate limiting helper
 * Track failed attempts (basic in-memory implementation)
 */
const rateLimitStore = new Map();

function rateLimit({ windowMs = 15 * 60 * 1000, max = 5 } = {}) {
    return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();

        // Get or create entry
        let entry = rateLimitStore.get(key);

        if (!entry) {
            entry = { count: 0, resetAt: now + windowMs };
            rateLimitStore.set(key, entry);
        }

        // Reset if window expired
        if (now > entry.resetAt) {
            entry.count = 0;
            entry.resetAt = now + windowMs;
        }

        // Increment count
        entry.count++;

        // Check limit
        if (entry.count > max) {
            const resetIn = Math.ceil((entry.resetAt - now) / 1000);

            logger.warn('Rate limit exceeded', {
                ip: key,
                path: req.path,
                count: entry.count
            });

            return res.status(429).json({
                success: false,
                error: `Too many requests. Try again in ${resetIn} seconds`,
                code: 'RATE_LIMIT_EXCEEDED',
                resetIn
            });
        }

        next();
    };
}

// Cleanup old rate limit entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetAt + 60000) {  // 1 minute grace period
            rateLimitStore.delete(key);
        }
    }
}, 60000);  // Every minute

module.exports = {
    requireAuth,
    requireAdmin,
    requireOrganization,
    attachOrganization,
    optionalAuth,
    rateLimit
};
