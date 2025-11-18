/**
 * Authentication Routes
 * Handles login, logout, register, and user management
 */

const express = require('express');
const passport = require('passport');
const { requireAuth, rateLimit } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }),  // 5 attempts per 15 minutes
    async (req, res) => {
        try {
            const { email, password, fullName, username } = req.body;

            // Get AuthService from app locals
            const authService = req.app.locals.authService;

            // Register user
            const user = await authService.register({
                email,
                password,
                fullName,
                username,
                organizationId: 'default-org'  // TODO: Support organization selection
            });

            logger.info('User registered', { userId: user.id, email: user.email });

            res.json({
                success: true,
                user
            });
        } catch (error) {
            logger.logError(error, { context: 'Register endpoint' });

            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }),  // 10 attempts per 15 minutes
    (req, res, next) => {
        passport.authenticate('local', (err, user, info) => {
            if (err) {
                logger.logError(err, { context: 'Login authentication' });
                return res.status(500).json({
                    success: false,
                    error: 'Internal server error'
                });
            }

            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: info.message || 'Invalid credentials'
                });
            }

            // Establish session
            req.logIn(user, (err) => {
                if (err) {
                    logger.logError(err, { context: 'Session creation' });
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to create session'
                    });
                }

                logger.info('User logged in', { userId: user.id, email: user.email });

                res.json({
                    success: true,
                    user
                });
            });
        })(req, res, next);
    }
);

/**
 * POST /api/auth/logout
 * Logout current user
 */
router.post('/logout', requireAuth, (req, res) => {
    const userId = req.user.id;

    req.logout((err) => {
        if (err) {
            logger.logError(err, { context: 'Logout', userId });
            return res.status(500).json({
                success: false,
                error: 'Failed to logout'
            });
        }

        // Destroy session
        req.session.destroy((err) => {
            if (err) {
                logger.logError(err, { context: 'Session destruction', userId });
            }

            logger.info('User logged out', { userId });

            res.json({
                success: true,
                message: 'Logged out successfully'
            });
        });
    });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            success: true,
            user: req.user
        });
    } else {
        res.status(401).json({
            success: false,
            error: 'Not authenticated'
        });
    }
});

/**
 * POST /api/auth/change-password
 * Change current user's password
 */
router.post('/change-password', requireAuth, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Old password and new password are required'
            });
        }

        const authService = req.app.locals.authService;

        await authService.changePassword(req.user.id, oldPassword, newPassword);

        logger.info('Password changed', { userId: req.user.id });

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        logger.logError(error, { context: 'Change password', userId: req.user.id });

        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/auth/stats (Admin only)
 * Get authentication statistics
 */
router.get('/stats', requireAuth, async (req, res) => {
    try {
        // Only admins can view stats
        if (!req.user.is_admin) {
            return res.status(403).json({
                success: false,
                error: 'Admin privileges required'
            });
        }

        const db = req.app.locals.db;

        // Get user count
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL').get();

        // Get recent auth logs
        const recentLogs = db.prepare(`
            SELECT action, COUNT(*) as count
            FROM auth_logs
            WHERE created_at > ?
            GROUP BY action
        `).all(Math.floor(Date.now() / 1000) - 86400);  // Last 24 hours

        // Get failed login attempts
        const failedLogins = db.prepare(`
            SELECT COUNT(*) as count
            FROM auth_logs
            WHERE action = 'failed_login' AND created_at > ?
        `).get(Math.floor(Date.now() / 1000) - 86400);

        res.json({
            success: true,
            stats: {
                totalUsers: userCount.count,
                authLogs24h: recentLogs,
                failedLogins24h: failedLogins.count
            }
        });
    } catch (error) {
        logger.logError(error, { context: 'Auth stats' });

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
