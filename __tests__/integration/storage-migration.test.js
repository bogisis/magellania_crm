/**
 * Storage Migration Integration Tests
 *
 * Тестирование миграции данных между File и SQLite storage:
 * - Data integrity при миграции
 * - API совместимость
 * - Dual-write режим
 * - Rollback scenarios
 */

const FileStorage = require('../../storage/FileStorage');
const SQLiteStorage = require('../../storage/SQLiteStorage');
const fs = require('fs').promises;
const path = require('path');
const { createTestDatabase, cleanupTestDatabase } = require('../helpers/db-setup');

describe('Storage Migration Integration', () => {
    let fileStorage;
    let sqliteStorage;

    const testBaseDir = path.join(__dirname, '../__test_migration__');
    const testDbPath = path.join(testBaseDir, 'migration_test.db');
    const testUserId = 'user-migration-test';
    const testOrgId = 'org-migration-test';

    beforeAll(async () => {
        // Создаем тестовые директории
        await fs.mkdir(testBaseDir, { recursive: true });

        // v3.0: Create database with migrations
        createTestDatabase(testDbPath);

        fileStorage = new FileStorage({ baseDir: testBaseDir });
        sqliteStorage = new SQLiteStorage({
            dbPath: testDbPath,
            userId: testUserId,
            organizationId: testOrgId
        });

        await fileStorage.init();
        await sqliteStorage.init();
    });

    afterAll(async () => {
        await sqliteStorage.close();

        // Cleanup
        try {
            await fs.rm(testBaseDir, { recursive: true, force: true });
        } catch (err) {
            console.error('Cleanup error:', err);
        }
        cleanupTestDatabase(testDbPath);
    });

    afterEach(async () => {
        // Очистка данных между тестами
        try {
            // File storage cleanup - удаляем ВСЕ .json файлы (кроме .gitkeep)
            const dirs = ['estimate', 'backup', 'catalog', 'settings'];
            for (const dir of dirs) {
                const dirPath = path.join(testBaseDir, dir);
                try {
                    const files = await fs.readdir(dirPath);
                    for (const file of files) {
                        if (file.endsWith('.json') && file !== '.gitkeep') {
                            const filePath = path.join(dirPath, file);
                            await fs.unlink(filePath).catch(() => {});
                        }
                    }
                } catch (err) {
                    // Directory might not exist yet
                }
            }

            // SQLite cleanup - полная очистка
            if (sqliteStorage && sqliteStorage.db) {
                sqliteStorage.db.exec('DELETE FROM estimates');
                sqliteStorage.db.exec('DELETE FROM backups');
                sqliteStorage.db.exec('DELETE FROM catalogs');
                sqliteStorage.db.exec('DELETE FROM settings');
                sqliteStorage.db.exec('DELETE FROM audit_logs');
            }
        } catch (err) {
            console.error('Cleanup error in afterEach:', err.message);
        }
    });

    // ========================================================================
    // API Compatibility Tests
    // ========================================================================

    describe('API Compatibility', () => {
        const testData = {
            id: 'compat-test-id',
            version: '1.1.0',
            clientName: 'Compatibility Test',
            paxCount: 5,
            tourStart: '2025-11-01',
            services: [
                { id: '1', name: 'Service 1', price: 100, quantity: 2 }
            ]
        };

        test('both storages should have same interface', () => {
            const fileStorageMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(fileStorage));
            const sqliteStorageMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(sqliteStorage));

            // Основные методы должны совпадать
            const coreMethods = [
                'getEstimatesList',
                'loadEstimate',
                'saveEstimate',
                'deleteEstimate',
                'renameEstimate',
                'getBackupsList',
                'loadBackup',
                'saveBackup',
                'restoreFromBackup',
                'getCatalogsList',
                'loadCatalog',
                'saveCatalog',
                'loadSettings',
                'saveSettings'
            ];

            for (const method of coreMethods) {
                expect(fileStorageMethods).toContain(method);
                expect(sqliteStorageMethods).toContain(method);
            }
        });

        test('both storages should save and load data identically', async () => {
            const filename = 'compat_test.json';

            // Сохранить в оба storage
            await fileStorage.saveEstimate(filename, testData);
            await sqliteStorage.saveEstimate(filename, testData);

            // Загрузить из обоих
            const fileData = await fileStorage.loadEstimate(filename);
            const sqliteData = await sqliteStorage.loadEstimate(filename);

            // Данные должны совпадать
            expect(fileData.id).toBe(sqliteData.id);
            expect(fileData.clientName).toBe(sqliteData.clientName);
            expect(fileData.services).toEqual(sqliteData.services);
        });

        test('both storages should return same list format', async () => {
            await fileStorage.saveEstimate('test1.json', { ...testData, id: 'id1' });
            await sqliteStorage.saveEstimate('test1.json', { ...testData, id: 'id1' });

            const fileList = await fileStorage.getEstimatesList();
            const sqliteList = await sqliteStorage.getEstimatesList();

            expect(fileList[0]).toHaveProperty('filename');
            expect(fileList[0]).toHaveProperty('clientName');
            expect(fileList[0]).toHaveProperty('paxCount');

            expect(sqliteList[0]).toHaveProperty('filename');
            expect(sqliteList[0]).toHaveProperty('clientName');
            expect(sqliteList[0]).toHaveProperty('paxCount');
        });
    });

    // ========================================================================
    // Data Migration Tests
    // ========================================================================

    describe('File → SQLite Migration', () => {
        test('should migrate single estimate', async () => {
            const filename = 'migrate_single.json';
            const data = {
                id: 'migrate-id-1',
                clientName: 'Migration Test 1',
                paxCount: 10,
                services: []
            };

            // Сохранить в File storage
            await fileStorage.saveEstimate(filename, data);

            // Загрузить из File и сохранить в SQLite
            const fileData = await fileStorage.loadEstimate(filename);
            await sqliteStorage.saveEstimate(filename, fileData);

            // Проверить что данные мигрировали корректно
            const sqliteData = await sqliteStorage.loadEstimate(filename);
            expect(sqliteData.id).toBe(data.id);
            expect(sqliteData.clientName).toBe(data.clientName);
        });

        test('should migrate multiple estimates', async () => {
            // Генерируем уникальные ID с timestamp
            const timestamp = Date.now();
            const estimates = [
                { id: `id1_${timestamp}`, clientName: 'Client 1', services: [] },
                { id: `id2_${timestamp}`, clientName: 'Client 2', services: [] },
                { id: `id3_${timestamp}`, clientName: 'Client 3', services: [] }
            ];

            // Сохранить все в File storage
            for (let i = 0; i < estimates.length; i++) {
                await fileStorage.saveEstimate(`est_${timestamp}_${i}.json`, estimates[i]);
            }

            // Мигрировать только созданные файлы
            for (let i = 0; i < estimates.length; i++) {
                const filename = `est_${timestamp}_${i}.json`;
                const data = await fileStorage.loadEstimate(filename);
                await sqliteStorage.saveEstimate(filename, data);
            }

            // Проверить количество
            const sqliteList = await sqliteStorage.getEstimatesList();
            expect(sqliteList).toHaveLength(estimates.length);
        });

        test('should preserve data integrity during migration', async () => {
            const complexData = {
                id: 'complex-migration',
                version: '1.1.0',
                appVersion: '2.3.0',
                clientName: 'Complex Test',
                clientEmail: 'test@example.com',
                clientPhone: '+7 123 456 7890',
                paxCount: 15,
                tourStart: '2025-12-01',
                tourEnd: '2025-12-10',
                services: [
                    {
                        id: '1',
                        name: 'Service A',
                        price: 100.50,
                        quantity: 2,
                        markup: 10,
                        nested: { data: 'test' }
                    },
                    {
                        id: '2',
                        name: 'Service B',
                        price: 200,
                        quantity: 1,
                        tags: ['tag1', 'tag2']
                    }
                ],
                hiddenMarkup: 5,
                taxRate: 20,
                programDescription: 'Test program',
                quoteComments: 'Test comments'
            };

            const filename = 'complex_migration.json';

            // File → SQLite
            await fileStorage.saveEstimate(filename, complexData);
            const fileData = await fileStorage.loadEstimate(filename);
            await sqliteStorage.saveEstimate(filename, fileData);

            const sqliteData = await sqliteStorage.loadEstimate(filename);

            // Deep comparison
            expect(sqliteData.id).toBe(complexData.id);
            expect(sqliteData.services).toHaveLength(2);
            expect(sqliteData.services[0].nested).toEqual({ data: 'test' });
            expect(sqliteData.services[1].tags).toEqual(['tag1', 'tag2']);
            expect(sqliteData.programDescription).toBe(complexData.programDescription);
        });

        test('should migrate backups', async () => {
            const backupData = {
                id: 'backup-migrate-id',
                clientName: 'Backup Migration Test',
                services: []
            };

            await fileStorage.saveBackup(backupData.id, backupData);

            const fileBackup = await fileStorage.loadBackup(backupData.id);
            await sqliteStorage.saveBackup(backupData.id, fileBackup);

            const sqliteBackup = await sqliteStorage.loadBackup(backupData.id);
            expect(sqliteBackup.id).toBe(backupData.id);
        });

        test('should migrate catalogs', async () => {
            const catalogData = {
                version: '1.2.0',
                region: 'Test Region',
                templates: [
                    { id: '1', name: 'Template 1', price: 100 }
                ]
            };

            const filename = 'migrate_catalog.json';

            await fileStorage.saveCatalog(filename, catalogData);
            const fileCatalog = await fileStorage.loadCatalog(filename);
            await sqliteStorage.saveCatalog(filename, fileCatalog);

            const sqliteCatalog = await sqliteStorage.loadCatalog(filename);
            expect(sqliteCatalog.region).toBe(catalogData.region);
            expect(sqliteCatalog.templates).toHaveLength(1);
        });

        test('should migrate settings', async () => {
            const settings = {
                bookingTerms: 'Migrated terms',
                customField: 'custom value'
            };

            await fileStorage.saveSettings(settings);
            const fileSettings = await fileStorage.loadSettings();
            await sqliteStorage.saveSettings(fileSettings);

            const sqliteSettings = await sqliteStorage.loadSettings();
            expect(sqliteSettings.bookingTerms).toBe(settings.bookingTerms);
            expect(sqliteSettings.customField).toBe(settings.customField);
        });
    });

    // ========================================================================
    // Dual-Write Simulation Tests
    // ========================================================================

    describe('Dual-Write Mode', () => {
        test('should write to both storages simultaneously', async () => {
            const filename = 'dual_write_test.json';
            const data = {
                id: 'dual-write-id',
                clientName: 'Dual Write Test',
                services: []
            };

            // Симуляция dual-write
            await Promise.all([
                fileStorage.saveEstimate(filename, data),
                sqliteStorage.saveEstimate(filename, data)
            ]);

            // Проверить что данные в обоих
            const fileData = await fileStorage.loadEstimate(filename);
            const sqliteData = await sqliteStorage.loadEstimate(filename);

            expect(fileData.id).toBe(data.id);
            expect(sqliteData.id).toBe(data.id);
        });

        test('should handle partial failure in dual-write', async () => {
            const filename = 'partial_failure.json';
            const data = { id: 'test-id', services: [] };

            // Успешная запись в File
            await fileStorage.saveEstimate(filename, data);

            // Симуляция ошибки в SQLite (закрываем соединение)
            await sqliteStorage.close();

            let sqliteError = null;
            try {
                await sqliteStorage.saveEstimate(filename, data);
            } catch (err) {
                sqliteError = err;
            }

            expect(sqliteError).toBeDefined();

            // File данные должны остаться
            const fileData = await fileStorage.loadEstimate(filename);
            expect(fileData.id).toBe(data.id);

            // Восстанавливаем SQLite для других тестов
            await sqliteStorage.init();
        });

        test('should synchronize data between storages', async () => {
            // Генерируем уникальные ID
            const timestamp = Date.now();
            const files = [
                { filename: `sync1_${timestamp}.json`, data: { id: `sync1_${timestamp}`, services: [] } },
                { filename: `sync2_${timestamp}.json`, data: { id: `sync2_${timestamp}`, services: [] } }
            ];

            // Создаем данные только в File storage
            for (const file of files) {
                await fileStorage.saveEstimate(file.filename, file.data);
            }

            // Синхронизация: File → SQLite (только созданные файлы)
            for (const file of files) {
                const data = await fileStorage.loadEstimate(file.filename);
                await sqliteStorage.saveEstimate(file.filename, data);
            }

            // Проверяем что данные синхронны
            const sqliteList = await sqliteStorage.getEstimatesList();
            expect(sqliteList.length).toBeGreaterThanOrEqual(files.length);
        });
    });

    // ========================================================================
    // Rollback Scenario Tests
    // ========================================================================

    describe('Rollback Scenarios', () => {
        test('should rollback from SQLite to File storage', async () => {
            const filename = 'rollback_test.json';
            const originalData = {
                id: 'rollback-id',
                clientName: 'Original Data',
                services: []
            };

            // Сохранить в File (original)
            await fileStorage.saveEstimate(filename, originalData);

            // Обновить в SQLite
            const updatedData = { ...originalData, clientName: 'Updated in SQLite' };
            await sqliteStorage.saveEstimate(filename, updatedData);

            // Rollback: восстановить из File
            const fileData = await fileStorage.loadEstimate(filename);
            expect(fileData.clientName).toBe('Original Data');

            // В SQLite обновлённые данные
            const sqliteData = await sqliteStorage.loadEstimate(filename);
            expect(sqliteData.clientName).toBe('Updated in SQLite');
        });

        test('should validate data before migration', async () => {
            const filename = 'invalid_migration.json';

            // Тестируем валидацию - null данные должны упасть
            await expect(
                sqliteStorage.saveEstimate(filename, null)
            ).rejects.toThrow('Invalid data');

            // Тестируем валидацию - не-объект данные должны упасть
            await expect(
                sqliteStorage.saveEstimate(filename, 'not an object')
            ).rejects.toThrow('Invalid data');

            // Тестируем валидацию - undefined данные должны упасть
            await expect(
                sqliteStorage.saveEstimate(filename, undefined)
            ).rejects.toThrow('Invalid data');
        });
    });

    // ========================================================================
    // Performance Comparison Tests
    // ========================================================================

    describe('Performance Comparison', () => {
        test('should compare write performance', async () => {
            const testData = {
                id: 'perf-test',
                clientName: 'Performance Test',
                services: Array.from({ length: 50 }, (_, i) => ({
                    id: `service-${i}`,
                    name: `Service ${i}`,
                    price: 100
                }))
            };

            // File storage write
            const fileStart = Date.now();
            for (let i = 0; i < 20; i++) {
                await fileStorage.saveEstimate(`file_perf_${i}.json`, { ...testData, id: `id-${i}` });
            }
            const fileTime = Date.now() - fileStart;

            // SQLite storage write
            const sqliteStart = Date.now();
            for (let i = 0; i < 20; i++) {
                await sqliteStorage.saveEstimate(`sqlite_perf_${i}.json`, { ...testData, id: `sqlite-id-${i}` });
            }
            const sqliteTime = Date.now() - sqliteStart;

            console.log(`File write time: ${fileTime}ms`);
            console.log(`SQLite write time: ${sqliteTime}ms`);

            // SQLite обычно быстрее для множественных записей
            expect(sqliteTime).toBeLessThan(fileTime * 2); // В пределах 2x

            // Cleanup: удалить все созданные файлы
            for (let i = 0; i < 20; i++) {
                await fileStorage.deleteEstimate(`file_perf_${i}.json`).catch(() => {});
                await sqliteStorage.deleteEstimate(`sqlite_perf_${i}.json`).catch(() => {});
            }
        });

        test('should compare read performance', async () => {
            // Создаем 30 estimates
            for (let i = 0; i < 30; i++) {
                const data = { id: `read-perf-${i}`, clientName: `Client ${i}`, services: [] };
                await fileStorage.saveEstimate(`read_perf_${i}.json`, data);
                await sqliteStorage.saveEstimate(`read_perf_${i}.json`, data);
            }

            // File storage read
            const fileStart = Date.now();
            await fileStorage.getEstimatesList();
            const fileTime = Date.now() - fileStart;

            // SQLite storage read
            const sqliteStart = Date.now();
            await sqliteStorage.getEstimatesList();
            const sqliteTime = Date.now() - sqliteStart;

            console.log(`File read time: ${fileTime}ms`);
            console.log(`SQLite read time: ${sqliteTime}ms`);

            // Оба должны быть быстрыми
            expect(fileTime).toBeLessThan(1000);
            expect(sqliteTime).toBeLessThan(1000);

            // Cleanup: удалить все созданные файлы
            for (let i = 0; i < 30; i++) {
                await fileStorage.deleteEstimate(`read_perf_${i}.json`).catch(() => {});
                await sqliteStorage.deleteEstimate(`read_perf_${i}.json`).catch(() => {});
            }
        });
    });

    // ========================================================================
    // Edge Cases Tests
    // ========================================================================

    describe('Edge Cases', () => {
        test('should handle empty migration', async () => {
            // Explicit cleanup перед тестом - удаляем все файлы
            const existingFiles = await fileStorage.getEstimatesList();
            for (const item of existingFiles) {
                await fileStorage.deleteEstimate(item.filename).catch(() => {});
            }

            // Очистить SQLite
            if (sqliteStorage.db) {
                sqliteStorage.db.exec('DELETE FROM estimates');
            }

            // Теперь проверяем что пусто
            const fileList = await fileStorage.getEstimatesList();
            expect(fileList).toHaveLength(0);

            // Миграция пустого storage не должна падать
            for (const item of fileList) {
                const data = await fileStorage.loadEstimate(item.filename);
                await sqliteStorage.saveEstimate(item.filename, data);
            }

            const sqliteList = await sqliteStorage.getEstimatesList();
            expect(sqliteList).toHaveLength(0);
        });

        test('should handle very long filenames', async () => {
            const longName = 'a'.repeat(200);
            const filename = `${longName}.json`;
            const data = { id: 'long-name-test', services: [] };

            // File может иметь ограничение на длину имени
            try {
                await fileStorage.saveEstimate(filename, data);
                const fileData = await fileStorage.loadEstimate(filename);

                // Мигрировать в SQLite
                await sqliteStorage.saveEstimate(filename, fileData);
                const sqliteData = await sqliteStorage.loadEstimate(filename);

                expect(sqliteData.id).toBe(data.id);
            } catch (err) {
                // Некоторые ОС имеют ограничения на длину имени файла
                expect(err.message).toContain('ENAMETOOLONG');
            }
        });

        test('should handle concurrent migrations', async () => {
            // Создаем несколько estimates с уникальными ID
            const timestamp = Date.now();
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(
                    fileStorage.saveEstimate(`concurrent_${timestamp}_${i}.json`, {
                        id: `concurrent-id-${timestamp}-${i}`,
                        services: []
                    })
                );
            }
            await Promise.all(promises);

            // Параллельная миграция
            const fileList = await fileStorage.getEstimatesList();
            const concurrentFiles = fileList.filter(item => item.filename.startsWith(`concurrent_${timestamp}_`));
            const migrationPromises = concurrentFiles.map(async (item) => {
                const data = await fileStorage.loadEstimate(item.filename);
                // v3.0: SQLiteStorage uses ID-first API, ensure filename is preserved
                data.filename = item.filename;
                await sqliteStorage.saveEstimate(data.id, data);
            });

            await Promise.all(migrationPromises);

            // Проверить что все мигрировали
            const sqliteList = await sqliteStorage.getEstimatesList();
            const migratedFiles = sqliteList.filter(item => item.filename.startsWith(`concurrent_${timestamp}_`));
            expect(migratedFiles).toHaveLength(10);
        });
    });
});
