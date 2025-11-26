/**
 * Settings API Routes
 *
 * Endpoints:
 * - GET /api/v1/settings - Получить настройки
 * - PUT /api/v1/settings - Обновить настройки
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const express = require('express');
const { requireAuth } = require('../../middleware/jwt-auth');

const router = express.Router();

/**
 * GET /api/v1/settings
 * Получить настройки пользователя, организации и app-level
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const storage = req.app.locals.storage;
        const scope = req.query.scope || 'user'; // user|organization|app

        let scopeId;
        if (scope === 'user') {
            scopeId = req.user.id;
        } else if (scope === 'organization') {
            scopeId = req.user.organization_id;
        } else if (scope === 'app') {
            scopeId = 'global';
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid scope. Must be: user, organization, or app'
            });
        }

        const settings = storage.db.prepare(`
            SELECT key, value, value_type, is_public
            FROM settings
            WHERE scope = ? AND scope_id = ?
        `).all(scope, scopeId);

        // Convert to object
        const settingsObj = {};
        settings.forEach(s => {
            let parsedValue = s.value;
            if (s.value_type === 'string') {
                parsedValue = JSON.parse(s.value);
            } else if (s.value_type === 'number') {
                parsedValue = parseFloat(s.value);
            } else if (s.value_type === 'boolean') {
                parsedValue = s.value === 'true';
            }
            settingsObj[s.key] = parsedValue;
        });

        res.json({
            success: true,
            data: {
                scope,
                settings: settingsObj
            }
        });

    } catch (err) {
        console.error('Get settings error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch settings'
        });
    }
});

/**
 * PUT /api/v1/settings
 * Обновить настройки
 */
router.put('/', requireAuth, async (req, res) => {
    try {
        const { scope, settings } = req.body;

        if (!scope || !settings) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: scope, settings'
            });
        }

        let scopeId;
        if (scope === 'user') {
            scopeId = req.user.id;
        } else if (scope === 'organization') {
            // Only admin can change org settings
            if (req.user.role !== 'admin' && req.user.role !== 'superuser') {
                return res.status(403).json({
                    success: false,
                    error: 'Only admins can modify organization settings'
                });
            }
            scopeId = req.user.organization_id;
        } else if (scope === 'app') {
            // Only superuser can change app settings
            if (req.user.role !== 'superuser') {
                return res.status(403).json({
                    success: false,
                    error: 'Only superusers can modify app settings'
                });
            }
            scopeId = 'global';
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid scope'
            });
        }

        const storage = req.app.locals.storage;

        // Upsert each setting
        for (const [key, value] of Object.entries(settings)) {
            let valueType = 'string';
            let valueStr = JSON.stringify(value);

            if (typeof value === 'number') {
                valueType = 'number';
                valueStr = value.toString();
            } else if (typeof value === 'boolean') {
                valueType = 'boolean';
                valueStr = value.toString();
            }

            storage.db.prepare(`
                INSERT INTO settings (scope, scope_id, key, value, value_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(scope, scope_id, key)
                DO UPDATE SET value = ?, value_type = ?, updated_at = ?
            `).run(
                scope, scopeId, key, valueStr, valueType,
                Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000),
                valueStr, valueType, Math.floor(Date.now() / 1000)
            );
        }

        res.json({
            success: true,
            message: 'Settings updated successfully'
        });

    } catch (err) {
        console.error('Update settings error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to update settings'
        });
    }
});

module.exports = router;
