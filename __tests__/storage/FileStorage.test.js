/**
 * FileStorage Tests
 *
 * Regression tests для FileStorage:
 * - Обратная совместимость с текущей системой
 * - CRUD операции через файлы
 * - Бэкапы
 * - Каталоги
 */

const FileStorage = require('../../storage/FileStorage');
const fs = require('fs').promises;
const path = require('path');

describe('FileStorage', () => {
    let storage;
    const testBaseDir = path.join(__dirname, '../__test_file_storage__');

    beforeAll(async () => {
        // В test mode FileStorage автоматически использует __test_estimate__, __test_backup__, etc
        // Не передаем estimateDir/backupDir/catalogDir/settingsDir - используем defaults
        storage = new FileStorage({
            baseDir: testBaseDir
        });

        await storage.init();
    });

    afterAll(async () => {
        // Cleanup test directories
        try {
            await fs.rm(testBaseDir, { recursive: true, force: true });
        } catch (err) {
            console.error('Cleanup error:', err);
        }
    });

    afterEach(async () => {
        // Очистка файлов между тестами, используем storage.dirs
        for (const dirPath of Object.values(storage.dirs)) {
            try {
                const files = await fs.readdir(dirPath);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        await fs.unlink(path.join(dirPath, file));
                    }
                }
            } catch (err) {
                // Directory may not exist
            }
        }
    });

    // ========================================================================
    // Initialization Tests
    // ========================================================================

    describe('Initialization', () => {
        test('should create all directories', async () => {
            // Проверяем что storage.dirs содержит все необходимые директории
            for (const [name, dirPath] of Object.entries(storage.dirs)) {
                const stats = await fs.stat(dirPath);
                expect(stats.isDirectory()).toBe(true);
            }
        });

        test('should initialize successfully', () => {
            expect(storage.initialized).toBe(true);
            expect(storage.dirs).toBeDefined();
            expect(storage.dirs.estimate).toBeDefined();
        });
    });

    // ========================================================================
    // Estimates Tests
    // ========================================================================

    describe('Estimates - File Operations', () => {
        const testEstimate = {
            id: 'file-test-id',
            version: '1.1.0',
            clientName: 'Test Client',
            paxCount: 5,
            tourStart: '2025-11-01',
            services: [
                { id: '1', name: 'Service 1', price: 100, quantity: 1 }
            ]
        };

        test('should save estimate as JSON file', async () => {
            const filename = 'test_client_2025-11-01_5pax_file-test-id.json';
            await storage.saveEstimate(filename, testEstimate);

            // Проверяем что файл создан
            const filepath = path.join(storage.dirs.estimate, filename);
            const stats = await fs.stat(filepath);
            expect(stats.isFile()).toBe(true);

            // Проверяем содержимое
            const content = await fs.readFile(filepath, 'utf8');
            const data = JSON.parse(content);
            expect(data.id).toBe(testEstimate.id);
        });

        test('should load estimate from JSON file', async () => {
            const filename = 'test_load.json';
            await storage.saveEstimate(filename, testEstimate);

            const loaded = await storage.loadEstimate(filename);
            expect(loaded.id).toBe(testEstimate.id);
            expect(loaded.clientName).toBe(testEstimate.clientName);
            expect(loaded.services).toHaveLength(1);
        });

        test('should list estimate files', async () => {
            await storage.saveEstimate('estimate1.json', { ...testEstimate, id: 'id1' });
            await storage.saveEstimate('estimate2.json', { ...testEstimate, id: 'id2' });

            const list = await storage.getEstimatesList();
            expect(list).toHaveLength(2);
            expect(list[0].filename).toBeDefined();
            expect(list[0].clientName).toBeDefined();
        });

        test('should delete estimate file', async () => {
            const filename = 'to_delete.json';
            await storage.saveEstimate(filename, testEstimate);

            await storage.deleteEstimate(filename);

            const list = await storage.getEstimatesList();
            expect(list).toHaveLength(0);
        });

        test('should rename estimate file', async () => {
            const oldName = 'old.json';
            const newName = 'new.json';

            await storage.saveEstimate(oldName, testEstimate);
            await storage.renameEstimate(oldName, newName);

            const list = await storage.getEstimatesList();
            expect(list).toHaveLength(1);
            expect(list[0].filename).toBe(newName);
        });

        test('should filter out autosave.json', async () => {
            await storage.saveEstimate('autosave.json', testEstimate);
            await storage.saveEstimate('regular.json', testEstimate);

            const list = await storage.getEstimatesList();
            expect(list).toHaveLength(1);
            expect(list[0].filename).toBe('regular.json');
        });

        test('should filter out .tmp_ files', async () => {
            const tmpPath = path.join(storage.dirs.estimate, '.tmp_test.json');
            await fs.writeFile(tmpPath, JSON.stringify(testEstimate));
            await storage.saveEstimate('regular.json', testEstimate);

            const list = await storage.getEstimatesList();
            expect(list).toHaveLength(1);
            expect(list[0].filename).toBe('regular.json');
        });
    });

    // ========================================================================
    // Backup Tests
    // ========================================================================

    describe('Backups - File Operations', () => {
        const testBackup = {
            id: 'backup-id-123',
            clientName: 'Backup Test',
            paxCount: 5,
            tourStart: '2025-11-01',
            services: []
        };

        test('should save backup file', async () => {
            await storage.saveBackup(testBackup.id, testBackup);

            const filepath = path.join(storage.dirs.backup, `${testBackup.id}.json`);
            const stats = await fs.stat(filepath);
            expect(stats.isFile()).toBe(true);
        });

        test('should load backup from file', async () => {
            await storage.saveBackup(testBackup.id, testBackup);

            const loaded = await storage.loadBackup(testBackup.id);
            expect(loaded.id).toBe(testBackup.id);
            expect(loaded.clientName).toBe(testBackup.clientName);
        });

        test('should list backup files', async () => {
            await storage.saveBackup('id1', { ...testBackup, id: 'id1' });
            await storage.saveBackup('id2', { ...testBackup, id: 'id2' });

            const list = await storage.getBackupsList();
            expect(list.length).toBeGreaterThanOrEqual(2);
        });

        test('should restore from backup', async () => {
            await storage.saveBackup(testBackup.id, testBackup);

            const result = await storage.restoreFromBackup(testBackup.id);
            expect(result.success).toBe(true);
            expect(result.filename).toContain(testBackup.id);

            // Проверяем что файл создан
            const estimate = await storage.loadEstimate(result.filename);
            expect(estimate.id).toBe(testBackup.id);
        });

        test('should create automatic backup before save', async () => {
            const filename = 'backup_test.json';

            // Первое сохранение
            await storage.saveEstimate(filename, testBackup);

            // Второе сохранение (должен создать backup)
            const updated = { ...testBackup, clientName: 'Updated' };
            await storage.saveEstimate(filename, updated);

            // Проверяем что создан backup файл
            const files = await fs.readdir(storage.dirs.backup);
            const backupFiles = files.filter(f => f.includes('estimate_') && f.includes(filename));
            expect(backupFiles.length).toBeGreaterThan(0);
        });
    });

    // ========================================================================
    // Catalog Tests
    // ========================================================================

    describe('Catalogs - File Operations', () => {
        const testCatalog = {
            version: '1.2.0',
            region: 'Test',
            templates: [
                { id: '1', name: 'Template 1', price: 100 }
            ]
        };

        test('should save catalog file', async () => {
            const filename = 'test_catalog.json';
            await storage.saveCatalog(filename, testCatalog);

            const filepath = path.join(storage.dirs.catalog, filename);
            const stats = await fs.stat(filepath);
            expect(stats.isFile()).toBe(true);
        });

        test('should load catalog from file', async () => {
            const filename = 'test_catalog.json';
            await storage.saveCatalog(filename, testCatalog);

            const loaded = await storage.loadCatalog(filename);
            expect(loaded.region).toBe(testCatalog.region);
            expect(loaded.templates).toHaveLength(1);
        });

        test('should list catalog files', async () => {
            await storage.saveCatalog('catalog1.json', testCatalog);
            await storage.saveCatalog('catalog2.json', testCatalog);

            const list = await storage.getCatalogsList();
            expect(list).toContain('catalog1.json');
            expect(list).toContain('catalog2.json');
        });
    });

    // ========================================================================
    // Settings Tests
    // ========================================================================

    describe('Settings - File Operations', () => {
        test('should save settings to file', async () => {
            const settings = {
                bookingTerms: 'Test terms',
                version: '1.0.0'
            };

            await storage.saveSettings(settings);

            const filepath = path.join(storage.dirs.settings, 'settings.json');
            const stats = await fs.stat(filepath);
            expect(stats.isFile()).toBe(true);
        });

        test('should load settings from file', async () => {
            const settings = {
                bookingTerms: 'Test terms',
                customField: 'custom'
            };

            await storage.saveSettings(settings);
            const loaded = await storage.loadSettings();

            expect(loaded.bookingTerms).toBe(settings.bookingTerms);
            expect(loaded.customField).toBe(settings.customField);
        });

        test('should return default settings if file does not exist', async () => {
            const loaded = await storage.loadSettings();
            expect(loaded).toBeDefined();
            expect(loaded.bookingTerms).toBe('');
            expect(loaded.version).toBe('1.0.0');
        });
    });

    // ========================================================================
    // Data Integrity Tests
    // ========================================================================

    describe('Data Integrity', () => {
        test('should preserve JSON formatting', async () => {
            const filename = 'formatted.json';
            const data = { id: 'test', nested: { value: 123 } };

            await storage.saveEstimate(filename, data);

            const filepath = path.join(storage.dirs.estimate, filename);
            const content = await fs.readFile(filepath, 'utf8');

            // Проверяем что JSON отформатирован с отступами
            expect(content).toContain('\n');
            expect(content).toContain('  '); // 2 spaces indent
        });

        test('should handle unicode in filenames', async () => {
            const data = { id: 'unicode-test', clientName: 'Тест' };
            const filename = 'test_unicode.json';

            await storage.saveEstimate(filename, data);
            const loaded = await storage.loadEstimate(filename);

            expect(loaded.clientName).toBe('Тест');
        });

        test('should preserve timestamps', async () => {
            const filename = 'timestamp_test.json';
            await storage.saveEstimate(filename, { id: 'test' });

            // Небольшая задержка
            await new Promise(resolve => setTimeout(resolve, 100));

            const list = await storage.getEstimatesList();
            const estimate = list.find(e => e.filename === filename);

            expect(estimate.createdAt).toBeDefined();
            expect(estimate.updatedAt).toBeDefined();
            // Проверяем что это валидные timestamp (Date объекты или строки с датами)
            const createdDate = new Date(estimate.createdAt);
            expect(createdDate.getTime()).toBeGreaterThan(0);
        });
    });

    // ========================================================================
    // Stats and Health Tests
    // ========================================================================

    describe('Stats and Health', () => {
        test('should calculate storage size', async () => {
            // Создаем несколько файлов
            await storage.saveEstimate('test1.json', { id: '1', data: 'A'.repeat(1000) });
            await storage.saveEstimate('test2.json', { id: '2', data: 'B'.repeat(1000) });

            const stats = await storage.getStats();
            expect(stats.storageSize).toBeGreaterThan(0);
            expect(stats.storageSizeFormatted).toBeDefined();
        });

        test('should format bytes correctly', () => {
            expect(storage._formatBytes(0)).toBe('0 Bytes');
            expect(storage._formatBytes(1024)).toBe('1 KB');
            expect(storage._formatBytes(1024 * 1024)).toBe('1 MB');
        });

        test('should pass health check', async () => {
            const health = await storage.healthCheck();
            expect(health.healthy).toBe(true);
            expect(health.checks).toBeDefined();
            expect(health.checks.estimate).toBe(true);
        });

        test('should get storage stats', async () => {
            await storage.saveEstimate('test.json', { id: 'test' });
            await storage.saveBackup('id1', { id: 'id1' });
            await storage.saveCatalog('catalog.json', { templates: [] });

            const stats = await storage.getStats();
            expect(stats.estimatesCount).toBe(1);
            expect(stats.backupsCount).toBeGreaterThanOrEqual(1);
            expect(stats.catalogsCount).toBe(1);
            expect(stats.storageType).toBe('FileStorage');
        });
    });

    // ========================================================================
    // Error Handling Tests
    // ========================================================================

    describe('Error Handling', () => {
        test('should throw error for non-existent file', async () => {
            await expect(
                storage.loadEstimate('does_not_exist.json')
            ).rejects.toThrow();
        });

        test('should throw error for invalid JSON', async () => {
            const filepath = path.join(storage.dirs.estimate, 'invalid.json');
            await fs.writeFile(filepath, 'invalid json content');

            await expect(
                storage.loadEstimate('invalid.json')
            ).rejects.toThrow();
        });

        test('should handle concurrent access gracefully', async () => {
            const filename = 'concurrent.json';
            const data = { id: 'concurrent-test' };

            // Несколько одновременных записей
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(storage.saveEstimate(filename, { ...data, count: i }));
            }

            await Promise.all(promises);

            // Файл должен существовать и содержать валидные данные
            const loaded = await storage.loadEstimate(filename);
            expect(loaded.id).toBe(data.id);
        });

        test('should handle missing directories', async () => {
            // Удаляем директорию
            await fs.rm(storage.dirs.estimate, { recursive: true, force: true });

            // Сброс флага initialized, чтобы init() выполнился снова
            storage.initialized = false;
            await storage.init();

            await storage.saveEstimate('recovery_test.json', { id: 'test' });

            const loaded = await storage.loadEstimate('recovery_test.json');
            expect(loaded.id).toBe('test');
        });
    });

    // ========================================================================
    // Backward Compatibility Tests
    // ========================================================================

    describe('Backward Compatibility', () => {
        beforeEach(async () => {
            // Убедимся что все директории существуют перед тестами
            storage.initialized = false;
            await storage.init();
        });

        test('should work with existing file structure', async () => {
            // Создаем файл напрямую (симуляция legacy)
            const legacyData = {
                id: 'legacy-id',
                clientName: 'Legacy Client',
                services: []
            };

            // Убедимся что директория существует
            await fs.mkdir(storage.dirs.estimate, { recursive: true });

            const filepath = path.join(storage.dirs.estimate, 'legacy.json');
            await fs.writeFile(filepath, JSON.stringify(legacyData, null, 2));

            // FileStorage должен корректно прочитать
            const loaded = await storage.loadEstimate('legacy.json');
            expect(loaded.id).toBe('legacy-id');
            expect(loaded.clientName).toBe('Legacy Client');
        });

        test('should maintain compatibility with current server.js', async () => {
            // Тест что FileStorage API совместим с current server.js endpoints
            const filename = 'compat_test.json';
            const data = {
                id: 'compat-id',
                version: '1.1.0',
                clientName: 'Test',
                services: []
            };

            // Последовательность операций как в server.js
            await storage.saveEstimate(filename, data);
            await storage.saveBackup(data.id, data);

            const estimates = await storage.getEstimatesList();
            const backups = await storage.getBackupsList();

            expect(estimates.length).toBeGreaterThan(0);
            expect(backups.length).toBeGreaterThan(0);
        });
    });
});
