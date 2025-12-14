/**
 * Audit Logger Middleware
 *
 * Logs all admin actions to audit_log table for compliance and debugging.
 *
 * Features:
 * - Automatic logging of all admin operations
 * - Captures before/after changes for updates
 * - Never fails requests (try-catch wrapper)
 * - IP address and user agent tracking
 * - Organization-scoped logging
 *
 * Usage:
 *   const { auditLog } = require('../middleware/auditLogger');
 *
 *   router.post('/users', requireAuth, auditLog('user_create'), handler);
 *   router.put('/users/:id', requireAuth, auditLog('user_update'), handler);
 *   router.delete('/users/:id', requireAuth, auditLog('user_delete'), handler);
 *
 * Created: 2025-12-13
 * Version: 1.0.0
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Audit log middleware
 *
 * @param {string} action - Action being performed (e.g., 'user_create', 'estimate_delete')
 * @param {Object} options - Optional configuration
 * @param {Function} options.getEntityId - Function to extract entity ID from req
 * @param {Function} options.getBeforeState - Function to get "before" state for updates
 * @returns {Function} Express middleware
 */
function auditLog(action, options = {}) {
    return async (req, res, next) => {
        // Store original res.json to intercept response
        const originalJson = res.json.bind(res);

        // Intercept res.json to log after successful response
        res.json = function(data) {
            // Log asynchronously without blocking response
            logAudit(req, action, data, options).catch(err => {
                console.error('[AuditLogger] Failed to log audit entry:', err);
                // Continue anyway - audit logging should never fail the request
            });

            // Call original res.json
            return originalJson(data);
        };

        next();
    };
}

/**
 * Internal function to write audit log entry
 *
 * @param {Object} req - Express request object
 * @param {string} action - Action performed
 * @param {Object} responseData - Response data
 * @param {Object} options - Optional configuration
 */
async function logAudit(req, action, responseData, options) {
    try {
        // Only log if request was successful
        if (responseData && !responseData.success) {
            return; // Skip logging failed requests
        }

        const storage = req.app.locals.storage;
        if (!storage || !storage.db) {
            console.warn('[AuditLogger] Storage not available');
            return;
        }

        // Extract user info (set by requireAuth middleware)
        const userId = req.user?.id || 'anonymous';
        const organizationId = req.user?.organization_id || null;

        // Extract entity ID (e.g., user ID, estimate ID)
        let entityId = null;
        if (options.getEntityId) {
            entityId = options.getEntityId(req);
        } else {
            // Default: try to get from URL params
            entityId = req.params.id || req.params.userId || req.params.estimateId || null;
        }

        // Get "before" state for updates (if applicable)
        let changesBefore = null;
        if (options.getBeforeState && entityId) {
            try {
                changesBefore = await options.getBeforeState(req, entityId, storage);
            } catch (err) {
                console.warn('[AuditLogger] Failed to get before state:', err);
            }
        }

        // Get "after" state (response data or request body)
        const changesAfter = req.body || null;

        // Extract metadata
        const metadata = {
            ip_address: getClientIp(req),
            user_agent: req.get('user-agent') || null,
            method: req.method,
            path: req.path,
            query: req.query,
            params: req.params
        };

        // Insert audit log entry
        const auditEntry = {
            id: uuidv4(),
            user_id: userId,
            organization_id: organizationId,
            action,
            entity_type: extractEntityType(action),
            entity_id: entityId,
            changes_before: changesBefore ? JSON.stringify(changesBefore) : null,
            changes_after: changesAfter ? JSON.stringify(changesAfter) : null,
            metadata: JSON.stringify(metadata),
            created_at: new Date().toISOString()
        };

        const stmt = storage.db.prepare(`
            INSERT INTO audit_log (
                id, user_id, organization_id, action, entity_type, entity_id,
                changes_before, changes_after, metadata, created_at
            ) VALUES (
                @id, @user_id, @organization_id, @action, @entity_type, @entity_id,
                @changes_before, @changes_after, @metadata, @created_at
            )
        `);

        stmt.run(auditEntry);

        console.log(`[AuditLogger] Logged: ${action} by user ${userId} (entity: ${entityId})`);

    } catch (error) {
        // NEVER throw - audit logging failures should not break the request
        console.error('[AuditLogger] Error writing audit log:', error);
    }
}

