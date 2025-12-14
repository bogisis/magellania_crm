/**
 * Users API Routes (Admin Panel)
 *
 * Endpoints:
 * - GET /api/v1/users - Список пользователей (users.list permission)
 * - GET /api/v1/users/:id - Детали пользователя (users.read permission)
 * - POST /api/v1/users - Создать пользователя (users.create permission)
 * - PUT /api/v1/users/:id - Обновить пользователя (users.update permission)
 * - DELETE /api/v1/users/:id - Удалить пользователя (users.delete permission)
 * - POST /api/v1/users/:id/reset-password - Сброс пароля (users.reset_password permission)
 * - GET /api/v1/users/:id/sessions - Активные сессии (users.manage_sessions permission)
 * - DELETE /api/v1/users/:id/sessions/:sessionId - Закрыть сессию (users.manage_sessions permission)
 *
 * Created: 2025-11-19
 * Updated: 2025-12-13 - Added permission-based RBAC, audit logging, full CRUD
 * Version: 4.0.0
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../../middleware/jwt-auth');
const { checkPermission } = require('../../middleware/rbac');
const { auditLog } = require('../../middleware/auditLogger');
const {
    filterByOrganization,
    parsePagination,
    parseSorting,
    parseFilters,
    buildWhereClause,
    buildPaginationClause,
    buildOrderClause
} = require('../../middleware/admin');

const router = express.Router();

/**
 * GET /api/v1/users
 * Список пользователей организации с pagination и filtering
 */
router.get('/',
    requireAuth,
    checkPermission('users.list'),
    filterByOrganization,
    parsePagination(),
    parseSorting({
        allowedFields: ['created_at', 'email', 'username', 'full_name', 'role', 'last_login_at'],
        defaultField: 'created_at',
        defaultOrder: 'desc'
    }),
    parseFilters({
        allowedFilters: ['role', 'is_active', 'email_verified'],
        searchField: 'search'
    }),
    async (req, res) => {
        try {
            const storage = req.app.locals.storage;
            const conditions = ['deleted_at IS NULL'];
            const params = [];

            // Apply organization filter
            if (req.organizationFilter) {
                conditions.push('organization_id = ?');
                params.push(req.organizationFilter);
            }

            // Apply additional filters
            if (req.filters.role) {
                conditions.push('role = ?');
                params.push(req.filters.role);
            }

            if (req.filters.is_active !== undefined) {
                conditions.push('is_active = ?');
                params.push(req.filters.is_active === 'true' ? 1 : 0);
            }

            if (req.filters.email_verified !== undefined) {
                conditions.push('email_verified = ?');
                params.push(req.filters.email_verified === 'true' ? 1 : 0);
            }

            // Apply search filter
            if (req.filters.search) {
                conditions.push('(email LIKE ? OR username LIKE ? OR full_name LIKE ?)');
                const searchPattern = `%${req.filters.search}%`;
                params.push(searchPattern, searchPattern, searchPattern);
            }

            // Build WHERE clause
            const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

            // Count total (for pagination)
            const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
            const { total } = storage.db.prepare(countQuery).get(...params);

            // Build ORDER BY clause
            const orderClause = buildOrderClause(req);

            // Build LIMIT/OFFSET clause
            const { limitClause, params: paginationParams } = buildPaginationClause(req);

            // Fetch users
            const query = `
                SELECT id, email, username, full_name, role,
                       is_active, email_verified,
                       last_login_at, created_at, updated_at
                FROM users
                ${whereClause}
                ${orderClause}
                ${limitClause}
            `;

            const users = storage.db.prepare(query).all(...params, ...paginationParams);

            res.json({
                success: true,
                data: {
                    users,
                    pagination: {
                        page: req.pagination.page,
                        limit: req.pagination.limit,
                        total,
                        totalPages: Math.ceil(total / req.pagination.limit)
                    }
                }
            });

        } catch (err) {
            console.error('Get users error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch users'
            });
        }
    }
);

/**
 * GET /api/v1/users/:id
 * Получить детали пользователя
 */
router.get('/:id',
    requireAuth,
    checkPermission('users.read'),
    filterByOrganization,
    async (req, res) => {
        try {
            const storage = req.app.locals.storage;
            const userId = req.params.id;

            const conditions = ['deleted_at IS NULL', 'id = ?'];
            const params = [userId];

            // Apply organization filter (unless superadmin)
            if (req.organizationFilter) {
                conditions.push('organization_id = ?');
                params.push(req.organizationFilter);
            }

            const whereClause = `WHERE ${conditions.join(' AND ')}`;

            const user = storage.db.prepare(`
                SELECT id, email, username, full_name, role,
                       is_active, email_verified, organization_id,
                       last_login_at, created_at, updated_at
                FROM users
                ${whereClause}
            `).get(...params);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            res.json({
                success: true,
                data: { user }
            });

        } catch (err) {
            console.error('Get user error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch user'
            });
        }
    }
);

