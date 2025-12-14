/**
 * RBAC (Role-Based Access Control) Middleware для API v1
 *
 * Проверяет роли и permissions пользователей
 *
 * Roles:
 * - superadmin (level 100) - полный доступ ко всем org
 * - admin (level 50) - управление своей org
 * - user (level 10) - базовые операции
 *
 * Permission-based RBAC (NEW):
 * - Fine-grained permissions using permissions table
 * - checkPermission(permissionName) для точного контроля
 * - Integration with role_permissions table
 *
 * Created: 2025-11-19
 * Updated: 2025-12-13 - Added permission-based RBAC
 * Version: 4.0.0
 */

// Role levels
const ROLES = {
    user: 10,
    admin: 50,
    superadmin: 100,  // Changed from superuser for consistency
    superuser: 100    // Backward compatibility
};

/**
 * Получить уровень роли
 */
function getRoleLevel(role) {
    return ROLES[role] || 0;
}

/**
 * Проверка минимальной роли
 */
function requireRole(minRole) {
    const minLevel = getRoleLevel(minRole);

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const userLevel = getRoleLevel(req.user.role);

        if (userLevel < minLevel) {
            return res.status(403).json({
                success: false,
                error: `Insufficient permissions. Required role: ${minRole} or higher`
            });
        }

        next();
    };
}

/**
 * Проверка ownership ресурса
 * Пользователь может быть owner ИЛИ admin своей организации
 */
function requireOwnership(getOwnerId) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        try {
            const ownerId = await getOwnerId(req);

            // Superuser имеет доступ везде
            if (req.user.role === 'superuser') {
                return next();
            }

            // Admin своей org имеет доступ
            if (req.user.role === 'admin') {
                return next();
            }

            // Owner ресурса
            if (req.user.id === ownerId) {
                return next();
            }

            return res.status(403).json({
                success: false,
                error: 'Access denied: You are not the owner of this resource'
            });

        } catch (err) {
            return res.status(500).json({
                success: false,
                error: 'Failed to verify ownership'
            });
        }
    };
}

/**
 * Проверка доступа к организации
 */
function requireOrganizationAccess(getOrganizationId) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        try {
            const organizationId = await getOrganizationId(req);

            // Superuser имеет доступ ко всем org
            if (req.user.role === 'superuser') {
                return next();
            }

            // Проверка, что пользователь из той же org
            if (req.user.organization_id !== organizationId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied: Resource belongs to different organization'
                });
            }

            next();

        } catch (err) {
            return res.status(500).json({
                success: false,
                error: 'Failed to verify organization access'
            });
        }
    };
}

/**
 * Проверка shared access к estimate
 */
function requireSharedAccess(storage) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        try {
            const estimateId = req.params.id;
            const estimate = await storage.getEstimate(estimateId);

            if (!estimate) {
                return res.status(404).json({
                    success: false,
                    error: 'Estimate not found'
                });
            }

            // Superuser имеет доступ везде
            if (req.user.role === 'superuser') {
                req.estimate = estimate;
                return next();
            }

            // Owner имеет доступ
            if (estimate.owner_id === req.user.id) {
                req.estimate = estimate;
                return next();
            }

            // Admin своей org имеет доступ
            if (req.user.role === 'admin' && estimate.organization_id === req.user.organization_id) {
                req.estimate = estimate;
                return next();
            }

            // Проверка visibility
            if (estimate.visibility === 'organization' && estimate.organization_id === req.user.organization_id) {
                req.estimate = estimate;
                return next();
            }

            // Проверка shared_with
            if (estimate.shared_with) {
                const sharedWith = JSON.parse(estimate.shared_with);
                if (sharedWith.includes(req.user.id)) {
                    req.estimate = estimate;
                    return next();
                }
            }

            return res.status(403).json({
                success: false,
                error: 'Access denied: You do not have access to this estimate'
            });

        } catch (err) {
            return res.status(500).json({
                success: false,
                error: 'Failed to verify access'
            });
        }
    };
}

/**
 * Middleware для проверки, что пользователь - это он сам или admin
 */
function requireSelfOrAdmin(getUserId) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        try {
            const targetUserId = await getUserId(req);

            // Superuser имеет доступ везде
            if (req.user.role === 'superuser') {
                return next();
            }

            // Admin своей org
            if (req.user.role === 'admin' && req.user.organization_id === req.user.organization_id) {
                return next();
            }

            // Сам пользователь
            if (req.user.id === targetUserId) {
                return next();
            }

            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });

        } catch (err) {
            return res.status(500).json({
                success: false,
                error: 'Failed to verify permissions'
            });
        }
    };
}

// ============================================================================
// Permission-Based RBAC (NEW in v4.0.0)
// ============================================================================

