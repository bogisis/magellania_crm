/**
 * RBAC (Role-Based Access Control) Middleware для API v1
 *
 * Проверяет роли и permissions пользователей
 *
 * Roles:
 * - superuser (level 100) - полный доступ ко всем org
 * - admin (level 50) - управление своей org
 * - user (level 10) - базовые операции
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

// Role levels
const ROLES = {
    user: 10,
    admin: 50,
    superuser: 100
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

module.exports = {
    ROLES,
    getRoleLevel,
    requireRole,
    requireOwnership,
    requireOrganizationAccess,
    requireSharedAccess,
    requireSelfOrAdmin
};
