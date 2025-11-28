require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const passport = require('passport');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

// Storage adapters
const SQLiteStorage = require('./storage/SQLiteStorage');
const FileStorage = require('./storage/FileStorage'); // Only for import/export

// Authentication
const AuthService = require('./services/AuthService');
const configurePassport = require('./config/passport');
const authRoutes = require('./routes/auth');
const catalogRoutes = require('./routes/catalogs');
const { requireAuth } = require('./middleware/auth');

// API v1 (Migration v3.0 - Multi-Tenancy + JWT)
const apiV1Router = require('./routes/api-v1');

// DAY 1.3: Disk space validation middleware (Production Safety)
const { checkDiskSpace, getDiskSpaceInfo } = require('./middleware/diskSpace');

// DAY 2.1: Structured logging with Winston (Production Observability)
const logger = require('./utils/logger');

const app = express();

// ============================================================================
// Configuration
// ============================================================================

const isTestMode = process.env.NODE_ENV === 'test';
const PORT = isTestMode ? 3001 : (process.env.PORT || 4000);

// DAY 5: SQLite-only mode (migration completed)
// FileStorage is only used for import/export operations
const STORAGE_TYPE = 'sqlite';

logger.info('Storage configuration', {
    version: '2.3.0',
    environment: process.env.NODE_ENV || 'development',
    type: STORAGE_TYPE,
    dualWrite: false,
    testMode: isTestMode
});

// ============================================================================
// Middleware
// ============================================================================

app.use(cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true  // Allow cookies
}));
app.use(express.json({ limit: process.env.JSON_LIMIT || '50mb' }));
app.use(express.urlencoded({ extended: true }));  // For form data

// DAY 2.1: HTTP request logging
if (!isTestMode) {
    app.use(logger.middleware());
}

// Session configuration (must be before passport)
const sessionStore = new SQLiteStore({
    db: process.env.SESSION_DB_PATH || 'sessions.db',
    dir: './db',
    table: 'sessions'
});

app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production-IMPORTANT',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: process.env.SESSION_SECURE_COOKIE === 'true',  // true only for HTTPS
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
        sameSite: 'lax'
    }
}));

// Initialize Passport (must be after session)
app.use(passport.initialize());
app.use(passport.session());

// Serve static files (login.html, etc.)
app.use(express.static('.'));

// ============================================================================
// Storage Initialization
// ============================================================================

// DAY 5: SQLite-only storage with backward compatibility
// Используем defaults (user_default, org_default) для совместимости с legacy data
const storage = new SQLiteStorage();

// Инициализация storage при старте
async function initStorage() {
    try {
        await storage.init();
        logger.info('Primary storage initialized', {
            version: '2.3.0',
            environment: process.env.NODE_ENV || 'development'
        });

        // Initialize AuthService
        const authService = new AuthService(storage.db);
        app.locals.authService = authService;
        app.locals.db = storage.db;
        app.locals.storage = storage;  // Make storage available to routes

        // Configure Passport
        configurePassport(authService);

        logger.info('Authentication configured', {
            sessionStore: 'sqlite',
            cookieSecure: process.env.SESSION_SECURE_COOKIE === 'true'
        });
    } catch (err) {
        logger.logError(err, { context: 'Storage initialization' });
        throw err;
    }
}

// ============================================================================
// API v1 (Migration v3.0 - Multi-Tenancy + JWT)
// ============================================================================

app.use('/api/v1', apiV1Router);

// ============================================================================
// Authentication API (Legacy session-based auth)
// ============================================================================

app.use('/api/auth', authRoutes);

// Login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// ============================================================================
// Catalog API (Multi-Tenant)
// ============================================================================

app.use('/api/v1/catalogs', catalogRoutes);

// ============================================================================
// API для смет
// ============================================================================

