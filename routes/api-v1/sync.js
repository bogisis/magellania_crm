/**
 * Sync API Routes
 *
 * Endpoints:
 * - GET /api/v1/sync/updates - Получить обновления с сервера
 * - POST /api/v1/sync/batch - Отправить батч изменений
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const express = require('express');
const { requireAuth } = require('../../middleware/jwt-auth');

const router = express.Router();

/**
 * GET /api/v1/sync/updates
 * Получить все изменения с сервера с указанного timestamp
 */
router.get('/updates', requireAuth, async (req, res) => {
    try {
        const since = parseInt(req.query.since) || 0;
        const storage = req.app.locals.storage;

        // Get updated estimates
        const estimates = storage.db.prepare(`
            SELECT id, filename, data, data_version, updated_at
            FROM estimates
            WHERE organization_id = ?
              AND updated_at > ?
              AND deleted_at IS NULL
            ORDER BY updated_at ASC
            LIMIT 100
        `).all(req.user.organization_id, since);

        // Get updated catalogs
        const catalogs = storage.db.prepare(`
            SELECT id, name, slug, data, data_version, updated_at
            FROM catalogs
            WHERE organization_id = ?
              AND updated_at > ?
              AND deleted_at IS NULL
            ORDER BY updated_at ASC
            LIMIT 10
        `).all(req.user.organization_id, since);

        // Get updated settings
        const settings = storage.db.prepare(`
            SELECT scope, scope_id, key, value, value_type, updated_at
            FROM settings
            WHERE (
                (scope = 'user' AND scope_id = ?) OR
                (scope = 'organization' AND scope_id = ?) OR
                (scope = 'app' AND scope_id = 'global')
            )
            AND updated_at > ?
            ORDER BY updated_at ASC
        `).all(req.user.id, req.user.organization_id, since);

        const serverTime = Math.floor(Date.now() / 1000);

        res.json({
            success: true,
            data: {
                estimates,
                catalogs,
                settings,
                serverTime,
                hasMore: estimates.length === 100 || catalogs.length === 10
            }
        });

    } catch (err) {
        console.error('Get sync updates error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch updates'
        });
    }
});

/**
 * POST /api/v1/sync/batch
 * Отправить батч изменений на сервер
 */
router.post('/batch', requireAuth, async (req, res) => {
    try {
        const { changes } = req.body;

        if (!Array.isArray(changes)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request: changes must be an array'
            });
        }

        const storage = req.app.locals.storage;
        const results = [];

        for (const change of changes) {
            const { entity_type, entity_id, action, data, client_version } = change;

            try {
                if (entity_type === 'estimate') {
                    if (action === 'update' || action === 'create') {
                        // Get current estimate
                        const estimate = storage.db.prepare(
                            'SELECT data_version FROM estimates WHERE id = ?'
                        ).get(entity_id);

                        // Optimistic locking check
                        if (estimate && client_version && client_version !== estimate.data_version) {
                            results.push({
                                entity_type,
                                entity_id,
                                status: 'conflict',
                                client_version,
                                server_version: estimate.data_version,
                                message: 'Version conflict'
                            });
                            continue;
                        }

                        // Update
                        if (estimate) {
                            const newVersion = estimate.data_version + 1;
                            const parsedData = JSON.parse(data);

                            storage.db.prepare(`
                                UPDATE estimates
                                SET data = ?,
                                    client_name = ?,
                                    pax_count = ?,
                                    total_cost = ?,
                                    data_version = ?,
                                    updated_at = ?
                                WHERE id = ?
                            `).run(
                                data,
                                parsedData.clientName || null,
                                parsedData.paxCount || 0,
                                parsedData.totalCost || 0,
                                newVersion,
                                Math.floor(Date.now() / 1000),
                                entity_id
                            );

                            results.push({
                                entity_type,
                                entity_id,
                                status: 'success',
                                data_version: newVersion
                            });
                        } else {
                            // Create new estimate (stub, should use POST /estimates)
                            results.push({
                                entity_type,
                                entity_id,
                                status: 'error',
                                message: 'Use POST /api/v1/estimates to create'
                            });
                        }
                    }
                } else if (entity_type === 'catalog') {
                    // Similar logic for catalogs
                    results.push({
                        entity_type,
                        entity_id,
                        status: 'error',
                        message: 'Catalog sync not implemented yet'
                    });
                } else {
                    results.push({
                        entity_type,
                        entity_id,
                        status: 'error',
                        message: 'Unknown entity type'
                    });
                }

            } catch (err) {
                results.push({
                    entity_type,
                    entity_id,
                    status: 'error',
                    message: err.message
                });
            }
        }

        res.json({
            success: true,
            data: {
                results,
                serverTime: Math.floor(Date.now() / 1000)
            }
        });

    } catch (err) {
        console.error('Sync batch error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to process sync batch'
        });
    }
});

module.exports = router;
