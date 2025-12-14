require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// API v1 Router (новая архитектура)
const apiV1Router = require('./routes/api-v1');

// Storage adapters
const FileStorage = require('./storage/FileStorage');
const SQLiteStorage = require('./storage/SQLiteStorage');

const app = express();

// ============================================================================
// Configuration
// ============================================================================

const isTestMode = process.env.NODE_ENV === 'test';
const PORT = isTestMode ? 4001 : (process.env.PORT || 4000);

// Storage type: 'file' или 'sqlite'
const STORAGE_TYPE = process.env.STORAGE_TYPE || 'sqlite';

// Dual-write mode: писать в оба хранилища (для постепенной миграции)
const DUAL_WRITE_MODE = process.env.DUAL_WRITE_MODE === 'true';

console.log(`Storage configuration:`);
console.log(`  Type: ${STORAGE_TYPE}`);
console.log(`  Dual-write: ${DUAL_WRITE_MODE}`);
console.log(`  Test mode: ${isTestMode}`);

// ============================================================================
// Middleware
// ============================================================================

app.use(cors());
app.use(express.json({ limit: process.env.JSON_LIMIT || '50mb' }));
app.use(express.static('.'));

// ============================================================================
// Storage Initialization
// ============================================================================

let storage;
let secondaryStorage; // For dual-write mode

// Инициализация основного storage
if (STORAGE_TYPE === 'sqlite') {
    storage = new SQLiteStorage();
    console.log('Using SQLite storage');
} else {
    storage = new FileStorage();
    console.log('Using File storage');
}

// Инициализация вторичного storage для dual-write
if (DUAL_WRITE_MODE) {
    if (STORAGE_TYPE === 'sqlite') {
        secondaryStorage = new FileStorage();
        console.log('Dual-write enabled: SQLite + File');
    } else {
        secondaryStorage = new SQLiteStorage();
        console.log('Dual-write enabled: File + SQLite');
    }
}

// Инициализация storage при старте
async function initStorage() {
    try {
        await storage.init();
        console.log('✓ Primary storage initialized');

        if (secondaryStorage) {
            await secondaryStorage.init();
            console.log('✓ Secondary storage initialized (dual-write)');
        }
    } catch (err) {
        console.error('Failed to initialize storage:', err);
        throw err;
    }
}

// Вспомогательная функция для dual-write
async function dualWrite(operation, ...args) {
    // Сначала пишем в основное хранилище
    const result = await operation(storage, ...args);

    // Если включен dual-write, пишем и во вторичное
    if (secondaryStorage) {
        try {
            await operation(secondaryStorage, ...args);
        } catch (err) {
            // Ошибка во вторичном хранилище не критична
            console.error('Secondary storage write failed:', err.message);
        }
    }

    return result;
}

// ============================================================================
// API v1 Router Setup (новая архитектура с JWT auth)
// ============================================================================

// Передаём storage в app.locals для использования в v1 routes
// Это позволяет routes получать storage через req.app.locals.storage
app.set('storage', storage);
app.locals.storage = storage;

// Монтируем API v1 router
app.use('/api/v1', apiV1Router);

// ============================================================================
// Legacy API Routes (старая архитектура без auth)
// ============================================================================
// TODO: Эти роуты будут удалены после полной миграции на API v1
// Пока оставляем для обратной совместимости

// ============================================================================
// API для каталога
// ============================================================================

