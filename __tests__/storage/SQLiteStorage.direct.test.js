/**
 * SQLite Direct Database Access Tests
 *
 * These tests access the database directly using SQL queries
 * to verify data integrity, constraints, and edge cases
 * that might not be caught by higher-level API tests.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const SQLiteStorage = require('../../storage/SQLiteStorage');
const { createTestDatabase, cleanupTestDatabase } = require('../helpers/db-setup');

describe('SQLite Direct Database Tests', () => {
    let db;
    let storage;
    const testDbPath = path.join(__dirname, '../../db/test-direct-access.db');
    const testUserId = 'user-direct-test';
    const testOrgId = 'org-direct-test';

    beforeAll(async () => {
        // Создаем тестовую БД с v3.0 schema + migrations
        createTestDatabase(testDbPath);

        // Initialize storage with multi-tenancy support
        storage = new SQLiteStorage({
            dbPath: testDbPath,
            userId: testUserId,
            organizationId: testOrgId
        });
        await storage.init();

        // Get direct database access
        db = storage.db;
    });

    afterAll(async () => {
        await storage.close();
        cleanupTestDatabase(testDbPath);
    });

    afterEach(() => {
        // Clean up between tests
        db.prepare('DELETE FROM estimates').run();
        db.prepare('DELETE FROM backups').run();
        db.prepare('DELETE FROM catalogs').run();
        db.prepare('DELETE FROM audit_logs').run();
    });

    // ========================================================================
    // Helper Functions
    // ========================================================================

    /**
     * Helper function to insert estimate with all required fields (v3.0 multi-tenancy)
     */
    function insertEstimate(id, filename, data, dataVersion = 1) {
        const now = Math.floor(Date.now() / 1000);
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

        db.prepare(`
            INSERT INTO estimates (id, filename, data, data_version, owner_id, organization_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, filename, dataStr, dataVersion, testUserId, testOrgId, now, now);

        return { id, filename, data: dataStr, dataVersion, now };
    }

    /**
     * Helper function to insert backup with all required fields (v3.0 multi-tenancy)
     * Note: id parameter is ignored, backups table uses INTEGER AUTOINCREMENT
     */
    function insertBackup(id, estimateId, data) {
        const now = Math.floor(Date.now() / 1000);
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

        // Note: Don't specify id - it's INTEGER AUTOINCREMENT
        const result = db.prepare(`
            INSERT INTO backups (estimate_id, data, organization_id, created_at)
            VALUES (?, ?, ?, ?)
        `).run(estimateId, dataStr, testOrgId, now);

        return { id: result.lastInsertRowid, estimateId, data: dataStr, now };
    }

    // ========================================================================
    // Schema Verification Tests
    // ========================================================================

    describe('Schema Verification', () => {
        test('should have all required tables', () => {
            const tables = db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).all();

            const tableNames = tables.map(t => t.name);
            expect(tableNames).toContain('estimates');
            expect(tableNames).toContain('backups');
            expect(tableNames).toContain('catalogs');
            expect(tableNames).toContain('settings');
            expect(tableNames).toContain('audit_logs');
        });

        test('estimates table should have correct columns', () => {
            const columns = db.pragma('table_info(estimates)');
            const columnNames = columns.map(c => c.name);

            expect(columnNames).toContain('id');
            expect(columnNames).toContain('filename');
            expect(columnNames).toContain('data');
            expect(columnNames).toContain('data_version');
            expect(columnNames).toContain('owner_id');           // v3.0 multi-tenancy
            expect(columnNames).toContain('organization_id');    // v3.0 multi-tenancy
            expect(columnNames).toContain('created_at');
            expect(columnNames).toContain('updated_at');
            expect(columnNames).toContain('deleted_at');
        });

        test('should have indexes on key columns', () => {
            const indexes = db.prepare(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='estimates'"
            ).all();

            const indexNames = indexes.map(i => i.name);
            expect(indexNames.some(n => n.includes('filename'))).toBe(true);
        });

        test('should have foreign key constraints enabled', () => {
            const fkEnabled = db.pragma('foreign_keys');
            expect(fkEnabled[0].foreign_keys).toBe(1);
        });
    });

    // ========================================================================
    // Data Integrity Tests
    // ========================================================================

    describe('Data Integrity', () => {
        test('should enforce UNIQUE constraint on estimate id', () => {
            const testData = { id: 'test123', version: '1.1.0', clientName: 'Test' };

            // First insert should succeed
            insertEstimate('test123', 'test1.json', testData, 1);

            // Second insert with same ID should fail
            expect(() => {
                insertEstimate('test123', 'test2.json', testData, 1);
            }).toThrow(/UNIQUE constraint failed/);
        });

        test('should allow backups without FK constraint', () => {
            // Note: We removed FK constraint to allow orphaned backups
            const backup = { id: 'backup123', clientName: 'Test' };

            // This should now succeed (no FK constraint)
            expect(() => {
                insertBackup('backup123', 'nonexistent', backup);
            }).not.toThrow();
        });

        test('should allow NULL in optional columns', () => {
            const testData = { id: 'test456', version: '1.1.0' };

            expect(() => {
                insertEstimate('test456', 'test.json', testData, 1);
            }).not.toThrow();

            const row = db.prepare('SELECT * FROM estimates WHERE id = ?').get('test456');
            expect(row.deleted_at).toBeNull();
        });

        test('should validate JSON data', () => {
            // v3.0: Use helper functions
            expect(() => {
                insertEstimate('test789', 'test.json', { id: 'test789', version: '1.1.0' }, 1);
            }).not.toThrow();

            // SQLite doesn't validate JSON syntax at insert, but json_extract may throw error
            // For invalid JSON, need to use direct INSERT to bypass helper's JSON.stringify
            const now = Math.floor(Date.now() / 1000);
            const invalidJson = 'not valid json {]';

            db.prepare(`
                INSERT INTO estimates (id, filename, data, data_version, owner_id, organization_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run('testbad', 'testbad.json', invalidJson, 1, testUserId, testOrgId, now, now);

            // Modern SQLite throws error on malformed JSON instead of returning NULL
            expect(() => {
                db.prepare(`
                    SELECT json_extract(data, '$.id') as extracted_id FROM estimates WHERE id = ?
                `).get('testbad');
            }).toThrow(/malformed JSON/);
        });
    });

    // ========================================================================
    // JSON Extraction Tests
    // ========================================================================

    describe('JSON Data Extraction', () => {
        beforeEach(() => {
            const testData = {
                id: 'extract123',
                version: '1.1.0',
                clientName: 'John Doe',
                paxCount: 5,
                services: [
                    { id: 'svc1', name: 'Service 1', price: 100 },
                    { id: 'svc2', name: 'Service 2', price: 200 }
                ]
            };

            // v3.0: Use helper function which includes all required fields
            insertEstimate('extract123', 'extract.json', testData, 1);
        });

        test('should extract simple fields', () => {
            const result = db.prepare(`
                SELECT
                    json_extract(data, '$.clientName') as clientName,
                    json_extract(data, '$.paxCount') as paxCount
                FROM estimates WHERE id = ?
            `).get('extract123');

            expect(result.clientName).toBe('John Doe');
            expect(result.paxCount).toBe(5);
        });

        test('should extract array data', () => {
            const result = db.prepare(`
                SELECT json_extract(data, '$.services') as services
                FROM estimates WHERE id = ?
            `).get('extract123');

            const services = JSON.parse(result.services);
            expect(services).toHaveLength(2);
            expect(services[0].name).toBe('Service 1');
        });

        test('should use json_extract in WHERE clauses', () => {
            const result = db.prepare(`
                SELECT COUNT(*) as count
                FROM estimates
                WHERE json_extract(data, '$.paxCount') > 3
            `).get();

            expect(result.count).toBe(1);
        });

        test('should handle nested JSON paths', () => {
            const result = db.prepare(`
                SELECT json_extract(data, '$.services[0].price') as firstPrice
                FROM estimates WHERE id = ?
            `).get('extract123');

            expect(result.firstPrice).toBe(100);
        });
    });

    // ========================================================================
    // Optimistic Locking Tests
    // ========================================================================

    describe('Optimistic Locking', () => {
        test('should increment data_version on update', () => {
            const testData = { id: 'version123', version: '1.1.0', clientName: 'Test' };

            // v3.0: Use helper function
            insertEstimate('version123', 'version.json', testData, 1);

            const v1 = db.prepare('SELECT data_version FROM estimates WHERE id = ? AND organization_id = ?').get('version123', testOrgId);
            expect(v1.data_version).toBe(1);

            testData.clientName = 'Updated';
            db.prepare(`
                UPDATE estimates
                SET data = ?, data_version = data_version + 1, updated_at = strftime('%s', 'now')
                WHERE id = ? AND organization_id = ?
            `).run(JSON.stringify(testData), 'version123', testOrgId);

            const v2 = db.prepare('SELECT data_version FROM estimates WHERE id = ? AND organization_id = ?').get('version123', testOrgId);
            expect(v2.data_version).toBe(2);
        });

        test('should detect concurrent modifications', () => {
            const testData = { id: 'concurrent123', version: '1.1.0', clientName: 'Test' };

            // v3.0: Use helper function
            insertEstimate('concurrent123', 'concurrent.json', testData, 1);

            // Simulate two concurrent updates with version check
            const currentVersion = 1;

            // First update succeeds
            const result1 = db.prepare(`
                UPDATE estimates
                SET data = ?, data_version = data_version + 1
                WHERE id = ? AND organization_id = ? AND data_version = ?
            `).run(JSON.stringify({ ...testData, clientName: 'Update1' }), 'concurrent123', testOrgId, currentVersion);

            expect(result1.changes).toBe(1);

            // Second update with same version fails
            const result2 = db.prepare(`
                UPDATE estimates
                SET data = ?, data_version = data_version + 1
                WHERE id = ? AND organization_id = ? AND data_version = ?
            `).run(JSON.stringify({ ...testData, clientName: 'Update2' }), 'concurrent123', testOrgId, currentVersion);

            expect(result2.changes).toBe(0); // No rows updated
        });
    });

    // ========================================================================
    // Soft Delete Tests
    // ========================================================================

    describe('Soft Delete', () => {
        test('should set deleted_at timestamp on soft delete', () => {
            const testData = { id: 'delete123', version: '1.1.0', clientName: 'Test' };

            // v3.0: Use helper function
            insertEstimate('delete123', 'delete.json', testData, 1);

            const now = Math.floor(Date.now() / 1000);
            db.prepare(`
                UPDATE estimates
                SET deleted_at = ?
                WHERE id = ? AND organization_id = ?
            `).run(now, 'delete123', testOrgId);

            const row = db.prepare('SELECT deleted_at FROM estimates WHERE id = ? AND organization_id = ?').get('delete123', testOrgId);
            expect(row.deleted_at).not.toBeNull();
            expect(row.deleted_at).toBeGreaterThan(0);
        });

        test('should exclude soft-deleted records from normal queries', () => {
            const testData1 = { id: 'active1', version: '1.1.0', clientName: 'Active' };
            const testData2 = { id: 'deleted1', version: '1.1.0', clientName: 'Deleted' };

            // v3.0: Use helper function
            insertEstimate('active1', 'active.json', testData1, 1);

            // Insert with deleted_at set
            const now = Math.floor(Date.now() / 1000);
            db.prepare(`
                INSERT INTO estimates (id, filename, data, data_version, owner_id, organization_id, created_at, updated_at, deleted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run('deleted1', 'deleted.json', JSON.stringify(testData2), 1, testUserId, testOrgId, now, now, now);

            const activeCount = db.prepare(`
                SELECT COUNT(*) as count FROM estimates WHERE organization_id = ? AND deleted_at IS NULL
            `).get(testOrgId);

            expect(activeCount.count).toBe(1);
        });
    });

    // ========================================================================
    // Transaction Tests
    // ========================================================================

    describe('Transactions', () => {
        test('should rollback on error', () => {
            const testData = { id: 'trans123', version: '1.1.0', clientName: 'Test' };

            expect(() => {
                const transaction = db.transaction(() => {
                    db.prepare(`
                        INSERT INTO estimates (id, filename, data, data_version)
                        VALUES (?, ?, ?, ?)
                    `).run('trans123', 'trans.json', JSON.stringify(testData), 1);

                    // This will fail due to duplicate ID
                    db.prepare(`
                        INSERT INTO estimates (id, filename, data, data_version)
                        VALUES (?, ?, ?, ?)
                    `).run('trans123', 'trans2.json', JSON.stringify(testData), 1);
                });

                transaction();
            }).toThrow();

            // Verify rollback - no records should exist
            const count = db.prepare('SELECT COUNT(*) as count FROM estimates WHERE id = ?').get('trans123');
            expect(count.count).toBe(0);
        });

        test('should commit successful transaction', () => {
            const estimate = { id: 'trans456', version: '1.1.0', clientName: 'Test' };
            const backup = { id: 'trans456', clientName: 'Test' };

            const transaction = db.transaction(() => {
                // v3.0: Use helper functions
                insertEstimate('trans456', 'trans.json', estimate, 1);
                insertBackup('backup456', 'trans456', backup);
            });

            transaction();

            const estimateExists = db.prepare('SELECT COUNT(*) as count FROM estimates WHERE id = ? AND organization_id = ?').get('trans456', testOrgId);
            const backupExists = db.prepare('SELECT COUNT(*) as count FROM backups WHERE estimate_id = ? AND organization_id = ?').get('trans456', testOrgId);

            expect(estimateExists.count).toBe(1);
            expect(backupExists.count).toBe(1);
        });
    });

    // ========================================================================
    // Performance Tests
    // ========================================================================

    describe('Performance', () => {
        test('should handle bulk inserts efficiently', () => {
            const startTime = Date.now();
            const insertCount = 100;
            const now = Math.floor(Date.now() / 1000);

            const transaction = db.transaction(() => {
                const stmt = db.prepare(`
                    INSERT INTO estimates (id, filename, data, data_version, owner_id, organization_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (let i = 0; i < insertCount; i++) {
                    const data = {
                        id: `bulk${i}`,
                        version: '1.1.0',
                        clientName: `Client ${i}`,
                        services: Array.from({ length: 10 }, (_, j) => ({
                            id: `svc${j}`,
                            name: `Service ${j}`,
                            price: 100
                        }))
                    };

                    stmt.run(`bulk${i}`, `bulk${i}.json`, JSON.stringify(data), 1, testUserId, testOrgId, now, now);
                }
            });

            transaction();

            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(1000); // Should complete in under 1 second

            const count = db.prepare('SELECT COUNT(*) as count FROM estimates WHERE organization_id = ?').get(testOrgId);
            expect(count.count).toBe(insertCount);
        });

        test('should use indexes for queries', () => {
            const now = Math.floor(Date.now() / 1000);
            // Insert test data
            for (let i = 0; i < 50; i++) {
                const data = { id: `perf${i}`, version: '1.1.0', clientName: `Client ${i}` };
                db.prepare(`
                    INSERT INTO estimates (id, filename, data, data_version, owner_id, organization_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(`perf${i}`, `perf${i}.json`, JSON.stringify(data), 1, testUserId, testOrgId, now, now);
            }

            // Query by filename (indexed)
            const startTime = Date.now();
            const result = db.prepare('SELECT * FROM estimates WHERE filename = ? AND organization_id = ?').get('perf25.json', testOrgId);
            const duration = Date.now() - startTime;

            expect(result).toBeDefined();
            expect(duration).toBeLessThan(10); // Should be nearly instant with index
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('Edge Cases', () => {
        test('should handle empty JSON objects', () => {
            // v3.0: Use helper function with empty object
            expect(() => {
                insertEstimate('empty1', 'empty.json', {}, 1);
            }).not.toThrow();
        });

        test('should handle very large JSON data', () => {
            const largeData = {
                id: 'large1',
                version: '1.1.0',
                services: Array.from({ length: 1000 }, (_, i) => ({
                    id: `svc${i}`,
                    name: `Service ${i}`.repeat(10), // Make it larger
                    description: 'A'.repeat(500), // 500 characters
                    price: i * 10
                }))
            };

            const jsonStr = JSON.stringify(largeData);
            expect(jsonStr.length).toBeGreaterThan(100000); // Over 100KB

            // v3.0: Use helper function
            expect(() => {
                insertEstimate('large1', 'large.json', largeData, 1);
            }).not.toThrow();

            const retrieved = db.prepare('SELECT data FROM estimates WHERE id = ? AND organization_id = ?').get('large1', testOrgId);
            const parsed = JSON.parse(retrieved.data);
            expect(parsed.services).toHaveLength(1000);
        });

        test('should handle special characters in filenames', () => {
            const testData = { id: 'special1', version: '1.1.0' };
            const specialFilename = "test 'quote' & \"double\" (parens) [brackets] {braces}.json";

            // v3.0: Use helper function
            expect(() => {
                insertEstimate('special1', specialFilename, testData, 1);
            }).not.toThrow();

            const result = db.prepare('SELECT filename FROM estimates WHERE id = ? AND organization_id = ?').get('special1', testOrgId);
            expect(result.filename).toBe(specialFilename);
        });

        test('should handle Unicode characters', () => {
            const testData = {
                id: 'unicode1',
                version: '1.1.0',
                clientName: 'Дмитрий Иванов',
                description: '中文测试 🎉 émojis'
            };

            // v3.0: Use helper function
            insertEstimate('unicode1', 'unicode.json', testData, 1);

            const result = db.prepare(`
                SELECT json_extract(data, '$.clientName') as clientName
                FROM estimates WHERE id = ? AND organization_id = ?
            `).get('unicode1', testOrgId);

            expect(result.clientName).toBe('Дмитрий Иванов');
        });

        test('should handle NULL values in JSON', () => {
            const testData = {
                id: 'nulltest1',
                version: '1.1.0',
                clientName: null,
                optionalField: null
            };

            // v3.0: Use helper function
            insertEstimate('nulltest1', 'null.json', testData, 1);

            const result = db.prepare(`
                SELECT json_extract(data, '$.clientName') as clientName
                FROM estimates WHERE id = ? AND organization_id = ?
            `).get('nulltest1', testOrgId);

            expect(result.clientName).toBeNull();
        });
    });

    // ========================================================================
    // Audit Log Tests
    // ========================================================================

    describe('Audit Logs', () => {
        // TODO: Audit logging not yet implemented in SQLiteStorage v3.0
        // These tests verify the audit_logs table structure but skip functionality tests

        test.skip('should record estimate creation in audit log', async () => {
            const testData = { id: 'audit123', version: '1.1.0', clientName: 'Test' };

            // v3.0: ID-first API
            await storage.saveEstimate('audit123', testData);

            const logs = db.prepare(`
                SELECT * FROM audit_logs
                WHERE entity_type = 'estimate' AND entity_id = ?
            `).all('audit123');

            expect(logs.length).toBeGreaterThan(0);
            expect(logs[0].action).toBe('create');
        });

        test.skip('should record estimate updates in audit log', async () => {
            const testData = { id: 'audit456', version: '1.1.0', clientName: 'Original' };

            // v3.0: ID-first API
            await storage.saveEstimate('audit456', testData);

            testData.clientName = 'Updated';
            await storage.saveEstimate('audit456', testData);

            const logs = db.prepare(`
                SELECT * FROM audit_logs
                WHERE entity_type = 'estimate' AND entity_id = ?
                ORDER BY created_at
            `).all('audit456');

            expect(logs.length).toBeGreaterThanOrEqual(2);
            expect(logs[0].action).toBe('create');
            expect(logs[1].action).toBe('update');
        });
    });
});
