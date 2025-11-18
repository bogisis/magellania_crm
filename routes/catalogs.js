/**
 * Catalog Routes
 * Handles catalog CRUD operations with multi-tenancy support
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/catalogs
 * List all catalogs for the user's organization
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const storage = req.app.locals.storage;
        const organizationId = req.user.organization_id;

        const catalogs = await storage.getCatalogsList(organizationId);

        logger.info('Catalogs listed', {
            userId: req.user.id,
            organizationId,
            count: catalogs.length
        });

        res.json({
            success: true,
            catalogs
        });
    } catch (error) {
        logger.logError(error, {
            context: 'List catalogs',
            userId: req.user?.id,
            organizationId: req.user?.organization_id
        });

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/catalogs/:name
 * Get a specific catalog by name
 */
router.get('/:name', requireAuth, async (req, res) => {
    try {
        const storage = req.app.locals.storage;
        const { name } = req.params;
        const organizationId = req.user.organization_id;

        const data = await storage.loadCatalog(name, organizationId);

        logger.info('Catalog loaded', {
            userId: req.user.id,
            organizationId,
            catalogName: name
        });

        res.json({
            success: true,
            data
        });
    } catch (error) {
        logger.logError(error, {
            context: 'Load catalog',
            userId: req.user?.id,
            organizationId: req.user?.organization_id,
            catalogName: req.params.name
        });

        // 404 если каталог не найден
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/catalogs
 * Create or update a catalog
 * Body: { name, data, visibility }
 */
router.post('/', requireAuth, async (req, res) => {
    try {
        const storage = req.app.locals.storage;
        const { name, data, visibility = 'organization' } = req.body;

        if (!name || !data) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name, data'
            });
        }

        const userId = req.user.id;
        const organizationId = req.user.organization_id;

        await storage.saveCatalog(name, data, userId, organizationId, visibility);

        logger.info('Catalog saved', {
            userId,
            organizationId,
            catalogName: name,
            visibility,
            templatesCount: Array.isArray(data.templates) ? data.templates.length : 0
        });

        res.json({
            success: true,
            message: 'Catalog saved successfully'
        });
    } catch (error) {
        logger.logError(error, {
            context: 'Save catalog',
            userId: req.user?.id,
            organizationId: req.user?.organization_id,
            catalogName: req.body?.name
        });

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/catalogs/:name
 * Delete a catalog (soft delete)
 * TODO: Implement soft delete in SQLiteStorage
 */
router.delete('/:name', requireAuth, async (req, res) => {
    try {
        const { name } = req.params;

        // TODO: Implement deleteCatalog method in SQLiteStorage
        // For now, return not implemented
        logger.warn('Delete catalog not implemented', {
            userId: req.user.id,
            organizationId: req.user.organization_id,
            catalogName: name
        });

        res.status(501).json({
            success: false,
            error: 'Delete catalog not yet implemented'
        });
    } catch (error) {
        logger.logError(error, {
            context: 'Delete catalog',
            userId: req.user?.id,
            organizationId: req.user?.organization_id,
            catalogName: req.params.name
        });

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
