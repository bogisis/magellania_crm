/**
 * Admin Middleware
 *
 * Provides organization filtering and multi-tenancy enforcement for admin API routes.
 *
 * Features:
 * - Automatic organization_id filtering
 * - Superadmin sees all organizations
 * - Admin sees only their organization
 * - Query parameter helpers for pagination and filtering
 *
 * Usage:
 *   const { filterByOrganization, validateOrgAccess } = require('../middleware/admin');
 *
 *   router.get('/users',
 *     requireAuth,
 *     filterByOrganization,  // Adds org filtering
 *     handler
 *   );
 *
 * Created: 2025-12-13
 * Version: 1.0.0
 */

/**
 * Filter results by organization
 * Adds organization_id to req.query for SQL queries
 * Superadmin bypass: no filtering applied
 *
 * @returns {Function} Express middleware
 */
function filterByOrganization(req, res, next) {
    try {
        // Ensure user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const { role, organization_id } = req.user;

        // Superadmin: no filtering, sees all organizations
        if (role === 'superadmin' || role === 'superuser') {
            req.organizationFilter = null; // No filter
            return next();
        }

        // Admin/User: filter by their organization only
        req.organizationFilter = organization_id;

        // Store in req for use in route handlers
        req.filteredOrganizationId = organization_id;

        next();

    } catch (error) {
        console.error('[Admin] Error applying organization filter:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}

/**
 * Validate that user has access to specified organization
 * Used for routes that take organization_id as parameter
 *
 * @param {Function} getOrganizationId - Function to extract org ID from request
 * @returns {Function} Express middleware
 */
function validateOrgAccess(getOrganizationId) {
    return async (req, res, next) => {
        try {
            // Ensure user is authenticated
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            const { role, organization_id: userOrgId } = req.user;

            // Get target organization ID from request
            const targetOrgId = getOrganizationId
                ? getOrganizationId(req)
                : req.params.organizationId || req.body.organization_id;

            if (!targetOrgId) {
                return res.status(400).json({
                    success: false,
                    error: 'Organization ID required'
                });
            }

            // Superadmin: access to all organizations
            if (role === 'superadmin' || role === 'superuser') {
                req.targetOrganizationId = targetOrgId;
                return next();
            }

            // Admin/User: only access their own organization
            if (targetOrgId !== userOrgId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied: You do not have access to this organization'
                });
            }

            req.targetOrganizationId = targetOrgId;
            next();

        } catch (error) {
            console.error('[Admin] Error validating org access:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    };
}

/**
 * Parse pagination parameters from query string
 * Adds req.pagination with validated page/limit
 *
 * @param {Object} options - Configuration
 * @param {number} options.maxLimit - Maximum allowed limit (default: 100)
 * @param {number} options.defaultLimit - Default limit (default: 20)
 * @returns {Function} Express middleware
 */
function parsePagination(options = {}) {
    const { maxLimit = 100, defaultLimit = 20 } = options;

    return (req, res, next) => {
        try {
            // Parse page (1-indexed for users, 0-indexed internally)
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);

            // Parse limit with bounds checking
            let limit = parseInt(req.query.limit, 10) || defaultLimit;
            limit = Math.min(maxLimit, Math.max(1, limit));

            // Calculate offset
            const offset = (page - 1) * limit;

            // Store in req
            req.pagination = {
                page,
                limit,
                offset,
                maxLimit,
                defaultLimit
            };

            next();

        } catch (error) {
            console.error('[Admin] Error parsing pagination:', error);
            return res.status(400).json({
                success: false,
                error: 'Invalid pagination parameters'
            });
        }
    };
}

/**
 * Parse sorting parameters from query string
 * Adds req.sorting with validated sortBy/sortOrder
 *
 * @param {Object} options - Configuration
 * @param {Array<string>} options.allowedFields - Allowed sort fields
 * @param {string} options.defaultField - Default sort field
 * @param {string} options.defaultOrder - Default sort order ('asc' or 'desc')
 * @returns {Function} Express middleware
 */
function parseSorting(options = {}) {
    const {
        allowedFields = [],
        defaultField = 'created_at',
        defaultOrder = 'desc'
    } = options;

    return (req, res, next) => {
        try {
            // Parse sortBy field
            let sortBy = req.query.sortBy || req.query.sort || defaultField;

            // Validate sortBy is in allowed list (SQL injection prevention)
            if (allowedFields.length > 0 && !allowedFields.includes(sortBy)) {
                sortBy = defaultField;
            }

            // Parse sortOrder
            let sortOrder = (req.query.sortOrder || req.query.order || defaultOrder).toLowerCase();
            if (!['asc', 'desc'].includes(sortOrder)) {
                sortOrder = defaultOrder;
            }

            // Store in req
            req.sorting = {
                sortBy,
                sortOrder,
                allowedFields
            };

            next();

        } catch (error) {
            console.error('[Admin] Error parsing sorting:', error);
            return res.status(400).json({
                success: false,
                error: 'Invalid sorting parameters'
            });
        }
    };
}

/**
 * Parse search/filter parameters from query string
 * Adds req.filters with validated search terms
 *
 * @param {Object} options - Configuration
 * @param {Array<string>} options.allowedFilters - Allowed filter fields
 * @param {string} options.searchField - Field to use for search query
 * @returns {Function} Express middleware
 */
function parseFilters(options = {}) {
    const {
        allowedFilters = [],
        searchField = 'search'
    } = options;

    return (req, res, next) => {
        try {
            const filters = {};

            // Parse search query
            if (req.query[searchField]) {
                filters.search = req.query[searchField].trim();
                filters.searchField = searchField;
            }

            // Parse allowed filters
            for (const field of allowedFilters) {
                if (req.query[field] !== undefined) {
                    filters[field] = req.query[field];
                }
            }

            // Store in req
            req.filters = filters;

            next();

        } catch (error) {
            console.error('[Admin] Error parsing filters:', error);
            return res.status(400).json({
                success: false,
                error: 'Invalid filter parameters'
            });
        }
    };
}

/**
 * Build SQL WHERE clause with organization filtering
 * Utility function for route handlers
 *
 * @param {Object} req - Express request object
 * @param {Array<string>} conditions - Additional WHERE conditions
 * @returns {Object} { whereClause: string, params: Array }
 */
function buildWhereClause(req, conditions = []) {
    const params = [];
    const allConditions = [...conditions];

    // Add organization filter if applicable
    if (req.organizationFilter) {
        allConditions.push('organization_id = ?');
        params.push(req.organizationFilter);
    }

    // Build WHERE clause
    const whereClause = allConditions.length > 0
        ? `WHERE ${allConditions.join(' AND ')}`
        : '';

    return { whereClause, params };
}

/**
 * Build pagination SQL clause
 * Utility function for route handlers
 *
 * @param {Object} req - Express request object
 * @returns {Object} { limitClause: string, params: Array }
 */
function buildPaginationClause(req) {
    const { limit, offset } = req.pagination || { limit: 20, offset: 0 };

    return {
        limitClause: 'LIMIT ? OFFSET ?',
        params: [limit, offset]
    };
}

/**
 * Build ORDER BY SQL clause
 * Utility function for route handlers
 *
 * @param {Object} req - Express request object
 * @returns {string} ORDER BY clause
 */
function buildOrderClause(req) {
    const { sortBy, sortOrder } = req.sorting || { sortBy: 'created_at', sortOrder: 'desc' };

    // SQL injection prevention: sortBy should already be validated by parseSorting
    return `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
}

module.exports = {
    filterByOrganization,
    validateOrgAccess,
    parsePagination,
    parseSorting,
    parseFilters,
    buildWhereClause,
    buildPaginationClause,
    buildOrderClause
};
