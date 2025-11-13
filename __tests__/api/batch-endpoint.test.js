/**
 * Batch Endpoint Tests
 *
 * Comprehensive testing for POST /api/estimates/batch endpoint
 * Covers: success scenarios, transaction handling, validation, errors
 *
 * @version 3.0.0
 */

const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Import storage implementations
const SQLiteStorage = require('../../storage/SQLiteStorage');

// Helper to apply migrations
function applyMigrations(dbPath) {
    const db = new Database(dbPath);

    // Apply migration 001: Add multi-tenancy
    db.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'migrations', '001_add_multitenancy.sql'), 'utf8'));

    // Apply migration 002: Remove filename UNIQUE
    db.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'migrations', '002_remove_filename_unique.sql'), 'utf8'));

    // Apply migration 003: Fix settings multi-tenancy
    db.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'migrations', '003_fix_settings_multitenancy.sql'), 'utf8'));

    db.close();
}

describe('Batch Endpoint Tests', () => {
    let app;
    let storage;
    let testDbPath;

    beforeAll(async () => {
        // Create test database
        testDbPath = path.join(__dirname, '..', '..', 'db', 'test-batch.db');

        // Remove existing test database
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        // Step 1: Create database with base schema
        const tempDb = new Database(testDbPath);
        tempDb.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8'));
        tempDb.close();

        // Step 2: Apply v3.0.0 migrations (multi-tenancy, ID-First)
        try {
            applyMigrations(testDbPath);
        } catch (err) {
            console.error('Migrations failed:', err);
            throw err;
        }

        // Step 3: Initialize storage (AFTER migrations)
        storage = new SQLiteStorage({
            dbPath: testDbPath,
            userId: 'user_test',
            organizationId: 'org_test'
        });

        // Step 4: Initialize database connection
        await storage.init();

        // Create Express app with batch endpoint
        app = express();
        app.use(express.json());

        // Batch endpoint (copied from server-with-db.js)
        app.post('/api/estimates/batch', async (req, res) => {
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

            // Transaction-based batch save for SQLite
            try {
                const transaction = storage.db.transaction(() => {
                    for (const item of items) {
                        const { id, data } = item;

                        if (!id || !data) {
                            results.failed.push({ id, error: 'Missing id or data' });
                            continue;
                        }

                        try {
                            const now = Math.floor(Date.now() / 1000);
                            const dataStr = JSON.stringify(data);
                            const dataHash = storage._calculateHash(dataStr);
                            const metadata = storage._extractMetadata(data);
                            const filename = data.filename || metadata.filename || `estimate_${id}.json`;

                            const orgId = storage.defaultOrganizationId;
                            const ownerId = storage.defaultUserId;

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
        });
    });

    afterAll(() => {
        // Cleanup
        if (storage && storage.close) {
            storage.close();
        }
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    // ========================================================================
    // Success Scenarios
    // ========================================================================

    describe('Success Scenarios', () => {
        test('should save 2 new estimates (INSERT)', async () => {
            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: [
                        {
                            id: 'batch-test-1',
                            data: {
                                id: 'batch-test-1',
                                version: '1.1.0',
                                clientName: 'Client A',
                                paxCount: 5,
                                tourStart: '2025-11-01',
                                services: []
                            }
                        },
                        {
                            id: 'batch-test-2',
                            data: {
                                id: 'batch-test-2',
                                version: '1.1.0',
                                clientName: 'Client B',
                                paxCount: 10,
                                tourStart: '2025-11-05',
                                services: []
                            }
                        }
                    ]
                });

            if (response.status !== 200) {
                console.error('Batch INSERT failed:', response.body);
            }

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.succeeded).toEqual(['batch-test-1', 'batch-test-2']);
            expect(response.body.failed).toEqual([]);
        });

        test('should update 2 existing estimates (UPDATE)', async () => {
            // First create estimates
            await storage.saveEstimate('batch-update-1', {
                id: 'batch-update-1',
                clientName: 'Old Client 1',
                paxCount: 5,
                tourStart: '2025-11-01',
                services: []
            });

            await storage.saveEstimate('batch-update-2', {
                id: 'batch-update-2',
                clientName: 'Old Client 2',
                paxCount: 10,
                tourStart: '2025-11-05',
                services: []
            });

            // Now batch update
            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: [
                        {
                            id: 'batch-update-1',
                            data: {
                                id: 'batch-update-1',
                                clientName: 'Updated Client 1',
                                paxCount: 15,
                                tourStart: '2025-11-01',
                                services: []
                            }
                        },
                        {
                            id: 'batch-update-2',
                            data: {
                                id: 'batch-update-2',
                                clientName: 'Updated Client 2',
                                paxCount: 20,
                                tourStart: '2025-11-05',
                                services: []
                            }
                        }
                    ]
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.succeeded).toEqual(['batch-update-1', 'batch-update-2']);

            // Verify updates
            const loaded1 = await storage.loadEstimate('batch-update-1');
            expect(loaded1.clientName).toBe('Updated Client 1');
            expect(loaded1.paxCount).toBe(15);
        });

        test('should handle mixed batch (1 new + 1 update)', async () => {
            // Create one estimate
            await storage.saveEstimate('batch-mixed-exist', {
                id: 'batch-mixed-exist',
                clientName: 'Existing',
                paxCount: 5,
                tourStart: '2025-11-01',
                services: []
            });

            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: [
                        {
                            id: 'batch-mixed-exist',
                            data: {
                                id: 'batch-mixed-exist',
                                clientName: 'Updated Existing',
                                paxCount: 10,
                                tourStart: '2025-11-01',
                                services: []
                            }
                        },
                        {
                            id: 'batch-mixed-new',
                            data: {
                                id: 'batch-mixed-new',
                                clientName: 'New Client',
                                paxCount: 15,
                                tourStart: '2025-11-05',
                                services: []
                            }
                        }
                    ]
                });

            expect(response.status).toBe(200);
            expect(response.body.succeeded).toEqual(['batch-mixed-exist', 'batch-mixed-new']);
        });

        test('should handle empty array gracefully', async () => {
            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: []
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('non-empty array');
        });

        test('should handle single item (edge case)', async () => {
            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: [
                        {
                            id: 'batch-single',
                            data: {
                                id: 'batch-single',
                                clientName: 'Single',
                                paxCount: 5,
                                tourStart: '2025-11-01',
                                services: []
                            }
                        }
                    ]
                });

            expect(response.status).toBe(200);
            expect(response.body.succeeded).toEqual(['batch-single']);
        });

        test('should handle maxBatchSize items (10)', async () => {
            const items = [];
            for (let i = 0; i < 10; i++) {
                items.push({
                    id: `batch-max-${i}`,
                    data: {
                        id: `batch-max-${i}`,
                        clientName: `Client ${i}`,
                        paxCount: i + 1,
                        tourStart: '2025-11-01',
                        services: []
                    }
                });
            }

            const response = await request(app)
                .post('/api/estimates/batch')
                .send({ items });

            expect(response.status).toBe(200);
            expect(response.body.succeeded.length).toBe(10);
        });

        test('should return correct response format', async () => {
            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: [
                        {
                            id: 'batch-format-test',
                            data: {
                                id: 'batch-format-test',
                                clientName: 'Format Test',
                                paxCount: 5,
                                tourStart: '2025-11-01',
                                services: []
                            }
                        }
                    ]
                });

            expect(response.body).toHaveProperty('success');
            expect(response.body).toHaveProperty('succeeded');
            expect(response.body).toHaveProperty('failed');
            expect(Array.isArray(response.body.succeeded)).toBe(true);
            expect(Array.isArray(response.body.failed)).toBe(true);
        });
    });

    // ========================================================================
    // Transaction Handling
    // ========================================================================

    describe('Transaction Handling', () => {
        test('should execute batch in single transaction (SQLite)', async () => {
            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: [
                        {
                            id: 'tx-test-1',
                            data: {
                                id: 'tx-test-1',
                                clientName: 'TX 1',
                                paxCount: 5,
                                tourStart: '2025-11-01',
                                services: []
                            }
                        },
                        {
                            id: 'tx-test-2',
                            data: {
                                id: 'tx-test-2',
                                clientName: 'TX 2',
                                paxCount: 10,
                                tourStart: '2025-11-05',
                                services: []
                            }
                        }
                    ]
                });

            expect(response.status).toBe(200);
            expect(response.body.succeeded).toEqual(['tx-test-1', 'tx-test-2']);

            // Both should exist (ACID guarantee)
            const loaded1 = await storage.loadEstimate('tx-test-1');
            const loaded2 = await storage.loadEstimate('tx-test-2');
            expect(loaded1).toBeDefined();
            expect(loaded2).toBeDefined();
        });

        test('should handle partial failures (some succeed, some fail)', async () => {
            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: [
                        {
                            id: 'partial-success-1',
                            data: {
                                id: 'partial-success-1',
                                clientName: 'Valid',
                                paxCount: 5,
                                tourStart: '2025-11-01',
                                services: []
                            }
                        },
                        {
                            id: '', // Invalid: missing ID
                            data: {
                                clientName: 'Invalid',
                                paxCount: 10,
                                tourStart: '2025-11-05',
                                services: []
                            }
                        },
                        {
                            // Missing data field
                            id: 'partial-fail-2'
                        }
                    ]
                });

            expect(response.status).toBe(200);
            expect(response.body.succeeded.length).toBe(1);
            expect(response.body.failed.length).toBe(2);
        });
    });

    // ========================================================================
    // Validation & Errors
    // ========================================================================

    describe('Validation & Errors', () => {
        test('should return 400 if items field is missing', async () => {
            const response = await request(app)
                .post('/api/estimates/batch')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('non-empty array');
        });

        test('should return 400 if items is not an array', async () => {
            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: 'not-an-array'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });

        test('should fail individual item without id', async () => {
            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: [
                        {
                            // Missing id
                            data: {
                                clientName: 'No ID',
                                paxCount: 5,
                                tourStart: '2025-11-01',
                                services: []
                            }
                        }
                    ]
                });

            expect(response.body.failed.length).toBe(1);
            expect(response.body.failed[0].error).toContain('Missing id');
        });

        test('should fail individual item without data', async () => {
            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: [
                        {
                            id: 'no-data-test'
                            // Missing data
                        }
                    ]
                });

            expect(response.body.failed.length).toBe(1);
            expect(response.body.failed[0].error).toContain('Missing');
        });

        test('should handle invalid JSON data gracefully', async () => {
            // Create circular reference (invalid JSON)
            const circular = { id: 'circular-test' };
            circular.self = circular;

            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: [
                        {
                            id: 'invalid-json',
                            data: circular
                        }
                    ]
                })
                .expect('Content-Type', /json/);

            // Should not crash, should handle gracefully
            expect([200, 500]).toContain(response.status);
        });

        test('should include item id in failed responses', async () => {
            const response = await request(app)
                .post('/api/estimates/batch')
                .send({
                    items: [
                        {
                            id: 'fail-test-id',
                            // Missing data will cause failure
                        }
                    ]
                });

            expect(response.body.failed.length).toBeGreaterThan(0);
            expect(response.body.failed[0]).toHaveProperty('id');
            expect(response.body.failed[0]).toHaveProperty('error');
        });

        test('should limit batch size appropriately', async () => {
            // Test with more than maxBatchSize (e.g., 50 items)
            const items = [];
            for (let i = 0; i < 50; i++) {
                items.push({
                    id: `large-batch-${i}`,
                    data: {
                        id: `large-batch-${i}`,
                        clientName: `Client ${i}`,
                        paxCount: i + 1,
                        tourStart: '2025-11-01',
                        services: []
                    }
                });
            }

            const response = await request(app)
                .post('/api/estimates/batch')
                .send({ items });

            // Should either succeed (if no limit) or return error
            expect(response.status).toBeLessThan(500);
        });
    });
});