/**
 * POST /api/v1/users
 * Создать нового пользователя в организации
 */
router.post('/',
    requireAuth,
    checkPermission('users.create'),
    filterByOrganization,
    auditLog('user_create'),
    async (req, res) => {
    try {
        const { email, password, username, full_name, role } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: email, password'
            });
        }

        const storage = req.app.locals.storage;

        // Determine target organization (filtered org or user's org)
        const targetOrgId = req.filteredOrganizationId || req.user.organization_id;

        // Check if email already exists
        const existing = storage.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'User with this email already exists'
            });
        }

        // Check organization limits
        const org = storage.db.prepare(`
            SELECT current_users_count, max_users
            FROM organizations
            WHERE id = ?
        `).get(targetOrgId);

        if (!org) {
            return res.status(404).json({
                success: false,
                error: 'Organization not found'
            });
        }

        if (org.current_users_count >= org.max_users) {
            return res.status(403).json({
                success: false,
                error: 'Organization user limit reached'
            });
        }

        // Generate user ID using UUID v4
        const userId = uuidv4();

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        storage.db.prepare(`
            INSERT INTO users (
                id, email, username, password_hash, full_name,
                role, organization_id, is_active, email_verified,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
            userId,
            email,
            username || email.split('@')[0],
            passwordHash,
            full_name || null,
            role || 'user',
            targetOrgId,
            1,
            0
        );

        // Update organization counter
        storage.db.prepare(`
            UPDATE organizations
            SET current_users_count = current_users_count + 1,
                updated_at = datetime('now')
            WHERE id = ?
        `).run(targetOrgId);

        res.status(201).json({
            success: true,
            data: {
                id: userId,
                email,
                username: username || email.split('@')[0],
                role: role || 'user',
                organization_id: targetOrgId
            }
        });

    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to create user'
        });
    }
});

/**
 * PUT /api/v1/users/:id
 * Обновить пользователя
 */
router.put('/:id',
    requireAuth,
    checkPermission('users.update'),
    filterByOrganization,
    auditLog('user_update', {
        getEntityId: (req) => req.params.id,
        getBeforeState: async (req, id, storage) => {
            return storage.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        }
    }),
    async (req, res) => {
    try {
        const userId = req.params.id;
        const { full_name, email, password, role, is_active } = req.body;

        const storage = req.app.locals.storage;

        // Build WHERE conditions with organization filter
        const conditions = ['id = ?', 'deleted_at IS NULL'];
        const whereParams = [userId];

        // Apply organization filter (unless superadmin)
        if (req.organizationFilter) {
            conditions.push('organization_id = ?');
            whereParams.push(req.organizationFilter);
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`;

        // Get target user
        const targetUser = storage.db.prepare(`
            SELECT * FROM users ${whereClause}
        `).get(...whereParams);

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Build update query
        const updates = [];
        const params = [];

        if (full_name !== undefined) {
            updates.push('full_name = ?');
            params.push(full_name);
        }

        if (email !== undefined) {
            updates.push('email = ?');
            params.push(email);
        }

        if (password !== undefined) {
            const passwordHash = await bcrypt.hash(password, 10);
            updates.push('password_hash = ?');
            params.push(passwordHash);
        }

        if (role !== undefined) {
            updates.push('role = ?');
            params.push(role);
        }

        if (is_active !== undefined) {
            updates.push('is_active = ?');
            params.push(is_active ? 1 : 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No fields to update'
            });
        }

        updates.push('updated_at = datetime(\'now\')');

        params.push(userId);

        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        storage.db.prepare(query).run(...params);

        res.json({
            success: true,
            message: 'User updated successfully'
        });

    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to update user'
        });
    }
});

/**
 * DELETE /api/v1/users/:id
 * Мягкое удаление пользователя (soft delete)
 */
router.delete('/:id',
    requireAuth,
    checkPermission('users.delete'),
    filterByOrganization,
    auditLog('user_delete'),
    async (req, res) => {
        try {
            const userId = req.params.id;
            const storage = req.app.locals.storage;

            // Build WHERE conditions with organization filter
            const conditions = ['id = ?', 'deleted_at IS NULL'];
            const whereParams = [userId];

            if (req.organizationFilter) {
                conditions.push('organization_id = ?');
                whereParams.push(req.organizationFilter);
            }

            const whereClause = `WHERE ${conditions.join(' AND ')}`;

            // Get target user
            const targetUser = storage.db.prepare(`
                SELECT * FROM users ${whereClause}
            `).get(...whereParams);

            if (!targetUser) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Soft delete
            storage.db.prepare(`
                UPDATE users
                SET deleted_at = datetime('now'),
                    updated_at = datetime('now')
                WHERE id = ?
            `).run(userId);

            // Update organization counter
            storage.db.prepare(`
                UPDATE organizations
                SET current_users_count = current_users_count - 1,
                    updated_at = datetime('now')
                WHERE id = ?
            `).run(targetUser.organization_id);

            res.json({
                success: true,
                message: 'User deleted successfully'
            });

        } catch (err) {
            console.error('Delete user error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to delete user'
            });
        }
    }
);

