/**
 * API v1 Router Index
 *
 * Объединяет все модули API v1
 *
 * Структура модулей:
 * - auth.js (3 endpoints) - Регистрация, вход, выход
 * - estimates.js (8 endpoints) - CRUD смет
 * - catalogs.js (3 endpoints) - Каталоги услуг
 * - settings.js (2 endpoints) - Настройки
 * - sync.js (2 endpoints) - Синхронизация
 * - users.js (3 endpoints) - Управление пользователями
 * - organizations.js (3 endpoints) - Управление организациями
 * - export.js (4 endpoints) - Экспорт/импорт данных
 *
 * Всего: 28 endpoints
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./api-v1/auth');
const estimatesRoutes = require('./api-v1/estimates');
const catalogsRoutes = require('./api-v1/catalogs');
const settingsRoutes = require('./api-v1/settings');
const syncRoutes = require('./api-v1/sync');
const usersRoutes = require('./api-v1/users');
const organizationsRoutes = require('./api-v1/organizations');
const exportRoutes = require('./api-v1/export');

// Mount routes
router.use('/auth', authRoutes);
router.use('/estimates', estimatesRoutes);
router.use('/catalogs', catalogsRoutes);
router.use('/settings', settingsRoutes);
router.use('/sync', syncRoutes);
router.use('/users', usersRoutes);
router.use('/organizations', organizationsRoutes);
router.use('/export', exportRoutes);

// API root endpoint
router.get('/', (req, res) => {
    res.json({
        success: true,
        api: 'Quote Calculator API v1',
        version: '3.0.0',
        endpoints: {
            auth: 3,
            estimates: 8,
            catalogs: 3,
            settings: 2,
            sync: 2,
            users: 3,
            organizations: 3,
            export: 4
        },
        total_endpoints: 28,
        documentation: '/docs'
    });
});

module.exports = router;
