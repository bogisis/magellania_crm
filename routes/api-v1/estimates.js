/**
 * Estimates API Routes
 *
 * Endpoints:
 * - GET /api/v1/estimates - Список смет с фильтрацией
 * - GET /api/v1/estimates/:id - Получить смету
 * - POST /api/v1/estimates - Создать смету
 * - PUT /api/v1/estimates/:id - Обновить смету
 * - DELETE /api/v1/estimates/:id - Удалить (soft)
 * - POST /api/v1/estimates/:id/restore - Восстановить
 * - PUT /api/v1/estimates/:id/rename - Переименовать
 * - POST /api/v1/estimates/:id/share - Поделиться
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const express = require('express');
const { requireAuth } = require('../../middleware/jwt-auth');
const { requireRole, requireSharedAccess } = require('../../middleware/rbac');

const router = express.Router();

/**
 * GET /api/v1/estimates
 * Список смет с фильтрацией и пагинацией
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const storage = req.app.locals.storage;

        // Pagination
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;

        // Sorting
        const sort = req.query.sort || 'updated_at';
        const order = req.query.order === 'asc' ? 'ASC' : 'DESC';

        // Filters
        const includeDeleted = req.query.include_deleted === 'true' && req.user.role === 'admin';

        // Build query
        let query = `
            SELECT id, filename, organization_id, owner_id, visibility,
                   client_name, client_email, client_phone, pax_count,
                   tour_start, tour_end, total_cost, total_profit, services_count,
                   data_version, is_template, template_name,
                   created_at, updated_at, last_accessed_at, deleted_at
            FROM estimates
            WHERE organization_id = ?
        `;

        const params = [req.user.organization_id];

        if (!includeDeleted) {
            query += ' AND deleted_at IS NULL';
        }

        // Filter by client_name
        if (req.query.client_name) {
            query += ' AND client_name LIKE ?';
            params.push(`%${req.query.client_name}%`);
        }

        // Filter by tour dates
        if (req.query.tour_start_from) {
            query += ' AND tour_start >= ?';
            params.push(req.query.tour_start_from);
        }
        if (req.query.tour_start_to) {
            query += ' AND tour_start <= ?';
            params.push(req.query.tour_start_to);
        }

        // Filter by is_template
        if (req.query.is_template !== undefined) {
            query += ' AND is_template = ?';
            params.push(req.query.is_template === 'true' ? 1 : 0);
        }

        // Get total count
        const countQuery = query.replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) as total FROM');
        const countResult = storage.db.prepare(countQuery).get(...params);
        const total = countResult ? countResult.total : 0;

        // Add sorting and pagination
        query += ` ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const estimates = storage.db.prepare(query).all(...params);

        res.json({
            success: true,
            data: {
                estimates,
                pagination: {
                    page,
                    limit,
                    total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (err) {
        console.error('Get estimates error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch estimates'
        });
    }
});

/**
 * GET /api/v1/estimates/:id
 * Получить смету по ID (с проверкой доступа)
 */
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const storage = req.app.locals.storage;
        const estimate = storage.db.prepare(`
            SELECT * FROM estimates WHERE id = ?
        `).get(req.params.id);

        if (!estimate) {
            return res.status(404).json({
                success: false,
                error: 'Estimate not found'
            });
        }

        // Check access
        const hasAccess =
            req.user.role === 'superuser' ||
            estimate.owner_id === req.user.id ||
            (req.user.role === 'admin' && estimate.organization_id === req.user.organization_id) ||
            (estimate.visibility === 'organization' && estimate.organization_id === req.user.organization_id) ||
            (estimate.shared_with && JSON.parse(estimate.shared_with).includes(req.user.id));

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Update last_accessed_at
        storage.db.prepare('UPDATE estimates SET last_accessed_at = ? WHERE id = ?')
            .run(Math.floor(Date.now() / 1000), req.params.id);

        res.json({
            success: true,
            data: estimate
        });

    } catch (err) {
        console.error('Get estimate error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch estimate'
        });
    }
});

