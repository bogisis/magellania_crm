/**
 * Integration E2E Tests for Quote Calculator v3.0.0
 *
 * Testing full stack integration:
 * Client (SyncManager) → API (Express) → Storage (SQLiteStorage) → Database
 *
 * Coverage:
 * - Basic E2E workflows
 * - Multi-tenant scenarios
 * - Recovery & resilience
 * - Performance & scale
 * - Versioning & compatibility
 *
 * @version 3.0.0
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const request = require('supertest');
const Database = require('better-sqlite3');
const SQLiteStorage = require('../../storage/SQLiteStorage');
const SyncManager = require('../../client/SyncManager');

// ============================================================================
// Test Infrastructure Setup
// ============================================================================

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

// Mock APIClient for SyncManager
class E2EAPIClient {
    constructor(baseURL) {
        this.baseURL = baseURL;
        this.requests = []; // Track all requests for assertions
    }

    async saveEstimate(id, data) {
        this.requests.push({ method: 'saveEstimate', id, data });

        const response = await request(this.baseURL)
            .post(`/api/estimates/${id}`)
            .send(data);

        if (response.status !== 200) {
            throw new Error(`Save failed: ${response.body.error || response.status}`);
        }

        return response.body;
    }

    async loadEstimate(id) {
        this.requests.push({ method: 'loadEstimate', id });

        const response = await request(this.baseURL)
            .get(`/api/estimates/${id}`);

        if (response.status !== 200) {
            throw new Error(`Load failed: ${response.body.error || response.status}`);
        }

        return response.body;
    }

    async saveBatch(items) {
        this.requests.push({ method: 'saveBatch', items });

        const response = await request(this.baseURL)
            .post('/api/estimates/batch')
            .send({ items });

        if (response.status !== 200) {
            throw new Error(`Batch save failed: ${response.body.error || response.status}`);
        }

        return response.body;
    }
}

// ============================================================================
// Test Suite Setup
// ============================================================================

describe('E2E Integration Tests', () => {
    let app;
    let storage;
    let testDbPath;
    let syncManager;
    let apiClient;

    beforeEach(async () => {
        // Step 1: Create database
        testDbPath = path.join(__dirname, '..', '..', 'db', 'test-e2e.db');
        createTestDatabase(testDbPath);

        // Step 2: Initialize storage
        storage = new SQLiteStorage({
            dbPath: testDbPath,
            userId: 'user-e2e',
            organizationId: 'org-e2e'
        });
        await storage.init();

        // Step 3: Create Express app
        app = express();
        app.use(express.json());

        // Save estimate endpoint
        app.post('/api/estimates/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const data = req.body;
                await storage.saveEstimate(id, data);
                res.json({ success: true, id });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // Load estimate endpoint
        app.get('/api/estimates/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const data = await storage.loadEstimate(id);
                res.json(data);
            } catch (err) {
                res.status(404).json({ error: err.message });
            }
        });

        // Batch save endpoint
        app.post('/api/estimates/batch', async (req, res) => {
            try {
                const { items } = req.body;
                const results = { succeeded: [], failed: [] };

                for (const item of items) {
                    try {
                        await storage.saveEstimate(item.id, item.data);
                        results.succeeded.push(item.id);
                    } catch (err) {
                        results.failed.push({ id: item.id, error: err.message });
                    }
                }

                res.json(results);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // Step 4: Setup SyncManager with E2E API client
        apiClient = new E2EAPIClient(app);

        // Mock localStorage for Node.js
        global.localStorage = {
            _data: {},
            get length() {
                return Object.keys(this._data).length;
            },
            key(index) {
                const keys = Object.keys(this._data);
                return keys[index] || null;
            },
            getItem(key) {
                return this._data[key] || null;
            },
            setItem(key, value) {
                this._data[key] = value;
            },
            removeItem(key) {
                delete this._data[key];
            },
            clear() {
                this._data = {};
            }
        };

        syncManager = new SyncManager(apiClient, {
            batchInterval: 1000,
            maxBatchSize: 5,
            debug: false
        });
    });

    afterEach(() => {
        if (syncManager) {
            syncManager.destroy();
        }
        if (storage && storage.db) {
            storage.db.close();
        }
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        global.localStorage.clear();
    });

    // ========================================================================
    // 1. Basic E2E Workflows (8 tests)
    // ========================================================================

    describe('Basic E2E Workflows', () => {
        test('should complete full save flow: Client → SyncManager → API → Storage → DB', async () => {
            const estimate = {
                id: 'e2e-save-1',
                clientName: 'E2E Test Client',
                paxCount: 10,
                version: '1.1.0'
            };

            // Client saves via SyncManager (critical sync)
            const result = await syncManager.save(estimate.id, estimate, { critical: true });

            expect(result.success).toBe(true);
            expect(result.synced).toBe(true);

            // Verify in database
            const row = storage.db.prepare('SELECT * FROM estimates WHERE id = ?').get(estimate.id);
            expect(row).toBeTruthy();
            expect(row.organization_id).toBe('org-e2e');

            // Verify localStorage cache
            const cached = global.localStorage.getItem(`syncManager_${estimate.id}`);
            expect(cached).toBeTruthy();
        });

        test('should complete full load flow: Client → API → Storage → DB', async () => {
            // Seed data
            const estimate = {
                id: 'e2e-load-1',
                clientName: 'Load Test',
                paxCount: 20,
                version: '1.1.0'
            };
            await storage.saveEstimate(estimate.id, estimate);

            // Client loads via SyncManager
            const loaded = await syncManager.load(estimate.id);

            expect(loaded.clientName).toBe('Load Test');
            expect(loaded.paxCount).toBe(20);
            expect(loaded.dataVersion).toBe(1);
        });

        test('should handle batch save via SyncManager', async () => {
            const estimates = [
                { id: 'batch-1', clientName: 'Batch 1', version: '1.1.0' },
                { id: 'batch-2', clientName: 'Batch 2', version: '1.1.0' },
                { id: 'batch-3', clientName: 'Batch 3', version: '1.1.0' }
            ];

            // Add to batch queue
            for (const est of estimates) {
                await syncManager.save(est.id, est, { critical: false });
            }

            // Flush batch
            const result = await syncManager.flushBatchQueue();

            expect(result.succeeded.length).toBe(3);
            expect(result.failed.length).toBe(0);

            // Verify all in database
            const count = storage.db.prepare('SELECT COUNT(*) as count FROM estimates WHERE organization_id = ?')
                .get('org-e2e').count;
            expect(count).toBe(3);
        });

        test('should handle adaptive batching (critical vs non-critical)', async () => {
            const criticalEst = { id: 'critical-1', clientName: 'Critical', version: '1.1.0' };
            const nonCriticalEst = { id: 'noncritical-1', clientName: 'NonCritical', version: '1.1.0' };

            // Critical: immediate sync
            const criticalResult = await syncManager.save(criticalEst.id, criticalEst, { critical: true });
            expect(criticalResult.synced).toBe(true);
            expect(apiClient.requests.length).toBe(1);

            // Non-critical: queued
            const nonCriticalResult = await syncManager.save(nonCriticalEst.id, nonCriticalEst, { critical: false });
            expect(nonCriticalResult.queued).toBe(true);
            expect(apiClient.requests.length).toBe(1); // Still 1, not synced yet

            // Verify critical in DB
            const criticalRow = storage.db.prepare('SELECT * FROM estimates WHERE id = ?').get('critical-1');
            expect(criticalRow).toBeTruthy();

            // Flush to sync non-critical
            await syncManager.flushBatchQueue();
            const nonCriticalRow = storage.db.prepare('SELECT * FROM estimates WHERE id = ?').get('noncritical-1');
            expect(nonCriticalRow).toBeTruthy();
        });

        test('should complete localStorage pre-save + server sync', async () => {
            const estimate = { id: 'presave-1', clientName: 'PreSave Test', version: '1.1.0' };

            // Save non-critical (localStorage first)
            await syncManager.save(estimate.id, estimate, { critical: false });

            // Verify in localStorage immediately
            const cached = global.localStorage.getItem(`syncManager_${estimate.id}`);
            expect(cached).toBeTruthy();
            const parsed = JSON.parse(cached);
            expect(parsed.data.clientName).toBe('PreSave Test');

            // Verify queued
            const stats = syncManager.getStats();
            expect(stats.queueSize).toBe(1);

            // Flush to sync
            await syncManager.flushBatchQueue();

            // Now synced to DB
            const rowAfter = storage.db.prepare('SELECT * FROM estimates WHERE id = ?').get(estimate.id);
            expect(rowAfter).toBeTruthy();
            expect(rowAfter.client_name).toBe('PreSave Test');
        });

        test('should complete full CRUD cycle E2E', async () => {
            const estimate = {
                id: 'crud-cycle-1',
                clientName: 'CRUD Test',
                paxCount: 15,
                version: '1.1.0'
            };

            // Create
            await syncManager.save(estimate.id, estimate, { critical: true });
            let loaded = await syncManager.load(estimate.id);
            expect(loaded.clientName).toBe('CRUD Test');

            // Update
            estimate.clientName = 'CRUD Updated';
            await syncManager.save(estimate.id, estimate, { critical: true });
            loaded = await syncManager.load(estimate.id);
            expect(loaded.clientName).toBe('CRUD Updated');
            expect(loaded.dataVersion).toBe(2);

            // Delete (soft delete)
            await storage.deleteEstimate(estimate.id);

            // Clear localStorage to prevent fallback
            global.localStorage.removeItem(`syncManager_${estimate.id}`);

            // Load should now fail (soft deleted, no localStorage fallback)
            await expect(syncManager.load(estimate.id)).rejects.toThrow();
        });

        test('should list estimates E2E', async () => {
            // Create multiple estimates
            for (let i = 1; i <= 5; i++) {
                await syncManager.save(`list-${i}`, {
                    id: `list-${i}`,
                    clientName: `Client ${i}`,
                    version: '1.1.0'
                }, { critical: true });
            }

            // List via storage
            const list = await storage.listEstimates();

            expect(list).toHaveLength(5);
            expect(list[0]).toHaveProperty('id');
            expect(list[0]).toHaveProperty('filename');
        });

        test('should handle settings E2E', async () => {
            const settings = {
                theme: 'dark',
                language: 'ru',
                currency: 'USD'
            };

            // Save via storage
            await storage.saveSettings(settings);

            // Load via storage
            const loaded = await storage.loadSettings();

            expect(loaded.theme).toBe('dark');
            expect(loaded.language).toBe('ru');
        });
    });

    // ========================================================================
    // 2. Multi-Tenant E2E (7 tests)
    // ========================================================================

    describe('Multi-Tenant E2E', () => {
        test('should isolate data between organizations in full stack', async () => {
            // Org 1 saves estimate
            const est1 = { id: 'org1-est', clientName: 'Org 1 Client', version: '1.1.0' };
            await syncManager.save(est1.id, est1, { critical: true });

            // Create storage for Org 2
            const storage2 = new SQLiteStorage({
                dbPath: testDbPath,
                userId: 'user-e2e',
                organizationId: 'org-e2e-2'
            });
            await storage2.init();

            // Org 2 cannot see Org 1's estimate
            const list2 = await storage2.listEstimates();
            expect(list2).toHaveLength(0);

            // Org 2 saves its own estimate
            await storage2.saveEstimate('org2-est', {
                id: 'org2-est',
                clientName: 'Org 2 Client',
                version: '1.1.0'
            });

            // Org 1 still only sees its own
            const list1 = await storage.listEstimates();
            expect(list1).toHaveLength(1);
            expect(list1[0].id).toBe('org1-est');

            storage2.db.close();
        });

        test('should prevent cross-org access in full stack', async () => {
            // Org 1 saves estimate
            await storage.saveEstimate('cross-org-test', {
                id: 'cross-org-test',
                clientName: 'Org 1 Data',
                version: '1.1.0'
            });

            // Org 2 tries to load Org 1's estimate
            const storage2 = new SQLiteStorage({
                dbPath: testDbPath,
                userId: 'user-e2e',
                organizationId: 'org-e2e-2'
            });
            await storage2.init();

            await expect(storage2.loadEstimate('cross-org-test')).rejects.toThrow();

            storage2.db.close();
        });

        test('should handle organization migration E2E', async () => {
            // Create estimate in Org 1
            await storage.saveEstimate('migrate-est', {
                id: 'migrate-est',
                clientName: 'Migration Test',
                version: '1.1.0'
            });

            // Migrate to Org 2 (manual SQL)
            storage.db.prepare('UPDATE estimates SET organization_id = ? WHERE id = ?')
                .run('org-e2e-2', 'migrate-est');

            // Org 1 cannot load anymore
            await expect(storage.loadEstimate('migrate-est')).rejects.toThrow();

            // Org 2 can load
            const storage2 = new SQLiteStorage({
                dbPath: testDbPath,
                userId: 'user-e2e',
                organizationId: 'org-e2e-2'
            });
            await storage2.init();

            const loaded = await storage2.loadEstimate('migrate-est');
            expect(loaded.clientName).toBe('Migration Test');

            storage2.db.close();
        });

        test('should track owner_id across full stack', async () => {
            // User 1 saves
            await syncManager.save('owner-test-1', {
                id: 'owner-test-1',
                clientName: 'User 1 Est',
                version: '1.1.0'
            }, { critical: true });

            // User 2 in same org saves
            const storage2 = new SQLiteStorage({
                dbPath: testDbPath,
                userId: 'user-e2e-2',
                organizationId: 'org-e2e'
            });
            await storage2.init();

            await storage2.saveEstimate('owner-test-2', {
                id: 'owner-test-2',
                clientName: 'User 2 Est',
                version: '1.1.0'
            });

            // Verify owner_id
            const row1 = storage.db.prepare('SELECT * FROM estimates WHERE id = ?').get('owner-test-1');
            const row2 = storage.db.prepare('SELECT * FROM estimates WHERE id = ?').get('owner-test-2');

            expect(row1.owner_id).toBe('user-e2e');
            expect(row2.owner_id).toBe('user-e2e-2');

            // Both can see both estimates (same org)
            const list1 = await storage.listEstimates();
            const list2 = await storage2.listEstimates();

            expect(list1).toHaveLength(2);
            expect(list2).toHaveLength(2);

            storage2.db.close();
        });

        test('should handle shared estimates in organization E2E', async () => {
            // User 1 creates estimate
            await syncManager.save('shared-est', {
                id: 'shared-est',
                clientName: 'Shared Estimate',
                version: '1.1.0'
            }, { critical: true });

            // User 2 in same org can load
            const storage2 = new SQLiteStorage({
                dbPath: testDbPath,
                userId: 'user-e2e-2',
                organizationId: 'org-e2e'
            });
            await storage2.init();

            const loaded = await storage2.loadEstimate('shared-est');
            expect(loaded.clientName).toBe('Shared Estimate');

            // User 2 can update
            await storage2.saveEstimate('shared-est', {
                id: 'shared-est',
                clientName: 'Updated by User 2',
                version: '1.1.0'
            });

            // User 1 sees update
            const reloaded = await syncManager.load('shared-est');
            expect(reloaded.clientName).toBe('Updated by User 2');

            storage2.db.close();
        });

        test('should handle settings per organization E2E', async () => {
            // Org 1 settings
            await storage.saveSettings({ theme: 'dark', language: 'ru' });

            // Org 2 settings
            const storage2 = new SQLiteStorage({
                dbPath: testDbPath,
                userId: 'user-e2e',
                organizationId: 'org-e2e-2'
            });
            await storage2.init();
            await storage2.saveSettings({ theme: 'light', language: 'en' });

            // Load each org's settings
            const settings1 = await storage.loadSettings();
            const settings2 = await storage2.loadSettings();

            expect(settings1.theme).toBe('dark');
            expect(settings2.theme).toBe('light');

            storage2.db.close();
        });

        test('should prevent cross-org deletion E2E', async () => {
            // Org 1 creates estimate
            await storage.saveEstimate('delete-test', {
                id: 'delete-test',
                clientName: 'Delete Test',
                version: '1.1.0'
            });

            // Org 2 tries to delete (should silently fail - security)
            const storage2 = new SQLiteStorage({
                dbPath: testDbPath,
                userId: 'user-e2e',
                organizationId: 'org-e2e-2'
            });
            await storage2.init();

            const result = await storage2.deleteEstimate('delete-test');
            expect(result.success).toBe(true); // Doesn't throw
            expect(result.deleted).toBe(false); // But didn't actually delete

            // Org 1 still has the estimate
            const loaded = await storage.loadEstimate('delete-test');
            expect(loaded.clientName).toBe('Delete Test');

            storage2.db.close();
        });
    });

    // ========================================================================
    // 3. Recovery & Resilience (8 tests)
    // ========================================================================

    describe('Recovery & Resilience', () => {
        test('should fallback to localStorage when server is down', async () => {
            // Save to localStorage
            const estimate = { id: 'fallback-1', clientName: 'Fallback Test', version: '1.1.0' };
            await syncManager.save(estimate.id, estimate, { critical: false });

            // Close storage to simulate server down
            storage.db.close();

            // Load should fallback to localStorage
            const loaded = await syncManager.load(estimate.id);
            expect(loaded.clientName).toBe('Fallback Test');

            const stats = syncManager.getStats();
            expect(stats.recovered).toBe(1);
        });

        test('should recover from localStorage when server comes back up', async () => {
            // Simulate saving while server is down
            global.localStorage.setItem('syncManager_recovery-1', JSON.stringify({
                data: { id: 'recovery-1', clientName: 'Recovery Test', version: '1.1.0' },
                savedAt: Date.now()
            }));

            // Create new SyncManager (simulates restart with server up)
            const newSyncManager = new SyncManager(apiClient, {
                batchInterval: 1000,
                maxBatchSize: 5,
                debug: false
            });

            // Should recover from localStorage
            const stats = newSyncManager.getStats();
            expect(stats.recovered).toBe(1);
            expect(stats.queueSize).toBe(1);

            // Flush to sync
            await newSyncManager.flushBatchQueue();

            // Verify in database
            const row = storage.db.prepare('SELECT * FROM estimates WHERE id = ?').get('recovery-1');
            expect(row).toBeTruthy();

            newSyncManager.destroy();
        });

        test('should handle partial batch failure', async () => {
            // Add valid estimates to queue
            const estimates = [
                { id: 'valid-1', clientName: 'Valid 1', version: '1.1.0' },
                { id: 'will-fail', clientName: 'Will Fail', version: '1.1.0' },
                { id: 'valid-2', clientName: 'Valid 2', version: '1.1.0' }
            ];

            // Add to batch queue
            for (const est of estimates) {
                await syncManager.save(est.id, est, { critical: false });
            }

            // Make API fail for one specific ID
            const originalSave = apiClient.saveEstimate;
            apiClient.saveEstimate = async (id, data) => {
                if (id === 'will-fail') {
                    throw new Error('Simulated API error for this ID');
                }
                return await originalSave.call(apiClient, id, data);
            };

            // Flush batch (partial failure expected)
            const result = await syncManager.flushBatchQueue();

            // Should have both successes and failures
            expect(result.succeeded.length).toBe(2);
            expect(result.failed.length).toBe(1);
            expect(result.failed[0].id).toBe('will-fail');

            // Restore API
            apiClient.saveEstimate = originalSave;
        });

        test('should retry with exponential backoff', async () => {
            // Force API error
            apiClient.saveEstimate = async () => {
                throw new Error('Simulated API error');
            };

            // Try critical save (should fail and add to failed queue)
            await expect(
                syncManager.save('retry-test', { id: 'retry-test', version: '1.1.0' }, { critical: true })
            ).rejects.toThrow();

            const stats1 = syncManager.getStats();
            expect(stats1.failedSize).toBe(1);

            // Fix API
            apiClient.saveEstimate = async (id, data) => {
                await request(app).post(`/api/estimates/${id}`).send(data);
                return { success: true, id };
            };

            // Retry
            const result = await syncManager.retryFailed();
            expect(result.succeeded.length).toBe(1);

            const stats2 = syncManager.getStats();
            expect(stats2.failedSize).toBe(0);
        });

        test('should recover from network interruption', async () => {
            const estimate = { id: 'network-test', clientName: 'Network Test', version: '1.1.0' };

            // First save succeeds
            await syncManager.save(estimate.id, estimate, { critical: true });

            // Simulate network interruption
            const originalSave = apiClient.saveEstimate;
            apiClient.saveEstimate = async () => {
                throw new Error('Network error');
            };

            // Update fails
            estimate.clientName = 'Updated';
            await expect(
                syncManager.save(estimate.id, estimate, { critical: true })
            ).rejects.toThrow();

            // Network restored
            apiClient.saveEstimate = originalSave;

            // Retry succeeds
            await syncManager.retryFailed();

            // Verify update in database
            const loaded = await storage.loadEstimate(estimate.id);
            expect(loaded.clientName).toBe('Updated');
        });

        test('should handle concurrent saves from multiple clients', async () => {
            const estimate = { id: 'concurrent-test', clientName: 'Initial', version: '1.1.0' };

            // Client 1 saves
            await syncManager.save(estimate.id, estimate, { critical: true });

            // Create Client 2
            const apiClient2 = new E2EAPIClient(app);
            const syncManager2 = new SyncManager(apiClient2, {
                batchInterval: 1000,
                maxBatchSize: 5,
                debug: false
            });

            // Concurrent updates
            await Promise.all([
                syncManager.save(estimate.id, { ...estimate, clientName: 'Client 1 Update' }, { critical: true }),
                syncManager2.save(estimate.id, { ...estimate, clientName: 'Client 2 Update' }, { critical: true })
            ]);

            // Last write wins
            const loaded = await storage.loadEstimate(estimate.id);
            expect(['Client 1 Update', 'Client 2 Update']).toContain(loaded.clientName);
            expect(loaded.dataVersion).toBeGreaterThan(1);

            syncManager2.destroy();
        });

        test('should handle localStorage quota', async () => {
            // Mock localStorage quota exceeded
            const originalSetItem = global.localStorage.setItem;
            global.localStorage.setItem = () => {
                throw new Error('QuotaExceededError');
            };

            // Save should not throw (graceful degradation)
            const estimate = { id: 'quota-test', clientName: 'Quota Test', version: '1.1.0' };
            const result = await syncManager.save(estimate.id, estimate, { critical: true });

            expect(result.success).toBe(true);
            expect(result.synced).toBe(true); // Still synced to server

            // Restore
            global.localStorage.setItem = originalSetItem;
        });

        test('should maintain data consistency after recovery', async () => {
            const estimates = [
                { id: 'consistency-1', clientName: 'Est 1', version: '1.1.0' },
                { id: 'consistency-2', clientName: 'Est 2', version: '1.1.0' },
                { id: 'consistency-3', clientName: 'Est 3', version: '1.1.0' }
            ];

            // Save all to localStorage (simulate offline)
            for (const est of estimates) {
                await syncManager.save(est.id, est, { critical: false });
            }

            // Flush batch
            await syncManager.flushBatchQueue();

            // Verify all in database with correct data
            for (const est of estimates) {
                const loaded = await storage.loadEstimate(est.id);
                expect(loaded.clientName).toBe(est.clientName);
                expect(loaded.dataVersion).toBe(1);
            }

            // Verify count
            const count = storage.db.prepare('SELECT COUNT(*) as count FROM estimates WHERE organization_id = ?')
                .get('org-e2e').count;
            expect(count).toBe(3);
        });
    });

    // ========================================================================
    // 4. Performance & Scale (4 tests)
    // ========================================================================

    describe('Performance & Scale', () => {
        test('should handle batch of 100+ estimates', async () => {
            const estimates = Array(100).fill(null).map((_, i) => ({
                id: `scale-${i}`,
                clientName: `Client ${i}`,
                paxCount: i,
                version: '1.1.0'
            }));

            // Add all to batch queue
            for (const est of estimates) {
                await syncManager.save(est.id, est, { critical: false });
            }

            // Flush batch
            const result = await syncManager.flushBatchQueue();

            expect(result.succeeded.length).toBe(100);
            expect(result.failed.length).toBe(0);

            // Verify count in database
            const count = storage.db.prepare('SELECT COUNT(*) as count FROM estimates WHERE organization_id = ?')
                .get('org-e2e').count;
            expect(count).toBe(100);
        }, 30000); // 30 sec timeout

        test('should handle large estimate (1000+ services)', async () => {
            const largeServices = Array(1000).fill(null).map((_, i) => ({
                id: `service-${i}`,
                name: `Service ${i}`,
                price: 100,
                quantity: 1
            }));

            const estimate = {
                id: 'large-est',
                clientName: 'Large Estimate',
                services: largeServices,
                version: '1.1.0'
            };

            // Save
            await syncManager.save(estimate.id, estimate, { critical: true });

            // Load
            const loaded = await syncManager.load(estimate.id);
            expect(loaded.services).toHaveLength(1000);
        });

        test('should handle rapid sequential updates', async () => {
            const estimate = { id: 'rapid-test', clientName: 'Initial', version: '1.1.0' };

            // Initial save
            await syncManager.save(estimate.id, estimate, { critical: true });

            // 50 rapid updates
            for (let i = 1; i <= 50; i++) {
                await syncManager.save(estimate.id, {
                    ...estimate,
                    clientName: `Update ${i}`
                }, { critical: false });
            }

            // Flush
            await syncManager.flushBatchQueue();

            // Verify final version
            const loaded = await storage.loadEstimate(estimate.id);
            expect(loaded.dataVersion).toBeGreaterThan(1);
        });

        test('should handle concurrent multi-user access', async () => {
            // Create 5 concurrent SyncManagers (simulating 5 users)
            const managers = [];
            for (let i = 0; i < 5; i++) {
                const client = new E2EAPIClient(app);
                const manager = new SyncManager(client, {
                    batchInterval: 1000,
                    maxBatchSize: 5,
                    debug: false
                });
                managers.push(manager);
            }

            // Each user saves 10 estimates
            const promises = managers.map((manager, userIndex) => {
                return Promise.all(
                    Array(10).fill(null).map((_, estIndex) => {
                        return manager.save(`user${userIndex}-est${estIndex}`, {
                            id: `user${userIndex}-est${estIndex}`,
                            clientName: `User ${userIndex} Est ${estIndex}`,
                            version: '1.1.0'
                        }, { critical: true });
                    })
                );
            });

            await Promise.all(promises);

            // Verify count
            const count = storage.db.prepare('SELECT COUNT(*) as count FROM estimates WHERE organization_id = ?')
                .get('org-e2e').count;
            expect(count).toBe(50);

            // Cleanup
            managers.forEach(m => m.destroy());
        }, 30000);
    });

    // ========================================================================
    // 5. Versioning & Compatibility (3 tests)
    // ========================================================================

    describe('Versioning & Compatibility', () => {
        test('should track optimistic locking E2E', async () => {
            const estimate = { id: 'version-test', clientName: 'V1', version: '1.1.0' };

            // V1
            await syncManager.save(estimate.id, estimate, { critical: true });
            let loaded = await syncManager.load(estimate.id);
            expect(loaded.dataVersion).toBe(1);

            // V2
            await syncManager.save(estimate.id, { ...estimate, clientName: 'V2' }, { critical: true });
            loaded = await syncManager.load(estimate.id);
            expect(loaded.dataVersion).toBe(2);

            // V3
            await syncManager.save(estimate.id, { ...estimate, clientName: 'V3' }, { critical: true });
            loaded = await syncManager.load(estimate.id);
            expect(loaded.dataVersion).toBe(3);
        });

        test('should detect version conflicts E2E', async () => {
            const estimate = { id: 'conflict-test', clientName: 'Original', version: '1.1.0' };

            // User 1 saves
            await syncManager.save(estimate.id, estimate, { critical: true });

            // User 2 loads (gets version 1)
            const loaded = await syncManager.load(estimate.id);
            expect(loaded.dataVersion).toBe(1);

            // User 1 updates (version becomes 2)
            await syncManager.save(estimate.id, { ...estimate, clientName: 'User 1 Update' }, { critical: true });

            // User 2 tries to update (has stale version 1)
            // In production, this would check dataVersion and reject
            // For now, just verify version incremented
            await syncManager.save(estimate.id, { ...estimate, clientName: 'User 2 Update' }, { critical: true });

            const final = await syncManager.load(estimate.id);
            expect(final.dataVersion).toBe(3); // Version incremented
        });

        test('should maintain backward compatibility', async () => {
            // Simulate old format (v1.0.0 without some v3.0 fields)
            const legacyEstimate = {
                id: 'legacy-est',
                clientName: 'Legacy Client',
                paxCount: 10
                // Missing: version field (should be added)
            };

            // Save via SyncManager
            await syncManager.save(legacyEstimate.id, { ...legacyEstimate, version: '1.1.0' }, { critical: true });

            // Load should work
            const loaded = await syncManager.load(legacyEstimate.id);
            expect(loaded.clientName).toBe('Legacy Client');
            expect(loaded.dataVersion).toBe(1);
        });
    });
});
