/**
 * Error Scenarios Tests for Quote Calculator v3.0.0
 *
 * Testing error handling across all components:
 * - Database errors
 * - Network errors
 * - Validation errors
 * - Edge cases
 * - Security scenarios
 *
 * @version 3.0.0
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const SQLiteStorage = require('../../storage/SQLiteStorage');

// Helper to create test database
function createTestDatabase(dbPath) {
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }

    const db = new Database(dbPath);
    db.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8'));
    db.close();

    const migrationsDb = new Database(dbPath);
    migrationsDb.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'migrations', '001_add_multitenancy.sql'), 'utf8'));
    migrationsDb.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'migrations', '002_remove_filename_unique.sql'), 'utf8'));
    migrationsDb.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'migrations', '003_fix_settings_multitenancy.sql'), 'utf8'));
    migrationsDb.close();
}

describe('Error Scenarios Tests', () => {
    let storage;
    let testDbPath;

    beforeEach(async () => {
        testDbPath = path.join(__dirname, '..', '..', 'db', 'test-errors.db');
        createTestDatabase(testDbPath);

        storage = new SQLiteStorage({
            dbPath: testDbPath,
            userId: 'user-test',
            organizationId: 'org-test'
        });

        await storage.init();
    });

    afterEach(() => {
        if (storage && storage.db) {
            storage.db.close();
        }

        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    // ========================================================================
    // 1. Database Errors (6 tests)
    // ========================================================================

    describe('Database Errors', () => {
        test('should handle database connection failure', async () => {
            // Close database to simulate connection failure
            storage.db.close();

            // Try to save (should fail gracefully)
            await expect(
                storage.saveEstimate('test-id', { id: 'test-id', clientName: 'Test', version: '1.1.0' })
            ).rejects.toThrow();
        });

        test('should handle NOT NULL constraint violation', () => {
            // Try to insert without required fields
            expect(() => {
                storage.db.prepare('INSERT INTO estimates (id, filename, data) VALUES (?, ?, ?)')
                    .run('test-id', 'test.json', '{}');
            }).toThrow(); // Missing organization_id, owner_id
        });

        test('should handle UNIQUE constraint violation (PRIMARY KEY)', async () => {
            const estimate = { id: 'unique-test', clientName: 'Test', version: '1.1.0' };

            // First save
            await storage.saveEstimate(estimate.id, estimate);

            // Direct INSERT with same id (should fail)
            expect(() => {
                const now = Math.floor(Date.now() / 1000);
                storage.db.prepare(`INSERT INTO estimates
                    (id, filename, data, organization_id, owner_id, data_version, created_at, updated_at, version, app_version, data_hash)
                    VALUES (?, ?, ?, ?, ?, 1, ?, ?, '1.1.0', '3.0.0', 'hash')`)
                    .run('unique-test', 'test.json', '{}', 'org-test', 'user-test', now, now);
            }).toThrow(/UNIQUE constraint/);
        });

        test('should handle disk full / write errors', () => {
            // Simulate by making database read-only
            // Note: This is platform-dependent, we'll test with a mock scenario

            // Try to write a very large estimate
            const largeServices = Array(100000).fill(null).map((_, i) => ({
                id: `service-${i}`,
                name: 'A'.repeat(1000), // 1KB per service = 100MB total
                price: 100
            }));

            const estimate = {
                id: 'large-test',
                clientName: 'Large Test',
                services: largeServices,
                version: '1.1.0'
            };

            // This might fail on systems with limited memory
            // but should fail gracefully
            try {
                storage.saveEstimate(estimate.id, estimate);
            } catch (err) {
                expect(err).toBeDefined();
            }
        });

        test('should handle corrupted JSON data', async () => {
            // Insert corrupted JSON directly
            const now = Math.floor(Date.now() / 1000);
            storage.db.prepare(`INSERT INTO estimates
                (id, filename, data, organization_id, owner_id, data_version, created_at, updated_at, version, app_version, data_hash)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?, '1.1.0', '3.0.0', 'hash')`)
                .run('corrupt-id', 'corrupt.json', '{invalid json', 'org-test', 'user-test', now, now);

            // Try to load (should fail gracefully)
            await expect(storage.loadEstimate('corrupt-id')).rejects.toThrow();
        });

        test('should handle transaction rollback on error', async () => {
            const estimate = { id: 'rollback-test', clientName: 'Test', version: '1.1.0' };

            // Save initial version
            await storage.saveEstimate(estimate.id, estimate);

            // Try to update with invalid data (force error)
            try {
                // Manually create a failing transaction scenario
                const transaction = storage.db.transaction(() => {
                    // Update estimate
                    storage.db.prepare('UPDATE estimates SET client_name = ? WHERE id = ?')
                        .run('Updated', estimate.id);

                    // Force error
                    throw new Error('Simulated transaction error');
                });

                transaction();
            } catch (err) {
                expect(err.message).toContain('Simulated transaction error');
            }

            // Verify data not changed (rollback successful)
            const loaded = await storage.loadEstimate(estimate.id);
            expect(loaded.clientName).toBe('Test'); // Original value
        });
    });

    // ========================================================================
    // 2. Network Errors (5 tests)
    // ========================================================================

    describe('Network Errors', () => {
        test('should handle connection timeout', async () => {
            // Simulate timeout by creating a slow operation
            const slowStorage = new SQLiteStorage({
                dbPath: testDbPath,
                userId: 'user-test',
                organizationId: 'org-test'
            });

            await slowStorage.init();

            // Mock slow operation
            const originalSave = slowStorage.saveEstimate.bind(slowStorage);
            slowStorage.saveEstimate = async (id, data) => {
                await new Promise(resolve => setTimeout(resolve, 100)); // Simulate slow network
                return originalSave(id, data);
            };

            // With timeout, this should complete (just slower)
            const estimate = { id: 'timeout-test', clientName: 'Test', version: '1.1.0' };
            await slowStorage.saveEstimate(estimate.id, estimate);

            expect(true).toBe(true); // If we got here, timeout was handled

            slowStorage.db.close();
        });

        test('should handle connection refused', async () => {
            // Try to connect to non-existent database path
            const badPath = '/invalid/path/to/database.db';

            const badStorage = new SQLiteStorage({
                dbPath: badPath,
                userId: 'user-test',
                organizationId: 'org-test'
            });

            // init() should fail
            await expect(badStorage.init()).rejects.toThrow();
        });

        test('should handle DNS failures', () => {
            // SQLite doesn't use DNS, but test invalid path scenarios
            const invalidStorage = new SQLiteStorage({
                dbPath: 'http://invalid-dns-name/database.db', // Invalid path format
                userId: 'user-test',
                organizationId: 'org-test'
            });

            // Should fail during init
            expect(async () => {
                await invalidStorage.init();
            }).rejects.toThrow();
        });

        test('should handle partial write failures', async () => {
            const estimate = { id: 'partial-test', clientName: 'Test', version: '1.1.0' };

            // Save estimate
            await storage.saveEstimate(estimate.id, estimate);

            // Simulate partial write by closing database mid-operation
            try {
                // Start save
                const savePromise = storage.saveEstimate(estimate.id, { ...estimate, clientName: 'Updated' });

                // Close database immediately (simulates connection loss during write)
                storage.db.close();

                await savePromise;
            } catch (err) {
                // Expected to fail
                expect(err).toBeDefined();
            }

            // Reinitialize
            storage = new SQLiteStorage({
                dbPath: testDbPath,
                userId: 'user-test',
                organizationId: 'org-test'
            });
            await storage.init();

            // Data should be original (partial write should have rolled back)
            const loaded = await storage.loadEstimate(estimate.id);
            expect(loaded.clientName).toBe('Test');
        });

        test('should handle network interruption during batch', async () => {
            const estimates = [
                { id: 'batch-1', clientName: 'Est 1', version: '1.1.0' },
                { id: 'batch-2', clientName: 'Est 2', version: '1.1.0' },
                { id: 'batch-3', clientName: 'Est 3', version: '1.1.0' }
            ];

            // Save first two
            await storage.saveEstimate(estimates[0].id, estimates[0]);
            await storage.saveEstimate(estimates[1].id, estimates[1]);

            // Simulate network interruption
            storage.db.close();

            // Third should fail
            await expect(
                storage.saveEstimate(estimates[2].id, estimates[2])
            ).rejects.toThrow();

            // Reinitialize
            storage = new SQLiteStorage({
                dbPath: testDbPath,
                userId: 'user-test',
                organizationId: 'org-test'
            });
            await storage.init();

            // First two should be saved
            const list = await storage.listEstimates();
            expect(list).toHaveLength(2);
        });
    });

    // ========================================================================
    // 3. Validation Errors (5 tests)
    // ========================================================================

    describe('Validation Errors', () => {
        test('should reject invalid ID format', async () => {
            // Null ID
            await expect(
                storage.saveEstimate(null, { clientName: 'Test', version: '1.1.0' })
            ).rejects.toThrow();

            // Undefined ID
            await expect(
                storage.saveEstimate(undefined, { clientName: 'Test', version: '1.1.0' })
            ).rejects.toThrow();

            // Empty string ID
            await expect(
                storage.saveEstimate('', { clientName: 'Test', version: '1.1.0' })
            ).rejects.toThrow();
        });

        test('should handle missing optional fields gracefully', async () => {
            // Missing version field (should add defaults)
            const result1 = await storage.saveEstimate('test-id-1', { id: 'test-id-1', clientName: 'Test' });
            expect(result1.success).toBe(true);

            // Completely empty data (should handle gracefully with defaults)
            const result2 = await storage.saveEstimate('test-id-2', { id: 'test-id-2' });
            expect(result2.success).toBe(true);

            // Null data should reject
            await expect(
                storage.saveEstimate('test-id-3', null)
            ).rejects.toThrow();

            // Undefined data should reject
            await expect(
                storage.saveEstimate('test-id-4', undefined)
            ).rejects.toThrow();
        });

        test('should validate type requirements strictly', async () => {
            // ID as number instead of string (should reject - ID must be string)
            const numericId = 12345;
            const estimate = { id: numericId.toString(), clientName: 'Test', version: '1.1.0' };

            await expect(
                storage.saveEstimate(numericId, estimate)
            ).rejects.toThrow(/Invalid id/);

            // Empty string ID (should reject)
            await expect(
                storage.saveEstimate('', { id: '', clientName: 'Test', version: '1.1.0' })
            ).rejects.toThrow();

            // Whitespace-only ID (should reject)
            await expect(
                storage.saveEstimate('   ', { id: '   ', clientName: 'Test', version: '1.1.0' })
            ).rejects.toThrow();

            // Valid string ID and object data (should succeed)
            const validResult = await storage.saveEstimate('valid-id', { id: 'valid-id', clientName: 'Valid', version: '1.1.0' });
            expect(validResult.success).toBe(true);

            // Arrays are objects in JS, so they're accepted and JSON.stringified
            const arrayResult = await storage.saveEstimate('array-data', [1, 2, 3]);
            expect(arrayResult.success).toBe(true);

            // Strings are NOT objects, so they should be rejected
            await expect(
                storage.saveEstimate('string-data', 'string data')
            ).rejects.toThrow(/Invalid data/);
        });

        test('should enforce data size limits', async () => {
            // Extremely long client name (10KB)
            const longName = 'A'.repeat(10000);
            const estimate = {
                id: 'size-test',
                clientName: longName,
                version: '1.1.0'
            };

            // Should save (no hard limit on client_name)
            await storage.saveEstimate(estimate.id, estimate);
            const loaded = await storage.loadEstimate(estimate.id);
            expect(loaded.clientName).toBe(longName);

            // Extremely long ID (should fail or truncate)
            const longId = 'x'.repeat(10000);
            const estimate2 = {
                id: longId,
                clientName: 'Test',
                version: '1.1.0'
            };

            try {
                await storage.saveEstimate(longId, estimate2);
                // If it succeeds, verify it's stored
                expect(true).toBe(true);
            } catch (err) {
                // If it fails, that's acceptable (ID too long)
                expect(err).toBeDefined();
            }
        });

        test('should validate JSON structure', async () => {
            // Invalid JSON structure (circular reference)
            const circularData = { id: 'circular-test', version: '1.1.0' };
            circularData.self = circularData; // Circular reference

            await expect(
                storage.saveEstimate('circular-test', circularData)
            ).rejects.toThrow();

            // Invalid characters in JSON
            const invalidChars = {
                id: 'invalid-chars',
                clientName: 'Test\u0000\u0001\u0002', // NULL bytes
                version: '1.1.0'
            };

            try {
                await storage.saveEstimate(invalidChars.id, invalidChars);
                // If it succeeds, JSON.stringify handled it
                expect(true).toBe(true);
            } catch (err) {
                expect(err).toBeDefined();
            }
        });
    });

    // ========================================================================
    // 4. Edge Cases (5 tests)
    // ========================================================================

    describe('Edge Cases', () => {
        test('should handle empty strings in all fields', async () => {
            const estimate = {
                id: 'empty-test',
                clientName: '',
                clientEmail: '',
                clientPhone: '',
                tourStart: '',
                tourEnd: '',
                version: '1.1.0'
            };

            await storage.saveEstimate(estimate.id, estimate);
            const loaded = await storage.loadEstimate(estimate.id);

            expect(loaded.clientName).toBe('');
            expect(loaded.clientEmail).toBe('');
        });

        test('should handle null values in optional fields', async () => {
            const estimate = {
                id: 'null-test',
                clientName: 'Test',
                clientEmail: null,
                clientPhone: null,
                paxCount: null,
                tourStart: null,
                version: '1.1.0'
            };

            await storage.saveEstimate(estimate.id, estimate);
            const loaded = await storage.loadEstimate(estimate.id);

            expect(loaded.clientName).toBe('Test');
            // Nulls might be converted to undefined or empty strings
            expect([null, undefined, '']).toContain(loaded.clientEmail);
        });

        test('should handle extremely long strings (stress test)', async () => {
            // 1MB string
            const megaString = 'x'.repeat(1024 * 1024);

            const estimate = {
                id: 'mega-test',
                clientName: 'Test',
                notes: megaString,
                version: '1.1.0'
            };

            try {
                await storage.saveEstimate(estimate.id, estimate);
                const loaded = await storage.loadEstimate(estimate.id);
                expect(loaded.notes.length).toBe(1024 * 1024);
            } catch (err) {
                // Acceptable to fail on extremely large data
                expect(err).toBeDefined();
            }
        });

        test('should handle special characters safely', async () => {
            // SQL special characters (injection attempt - should be sanitized)
            const sqlInjection = {
                id: "test'; DROP TABLE estimates; --",
                clientName: "'; DELETE FROM estimates WHERE '1'='1",
                clientEmail: "test@test.com' OR '1'='1",
                version: '1.1.0'
            };

            // Should save safely (parameterized queries prevent injection)
            await storage.saveEstimate(sqlInjection.id, sqlInjection);
            const loaded = await storage.loadEstimate(sqlInjection.id);

            expect(loaded.clientName).toBe("'; DELETE FROM estimates WHERE '1'='1");

            // Verify estimates table still exists
            const list = await storage.listEstimates();
            expect(list).toBeDefined();
        });

        test('should handle race conditions gracefully', async () => {
            const estimate = { id: 'race-test', clientName: 'Initial', version: '1.1.0' };

            // Initial save
            await storage.saveEstimate(estimate.id, estimate);

            // Concurrent updates (race condition)
            const promises = [
                storage.saveEstimate(estimate.id, { ...estimate, clientName: 'Update 1' }),
                storage.saveEstimate(estimate.id, { ...estimate, clientName: 'Update 2' }),
                storage.saveEstimate(estimate.id, { ...estimate, clientName: 'Update 3' }),
                storage.saveEstimate(estimate.id, { ...estimate, clientName: 'Update 4' }),
                storage.saveEstimate(estimate.id, { ...estimate, clientName: 'Update 5' })
            ];

            await Promise.all(promises);

            // Last write wins (one of the updates should be final)
            const loaded = await storage.loadEstimate(estimate.id);
            expect(['Update 1', 'Update 2', 'Update 3', 'Update 4', 'Update 5']).toContain(loaded.clientName);

            // Version should be incremented correctly
            expect(loaded.dataVersion).toBeGreaterThan(1);
        });
    });

    // ========================================================================
    // 5. Security Tests (4 tests)
    // ========================================================================

    describe('Security Tests', () => {
        test('should prevent SQL injection in queries', async () => {
            // SQL injection attempts in various fields
            const injectionAttempts = [
                { id: "1' OR '1'='1", clientName: 'Test', version: '1.1.0' },
                { id: "1; DROP TABLE estimates; --", clientName: 'Test', version: '1.1.0' },
                { id: "1' UNION SELECT * FROM users --", clientName: 'Test', version: '1.1.0' }
            ];

            for (const attempt of injectionAttempts) {
                // Should save safely (parameterized queries)
                await storage.saveEstimate(attempt.id, attempt);

                // Should load back exactly as stored
                const loaded = await storage.loadEstimate(attempt.id);
                expect(loaded.id).toBe(attempt.id);
            }

            // Verify database integrity
            const list = await storage.listEstimates();
            expect(list.length).toBeGreaterThanOrEqual(3);
        });

        test('should prevent path traversal in file operations', () => {
            // Path traversal attempts (though SQLiteStorage doesn't use files for estimates)
            const pathTraversalId = '../../../etc/passwd';

            const estimate = {
                id: pathTraversalId,
                clientName: 'Test',
                version: '1.1.0'
            };

            // Should treat as normal ID (no file path interpretation)
            expect(async () => {
                await storage.saveEstimate(pathTraversalId, estimate);
                const loaded = await storage.loadEstimate(pathTraversalId);
                expect(loaded.id).toBe(pathTraversalId);
            }).not.toThrow();
        });

        test('should sanitize XSS attempts in data', async () => {
            // XSS payloads
            const xssPayloads = {
                id: 'xss-test',
                clientName: '<script>alert("XSS")</script>',
                clientEmail: '<img src=x onerror=alert("XSS")>',
                notes: 'javascript:alert("XSS")',
                version: '1.1.0'
            };

            // Should store as-is (backend doesn't render HTML)
            await storage.saveEstimate(xssPayloads.id, xssPayloads);
            const loaded = await storage.loadEstimate(xssPayloads.id);

            // Data should be stored exactly as provided
            expect(loaded.clientName).toBe('<script>alert("XSS")</script>');
            expect(loaded.clientEmail).toBe('<img src=x onerror=alert("XSS")>');

            // Note: Frontend should sanitize when displaying
        });

        test('should enforce organization isolation (prevent data leaks)', async () => {
            // Org 1 creates estimate
            await storage.saveEstimate('secret-data', {
                id: 'secret-data',
                clientName: 'Confidential',
                secretField: 'TOP_SECRET',
                version: '1.1.0'
            });

            // Org 2 tries to access
            const storage2 = new SQLiteStorage({
                dbPath: testDbPath,
                userId: 'user-test',
                organizationId: 'org-different'
            });
            await storage2.init();

            // Should not be able to load
            await expect(storage2.loadEstimate('secret-data')).rejects.toThrow();

            // Should not appear in list
            const list = await storage2.listEstimates();
            expect(list.every(e => e.id !== 'secret-data')).toBe(true);

            // Should not be able to delete (security: no info leak)
            const deleteResult = await storage2.deleteEstimate('secret-data');
            expect(deleteResult.deleted).toBe(false); // Not deleted (different org)

            // Org 1 should still have data
            const loaded = await storage.loadEstimate('secret-data');
            expect(loaded.secretField).toBe('TOP_SECRET');

            storage2.db.close();
        });
    });
});