/**
 * POST /api/v1/estimates
 * Создать новую смету
 */
router.post('/', requireAuth, async (req, res) => {
    try {
        const { filename, data, visibility, is_template, template_name } = req.body;

        if (!filename || !data) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: filename, data'
            });
        }

        const storage = req.app.locals.storage;
        const estimateId = `est-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Parse data для извлечения metadata
        const parsedData = JSON.parse(data);

        storage.db.prepare(`
            INSERT INTO estimates (
                id, filename, organization_id, owner_id, visibility, data,
                client_name, client_email, client_phone, pax_count,
                tour_start, tour_end, total_cost, total_profit, services_count,
                data_version, data_hash, is_template, template_name,
                created_at, updated_at, last_accessed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            estimateId, filename, req.user.organization_id, req.user.id,
            visibility || 'private', data,
            parsedData.clientName || null,
            parsedData.clientEmail || null,
            parsedData.clientPhone || null,
            parsedData.paxCount || 0,
            parsedData.tourStart || null,
            parsedData.tourEnd || null,
            parsedData.totalCost || 0,
            parsedData.totalProfit || 0,
            parsedData.services?.length || 0,
            1, // data_version
            null, // data_hash (TODO: calculate)
            is_template ? 1 : 0,
            template_name || null,
            Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000)
        );

        // Update organization counter
        storage.db.prepare(`
            UPDATE organizations
            SET current_estimates_count = current_estimates_count + 1
            WHERE id = ?
        `).run(req.user.organization_id);

        res.status(201).json({
            success: true,
            data: {
                id: estimateId,
                filename,
                data_version: 1
            }
        });

    } catch (err) {
        console.error('Create estimate error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to create estimate'
        });
    }
});

/**
 * PUT /api/v1/estimates/:id
 * Обновить смету (с optimistic locking)
 */
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { data, client_version } = req.body;

        if (!data) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: data'
            });
        }

        const storage = req.app.locals.storage;

        // Get current estimate
        const estimate = storage.db.prepare('SELECT * FROM estimates WHERE id = ?').get(req.params.id);

        if (!estimate) {
            return res.status(404).json({
                success: false,
                error: 'Estimate not found'
            });
        }

        // Check access
        const canEdit =
            req.user.role === 'superuser' ||
            estimate.owner_id === req.user.id ||
            (req.user.role === 'admin' && estimate.organization_id === req.user.organization_id);

        if (!canEdit) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Optimistic locking check
        if (client_version && client_version !== estimate.data_version) {
            return res.status(409).json({
                success: false,
                error: 'Conflict: Estimate was modified by another user',
                serverVersion: estimate.data_version,
                serverData: estimate.data
            });
        }

        // Parse data для metadata
        const parsedData = JSON.parse(data);
        const newVersion = estimate.data_version + 1;

        storage.db.prepare(`
            UPDATE estimates
            SET data = ?,
                client_name = ?,
                client_email = ?,
                client_phone = ?,
                pax_count = ?,
                tour_start = ?,
                tour_end = ?,
                total_cost = ?,
                total_profit = ?,
                services_count = ?,
                data_version = ?,
                updated_at = ?
            WHERE id = ? AND data_version = ?
        `).run(
            data,
            parsedData.clientName || null,
            parsedData.clientEmail || null,
            parsedData.clientPhone || null,
            parsedData.paxCount || 0,
            parsedData.tourStart || null,
            parsedData.tourEnd || null,
            parsedData.totalCost || 0,
            parsedData.totalProfit || 0,
            parsedData.services?.length || 0,
            newVersion,
            Math.floor(Date.now() / 1000),
            req.params.id,
            estimate.data_version
        );

        res.json({
            success: true,
            data: {
                id: req.params.id,
                data_version: newVersion
            }
        });

    } catch (err) {
        console.error('Update estimate error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to update estimate'
        });
    }
});

