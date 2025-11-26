/**
 * Users API Routes
 *
 * Endpoints:
 * - GET /api/v1/users - Список пользователей (admin only)
 * - POST /api/v1/users - Создать пользователя (admin only)
 * - PUT /api/v1/users/:id - Обновить пользователя (admin or self)
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { requireAuth } = require('../../middleware/jwt-auth');
const { requireRole } = require('../../middleware/rbac');

const router = express.Router();

/**
 * GET /api/v1/users
 * Список пользователей организации (только для admin)
 */
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const storage = req.app.locals.storage;

        const users = storage.db.prepare(`
            SELECT id, email, username, full_name, role,
                   is_active, email_verified,
                   last_login_at, created_at
            FROM users
            WHERE organization_id = ?
              AND deleted_at IS NULL
            ORDER BY created_at DESC
        `).all(req.user.organization_id);

        res.json({
            success: true,
            data: {
                users
            }
        });

    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users'
        });
    }
});

/**
 * POST /api/v1/users
 * Создать нового пользователя в организации (только admin)
 */
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { email, password, username, full_name, role } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: email, password'
            });
        }

        const storage = req.app.locals.storage;

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
        `).get(req.user.organization_id);

        if (org.current_users_count >= org.max_users) {
            return res.status(403).json({
                success: false,
                error: 'Organization user limit reached'
            });
        }

        // Generate user ID
        const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        storage.db.prepare(`
            INSERT INTO users (
                id, email, username, password_hash, full_name,
                role, organization_id, is_active, email_verified,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            userId,
            email,
            username || email.split('@')[0],
            passwordHash,
            full_name || null,
            role || 'user',
            req.user.organization_id,
            1,
            0,
            Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000)
        );

        // Update organization counter
        storage.db.prepare(`
            UPDATE organizations
            SET current_users_count = current_users_count + 1
            WHERE id = ?
        `).run(req.user.organization_id);

        res.status(201).json({
            success: true,
            data: {
                id: userId,
                email,
                username: username || email.split('@')[0],
                role: role || 'user'
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
 * Обновить пользователя (admin или сам пользователь)
 */
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.params.id;
        const { full_name, email, password, role, is_active } = req.body;

        const storage = req.app.locals.storage;

        // Get target user
        const targetUser = storage.db.prepare(
            'SELECT * FROM users WHERE id = ?'
        ).get(userId);

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check permissions
        const canUpdate =
            req.user.role === 'superuser' ||
            (req.user.role === 'admin' && targetUser.organization_id === req.user.organization_id) ||
            req.user.id === userId;

        if (!canUpdate) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
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

        // Only admin can change role and is_active
        if (req.user.role === 'admin' || req.user.role === 'superuser') {
            if (role !== undefined) {
                updates.push('role = ?');
                params.push(role);
            }
            if (is_active !== undefined) {
                updates.push('is_active = ?');
                params.push(is_active ? 1 : 0);
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No fields to update'
            });
        }

        updates.push('updated_at = ?');
        params.push(Math.floor(Date.now() / 1000));

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

module.exports = router;