app.get('/api/estimates', async (req, res) => {
    try {
        // Multi-tenancy: фильтруем по organization_id пользователя
        // По умолчанию magellania-org (Migration 010)
        const organizationId = req.user?.organization_id || 'magellania-org';
        const estimates = await storage.getEstimatesList(organizationId);

        logger.info('Estimates list retrieved', {
            userId: req.user?.id || 'anonymous',
            organizationId,
            count: estimates.length
        });

        res.json({ success: true, estimates });
    } catch (err) {
        logger.error('Error getting estimates list', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// Batch API для массового сохранения (для SyncManager)
// ============================================================================

/**
 * Batch save estimates - транзакционное сохранение нескольких смет
 * POST /api/estimates/batch
 * Body: { items: [{id, data}, ...] }
 * Returns: { succeeded: [ids], failed: [{id, error}] }
 */
app.post('/api/estimates/batch', checkDiskSpace, async (req, res) => {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Invalid request: items must be a non-empty array'
        });
    }

    const results = {
        succeeded: [],
        failed: []
    };

    // SQLiteStorage: используем транзакцию для batch save
    if (STORAGE_TYPE === 'sqlite') {
        try {
            // Транзакция для всего batch
            const transaction = storage.db.transaction(() => {
                for (const item of items) {
                    const { id, data } = item;

                    if (!id || !data) {
                        results.failed.push({ id, error: 'Missing id or data' });
                        continue;
                    }

                    try {
                        // Используем синхронный метод внутри транзакции
                        const now = Math.floor(Date.now() / 1000);
                        const dataStr = JSON.stringify(data);
                        const dataHash = storage._calculateHash(dataStr);
                        const metadata = storage._extractMetadata(data);
                        const filename = data.filename || metadata.filename || `estimate_${id}.json`;

                        const orgId = storage.defaultOrganizationId;
                        const ownerId = storage.defaultUserId;

                        // Проверяем существование
                        const existing = storage.statements.getEstimateById.get(id, orgId);

                        if (existing) {
                            // UPDATE
                            storage.statements.updateEstimate.run(
                                filename,
                                dataStr,
                                metadata.clientName,
                                metadata.clientEmail,
                                metadata.clientPhone,
                                metadata.paxCount,
                                metadata.tourStart,
                                metadata.tourEnd,
                                metadata.totalCost,
                                metadata.totalProfit,
                                metadata.servicesCount,
                                dataHash,
                                now,
                                id,
                                existing.data_version,
                                orgId
                            );
                        } else {
                            // INSERT
                            storage.statements.insertEstimate.run(
                                id,
                                filename,
                                data.version || '1.1.0',
                                storage.appVersion,
                                dataStr,
                                metadata.clientName,
                                metadata.clientEmail,
                                metadata.clientPhone,
                                metadata.paxCount,
                                metadata.tourStart,
                                metadata.tourEnd,
                                metadata.totalCost,
                                metadata.totalProfit,
                                metadata.servicesCount,
                                1,
                                dataHash,
                                now,
                                now,
                                ownerId,
                                orgId
                            );
                        }

                        results.succeeded.push(id);
                    } catch (err) {
                        results.failed.push({ id, error: err.message });
                    }
                }
            });

            // Выполняем транзакцию
            transaction();

            res.json({
                success: true,
                ...results
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: `Batch transaction failed: ${err.message}`,
                ...results
            });
        }
    } else {
        // FileStorage: последовательное сохранение (нет транзакций)
        for (const item of items) {
            const { id, data } = item;

            if (!id || !data) {
                results.failed.push({ id, error: 'Missing id or data' });
                continue;
            }

            try {
                await storage.saveEstimate(id, data);
                results.succeeded.push(id);
            } catch (err) {
                results.failed.push({ id, error: err.message });
            }
        }

        res.json({
            success: true,
            ...results
        });
    }
});

// ============================================================================
// Single Estimate API (параметризованные routes)
// ============================================================================

// ID-First: Load estimate by ID
app.get('/api/estimates/:id', async (req, res) => {
    try {
        // Multi-tenancy: используем organization_id пользователя
        // По умолчанию magellania-org (Migration 010)
        const organizationId = req.user?.organization_id || 'magellania-org';
        const data = await storage.loadEstimate(req.params.id, organizationId);

        logger.info('Estimate loaded', {
            userId: req.user?.id || 'anonymous',
            organizationId,
            estimateId: req.params.id
        });

        res.json({ success: true, data });
    } catch (err) {
        logger.logError(err, { context: `Load estimate ${req.params.id}` });
        res.status(500).json({ success: false, error: err.message });
    }
});

// ID-First: Save estimate by ID
app.post('/api/estimates/:id', checkDiskSpace, async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        // Multi-tenancy: используем пользователя из сессии или defaults
        const userId = req.user?.id || storage.defaultUserId;
        const organizationId = req.user?.organization_id || storage.defaultOrganizationId;

        // Save estimate with ID-First architecture + multi-tenancy
        await storage.saveEstimate(id, data, userId, organizationId);

        res.json({ success: true });
    } catch (err) {
        logger.logError(err, { context: `Save estimate ${req.params.id}` });

        // Проверка на optimistic locking conflict
        if (err.message.includes('Concurrent modification')) {
            res.status(409).json({ success: false, error: err.message, code: 'CONFLICT' });
        } else {
            res.status(500).json({ success: false, error: err.message });
        }
    }
});