/**
 * DELETE /api/v1/estimates/:id
 * Soft delete сметы
 */
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const storage = req.app.locals.storage;
        const estimate = storage.db.prepare('SELECT * FROM estimates WHERE id = ?').get(req.params.id);

        if (!estimate) {
            return res.status(404).json({
                success: false,
                error: 'Estimate not found'
            });
        }

        // Check access
        const canDelete =
            req.user.role === 'superuser' ||
            estimate.owner_id === req.user.id ||
            (req.user.role === 'admin' && estimate.organization_id === req.user.organization_id);

        if (!canDelete) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Soft delete
        storage.db.prepare('UPDATE estimates SET deleted_at = ? WHERE id = ?')
            .run(Math.floor(Date.now() / 1000), req.params.id);

        res.json({
            success: true,
            message: 'Estimate deleted successfully'
        });

    } catch (err) {
        console.error('Delete estimate error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to delete estimate'
        });
    }
});

/**
 * POST /api/v1/estimates/:id/restore
 * Восстановить удалённую смету
 */
router.post('/:id/restore', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const storage = req.app.locals.storage;

        storage.db.prepare('UPDATE estimates SET deleted_at = NULL WHERE id = ?')
            .run(req.params.id);

        res.json({
            success: true,
            message: 'Estimate restored successfully'
        });

    } catch (err) {
        console.error('Restore estimate error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to restore estimate'
        });
    }
});

/**
 * PUT /api/v1/estimates/:id/rename
 * Переименовать смету
 */
router.put('/:id/rename', requireAuth, async (req, res) => {
    try {
        const { filename } = req.body;

        if (!filename) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: filename'
            });
        }

        const storage = req.app.locals.storage;
        const estimate = storage.db.prepare('SELECT * FROM estimates WHERE id = ?').get(req.params.id);

        if (!estimate) {
            return res.status(404).json({
                success: false,
                error: 'Estimate not found'
            });
        }

        // Check access
        const canRename =
            req.user.role === 'superuser' ||
            estimate.owner_id === req.user.id ||
            (req.user.role === 'admin' && estimate.organization_id === req.user.organization_id);

        if (!canRename) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        storage.db.prepare('UPDATE estimates SET filename = ?, updated_at = ? WHERE id = ?')
            .run(filename, Math.floor(Date.now() / 1000), req.params.id);

        res.json({
            success: true,
            data: {
                id: req.params.id,
                filename
            }
        });

    } catch (err) {
        console.error('Rename estimate error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to rename estimate'
        });
    }
});

/**
 * POST /api/v1/estimates/:id/share
 * Поделиться сметой с пользователями
 */
router.post('/:id/share', requireAuth, async (req, res) => {
    try {
        const { user_ids, visibility } = req.body;

        const storage = req.app.locals.storage;
        const estimate = storage.db.prepare('SELECT * FROM estimates WHERE id = ?').get(req.params.id);

        if (!estimate) {
            return res.status(404).json({
                success: false,
                error: 'Estimate not found'
            });
        }

        // Check access
        const canShare =
            req.user.role === 'superuser' ||
            estimate.owner_id === req.user.id ||
            (req.user.role === 'admin' && estimate.organization_id === req.user.organization_id);

        if (!canShare) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Update sharing
        const updates = {};
        if (user_ids) {
            updates.shared_with = JSON.stringify(user_ids);
        }
        if (visibility) {
            updates.visibility = visibility;
        }

        let query = 'UPDATE estimates SET';
        const params = [];
        const sets = [];

        if (updates.shared_with) {
            sets.push(' shared_with = ?');
            params.push(updates.shared_with);
        }
        if (updates.visibility) {
            sets.push(' visibility = ?');
            params.push(updates.visibility);
        }

        sets.push(' updated_at = ?');
        params.push(Math.floor(Date.now() / 1000));

        query += sets.join(',') + ' WHERE id = ?';
        params.push(req.params.id);

        storage.db.prepare(query).run(...params);

        res.json({
            success: true,
            message: 'Sharing updated successfully'
        });

    } catch (err) {
        console.error('Share estimate error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to update sharing'
        });
    }
});

module.exports = router;
