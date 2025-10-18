const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();

// Используем тестовые настройки в test режиме
const isTestMode = process.env.NODE_ENV === 'test';
const PORT = isTestMode ? 3001 : (process.env.PORT || 3000);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

// Директории (используем тестовые пути в test режиме)
const CATALOG_DIR = path.join(__dirname, isTestMode ? '__test_catalog__' : 'catalog');
const ESTIMATE_DIR = path.join(__dirname, isTestMode ? '__test_estimate__' : 'estimate');
const BACKUP_DIR = path.join(__dirname, isTestMode ? '__test_backup__' : 'backup');

// Создание директорий при старте
async function ensureDirs() {
    for (const dir of [CATALOG_DIR, ESTIMATE_DIR, BACKUP_DIR]) {
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (err) {
            console.error(`Error creating ${dir}:`, err);
        }
    }
}

// Импортируем вспомогательные функции
const { transliterate } = require('./utils');

// Утилита для автобэкапа
async function createBackup(type, filename, data) {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(BACKUP_DIR, `${type}_${timestamp}_${filename}`);
        await fs.writeFile(backupFile, JSON.stringify(data, null, 2));
        console.log(`Backup created: ${backupFile}`);
    } catch (err) {
        console.error('Backup error:', err);
    }
}

// ============ API для каталога ============

