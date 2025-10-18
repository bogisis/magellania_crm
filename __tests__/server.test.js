const request = require('supertest');
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { transliterate } = require('../utils');

describe('Server API - Новые endpoints', () => {
    let app;
    let server;
    const TEST_PORT = 3001;
    const TEST_DIR = path.join(__dirname, '..', '__test_data__');
    const ESTIMATE_DIR = path.join(TEST_DIR, 'estimate');
    const BACKUP_DIR = path.join(TEST_DIR, 'backup');
    const CATALOG_DIR = path.join(TEST_DIR, 'catalog');

    // Создаём тестовый сервер
    beforeAll(async () => {
        // Создаём тестовые директории
        await fs.mkdir(ESTIMATE_DIR, { recursive: true });
        await fs.mkdir(BACKUP_DIR, { recursive: true });
        await fs.mkdir(CATALOG_DIR, { recursive: true });

        // Инициализируем Express app
        app = express();
        app.use(cors());
        app.use(express.json({ limit: '50mb' }));

        // Копируем endpoints из server.js (упрощённая версия для тестов)

        // PUT /api/estimates/:oldFilename/rename
        app.put('/api/estimates/:oldFilename/rename', async (req, res) => {
            try {
                const oldPath = path.join(ESTIMATE_DIR, req.params.oldFilename);
                const newFilename = req.body.newFilename;
                const newPath = path.join(ESTIMATE_DIR, newFilename);

                await fs.access(oldPath);
                await fs.rename(oldPath, newPath);

                res.json({ success: true, newFilename });
            } catch (err) {
                res.status(500).json({ success: false, error: err.message });
            }
        });

        // GET /api/backups
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

                const validBackups = backups.filter(b => b !== null);
                validBackups.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

                res.json({ success: true, backups: validBackups });
            } catch (err) {
                res.status(500).json({ success: false, error: err.message });
            }
        });

        // GET /api/backups/:id
        app.get('/api/backups/:id', async (req, res) => {
            try {
                const filepath = path.join(BACKUP_DIR, `${req.params.id}.json`);
                const data = await fs.readFile(filepath, 'utf8');
                res.json({ success: true, data: JSON.parse(data) });
            } catch (err) {
                res.status(500).json({ success: false, error: err.message });
            }
        });

        // POST /api/backups/:id
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

        // POST /api/backups/:id/restore
        app.post('/api/backups/:id/restore', async (req, res) => {
            try {
                const backupPath = path.join(BACKUP_DIR, `${req.params.id}.json`);
                const backupData = await fs.readFile(backupPath, 'utf8');
                const data = JSON.parse(backupData);

                const clientName = data.clientName || '';
                const trans = clientName ? transliterate(clientName.trim().toLowerCase()).replace(/\s+/g, '_') : 'untitled';
                const date = data.tourStart || new Date().toISOString().split('T')[0];
                const pax = data.paxCount || 0;
                const id = req.params.id;

                const filename = `${trans}_${date}_${pax}pax_${id}.json`;
                const estimatePath = path.join(ESTIMATE_DIR, filename);

                await fs.writeFile(estimatePath, JSON.stringify(data, null, 2));

                res.json({ success: true, filename });
            } catch (err) {
                res.status(500).json({ success: false, error: err.message });
            }
        });

        // Запускаем тестовый сервер
        server = app.listen(TEST_PORT);
    });

    afterAll(async () => {
        // Закрываем сервер
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }

        // Удаляем тестовые директории
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch (err) {
            console.error('Error cleaning up test directories:', err);
        }
    });

    beforeEach(async () => {
        // Очищаем директории перед каждым тестом
        const dirs = [ESTIMATE_DIR, BACKUP_DIR];
        for (const dir of dirs) {
            const files = await fs.readdir(dir);
            for (const file of files) {
                await fs.unlink(path.join(dir, file));
            }
        }
    });

    describe('PUT /api/estimates/:oldFilename/rename', () => {
        test('должен успешно переименовать файл', async () => {
            // Создаём тестовый файл
            const oldFilename = 'old_name.json';
            const newFilename = 'new_name.json';
            await fs.writeFile(
                path.join(ESTIMATE_DIR, oldFilename),
                JSON.stringify({ test: 'data' })
            );

            const response = await request(app)
                .put(`/api/estimates/${oldFilename}/rename`)
                .send({ newFilename });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                success: true,
                newFilename
            });

            // Проверяем что файл переименован
            const newExists = await fs.access(path.join(ESTIMATE_DIR, newFilename))
                .then(() => true)
                .catch(() => false);
            expect(newExists).toBe(true);

            // Проверяем что старый файл удалён
            const oldExists = await fs.access(path.join(ESTIMATE_DIR, oldFilename))
                .then(() => true)
                .catch(() => false);
            expect(oldExists).toBe(false);
        });

        test('должен вернуть ошибку если файл не существует', async () => {
            const response = await request(app)
                .put('/api/estimates/nonexistent.json/rename')
                .send({ newFilename: 'new_name.json' });

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/backups', () => {
        test('должен вернуть пустой список если нет backup\'ов', async () => {
            const response = await request(app).get('/api/backups');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                success: true,
                backups: []
            });
        });

        test('должен вернуть список backup\'ов', async () => {
            // Создаём тестовые backup'ы
            const backup1 = {
                id: 'test123',
                clientName: 'Иванов Иван',
                paxCount: 8,
                tourStart: '2025-12-26'
            };
            await fs.writeFile(
                path.join(BACKUP_DIR, 'test123.json'),
                JSON.stringify(backup1)
            );

            const response = await request(app).get('/api/backups');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.backups).toHaveLength(1);
            expect(response.body.backups[0]).toMatchObject({
                id: 'test123',
                clientName: 'Иванов Иван',
                paxCount: 8,
                hasEstimate: false
            });
        });

        test('должен правильно определять наличие файла сметы', async () => {
            const id = 'test456';
            const backup = {
                id,
                clientName: 'Петров Пётр',
                paxCount: 4,
                tourStart: '2025-11-15'
            };

            // Создаём backup
            await fs.writeFile(
                path.join(BACKUP_DIR, `${id}.json`),
                JSON.stringify(backup)
            );

            // Создаём файл сметы
            await fs.writeFile(
                path.join(ESTIMATE_DIR, `petrov_2025-11-15_4pax_${id}.json`),
                JSON.stringify(backup)
            );

            const response = await request(app).get('/api/backups');

            expect(response.status).toBe(200);
            expect(response.body.backups[0].hasEstimate).toBe(true);
        });
    });

    describe('GET /api/backups/:id', () => {
        test('должен вернуть данные backup\'а по ID', async () => {
            const id = 'abc123';
            const data = {
                id,
                clientName: 'Тестов Тест',
                paxCount: 10
            };

            await fs.writeFile(
                path.join(BACKUP_DIR, `${id}.json`),
                JSON.stringify(data)
            );

            const response = await request(app).get(`/api/backups/${id}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                success: true,
                data
            });
        });

        test('должен вернуть ошибку если backup не существует', async () => {
            const response = await request(app).get('/api/backups/nonexistent');

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/backups/:id', () => {
        test('должен сохранить backup', async () => {
            const id = 'def456';
            const data = {
                id,
                clientName: 'Сидоров Сидор',
                paxCount: 5
            };

            const response = await request(app)
                .post(`/api/backups/${id}`)
                .send(data);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ success: true });

            // Проверяем что файл создан
            const savedData = await fs.readFile(
                path.join(BACKUP_DIR, `${id}.json`),
                'utf8'
            );
            expect(JSON.parse(savedData)).toEqual(data);
        });
    });

    describe('POST /api/backups/:id/restore', () => {
        test('должен восстановить смету из backup\'а', async () => {
            const id = 'restore123';
            const backupData = {
                id,
                clientName: 'Козлов Козёл',
                paxCount: 6,
                tourStart: '2025-10-20'
            };

            // Создаём backup
            await fs.writeFile(
                path.join(BACKUP_DIR, `${id}.json`),
                JSON.stringify(backupData)
            );

            const response = await request(app)
                .post(`/api/backups/${id}/restore`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.filename).toContain(id);
            expect(response.body.filename).toContain('kozlov');

            // Проверяем что файл сметы создан
            const estimateFile = response.body.filename;
            const estimateData = await fs.readFile(
                path.join(ESTIMATE_DIR, estimateFile),
                'utf8'
            );
            expect(JSON.parse(estimateData)).toEqual(backupData);
        });

        test('должен корректно обрабатывать смету без имени клиента', async () => {
            const id = 'untitled123';
            const backupData = {
                id,
                clientName: '',
                paxCount: 0,
                tourStart: '2025-10-15'
            };

            await fs.writeFile(
                path.join(BACKUP_DIR, `${id}.json`),
                JSON.stringify(backupData)
            );

            const response = await request(app)
                .post(`/api/backups/${id}/restore`);

            expect(response.status).toBe(200);
            expect(response.body.filename).toContain('untitled');
        });
    });
});
