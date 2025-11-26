/**
 * Catalogs API Routes
 *
 * Endpoints:
 * - GET /api/v1/catalogs - Список каталогов
 * - GET /api/v1/catalogs/:id - Получить каталог
 * - POST /api/v1/catalogs - Создать/обновить каталог
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const express = require('express');
const { requireAuth } = require('../../middleware/jwt-auth');

const router = express.Router();

/**
 * GET /api/v1/catalogs
 * Список каталогов организации
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const storage = req.app.locals.storage;

        const catalogs = storage.db.prepare(`
            SELECT id, name, slug, region, visibility,
                   templates_count, categories_count,
                   created_at, updated_at, last_accessed_at
            FROM catalogs
            WHERE organization_id = ? AND deleted_at IS NULL
            ORDER BY updated_at DESC
        `).all(req.user.organization_id);

        res.json({
            success: true,
            data: {
                catalogs
            }
        });

    } catch (err) {
        console.error('Get catalogs error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch catalogs'
        });
    }
});

/**
 * GET /api/v1/catalogs/:id
 * Получить каталог по ID (с полными данными)
 */
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const storage = req.app.locals.storage;

        const catalog = storage.db.prepare(`
            SELECT * FROM catalogs WHERE id = ?
        `).get(req.params.id);

        if (!catalog) {
            return res.status(404).json({
                success: false,
                error: 'Catalog not found'
            });
        }

        // Check access
        const hasAccess =
            req.user.role === 'superuser' ||
            catalog.organization_id === req.user.organization_id ||
            (catalog.visibility === 'public');

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Update last_accessed_at
        storage.db.prepare('UPDATE catalogs SET last_accessed_at = ? WHERE id = ?')
            .run(Math.floor(Date.now() / 1000), req.params.id);

        // ✅ FIX: Parse JSON data field before sending
        const catalogData = {
            ...catalog,
            data: JSON.parse(catalog.data)
        };

        res.json({
            success: true,
            data: catalogData.data  // ✅ Возвращаем только parsed data, а не весь row
        });

    } catch (err) {
        console.error('Get catalog error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch catalog'
        });
    }
});

/**
 * POST /api/v1/catalogs
 * Создать или обновить каталог
 */
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, data, visibility = 'organization' } = req.body;

        if (!name || !data) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name, data'
            });
        }

        const storage = req.app.locals.storage;
        const userId = req.user.id;
        const organizationId = req.user.organization_id;

        // Детальное логирование для отладки
        console.log('[Catalog Save] Request data:', {
            name,
            dataType: typeof data,
            hasTemplates: data && data.templates ? data.templates.length : 'N/A',
            hasCategories: data && data.categories ? data.categories.length : 'N/A',
            userId,
            organizationId,
            visibility
        });

        // Use storage layer - it handles ID generation, slug, data_version, etc.
        await storage.saveCatalog(name, data, userId, organizationId, visibility);

        res.json({
            success: true,
            message: 'Catalog saved successfully'
        });

    } catch (err) {
        console.error('Create/update catalog error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to save catalog'
        });
    }
});

module.exports = router;