/**
 * POST /api/v1/users/:id/reset-password
 * Сбросить пароль пользователя
 */
router.post('/:id/reset-password',
    requireAuth,
    checkPermission('users.reset_password'),
    filterByOrganization,
    auditLog('user_reset_password'),
    async (req, res) => {
        try {
            const userId = req.params.id;
            const { new_password } = req.body;

            if (!new_password) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required field: new_password'
                });
            }

            const storage = req.app.locals.storage;

            // Build WHERE conditions with organization filter
            const conditions = ['id = ?', 'deleted_at IS NULL'];
            const whereParams = [userId];

            if (req.organizationFilter) {
                conditions.push('organization_id = ?');
                whereParams.push(req.organizationFilter);
            }

            const whereClause = `WHERE ${conditions.join(' AND ')}`;

            // Get target user
            const targetUser = storage.db.prepare(`
                SELECT id FROM users ${whereClause}
            `).get(...whereParams);

            if (!targetUser) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Hash new password
            const passwordHash = await bcrypt.hash(new_password, 10);

            // Update password
            storage.db.prepare(`
                UPDATE users
                SET password_hash = ?,
                    updated_at = datetime('now')
                WHERE id = ?
            `).run(passwordHash, userId);

            // Invalidate all user sessions (force re-login)
            storage.db.prepare(`
                UPDATE user_sessions
                SET is_active = 0
                WHERE user_id = ?
            `).run(userId);

            res.json({
                success: true,
                message: 'Password reset successfully. All sessions have been terminated.'
            });

        } catch (err) {
            console.error('Reset password error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to reset password'
            });
        }
    }
);

/**
 * GET /api/v1/users/:id/sessions
 * Получить активные сессии пользователя
 */
router.get('/:id/sessions',
    requireAuth,
    checkPermission('users.manage_sessions'),
    filterByOrganization,
    async (req, res) => {
        try {
            const userId = req.params.id;
            const storage = req.app.locals.storage;

            // Verify user exists and belongs to organization
            const conditions = ['id = ?', 'deleted_at IS NULL'];
            const whereParams = [userId];

            if (req.organizationFilter) {
                conditions.push('organization_id = ?');
                whereParams.push(req.organizationFilter);
            }

            const whereClause = `WHERE ${conditions.join(' AND ')}`;

            const targetUser = storage.db.prepare(`
                SELECT id FROM users ${whereClause}
            `).get(...whereParams);

            if (!targetUser) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Get active sessions
            const sessions = storage.db.prepare(`
                SELECT
                    id,
                    created_at,
                    expires_at,
                    last_activity,
                    ip_address,
                    user_agent,
                    is_active
                FROM user_sessions
                WHERE user_id = ?
                ORDER BY created_at DESC
            `).all(userId);

            res.json({
                success: true,
                data: { sessions }
            });

        } catch (err) {
            console.error('Get sessions error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch sessions'
            });
        }
    }
);

/**
 * DELETE /api/v1/users/:id/sessions/:sessionId
 * Закрыть конкретную сессию пользователя (force logout)
 */
router.delete('/:id/sessions/:sessionId',
    requireAuth,
    checkPermission('users.manage_sessions'),
    filterByOrganization,
    auditLog('user_session_terminate'),
    async (req, res) => {
        try {
            const { id: userId, sessionId } = req.params;
            const storage = req.app.locals.storage;

            // Verify user exists and belongs to organization
            const conditions = ['id = ?', 'deleted_at IS NULL'];
            const whereParams = [userId];

            if (req.organizationFilter) {
                conditions.push('organization_id = ?');
                whereParams.push(req.organizationFilter);
            }

            const whereClause = `WHERE ${conditions.join(' AND ')}`;

            const targetUser = storage.db.prepare(`
                SELECT id FROM users ${whereClause}
            `).get(...whereParams);

            if (!targetUser) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Deactivate session
            const result = storage.db.prepare(`
                UPDATE user_sessions
                SET is_active = 0
                WHERE id = ? AND user_id = ?
            `).run(sessionId, userId);

            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found'
                });
            }

            res.json({
                success: true,
                message: 'Session terminated successfully'
            });

        } catch (err) {
            console.error('Terminate session error:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to terminate session'
            });
        }
    }
);

module.exports = router;
