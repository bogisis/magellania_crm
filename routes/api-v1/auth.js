/**
 * Authentication API Routes
 *
 * Endpoints:
 * - POST /api/v1/auth/register - Регистрация org + admin
 * - POST /api/v1/auth/login - Авторизация
 * - POST /api/v1/auth/logout - Выход
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { requireAuth } = require('../../middleware/jwt-auth');
const { generateToken } = require('../../middleware/jwt-auth');

const router = express.Router();

/**
 * POST /api/v1/auth/register
 * Регистрация новой организации + администратора
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password, username, organization_name, full_name } = req.body;

        // Validation
        if (!email || !password || !organization_name) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: email, password, organization_name'
            });
        }

        const storage = req.app.locals.storage;

        // Check if email already exists
        const existingUser = storage.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'User with this email already exists'
            });
        }

        // Generate IDs
        const orgId = `org-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const orgSlug = organization_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create organization
        storage.db.prepare(`
            INSERT INTO organizations (
                id, name, slug, plan, owner_id,
                max_users, max_estimates, max_catalogs, storage_limit_mb, api_rate_limit,
                current_users_count, current_estimates_count, current_catalogs_count, current_storage_mb,
                is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            orgId, organization_name, orgSlug, 'free', userId,
            5, 100, 10, 100, 1000,
            1, 0, 0, 0,
            1, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)
        );

        // Create admin user
        storage.db.prepare(`
            INSERT INTO users (
                id, email, username, password_hash, full_name, role, organization_id,
                is_active, email_verified, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            userId, email, username || email.split('@')[0], passwordHash,
            full_name || 'Admin', 'admin', orgId,
            1, 1, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)
        );

        // Generate JWT token
        const token = generateToken({
            id: userId,
            email,
            username: username || email.split('@')[0],
            organization_id: orgId,
            role: 'admin'
        });

        res.status(201).json({
            success: true,
            data: {
                token,
                user: {
                    id: userId,
                    email,
                    username: username || email.split('@')[0],
                    role: 'admin',
                    organization_id: orgId
                },
                organization: {
                    id: orgId,
                    name: organization_name,
                    plan: 'free'
                }
            }
        });

    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to register user'
        });
    }
});

/**
 * POST /api/v1/auth/login
 * Авторизация пользователя
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: email, password'
            });
        }

        const storage = req.app.locals.storage;

        // Find user
        const user = storage.db.prepare(`
            SELECT id, email, username, password_hash, role, organization_id, is_active
            FROM users
            WHERE email = ?
        `).get(email);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                error: 'Account is deactivated'
            });
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Update last_login_at
        storage.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
            .run(Math.floor(Date.now() / 1000), user.id);

        // Generate token
        const token = generateToken({
            id: user.id,
            email: user.email,
            username: user.username,
            organization_id: user.organization_id,
            role: user.role
        });

        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    role: user.role,
                    organization_id: user.organization_id
                }
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to login'
        });
    }
});

/**
 * POST /api/v1/auth/logout
 * Выход (для совместимости, JWT stateless)
 */
router.post('/logout', requireAuth, (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

module.exports = router;
