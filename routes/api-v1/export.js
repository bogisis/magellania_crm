/**
 * Export/Import API Routes
 *
 * Endpoints:
 * - GET /api/v1/export/organization - Экспорт данных org
 * - GET /api/v1/export/full - Экспорт всех данных (superuser)
 * - POST /api/v1/import/organization - Импорт данных org
 * - POST /api/v1/import/full - Импорт всех данных (superuser)
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const express = require('express');
const { requireAuth } = require('../../middleware/jwt-auth');
const { requireRole } = require('../../middleware/rbac');

const router = express.Router();

/**
 * GET /api/v1/export/organization
 * Экспорт всех данных организации (admin only)
 */
router.get('/organization', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const storage = req.app.locals.storage;

        // Get organization data
        const organization = storage.db.prepare(
            'SELECT * FROM organizations WHERE id = ?'
        ).get(req.user.organization_id);

        // Get all estimates
        const estimates = storage.db.prepare(`
            SELECT * FROM estimates
            WHERE organization_id = ? AND deleted_at IS NULL
        `).all(req.user.organization_id);

        // Get all catalogs
        const catalogs = storage.db.prepare(`
            SELECT * FROM catalogs
            WHERE organization_id = ? AND deleted_at IS NULL
        `).all(req.user.organization_id);

        // Get all users
        const users = storage.db.prepare(`
            SELECT id, email, username, full_name, role, is_active, created_at
            FROM users
            WHERE organization_id = ? AND deleted_at IS NULL
        `).all(req.user.organization_id);

        // Get all settings
        const settings = storage.db.prepare(`
            SELECT * FROM settings
            WHERE (scope = 'organization' AND scope_id = ?) OR
                  (scope = 'user' AND scope_id IN (SELECT id FROM users WHERE organization_id = ?))
        `).all(req.user.organization_id, req.user.organization_id);

        const exportData = {
            version: '3.0.0',
            exported_at: Math.floor(Date.now() / 1000),
            exported_by: req.user.id,
            organization,
            estimates,
            catalogs,
            users,
            settings
        };

        res.json({
            success: true,
            data: exportData
        });

    } catch (err) {
        console.error('Export organization error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to export organization data'
        });
    }
});

/**
 * GET /api/v1/export/full
 * Экспорт всех данных системы (только superuser)
 */
router.get('/full', requireAuth, requireRole('superuser'), async (req, res) => {
    try {
        const storage = req.app.locals.storage;

        // Export all tables
        const organizations = storage.db.prepare('SELECT * FROM organizations').all();
        const users = storage.db.prepare('SELECT * FROM users').all();
        const estimates = storage.db.prepare('SELECT * FROM estimates').all();
        const catalogs = storage.db.prepare('SELECT * FROM catalogs').all();
        const settings = storage.db.prepare('SELECT * FROM settings').all();
        const backups = storage.db.prepare('SELECT * FROM backups').all();
        const auditLogs = storage.db.prepare('SELECT * FROM audit_logs').all();

        const exportData = {
            version: '3.0.0',
            exported_at: Math.floor(Date.now() / 1000),
            exported_by: req.user.id,
            tables: {
                organizations,
                users,
                estimates,
                catalogs,
                settings,
                backups,
                audit_logs: auditLogs
            }
        };

        res.json({
            success: true,
            data: exportData
        });

    } catch (err) {
        console.error('Export full error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to export full data'
        });
    }
});

/**
 * POST /api/v1/import/organization
 * Импорт данных организации (admin only)
 */
router.post('/organization', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { data, mode } = req.body; // mode: 'merge' | 'replace'

        if (!data) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: data'
            });
        }

        const storage = req.app.locals.storage;

        // Validate data format
        if (!data.version || !data.estimates) {
            return res.status(400).json({
                success: false,
                error: 'Invalid import data format'
            });
        }

        // Begin transaction
        const importMode = mode || 'merge';
        let imported = { estimates: 0, catalogs: 0, settings: 0 };

        // Import estimates
        for (const estimate of data.estimates || []) {
            if (importMode === 'merge') {
                // Check if exists
                const exists = storage.db.prepare(
                    'SELECT id FROM estimates WHERE id = ?'
                ).get(estimate.id);

                if (!exists) {
                    // Create new with original ID
                    storage.db.prepare(`
                        INSERT INTO estimates (
                            id, filename, organization_id, owner_id, visibility, data,
                            client_name, pax_count, total_cost, data_version,
                            created_at, updated_at, last_accessed_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        estimate.id,
                        estimate.filename,
                        req.user.organization_id, // Force to current org
                        req.user.id, // Force to current user
                        estimate.visibility || 'private',
                        estimate.data,
                        estimate.client_name,
                        estimate.pax_count,
                        estimate.total_cost,
                        estimate.data_version || 1,
                        estimate.created_at || Math.floor(Date.now() / 1000),
                        Math.floor(Date.now() / 1000),
                        Math.floor(Date.now() / 1000)
                    );
                    imported.estimates++;
                }
            }
        }

        // Import catalogs
        for (const catalog of data.catalogs || []) {
            if (importMode === 'merge') {
                const exists = storage.db.prepare(
                    'SELECT id FROM catalogs WHERE id = ?'
                ).get(catalog.id);

                if (!exists) {
                    storage.db.prepare(`
                        INSERT INTO catalogs (
                            id, name, slug, region, organization_id, owner_id,
                            visibility, data, templates_count, categories_count,
                            data_version, created_at, updated_at, last_accessed_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        catalog.id,
                        catalog.name,
                        catalog.slug,
                        catalog.region,
                        req.user.organization_id,
                        req.user.id,
                        catalog.visibility || 'organization',
                        catalog.data,
                        catalog.templates_count || 0,
                        catalog.categories_count || 0,
                        catalog.data_version || 1,
                        catalog.created_at || Math.floor(Date.now() / 1000),
                        Math.floor(Date.now() / 1000),
                        Math.floor(Date.now() / 1000)
                    );
                    imported.catalogs++;
                }
            }
        }

        res.json({
            success: true,
            data: {
                imported,
                mode: importMode
            }
        });

    } catch (err) {
        console.error('Import organization error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to import organization data'
        });
    }
});

/**
 * POST /api/v1/import/full
 * Импорт всех данных системы (только superuser)
 */
router.post('/full', requireAuth, requireRole('superuser'), async (req, res) => {
    try {
        const { data, mode } = req.body;

        if (!data || !data.tables) {
            return res.status(400).json({
                success: false,
                error: 'Invalid import data format'
            });
        }

        // This is a dangerous operation - should have additional confirmation
        // For now, return stub
        res.status(501).json({
            success: false,
            error: 'Full system import not implemented yet - too dangerous'
        });

    } catch (err) {
        console.error('Import full error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to import full data'
        });
    }
});

module.exports = router;