/**
 * Extract entity type from action name
 * e.g., 'user_create' → 'user', 'estimate_delete' → 'estimate'
 *
 * @param {string} action - Action name
 * @returns {string} Entity type
 */
function extractEntityType(action) {
    const parts = action.split('_');
    return parts[0] || 'unknown';
}

/**
 * Get client IP address from request
 * Handles proxies and load balancers
 *
 * @param {Object} req - Express request object
 * @returns {string} IP address
 */
function getClientIp(req) {
    // Check X-Forwarded-For header (for proxies/load balancers)
    const forwarded = req.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }

    // Check X-Real-IP header
    const realIp = req.get('x-real-ip');
    if (realIp) {
        return realIp;
    }

    // Fallback to direct connection IP
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Query audit logs for a specific entity
 *
 * @param {Database} db - SQLite database instance
 * @param {string} entityType - Entity type (e.g., 'user', 'estimate')
 * @param {string} entityId - Entity ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Max results (default: 50)
 * @param {number} options.offset - Offset for pagination (default: 0)
 * @returns {Array} Audit log entries
 */
function getEntityAuditLog(db, entityType, entityId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    try {
        const query = `
            SELECT
                id,
                user_id,
                organization_id,
                action,
                entity_type,
                entity_id,
                changes_before,
                changes_after,
                metadata,
                created_at
            FROM audit_log
            WHERE entity_type = ?
              AND entity_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;

        const logs = db.prepare(query).all(entityType, entityId, limit, offset);

        // Parse JSON fields
        return logs.map(log => ({
            ...log,
            changes_before: log.changes_before ? JSON.parse(log.changes_before) : null,
            changes_after: log.changes_after ? JSON.parse(log.changes_after) : null,
            metadata: log.metadata ? JSON.parse(log.metadata) : null
        }));

    } catch (error) {
        console.error('[AuditLogger] Error querying audit log:', error);
        throw error;
    }
}

/**
 * Query audit logs for a user
 *
 * @param {Database} db - SQLite database instance
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Max results (default: 50)
 * @param {number} options.offset - Offset for pagination (default: 0)
 * @returns {Array} Audit log entries
 */
function getUserAuditLog(db, userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    try {
        const query = `
            SELECT
                id,
                user_id,
                organization_id,
                action,
                entity_type,
                entity_id,
                changes_before,
                changes_after,
                metadata,
                created_at
            FROM audit_log
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;

        const logs = db.prepare(query).all(userId, limit, offset);

        // Parse JSON fields
        return logs.map(log => ({
            ...log,
            changes_before: log.changes_before ? JSON.parse(log.changes_before) : null,
            changes_after: log.changes_after ? JSON.parse(log.changes_after) : null,
            metadata: log.metadata ? JSON.parse(log.metadata) : null
        }));

    } catch (error) {
        console.error('[AuditLogger] Error querying user audit log:', error);
        throw error;
    }
}

/**
 * Query audit logs for an organization
 *
 * @param {Database} db - SQLite database instance
 * @param {string} organizationId - Organization ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Max results (default: 100)
 * @param {number} options.offset - Offset for pagination (default: 0)
 * @param {string} options.action - Filter by action (optional)
 * @returns {Array} Audit log entries
 */
function getOrganizationAuditLog(db, organizationId, options = {}) {
    const { limit = 100, offset = 0, action = null } = options;

    try {
        let query = `
            SELECT
                id,
                user_id,
                organization_id,
                action,
                entity_type,
                entity_id,
                changes_before,
                changes_after,
                metadata,
                created_at
            FROM audit_log
            WHERE organization_id = ?
        `;

        const params = [organizationId];

        if (action) {
            query += ` AND action = ?`;
            params.push(action);
        }

        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const logs = db.prepare(query).all(...params);

        // Parse JSON fields
        return logs.map(log => ({
            ...log,
            changes_before: log.changes_before ? JSON.parse(log.changes_before) : null,
            changes_after: log.changes_after ? JSON.parse(log.changes_after) : null,
            metadata: log.metadata ? JSON.parse(log.metadata) : null
        }));

    } catch (error) {
        console.error('[AuditLogger] Error querying organization audit log:', error);
        throw error;
    }
}

module.exports = {
    auditLog,
    getEntityAuditLog,
    getUserAuditLog,
    getOrganizationAuditLog
};
