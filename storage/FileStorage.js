/**
 * FileStorage - File-based storage implementation
 *
 * Обертка над текущей файловой логикой из server.js
 * Сохраняет полную обратную совместимость с существующей системой
 *
 * Структура хранилища:
 * - estimate/{name}_{date}_{pax}_{id}.json
 * - backup/{id}.json
 * - catalog/{region}.json
 * - settings/settings.json
 */

const StorageAdapter = require('./StorageAdapter');
const fs = require('fs').promises;
const path = require('path');
const { transliterate } = require('../utils');

class FileStorage extends StorageAdapter {
    constructor(config = {}) {
        super(config);

        // Директории по умолчанию
        const baseDir = config.baseDir || process.cwd();
        const isTestMode = process.env.NODE_ENV === 'test';

        this.dirs = {
            estimate: path.join(baseDir, isTestMode ? '__test_estimate__' : (config.estimateDir || 'estimate')),
            backup: path.join(baseDir, isTestMode ? '__test_backup__' : (config.backupDir || 'backup')),
            catalog: path.join(baseDir, isTestMode ? '__test_catalog__' : (config.catalogDir || 'catalog')),
            settings: path.join(baseDir, isTestMode ? '__test_settings__' : (config.settingsDir || 'settings'))
        };

        this.initialized = false;
    }

    /**
     * Инициализация - создание директорий
     */
    async init() {
        if (this.initialized) return;

        for (const [name, dir] of Object.entries(this.dirs)) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (err) {
                console.error(`Error creating ${name} directory:`, err);
                throw err;
            }
        }

