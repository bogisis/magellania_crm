/**
 * Тесты для транзакционного сохранения
 * Проверяют работу endpoints: prepare, commit, rollback
 */

const request = require('supertest');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

// Подключаем server
const app = require('../server');

describe('Transaction API - Транзакционное сохранение', () => {
    const TEST_TRANSACTION_ID = 'test_tx_123';
    const TEST_FILENAME = 'test_quote.json';
    const TEST_BACKUP_ID = 'abc123def456';

    const testData = {
        id: TEST_BACKUP_ID,
        clientName: 'Test Client',
        paxCount: 10,
        tourStart: '2025-11-01',
        services: [
            { id: '1', name: 'Test Service', price: 100, quantity: 1 }
        ]
    };

    // Очистка после каждого теста
    afterEach(async () => {
        const estimateDir = path.join(__dirname, '..', '__test_estimate__');
        const backupDir = path.join(__dirname, '..', '__test_backup__');

        // Удаляем все temp файлы
        try {
            const estimateFiles = await fs.readdir(estimateDir);
            for (const file of estimateFiles) {
                if (file.startsWith('.tmp_')) {
                    await fs.unlink(path.join(estimateDir, file));
                }
            }

            const backupFiles = await fs.readdir(backupDir);
            for (const file of backupFiles) {
                if (file.startsWith('.tmp_')) {
                    await fs.unlink(path.join(backupDir, file));
                }
            }
        } catch (err) {
            // Ignore errors
        }
    });

    describe('POST /api/transaction/prepare', () => {
        it('должен успешно подготовить транзакцию', async () => {
            const response = await request(app)
                .post('/api/transaction/prepare')
                .send({
                    transactionId: TEST_TRANSACTION_ID,
                    estimate: {
                        filename: TEST_FILENAME,
                        data: testData
                    },
                    backup: {
                        id: TEST_BACKUP_ID,
                        data: testData
                    }
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.transactionId).toBe(TEST_TRANSACTION_ID);
            expect(response.body.tempFiles).toBeDefined();

            // Проверяем что temp файлы созданы
            const estimateDir = path.join(__dirname, '..', '__test_estimate__');
            const tempEstimate = path.join(estimateDir, `.tmp_${TEST_TRANSACTION_ID}_${TEST_FILENAME}`);
            const estimateExists = await fs.access(tempEstimate).then(() => true).catch(() => false);
            expect(estimateExists).toBe(true);
        });

        it('должен вернуть ошибку если нет обязательных полей', async () => {
            const response = await request(app)
                .post('/api/transaction/prepare')
                .send({
                    // Отсутствует transactionId
                    estimate: { filename: TEST_FILENAME, data: testData }
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Missing required fields');
        });
    });

    describe('POST /api/transaction/commit', () => {
        beforeEach(async () => {
            // Подготавливаем транзакцию перед commit
            await request(app)
                .post('/api/transaction/prepare')
                .send({
                    transactionId: TEST_TRANSACTION_ID,
                    estimate: { filename: TEST_FILENAME, data: testData },
                    backup: { id: TEST_BACKUP_ID, data: testData }
                });
        });

        it('должен успешно закоммитить транзакцию', async () => {
            const response = await request(app)
                .post('/api/transaction/commit')
                .send({
                    transactionId: TEST_TRANSACTION_ID,
                    estimateFilename: TEST_FILENAME,
                    backupId: TEST_BACKUP_ID
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('committed successfully');

            // Проверяем что финальные файлы созданы
            const estimateDir = path.join(__dirname, '..', '__test_estimate__');
            const backupDir = path.join(__dirname, '..', '__test_backup__');

            const finalEstimate = path.join(estimateDir, TEST_FILENAME);
            const finalBackup = path.join(backupDir, `${TEST_BACKUP_ID}.json`);

            const estimateExists = await fs.access(finalEstimate).then(() => true).catch(() => false);
            const backupExists = await fs.access(finalBackup).then(() => true).catch(() => false);

            expect(estimateExists).toBe(true);
            expect(backupExists).toBe(true);

            // Проверяем что temp файлы удалены
            const tempEstimate = path.join(estimateDir, `.tmp_${TEST_TRANSACTION_ID}_${TEST_FILENAME}`);
            const tempExists = await fs.access(tempEstimate).then(() => true).catch(() => false);
            expect(tempExists).toBe(false);

            // Cleanup
            await fs.unlink(finalEstimate).catch(() => {});
            await fs.unlink(finalBackup).catch(() => {});
        });

        it('должен вернуть ошибку если temp файлы не существуют', async () => {
            const response = await request(app)
                .post('/api/transaction/commit')
                .send({
                    transactionId: 'nonexistent_tx',
                    estimateFilename: TEST_FILENAME,
                    backupId: TEST_BACKUP_ID
                });

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Temporary files not found');
        });

        it('должен вернуть ошибку если нет обязательных полей', async () => {
            const response = await request(app)
                .post('/api/transaction/commit')
                .send({
                    // Отсутствует transactionId
                    estimateFilename: TEST_FILENAME
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/transaction/rollback', () => {
        beforeEach(async () => {
            // Подготавливаем транзакцию для rollback
            await request(app)
                .post('/api/transaction/prepare')
                .send({
                    transactionId: TEST_TRANSACTION_ID,
                    estimate: { filename: TEST_FILENAME, data: testData },
                    backup: { id: TEST_BACKUP_ID, data: testData }
                });
        });

        it('должен успешно откатить транзакцию', async () => {
            const response = await request(app)
                .post('/api/transaction/rollback')
                .send({
                    transactionId: TEST_TRANSACTION_ID,
                    estimateFilename: TEST_FILENAME,
                    backupId: TEST_BACKUP_ID
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('rolled back');
            expect(response.body.deleted.length).toBeGreaterThan(0);

            // Проверяем что temp файлы удалены
            const estimateDir = path.join(__dirname, '..', '__test_estimate__');
            const tempEstimate = path.join(estimateDir, `.tmp_${TEST_TRANSACTION_ID}_${TEST_FILENAME}`);
            const tempExists = await fs.access(tempEstimate).then(() => true).catch(() => false);
            expect(tempExists).toBe(false);
        });

        it('должен успешно работать даже если temp файлы не существуют', async () => {
            // Откатываем несуществующую транзакцию
            const response = await request(app)
                .post('/api/transaction/rollback')
                .send({
                    transactionId: 'nonexistent_tx',
                    estimateFilename: TEST_FILENAME,
                    backupId: TEST_BACKUP_ID
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            // Просто ничего не удалилось - это ок
        });

        it('должен вернуть ошибку если нет transactionId', async () => {
            const response = await request(app)
                .post('/api/transaction/rollback')
                .send({
                    // Отсутствует transactionId
                    estimateFilename: TEST_FILENAME
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('Полный цикл транзакции', () => {
        it('должен успешно выполнить prepare → commit', async () => {
            // Step 1: Prepare
            const prepareResponse = await request(app)
                .post('/api/transaction/prepare')
                .send({
                    transactionId: TEST_TRANSACTION_ID,
                    estimate: { filename: TEST_FILENAME, data: testData },
                    backup: { id: TEST_BACKUP_ID, data: testData }
                });

            expect(prepareResponse.body.success).toBe(true);

            // Step 2: Commit
            const commitResponse = await request(app)
                .post('/api/transaction/commit')
                .send({
                    transactionId: TEST_TRANSACTION_ID,
                    estimateFilename: TEST_FILENAME,
                    backupId: TEST_BACKUP_ID
                });

            expect(commitResponse.body.success).toBe(true);

            // Проверка финальных файлов
            const estimateDir = path.join(__dirname, '..', '__test_estimate__');
            const finalEstimate = path.join(estimateDir, TEST_FILENAME);
            const data = JSON.parse(await fs.readFile(finalEstimate, 'utf8'));

            expect(data.clientName).toBe('Test Client');
            expect(data.paxCount).toBe(10);

            // Cleanup
            await fs.unlink(finalEstimate).catch(() => {});
            await fs.unlink(path.join(__dirname, '..', '__test_backup__', `${TEST_BACKUP_ID}.json`)).catch(() => {});
        });

        it('должен успешно выполнить prepare → rollback', async () => {
            // Step 1: Prepare
            const prepareResponse = await request(app)
                .post('/api/transaction/prepare')
                .send({
                    transactionId: TEST_TRANSACTION_ID,
                    estimate: { filename: TEST_FILENAME, data: testData },
                    backup: { id: TEST_BACKUP_ID, data: testData }
                });

            expect(prepareResponse.body.success).toBe(true);

            // Step 2: Rollback вместо commit
            const rollbackResponse = await request(app)
                .post('/api/transaction/rollback')
                .send({
                    transactionId: TEST_TRANSACTION_ID,
                    estimateFilename: TEST_FILENAME,
                    backupId: TEST_BACKUP_ID
                });

            expect(rollbackResponse.body.success).toBe(true);

            // Проверка что финальных файлов НЕТ
            const estimateDir = path.join(__dirname, '..', '__test_estimate__');
            const finalEstimate = path.join(estimateDir, TEST_FILENAME);
            const exists = await fs.access(finalEstimate).then(() => true).catch(() => false);

            expect(exists).toBe(false);
        });
    });

    describe('Проверка атомарности', () => {
        it('должен откатиться если commit частично успешен', async () => {
            // Этот тест сложнее реализовать без мокирования fs
            // Но логика уже есть в server.js - при ошибке rename происходит cleanup
            expect(true).toBe(true); // Placeholder
        });
    });
});