// Получить список каталогов
app.get('/api/catalog/list', async (req, res) => {
    try {
        const files = await fs.readdir(CATALOG_DIR);
        const catalogFiles = files.filter(f => f.endsWith('.json'));
        res.json({ success: true, files: catalogFiles });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Загрузить каталог
app.get('/api/catalog/:filename', async (req, res) => {
    try {
        const filepath = path.join(CATALOG_DIR, req.params.filename);
        const data = await fs.readFile(filepath, 'utf8');
        res.json({ success: true, data: JSON.parse(data) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Сохранить каталог
app.post('/api/catalog/:filename', async (req, res) => {
    try {
        const filepath = path.join(CATALOG_DIR, req.params.filename);
        const data = req.body;

        // Бэкап перед сохранением
        try {
            const existing = await fs.readFile(filepath, 'utf8');
            await createBackup('catalog', req.params.filename, JSON.parse(existing));
        } catch (err) {
            // Файл не существует, пропускаем бэкап
        }

        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============ API для смет ============

// Получить список смет
app.get('/api/estimates', async (req, res) => {
    try {
        const files = await fs.readdir(ESTIMATE_DIR);
        // Фильтруем autosave.json - его не нужно показывать в списке
        const estimateFiles = files.filter(f => f.endsWith('.json') && f !== 'autosave.json');

        // Получить метаданные каждой сметы
        const estimates = await Promise.all(
            estimateFiles.map(async (filename) => {
                try {
                    const filepath = path.join(ESTIMATE_DIR, filename);
                    const stats = await fs.stat(filepath);
                    const data = await fs.readFile(filepath, 'utf8');
                    const json = JSON.parse(data);

                    return {
                        filename,
                        clientName: json.clientName || 'Без имени',
                        paxCount: json.paxCount || 0,
                        updatedAt: stats.mtime,
                        createdAt: stats.birthtime
                    };
                } catch (err) {
                    return {
                        filename,
                        clientName: 'Ошибка чтения',
                        error: true
                    };
                }
            })
        );

        // Сортировка по дате изменения (новые первые)
        estimates.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        res.json({ success: true, estimates });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Загрузить смету
app.get('/api/estimates/:filename', async (req, res) => {
    try {
        const filepath = path.join(ESTIMATE_DIR, req.params.filename);
        const data = await fs.readFile(filepath, 'utf8');
        res.json({ success: true, data: JSON.parse(data) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Сохранить смету (создание или обновление)
app.post('/api/estimates/:filename', async (req, res) => {
    try {
        const filepath = path.join(ESTIMATE_DIR, req.params.filename);
        const data = req.body;

        // Бэкап перед сохранением (если файл существует)
        try {
            const existing = await fs.readFile(filepath, 'utf8');
            await createBackup('estimate', req.params.filename, JSON.parse(existing));
        } catch (err) {
            // Файл не существует, это новая смета
        }

        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Удалить смету
app.delete('/api/estimates/:filename', async (req, res) => {
    try {
        const filepath = path.join(ESTIMATE_DIR, req.params.filename);

        // Бэкап перед удалением
        try {
            const existing = await fs.readFile(filepath, 'utf8');
            await createBackup('estimate_deleted', req.params.filename, JSON.parse(existing));
        } catch (err) {
            // Игнорируем ошибки бэкапа
        }

        await fs.unlink(filepath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Переименовать смету
app.put('/api/estimates/:oldFilename/rename', async (req, res) => {
    try {
        const oldPath = path.join(ESTIMATE_DIR, req.params.oldFilename);
        const newFilename = req.body.newFilename;
        const newPath = path.join(ESTIMATE_DIR, newFilename);

        // Проверяем что старый файл существует
        await fs.access(oldPath);

        // Переименовываем
        await fs.rename(oldPath, newPath);

        res.json({ success: true, newFilename });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============ API для backup'ов ============

// Получить список backup'ов
app.get('/api/backups', async (req, res) => {
    try {
        const files = await fs.readdir(BACKUP_DIR);
        const backupFiles = files.filter(f => f.endsWith('.json') && !f.includes('_'));

        const backups = await Promise.all(
            backupFiles.map(async (filename) => {
                try {
                    const filepath = path.join(BACKUP_DIR, filename);
                    const stats = await fs.stat(filepath);
                    const data = await fs.readFile(filepath, 'utf8');
                    const json = JSON.parse(data);

                    const id = filename.replace('.json', '');

                    // Проверяем есть ли соответствующий файл в estimate/
                    const estimateFiles = await fs.readdir(ESTIMATE_DIR);
                    const hasEstimate = estimateFiles.some(f => f.includes(`_${id}.json`));

                    return {
                        id,
                        clientName: json.clientName || 'Без имени',
                        paxCount: json.paxCount || 0,
                        tourStart: json.tourStart || '',
                        updatedAt: stats.mtime,
                        hasEstimate
                    };
                } catch (err) {
                    return null;
                }
            })
        );

        // Фильтруем null значения и сортируем по дате
        const validBackups = backups.filter(b => b !== null);
        validBackups.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        res.json({ success: true, backups: validBackups });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Загрузить backup по ID
app.get('/api/backups/:id', async (req, res) => {
    try {
        const filepath = path.join(BACKUP_DIR, `${req.params.id}.json`);
        const data = await fs.readFile(filepath, 'utf8');
        res.json({ success: true, data: JSON.parse(data) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Сохранить backup по ID
app.post('/api/backups/:id', async (req, res) => {
    try {
        const filepath = path.join(BACKUP_DIR, `${req.params.id}.json`);
        const data = req.body;
        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Восстановить смету из backup
app.post('/api/backups/:id/restore', async (req, res) => {
    try {
        const backupPath = path.join(BACKUP_DIR, `${req.params.id}.json`);
        const backupData = await fs.readFile(backupPath, 'utf8');
        const data = JSON.parse(backupData);

        // Генерируем имя файла из данных backup
        const clientName = data.clientName || '';
        const transliterated = clientName ? transliterate(clientName.trim().toLowerCase()).replace(/\s+/g, '_') : 'untitled';
        const date = data.tourStart || new Date().toISOString().split('T')[0];
        const pax = data.paxCount || 0;
        const id = req.params.id;

        const filename = `${transliterated}_${date}_${pax}pax_${id}.json`;
        const estimatePath = path.join(ESTIMATE_DIR, filename);

        // Сохраняем как новую смету
        await fs.writeFile(estimatePath, JSON.stringify(data, null, 2));

        res.json({ success: true, filename });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============ API для транзакционного сохранения ============

// Подготовка транзакции - сохранение во временные файлы
app.post('/api/transaction/prepare', async (req, res) => {
    try {
        const { estimate, backup, transactionId } = req.body;

        if (!estimate || !backup || !transactionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: estimate, backup, transactionId'
            });
        }

        // Создаём временные файлы с префиксом .tmp и transaction ID
        const tempEstimatePath = path.join(ESTIMATE_DIR, `.tmp_${transactionId}_${estimate.filename}`);
        const tempBackupPath = path.join(BACKUP_DIR, `.tmp_${transactionId}_${backup.id}.json`);

        // Сохраняем во временные файлы
        await fs.writeFile(tempEstimatePath, JSON.stringify(estimate.data, null, 2));
        await fs.writeFile(tempBackupPath, JSON.stringify(backup.data, null, 2));

        res.json({
            success: true,
            transactionId,
            tempFiles: {
                estimate: tempEstimatePath,
                backup: tempBackupPath
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Commit транзакции - atomic rename временных файлов в финальные
app.post('/api/transaction/commit', async (req, res) => {
    try {
        const { transactionId, estimateFilename, backupId } = req.body;

        if (!transactionId || !estimateFilename || !backupId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: transactionId, estimateFilename, backupId'
            });
        }

        const tempEstimatePath = path.join(ESTIMATE_DIR, `.tmp_${transactionId}_${estimateFilename}`);
        const tempBackupPath = path.join(BACKUP_DIR, `.tmp_${transactionId}_${backupId}.json`);

        const finalEstimatePath = path.join(ESTIMATE_DIR, estimateFilename);
        const finalBackupPath = path.join(BACKUP_DIR, `${backupId}.json`);

        // Проверяем существование временных файлов
        try {
            await fs.access(tempEstimatePath);
            await fs.access(tempBackupPath);
        } catch (err) {
            return res.status(404).json({
                success: false,
                error: 'Temporary files not found. Transaction may have been rolled back or expired.'
            });
        }

        // Atomic rename (на одной файловой системе это атомарная операция)
        try {
            await fs.rename(tempEstimatePath, finalEstimatePath);
            await fs.rename(tempBackupPath, finalBackupPath);

            res.json({
                success: true,
                message: 'Transaction committed successfully',
                files: {
                    estimate: finalEstimatePath,
                    backup: finalBackupPath
                }
            });
        } catch (renameErr) {
            // Если rename упал - пытаемся откатиться
            try {
                // Удаляем возможно созданные файлы
                await fs.unlink(finalEstimatePath).catch(() => {});
                await fs.unlink(finalBackupPath).catch(() => {});
                // Пытаемся восстановить temp файлы если они были переименованы
            } catch (cleanupErr) {
                console.error('Cleanup error during rollback:', cleanupErr);
            }

            return res.status(500).json({
                success: false,
                error: `Commit failed: ${renameErr.message}. Transaction rolled back.`
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Rollback транзакции - удаление временных файлов
app.post('/api/transaction/rollback', async (req, res) => {
    try {
        const { transactionId, estimateFilename, backupId } = req.body;

        if (!transactionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: transactionId'
            });
        }

        // Формируем пути к временным файлам
        const tempEstimatePath = estimateFilename
            ? path.join(ESTIMATE_DIR, `.tmp_${transactionId}_${estimateFilename}`)
            : null;
        const tempBackupPath = backupId
            ? path.join(BACKUP_DIR, `.tmp_${transactionId}_${backupId}.json`)
            : null;

        // Удаляем временные файлы (если они существуют)
        const deleted = [];
        if (tempEstimatePath) {
            try {
                await fs.unlink(tempEstimatePath);
                deleted.push('estimate');
            } catch (err) {
                // Файл может не существовать - это ок
            }
        }

        if (tempBackupPath) {
            try {
                await fs.unlink(tempBackupPath);
                deleted.push('backup');
            } catch (err) {
                // Файл может не существовать - это ок
            }
        }

        res.json({
            success: true,
            message: 'Transaction rolled back successfully',
            deleted
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============ Запуск сервера ============

// Создаём директории при загрузке модуля
ensureDirs();

// Запускать сервер только если файл запущен напрямую (не через require в тестах)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Open http://localhost:${PORT} in browser`);
    });
}

// Экспорт для тестирования
module.exports = app;