/**
 * Check if user has required permission(s)
 * Uses permissions table from migration 013
 *
 * @param {string|string[]} requiredPermissions - Permission name(s) to check
 * @returns {Function} Express middleware
 *
 * Usage:
 *   router.get('/users', requireAuth, checkPermission('users.list'), handler);
 *   router.delete('/users/:id', requireAuth, checkPermission(['users.delete', 'users.manage']), handler);
 */
function checkPermission(requiredPermissions) {
    // Normalize to array for consistent handling
    const permissions = Array.isArray(requiredPermissions)
        ? requiredPermissions
        : [requiredPermissions];

    return async (req, res, next) => {
        try {
            // Ensure user is authenticated (set by requireAuth middleware)
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            const { id: userId, role, organization_id } = req.user;

            // Superadmin bypass: has all permissions globally
            if (role === 'superadmin' || role === 'superuser') {
                return next();
            }

            // Get storage from app locals (initialized in server.js)
            const storage = req.app.locals.storage;
            if (!storage || !storage.db) {
                console.error('[RBAC] Storage not available in app.locals');
                return res.status(500).json({
                    success: false,
                    error: 'Internal server error: storage unavailable'
                });
            }

            // Check if user has at least one of the required permissions
            const hasPermission = checkUserPermissions(
                storage.db,
                role,
                organization_id,
                permissions
            );

            if (!hasPermission) {
                console.warn(`[RBAC] Permission denied for user ${userId}:`, {
                    role,
                    organization_id,
                    required: permissions
                });

                return res.status(403).json({
                    success: false,
                    error: 'Permission denied',
                    required_permissions: permissions
                });
            }

            // Permission granted, continue to route handler
            next();

        } catch (error) {
            console.error('[RBAC] Error checking permissions:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error during permission check'
            });
        }
    };
}

/**
 * Check if user has at least one of the required permissions
 * (Synchronous helper function)
 *
 * @param {Database} db - SQLite database instance
 * @param {string} role - User's role (e.g., 'admin')
 * @param {string} organizationId - User's organization ID
 * @param {string[]} permissions - Required permission names
 * @returns {boolean} True if user has at least one permission
 */
function checkUserPermissions(db, role, organizationId, permissions) {
    try {
        // Query: Check if user's role has any of the required permissions
        // For their organization (or globally for superadmin)
        const query = `
            SELECT COUNT(*) as count
            FROM role_permissions rp
            JOIN permissions p ON rp.permission_id = p.id
            WHERE rp.role = ?
              AND p.name IN (${permissions.map(() => '?').join(', ')})
              AND (
                  rp.organization_id = ?           -- Org-scoped permission
                  OR rp.organization_id IS NULL    -- Global permission (superadmin)
              )
        `;

        const params = [role, ...permissions, organizationId];
        const result = db.prepare(query).get(params);

        return result.count > 0;

    } catch (error) {
        console.error('[RBAC] Database error checking permissions:', error);
        throw error;
    }
}

/**
 * Get all permissions for a user
 * Useful for debugging or displaying in admin UI
 *
 * @param {Database} db - SQLite database instance
 * @param {string} role - User's role
 * @param {string} organizationId - User's organization ID
 * @returns {Array} Array of permission objects
 */
function getUserPermissions(db, role, organizationId) {
    try {
        const query = `
            SELECT
                p.id,
                p.name,
                p.description,
                p.resource,
                p.action,
                rp.organization_id,
                CASE
                    WHEN rp.organization_id IS NULL THEN 'global'
                    ELSE 'organization'
                END as scope
            FROM role_permissions rp
            JOIN permissions p ON rp.permission_id = p.id
            WHERE rp.role = ?
              AND (
                  rp.organization_id = ?
                  OR rp.organization_id IS NULL
              )
            ORDER BY p.resource, p.action
        `;

        const permissions = db.prepare(query).all(role, organizationId);
        return permissions;

    } catch (error) {
        console.error('[RBAC] Error getting user permissions:', error);
        throw error;
    }
}

/**
 * Convenience middleware: require superadmin role
 */
function requireSuperadmin() {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        if (req.user.role !== 'superadmin' && req.user.role !== 'superuser') {
            return res.status(403).json({
                success: false,
                error: 'Superadmin access required'
            });
        }

        next();
    };
}

module.exports = {
    // Role-based (legacy, v3.0.0)
    ROLES,
    getRoleLevel,
    requireRole,
    requireOwnership,
    requireOrganizationAccess,
    requireSharedAccess,
    requireSelfOrAdmin,

    // Permission-based (new, v4.0.0)
    checkPermission,
    checkUserPermissions,
    getUserPermissions,
    requireSuperadmin
};