// ID-First: Delete estimate by ID
app.delete('/api/estimates/:id', checkDiskSpace, async (req, res) => {
    try {
        // Multi-tenancy: используем organization_id пользователя
        // По умолчанию magellania-org (Migration 010)
        const organizationId = req.user?.organization_id || 'magellania-org';
        await storage.deleteEstimate(req.params.id, organizationId);

        logger.info('Estimate deleted', {
            userId: req.user?.id || 'anonymous',
            organizationId,
            estimateId: req.params.id
        });

        res.json({ success: true });
    } catch (err) {
        logger.logError(err, { context: `Delete estimate ${req.params.id}` });
        res.status(500).json({ success: false, error: err.message });
    }
});

// ID-First rename endpoint
app.put('/api/estimates/:id/rename', checkDiskSpace, async (req, res) => {
    try {
        const { id } = req.params;
        const { newFilename } = req.body;

        if (!newFilename) {
            return res.status(400).json({ success: false, error: 'newFilename is required' });
        }

        // Load current estimate
        const estimate = await storage.loadEstimate(id);

        if (!estimate) {
            return res.status(404).json({ success: false, error: `Estimate not found: ${id}` });
        }

        // Update filename in metadata and save back
        estimate.filename = newFilename;
        await storage.saveEstimate(id, estimate);

        res.json({ success: true, newFilename });
    } catch (err) {
        logger.logError(err, { context: `Rename estimate ${req.params.id}` });
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// API для настроек
// ============================================================================

app.get('/api/settings', async (req, res) => {
    try {
        const data = await storage.loadSettings();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/settings', checkDiskSpace, async (req, res) => {
    try {
        await storage.saveSettings(req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// API для транзакционного сохранения (только для SQLite)
// ============================================================================

app.post('/api/estimates/:filename/transactional', checkDiskSpace, async (req, res) => {
    try {
        // Транзакционное сохранение доступно только для SQLite
        if (storage.constructor.name === 'SQLiteStorage') {
            await storage.saveEstimateTransactional(req.params.filename, req.body);
            res.json({ success: true, transactional: true });
        } else {
            // Fallback на обычное сохранение для FileStorage
            await storage.saveEstimate(req.params.filename, req.body);
            await storage.saveBackup(req.body.id, req.body);
            res.json({ success: true, transactional: false });
        }
    } catch (err) {
        if (err.message.includes('Concurrent modification')) {
            res.status(409).json({ success: false, error: err.message, code: 'CONFLICT' });
        } else {
            res.status(500).json({ success: false, error: err.message });
        }
    }
});

// ============================================================================
// DAY 2.3: Export/Import API (Production Data Portability)
// ============================================================================

/**
 * Export all data - estimates, catalogs, settings, backups as JSON
 * GET /api/export/all
 * Query params:
 *   - includeBackups: boolean (default: true)
 * Returns: JSON with all data
 */
app.get('/api/export/all', async (req, res) => {
    try {
        const includeBackups = req.query.includeBackups !== 'false';

        logger.info('Exporting all data', { includeBackups });

        const exportData = {
            version: '2.3.0',
            exportDate: new Date().toISOString(),
            storageType: STORAGE_TYPE,
            data: {}
        };

        // Export estimates
        const estimates = await storage.getEstimatesList();
        exportData.data.estimates = [];
        for (const est of estimates) {
            try {
                // Use id instead of filename for SQLiteStorage
                const data = await storage.loadEstimate(est.id);
                exportData.data.estimates.push({
                    id: est.id,
                    filename: est.filename,
                    data: data
                });
            } catch (err) {
                logger.warn('Failed to load estimate for export', {
                    id: est.id,
                    filename: est.filename,
                    error: err.message
                });
            }
        }

        // Export catalogs
        const catalogs = await storage.getCatalogsList();
        exportData.data.catalogs = [];
        for (const catalogName of catalogs) {
            try {
                // catalogName is a string (filename), not an object
                const data = await storage.loadCatalog(catalogName);
                exportData.data.catalogs.push({
                    filename: catalogName,
                    data: data
                });
            } catch (err) {
                logger.warn('Failed to load catalog for export', {
                    filename: catalogName,
                    error: err.message
                });
            }
        }

        // Export settings
        try {
            const settings = await storage.loadSettings();
            exportData.data.settings = settings;
        } catch (err) {
            logger.warn('Failed to load settings for export', { error: err.message });
            exportData.data.settings = {};
        }

        // Export backups (optional)
        if (includeBackups) {
            const backups = await storage.getBackupsList();
            exportData.data.backups = [];
            for (const backup of backups) {
                try {
                    const data = await storage.loadBackup(backup.id || backup.estimate_id);
                    exportData.data.backups.push({
                        id: backup.id || backup.estimate_id,
                        data: data
                    });
                } catch (err) {
                    logger.warn('Failed to load backup for export', {
                        id: backup.id,
                        error: err.message
                    });
                }
            }
        }

        logger.info('Export completed', {
            estimates: exportData.data.estimates.length,
            catalogs: exportData.data.catalogs.length,
            backups: includeBackups ? exportData.data.backups.length : 0
        });

        // Set headers for file download
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="quote-calculator-export-${Date.now()}.json"`);
        res.json(exportData);
    } catch (err) {
        logger.logError(err, { context: 'Export all data' });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Import all data from JSON export
 * POST /api/import/all
 * Body: JSON export file
 * Returns: { success: true, imported: {...counts}, failed: {...counts} }
 */
app.post('/api/import/all', checkDiskSpace, async (req, res) => {
    try {
        const importData = req.body;

        // Validate import data structure
        if (!importData || !importData.version || !importData.data) {
            return res.status(400).json({
                success: false,
                error: 'Invalid import data: missing version or data fields'
            });
        }

        logger.info('Starting data import', {
            version: importData.version,
            exportDate: importData.exportDate
        });

        const results = {
            imported: {
                estimates: 0,
                catalogs: 0,
                settings: false,
                backups: 0
            },
            failed: {
                estimates: [],
                catalogs: [],
                backups: []
            }
        };

        // Import estimates
        if (importData.data.estimates && Array.isArray(importData.data.estimates)) {
            for (const item of importData.data.estimates) {
                try {
                    // Use id or data.id for SQLiteStorage
                    const estimateId = item.id || item.data.id;
                    if (!estimateId) {
                        throw new Error('Missing estimate id');
                    }
                    await storage.saveEstimate(estimateId, item.data);
                    results.imported.estimates++;
                } catch (err) {
                    logger.warn('Failed to import estimate', {
                        id: item.id,
                        filename: item.filename,
                        error: err.message
                    });
                    results.failed.estimates.push({
                        id: item.id,
                        filename: item.filename,
                        error: err.message
                    });
                }
            }
        }

        // Import catalogs
        if (importData.data.catalogs && Array.isArray(importData.data.catalogs)) {
            for (const item of importData.data.catalogs) {
                try {
                    await storage.saveCatalog(item.filename, item.data);
                    results.imported.catalogs++;
                } catch (err) {
                    logger.warn('Failed to import catalog', {
                        filename: item.filename,
                        error: err.message
                    });
                    results.failed.catalogs.push({
                        filename: item.filename,
                        error: err.message
                    });
                }
            }
        }

        // Import settings
        if (importData.data.settings) {
            try {
                await storage.saveSettings(importData.data.settings);
                results.imported.settings = true;
            } catch (err) {
                logger.warn('Failed to import settings', { error: err.message });
            }
        }

        // Import backups
        if (importData.data.backups && Array.isArray(importData.data.backups)) {
            for (const item of importData.data.backups) {
                try {
                    await storage.saveBackup(item.id, item.data);
                    results.imported.backups++;
                } catch (err) {
                    logger.warn('Failed to import backup', {
                        id: item.id,
                        error: err.message
                    });
                    results.failed.backups.push({
                        id: item.id,
                        error: err.message
                    });
                }
            }
        }

        logger.info('Import completed', { results });

        res.json({
            success: true,
            ...results
        });
    } catch (err) {
        logger.logError(err, { context: 'Import all data' });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Export SQLite database file (only for SQLiteStorage)
 * GET /api/export/database
 * Returns: SQLite database file as binary stream
 */
app.get('/api/export/database', async (req, res) => {
    try {
        // This endpoint only works with SQLiteStorage
        if (storage.constructor.name !== 'SQLiteStorage') {
            return res.status(400).json({
                success: false,
                error: 'Database export is only available for SQLite storage'
            });
        }

        logger.info('Exporting SQLite database');

        // Use better-sqlite3 serialize() method to get database as Buffer
        const dbBuffer = storage.db.serialize();

        // Set headers for binary download
        const filename = `quote-calculator-db-${Date.now()}.db`;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', dbBuffer.length);

        logger.info('Database export completed', {
            filename,
            sizeBytes: dbBuffer.length
        });

        // Send the buffer
        res.send(dbBuffer);
    } catch (err) {
        logger.logError(err, { context: 'Export database' });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Import SQLite database file (only for SQLiteStorage)
 * POST /api/import/database
 * Body: Raw SQLite database file (application/octet-stream)
 * Returns: { success: boolean, message: string }
 */
app.post('/api/import/database', express.raw({ type: 'application/octet-stream', limit: '100mb' }), async (req, res) => {
    try {
        // This endpoint only works with SQLiteStorage
        if (storage.constructor.name !== 'SQLiteStorage') {
            return res.status(400).json({
                success: false,
                error: 'Database import is only available for SQLite storage'
            });
        }

        const dbBuffer = req.body;

        if (!dbBuffer || dbBuffer.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No database file provided'
            });
        }

        logger.info('Importing SQLite database', {
            sizeBytes: dbBuffer.length
        });

        const fs = require('fs');
        const path = require('path');

        // Get database path from storage
        const dbPath = storage.dbPath;
        const backupPath = `${dbPath}.backup-${Date.now()}`;

        // 1. Create backup of current database
        logger.info('Creating backup of current database', { backupPath });
        if (fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, backupPath);
        }

        try {
            // 2. Close ALL database connections (storage + AuthService)
            logger.info('Closing all database connections');
            storage.db.close();

            // Close AuthService database if it exists
            if (global.authService && global.authService.db) {
                global.authService.db.close();
            }

            // 3. Write new database file
            logger.info('Writing new database file', { dbPath });
            fs.writeFileSync(dbPath, dbBuffer);

            logger.info('Database file replaced successfully', {
                sizeBytes: dbBuffer.length,
                backupPath
            });

            // 4. Send success response BEFORE restarting
            res.json({
                success: true,
                message: 'Database imported successfully. Server will restart in 2 seconds.',
                backupPath,
                restart: true
            });

            // 5. Graceful shutdown and restart (Docker will auto-restart)
            logger.info('Initiating server restart after database import...');
            setTimeout(() => {
                logger.info('Shutting down server for database reload...');
                process.exit(0); // Docker restart policy will restart the container
            }, 2000);

        } catch (importError) {
            // If import fails, restore from backup
            logger.logError(importError, { context: 'Database import failed, restoring backup' });

            if (fs.existsSync(backupPath)) {
                logger.info('Restoring database from backup');
                fs.copyFileSync(backupPath, dbPath);
                logger.info('Database restored from backup');
            }

            throw importError;
        }

    } catch (err) {
        logger.logError(err, { context: 'Import database' });
        res.status(500).json({
            success: false,
            error: err.message || 'Failed to import database'
        });
    }
});

// ============================================================================
// Health Check
// ============================================================================

// Health check endpoint (with /api/health alias for Docker healthcheck)
app.get(['/health', '/api/health'], async (req, res) => {
    try {
        const storageHealth = await storage.healthCheck();
        const stats = await storage.getStats();

        // DAY 1.3: Include disk space info in health check (Production Safety)
        const diskSpace = getDiskSpaceInfo();

        const healthy = storageHealth.healthy && diskSpace.healthy;

        res.status(healthy ? 200 : 503).json({
            status: healthy ? 'healthy' : 'unhealthy',
            version: '2.3.0',
            environment: process.env.APP_ENV || 'development',
            storage: {
                type: STORAGE_TYPE,
                health: storageHealth,
                stats
            },
            diskSpace,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(503).json({
            status: 'unhealthy',
            error: err.message
        });
    }
});

// ============================================================================
// Database Export
// ============================================================================

// Export SQLite database
app.get('/api/database/export', requireAuth, async (req, res) => {
    try {
        logger.info('Database export requested', {
            user: req.user ? req.user.username : 'anonymous'
        });

        // Path to SQLite database
        const dbPath = process.env.DB_PATH || 'db/quotes.db';

        // Check if database exists
        if (!fs.existsSync(dbPath)) {
            logger.warn('Database file not found', { dbPath });
            return res.status(404).json({
                success: false,
                error: 'Database file not found'
            });
        }

        // Set response headers for file download
        const filename = `quotes_backup_${new Date().toISOString().split('T')[0]}.db`;
        res.setHeader('Content-Type', 'application/x-sqlite3');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Stream database file to response
        const fileStream = fs.createReadStream(dbPath);
        fileStream.on('error', (err) => {
            logger.logError(err, { context: 'Database export stream' });
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to export database'
                });
            }
        });

        fileStream.pipe(res);

        logger.info('Database exported successfully', {
            filename,
            user: req.user ? req.user.username : 'anonymous'
        });
    } catch (err) {
        logger.logError(err, { context: 'Database export' });
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown() {
    logger.info('Shutting down gracefully...');
    try {
        await storage.close();
        logger.info('Storage connections closed');
        process.exit(0);
    } catch (err) {
        logger.logError(err, { context: 'Graceful shutdown' });
        process.exit(1);
    }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ============================================================================
// Server Startup
// ============================================================================

if (require.main === module) {
    initStorage()
        .then(() => {
            app.listen(PORT, () => {
                logger.info('Server started', {
                    version: '2.3.0',
                    environment: process.env.NODE_ENV || 'development',
                    port: PORT,
                    url: `http://localhost:${PORT}`,
                    storage: STORAGE_TYPE,
                    dualWrite: false
                });

                // Pretty banner for console in development
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`\n${'='.repeat(50)}`);
                    console.log(`Quote Calculator Server v2.3.0`);
                    console.log(`${'='.repeat(50)}`);
                    console.log(`Server running on port ${PORT}`);
                    console.log(`Open http://localhost:${PORT} in browser`);
                    console.log(`Storage: ${STORAGE_TYPE}`);
                    console.log(`${'='.repeat(50)}\n`);
                }
            });
        })
        .catch(err => {
            logger.logError(err, { context: 'Server startup' });
            process.exit(1);
        });
}

// Экспорт для тестирования
module.exports = app;