app.get('/api/catalog/list', async (req, res) => {
    try {
        const files = await storage.getCatalogsList();
        res.json({ success: true, files });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/catalog/:filename', async (req, res) => {
    try {
        const data = await storage.loadCatalog(req.params.filename);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/catalog/:filename', async (req, res) => {
    try {
        await dualWrite(
            async (storage, filename, data) => storage.saveCatalog(filename, data),
            req.params.filename,
            req.body
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// API для смет
// ============================================================================

app.get('/api/estimates', async (req, res) => {
    try {
        const estimates = await storage.getEstimatesList();
        res.json({ success: true, estimates });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/estimates/:filename', async (req, res) => {
    try {
        const data = await storage.loadEstimate(req.params.filename);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/estimates/:filename', async (req, res) => {
    try {
        // DAY 1.1: Use atomic transactions for SQLite (Production Safety)
        if (storage.constructor.name === 'SQLiteStorage') {
            // Atomic transaction: saves estimate + backup in one transaction
            // Prevents dual-write consistency issues
            await storage.saveEstimateTransactional(req.params.filename, req.body);
        } else {
            // FileStorage: use dual-write (legacy compatibility)
            await dualWrite(
                async (storage, filename, data) => storage.saveEstimate(filename, data),
                req.params.filename,
                req.body
            );
        }
        res.json({ success: true });
    } catch (err) {
        // Проверка на optimistic locking conflict
        if (err.message.includes('Concurrent modification')) {
            res.status(409).json({ success: false, error: err.message, code: 'CONFLICT' });
        } else {
            res.status(500).json({ success: false, error: err.message });
        }
    }
});

app.delete('/api/estimates/:filename', async (req, res) => {
    try {
        await dualWrite(
            async (storage, filename) => storage.deleteEstimate(filename),
            req.params.filename
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/estimates/:oldFilename/rename', async (req, res) => {
    try {
        const result = await dualWrite(
            async (storage, oldFilename, newFilename) => storage.renameEstimate(oldFilename, newFilename),
            req.params.oldFilename,
            req.body.newFilename
        );
        res.json({ success: true, newFilename: result.newFilename });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// API для backup'ов
// ============================================================================

app.get('/api/backups', async (req, res) => {
    try {
        const backups = await storage.getBackupsList();
        res.json({ success: true, backups });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/backups/:id', async (req, res) => {
    try {
        const data = await storage.loadBackup(req.params.id);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/backups/:id', async (req, res) => {
    try {
        await dualWrite(
            async (storage, id, data) => storage.saveBackup(id, data),
            req.params.id,
            req.body
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/backups/:id/restore', async (req, res) => {
    try {
        const result = await dualWrite(
            async (storage, id) => storage.restoreFromBackup(id),
            req.params.id
        );
        res.json({ success: true, filename: result.filename });
    } catch (err) {
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

app.post('/api/settings', async (req, res) => {
    try {
        await dualWrite(
            async (storage, data) => storage.saveSettings(data),
            req.body
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// API для транзакционного сохранения (только для SQLite)
// ============================================================================

app.post('/api/estimates/:filename/transactional', async (req, res) => {
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
// Legacy Transaction API (для обратной совместимости с текущим apiClient)
// ============================================================================

// Prepare transaction - deprecated в пользу transactional endpoint
app.post('/api/transaction/prepare', async (req, res) => {
    try {
        const { estimate, backup, transactionId } = req.body;

        if (!estimate || !backup || !transactionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: estimate, backup, transactionId'
            });
        }

        // Для SQLite используем нативные транзакции
        if (storage.constructor.name === 'SQLiteStorage') {
            // Ничего не делаем в prepare, commit выполнит все атомарно
            res.json({ success: true, transactionId, method: 'native' });
        } else {
            // Для FileStorage используем старую логику с temp файлами
            // TODO: Реализовать через FileStorage методы
            res.json({ success: true, transactionId, method: 'temp-files' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Commit transaction
app.post('/api/transaction/commit', async (req, res) => {
    try {
        const { transactionId, estimateFilename, backupId } = req.body;

        // Для SQLite используем транзакционное сохранение
        if (storage.constructor.name === 'SQLiteStorage') {
            const data = req.body.data; // Клиент должен передать данные
            await storage.saveEstimateTransactional(estimateFilename, data);
            res.json({ success: true, method: 'native' });
        } else {
            // Для FileStorage - старая логика
            res.json({ success: true, method: 'legacy' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Rollback transaction
app.post('/api/transaction/rollback', async (req, res) => {
    try {
        // Для SQLite rollback автоматический
        // Для FileStorage - удаление temp файлов
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// Health Check
// ============================================================================

app.get('/health', async (req, res) => {
    try {
        const storageHealth = await storage.healthCheck();
        const stats = await storage.getStats();

        const healthy = storageHealth.healthy;

        res.status(healthy ? 200 : 503).json({
            status: healthy ? 'healthy' : 'unhealthy',
            version: '2.3.0',
            environment: process.env.APP_ENV || 'unknown',
            storage: {
                type: STORAGE_TYPE,
                dualWrite: DUAL_WRITE_MODE,
                health: storageHealth,
                stats
            },
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
// Graceful Shutdown
// ============================================================================

async function shutdown() {
    console.log('\nShutting down gracefully...');
    try {
        await storage.close();
        if (secondaryStorage) {
            await secondaryStorage.close();
        }
        console.log('Storage connections closed');
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
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
                console.log(`\n${'='.repeat(50)}`);
                console.log(`Quote Calculator Server v2.3.0`);
                console.log(`${'='.repeat(50)}`);
                console.log(`Server running on port ${PORT}`);
                console.log(`Open http://localhost:${PORT} in browser`);
                console.log(`Storage: ${STORAGE_TYPE}${DUAL_WRITE_MODE ? ' (dual-write)' : ''}`);
                console.log(`${'='.repeat(50)}\n`);
            });
        })
        .catch(err => {
            console.error('Failed to start server:', err);
            process.exit(1);
        });
}

// Экспорт для тестирования
module.exports = app;
