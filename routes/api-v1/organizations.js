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
 * POST /api/v1/organizations
 * Создать новую организацию (только для superadmin)
 */
router.post('/', requireAuth, requireRole('superadmin'), async (req, res) => {
    try {
        const storage = req.app.locals.storage;
        const { v4: uuidv4 } = require('uuid');

        const {
            name,
            slug,
            plan = 'free',
            max_users,
            max_estimates,
            max_catalogs,
            storage_limit_mb,
            email,
            phone,
            website,
            address
        } = req.body;

        // Validation
        if (!name || !slug) {
            return res.status(400).json({
                success: false,
                error: 'Name and slug are required'
            });
        }

        // Check if slug already exists
        const existing = storage.db.prepare(
            'SELECT id FROM organizations WHERE slug = ? AND deleted_at IS NULL'
        ).get(slug);

        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Organization with this slug already exists'
            });
        }

        // Default quotas based on plan
        const planQuotas = {
            free: { users: 5, estimates: 10, catalogs: 5, storage: 100 },
            basic: { users: 20, estimates: 100, catalogs: 20, storage: 1000 },
            pro: { users: 100, estimates: 1000, catalogs: 100, storage: 10000 },
            enterprise: { users: 9999, estimates: 9999, catalogs: 9999, storage: 100000 }
        };

        const quotas = planQuotas[plan] || planQuotas.free;

        const orgId = uuidv4();
        const now = new Date().toISOString();

        // Insert organization
        storage.db.prepare(`
            INSERT INTO organizations (
                id, name, slug, plan, subscription_status,
                max_users, max_estimates, max_catalogs, storage_limit_mb,
                current_users_count, current_estimates_count, current_catalogs_count, current_storage_mb,
                email, phone, website, address,
                is_active, created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, 'active',
                ?, ?, ?, ?,
                0, 0, 0, 0,
                ?, ?, ?, ?,
                1, ?, ?
            )
        `).run(
            orgId, name, slug, plan,
            max_users || quotas.users,
            max_estimates || quotas.estimates,
            max_catalogs || quotas.catalogs,
            storage_limit_mb || quotas.storage,
            email || null,
            phone || null,
            website || null,
            address || null,
            now, now
        );

        const organization = storage.db.prepare(
            'SELECT * FROM organizations WHERE id = ?'
        ).get(orgId);

        res.status(201).json({
            success: true,
            data: {
                organization
            }
        });

    } catch (err) {
        console.error('Create organization error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to create organization'
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
            data: {
                organization
            }
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

        // Return updated organization
        const updatedOrg = storage.db.prepare(
            'SELECT * FROM organizations WHERE id = ?'
        ).get(orgId);

        res.json({
            success: true,
            data: {
                organization: updatedOrg
            }
        });

    } catch (err) {
        console.error('Update organization error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to update organization'
        });
    }
});

/**
 * DELETE /api/v1/organizations/:id
 * Удалить организацию (soft delete, только для superadmin)
 */
router.delete('/:id', requireAuth, requireRole('superadmin'), async (req, res) => {
    try {
        const storage = req.app.locals.storage;
        const orgId = req.params.id;

        // Check if organization exists
        const organization = storage.db.prepare(
            'SELECT * FROM organizations WHERE id = ? AND deleted_at IS NULL'
        ).get(orgId);

        if (!organization) {
            return res.status(404).json({
                success: false,
                error: 'Organization not found'
            });
        }

        const now = new Date().toISOString();

        // Soft delete organization
        storage.db.prepare(`
            UPDATE organizations
            SET deleted_at = ?, updated_at = ?
            WHERE id = ?
        `).run(now, now, orgId);

        // Also soft delete all users in this organization
        storage.db.prepare(`
            UPDATE users
            SET deleted_at = ?, updated_at = ?
            WHERE organization_id = ? AND deleted_at IS NULL
        `).run(now, now, orgId);

        res.json({
            success: true,
            message: 'Organization deleted successfully'
        });

    } catch (err) {
        console.error('Delete organization error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to delete organization'
        });
    }
});

module.exports = router;
