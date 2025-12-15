/**
 * Organizations API Routes
 *
 * Endpoints:
 * - GET /api/v1/organizations - Список org (superuser only)
 * - GET /api/v1/organizations/:id - Получить org (member)
 * - PUT /api/v1/organizations/:id - Обновить org (admin)
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const express = require('express');
const { requireAuth } = require('../../middleware/jwt-auth');
const { requireRole } = require('../../middleware/rbac');

const router = express.Router();

/**
 * GET /api/v1/organizations
 * Список всех организаций (только для superadmin)
 */
router.get('/', requireAuth, requireRole('superadmin'), async (req, res) => {
    try {
        const storage = req.app.locals.storage;

        // Pagination params
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const sort = req.query.sort || 'created_at';
        const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
        const search = req.query.search || '';
        const planFilter = req.query.plan || '';
        const isActiveFilter = req.query.is_active || '';

        // Build WHERE clause
        const whereClauses = ['deleted_at IS NULL'];
        const params = [];

        if (search) {
            whereClauses.push('(name LIKE ? OR slug LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }

        if (planFilter) {
            whereClauses.push('plan = ?');
            params.push(planFilter);
        }

        if (isActiveFilter !== '') {
            whereClauses.push('is_active = ?');
            params.push(parseInt(isActiveFilter));
        }

        const whereClause = whereClauses.join(' AND ');

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM organizations WHERE ${whereClause}`;
        const { total } = storage.db.prepare(countQuery).get(...params);

        // Get paginated organizations
        const dataQuery = `
            SELECT id, name, slug, plan, subscription_status,
                   max_users, max_estimates, max_catalogs, storage_limit_mb,
                   current_users_count, current_estimates_count, current_catalogs_count, current_storage_mb,
                   is_active, created_at, updated_at
            FROM organizations
            WHERE ${whereClause}
            ORDER BY ${sort} ${order}
            LIMIT ? OFFSET ?
        `;

        const organizations = storage.db.prepare(dataQuery).all(...params, limit, offset);

        res.json({
            success: true,
            data: {
                organizations,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });

    } catch (err) {
        console.error('Get organizations error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch organizations'
        });
    }
});

/**
 * GET /api/v1/organizations/:id
 * Получить информацию об организации (для членов org)
 */
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const storage = req.app.locals.storage;
        const orgId = req.params.id;

        const organization = storage.db.prepare(`
            SELECT * FROM organizations WHERE id = ?
        `).get(orgId);

        if (!organization) {
            return res.status(404).json({
                success: false,
                error: 'Organization not found'
            });
        }

        // Check access
        const canView =
            req.user.role === 'superadmin' ||
            req.user.organization_id === orgId;

        if (!canView) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        res.json({
            success: true,
            data: organization
        });

    } catch (err) {
        console.error('Get organization error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch organization'
        });
    }
});

/**
 * PUT /api/v1/organizations/:id
 * Обновить организацию (только admin своей org или superuser)
 */
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const orgId = req.params.id;
        const { name, logo_url, primary_color, email, phone, website, address, settings } = req.body;

        const storage = req.app.locals.storage;

        // Get organization
        const organization = storage.db.prepare(
            'SELECT * FROM organizations WHERE id = ?'
        ).get(orgId);

        if (!organization) {
            return res.status(404).json({
                success: false,
                error: 'Organization not found'
            });
        }

        // Check permissions
        const canUpdate =
            req.user.role === 'superadmin' ||
            (req.user.role === 'admin' && req.user.organization_id === orgId);

        if (!canUpdate) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Build update query
        const updates = [];
        const params = [];

        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }

        if (logo_url !== undefined) {
            updates.push('logo_url = ?');
            params.push(logo_url);
        }

        if (primary_color !== undefined) {
            updates.push('primary_color = ?');
            params.push(primary_color);
        }

        if (email !== undefined) {
            updates.push('email = ?');
            params.push(email);
        }

        if (phone !== undefined) {
            updates.push('phone = ?');
            params.push(phone);
        }

        if (website !== undefined) {
            updates.push('website = ?');
            params.push(website);
        }

        if (address !== undefined) {
            updates.push('address = ?');
            params.push(address);
        }

        if (settings !== undefined) {
            updates.push('settings = ?');
            params.push(JSON.stringify(settings));
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No fields to update'
            });
        }

        updates.push('updated_at = ?');
        params.push(Math.floor(Date.now() / 1000));

        params.push(orgId);

        const query = `UPDATE organizations SET ${updates.join(', ')} WHERE id = ?`;
        storage.db.prepare(query).run(...params);

        res.json({
            success: true,
            message: 'Organization updated successfully'
        });

    } catch (err) {
        console.error('Update organization error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to update organization'
        });
    }
});

module.exports = router;