        this.initialized = true;
    }

    // ========================================================================
    // Estimates (Сметы)
    // ========================================================================

    async getEstimatesList() {
        await this.init();

        const files = await fs.readdir(this.dirs.estimate);
        // Фильтруем autosave.json и временные файлы
        const estimateFiles = files.filter(f =>
            f.endsWith('.json') &&
            f !== 'autosave.json' &&
            !f.startsWith('.tmp_')
        );

        // Получить метаданные каждой сметы
        const estimates = await Promise.all(
            estimateFiles.map(async (filename) => {
                try {
                    const filepath = path.join(this.dirs.estimate, filename);
                    const stats = await fs.stat(filepath);
                    const data = await fs.readFile(filepath, 'utf8');
                    const json = JSON.parse(data);

                    return {
                        filename,
                        id: json.id,
                        clientName: json.clientName || 'Без имени',
                        paxCount: json.paxCount || 0,
                        tourStart: json.tourStart || '',
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

        return estimates;
    }

    async loadEstimate(filename) {
        await this.init();

        const filepath = path.join(this.dirs.estimate, filename);
        const data = await fs.readFile(filepath, 'utf8');
        return JSON.parse(data);
    }

    async saveEstimate(filename, data) {
        await this.init();

        const filepath = path.join(this.dirs.estimate, filename);

        // Бэкап перед сохранением (если файл существует)
        try {
            const existing = await fs.readFile(filepath, 'utf8');
            await this._createBackupFile('estimate', filename, JSON.parse(existing));
        } catch (err) {
            // Файл не существует, это новая смета
        }

        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
        return { success: true };
    }

    async deleteEstimate(filename) {
        await this.init();

        const filepath = path.join(this.dirs.estimate, filename);

        // Бэкап перед удалением
        try {
            const existing = await fs.readFile(filepath, 'utf8');
            await this._createBackupFile('estimate_deleted', filename, JSON.parse(existing));
        } catch (err) {
            // Игнорируем ошибки бэкапа
        }

        await fs.unlink(filepath);
        return { success: true };
    }

    async renameEstimate(oldFilename, newFilename) {
        await this.init();

        const oldPath = path.join(this.dirs.estimate, oldFilename);
        const newPath = path.join(this.dirs.estimate, newFilename);

        // Проверяем что старый файл существует
        await fs.access(oldPath);

        // Переименовываем
        await fs.rename(oldPath, newPath);

        return { success: true, newFilename };
    }

    // ========================================================================
    // Backups (Резервные копии)
    // ========================================================================

    async getBackupsList() {
        await this.init();

        const files = await fs.readdir(this.dirs.backup);
        const backupFiles = files.filter(f =>
            f.endsWith('.json') &&
            !f.includes('_') &&
            !f.startsWith('.tmp_')
        );

        const backups = await Promise.all(
            backupFiles.map(async (filename) => {
                try {
                    const filepath = path.join(this.dirs.backup, filename);
                    const stats = await fs.stat(filepath);
                    const data = await fs.readFile(filepath, 'utf8');
                    const json = JSON.parse(data);

                    const id = filename.replace('.json', '');

                    // Проверяем есть ли соответствующий файл в estimate/
                    const estimateFiles = await fs.readdir(this.dirs.estimate);
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

        return validBackups;
    }

    async loadBackup(id) {
        await this.init();

        const filepath = path.join(this.dirs.backup, `${id}.json`);
        const data = await fs.readFile(filepath, 'utf8');
        return JSON.parse(data);
    }

    async saveBackup(id, data) {
        await this.init();

        const filepath = path.join(this.dirs.backup, `${id}.json`);
        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
        return { success: true };
    }

    async restoreFromBackup(id) {
        await this.init();

        const backupPath = path.join(this.dirs.backup, `${id}.json`);
        const backupData = await fs.readFile(backupPath, 'utf8');
        const data = JSON.parse(backupData);

        // Генерируем имя файла из данных backup
        const clientName = data.clientName || '';
        const transliterated = clientName
            ? transliterate(clientName.trim().toLowerCase()).replace(/\s+/g, '_')
            : 'untitled';
        const date = data.tourStart || new Date().toISOString().split('T')[0];
        const pax = data.paxCount || 0;

        const filename = `${transliterated}_${date}_${pax}pax_${id}.json`;
        const estimatePath = path.join(this.dirs.estimate, filename);

        // Сохраняем как новую смету
        await fs.writeFile(estimatePath, JSON.stringify(data, null, 2));

        return { success: true, filename };
    }

    // ========================================================================
    // Catalogs (Каталоги услуг)
    // ========================================================================

    async getCatalogsList() {
        await this.init();

        const files = await fs.readdir(this.dirs.catalog);
        const catalogFiles = files.filter(f => f.endsWith('.json'));
        return catalogFiles;
    }

    async loadCatalog(filename) {
        await this.init();

        const filepath = path.join(this.dirs.catalog, filename);
        const data = await fs.readFile(filepath, 'utf8');
        return JSON.parse(data);
    }

    async saveCatalog(filename, data) {
        await this.init();

        const filepath = path.join(this.dirs.catalog, filename);

        // Бэкап перед сохранением
        try {
            const existing = await fs.readFile(filepath, 'utf8');
            await this._createBackupFile('catalog', filename, JSON.parse(existing));
        } catch (err) {
            // Файл не существует, пропускаем бэкап
        }

        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
        return { success: true };
    }

    // ========================================================================
    // Settings (Настройки)
    // ========================================================================

    async loadSettings() {
        await this.init();

        const filepath = path.join(this.dirs.settings, 'settings.json');

        try {
            const data = await fs.readFile(filepath, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            // Если файл не существует, возвращаем дефолтные настройки
            if (err.code === 'ENOENT') {
                return {
                    bookingTerms: '',
                    version: '1.0.0'
                };
            }
            throw err;
        }
    }

    async saveSettings(data) {
        await this.init();

        const filepath = path.join(this.dirs.settings, 'settings.json');

        // Бэкап перед сохранением (если файл существует)
        try {
            const existing = await fs.readFile(filepath, 'utf8');
            await this._createBackupFile('settings', 'settings.json', JSON.parse(existing));
        } catch (err) {
            // Файл не существует, это первое сохранение
        }

        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
        return { success: true };
    }

    // ========================================================================
    // Utilities (Вспомогательные методы)
    // ========================================================================

    /**
     * Создать автоматический бэкап файла
     * @private
     */
    async _createBackupFile(type, filename, data) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(this.dirs.backup, `${type}_${timestamp}_${filename}`);
            await fs.writeFile(backupFile, JSON.stringify(data, null, 2));
            console.log(`Backup created: ${backupFile}`);
        } catch (err) {
            console.error('Backup error:', err);
        }
    }

    /**
     * Получить статистику хранилища
     */
    async getStats() {
        const baseStats = await super.getStats();

        // Подсчитать размер хранилища
        let totalSize = 0;
        for (const dir of Object.values(this.dirs)) {
            try {
                const files = await fs.readdir(dir);
                for (const file of files) {
                    const stat = await fs.stat(path.join(dir, file));
                    totalSize += stat.size;
                }
            } catch (err) {
                // Директория может не существовать
            }
        }

        return {
            ...baseStats,
            storageSize: totalSize,
            storageSizeFormatted: this._formatBytes(totalSize)
        };
    }

    _formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            await this.init();

            // Проверяем доступность всех директорий
            const checks = {};
            for (const [name, dir] of Object.entries(this.dirs)) {
                try {
                    await fs.access(dir);
                    checks[name] = true;
                } catch (err) {
                    checks[name] = false;
                }
            }

            const allHealthy = Object.values(checks).every(v => v);

            return {
                healthy: allHealthy,
                message: allHealthy ? 'All directories accessible' : 'Some directories inaccessible',
                checks
            };
        } catch (err) {
            return {
                healthy: false,
                message: err.message
            };
        }
    }
}

module.exports = FileStorage;
