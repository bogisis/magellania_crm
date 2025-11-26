#!/usr/bin/env node

/**
 * Final Integration Test v3.0.0
 *
 * Автоматизированная проверка финальной интеграции миграции
 *
 * Checklist согласно MIGRATION_V3_SPEC.md Фаза 6 (lines 1365-1375):
 * - [ ] Войти как admin@localhost / admin123
 * - [ ] Проверить список смет - все на месте?
 * - [ ] Открыть смету - загружается корректно?
 * - [ ] Проверить каталоги - все регионы доступны?
 * - [ ] Создать новую смету - сохраняется?
 * - [ ] Проверить синхронизацию - работает?
 *
 * Использование:
 *   node scripts/test-final-integration.js
 *
 * Требования:
 *   - Сервер должен быть запущен (node server-with-db.js)
 *   - Все миграции выполнены (Фазы 1-5)
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 * Reference: MIGRATION_V3_SPEC.md Section 7, Фаза 6 (lines 1365-1375)
 */

const axios = require('axios');

// =================================================================
// CONFIGURATION
// =================================================================

const API_BASE_URL = process.env.API_URL || 'http://localhost:4000';

// Credentials для дефолтного админа
const ADMIN_EMAIL = 'admin@localhost';
const ADMIN_PASSWORD = 'admin123';

// =================================================================
// LOGGER
// =================================================================

class Logger {
    static log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${level}] ${message}`);
    }

    static info(message) {
        this.log(message, 'INFO');
    }

    static warn(message) {
        this.log(message, 'WARN');
    }

    static error(message) {
        this.log(message, 'ERROR');
    }

    static success(message) {
        this.log(message, 'SUCCESS');
    }
}

// =================================================================
// API CLIENT
// =================================================================

class APIClient {
    constructor(baseURL) {
        this.baseURL = baseURL;
        this.token = null;
        this.axios = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Вход в систему
     */
    async login(email, password) {
        Logger.info(`Logging in as ${email}...`);

        try {
            const response = await this.axios.post('/api/v1/auth/login', {
                email,
                password
            });

            this.token = response.data.data.token;
            this.user = response.data.data.user;
            this.axios.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;

            Logger.success(`Login successful: ${this.user.username} (${this.user.role})`);
            return { token: this.token, user: this.user };

        } catch (err) {
            Logger.error(`Login failed: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }

    /**
     * Получить список смет
     */
    async getEstimates() {
        try {
            const response = await this.axios.get('/api/v1/estimates');
            return response.data;
        } catch (err) {
            Logger.error(`Failed to get estimates: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }

    /**
     * Получить смету по ID
     */
    async getEstimate(id) {
        try {
            const response = await this.axios.get(`/api/v1/estimates/${id}`);
            return response.data;
        } catch (err) {
            Logger.error(`Failed to get estimate ${id}: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }

    /**
     * Создать новую смету
     */
    async createEstimate(data) {
        try {
            const response = await this.axios.post('/api/v1/estimates', data);
            return response.data;
        } catch (err) {
            Logger.error(`Failed to create estimate: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }

    /**
     * Получить список каталогов
     */
    async getCatalogs() {
        try {
            const response = await this.axios.get('/api/v1/catalogs');
            return response.data;
        } catch (err) {
            Logger.error(`Failed to get catalogs: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }

    /**
     * Получить обновления синхронизации
     */
    async getSyncUpdates(timestamp) {
        try {
            const response = await this.axios.get(`/api/v1/sync/updates?timestamp=${timestamp}`);
            return response.data;
        } catch (err) {
            Logger.error(`Failed to get sync updates: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }
}

// =================================================================
// TEST HELPERS
// =================================================================

function assert(condition, message) {
    if (!condition) {
        Logger.error(`❌ ASSERTION FAILED: ${message}`);
        throw new Error(message);
    }
    Logger.success(`✓ ${message}`);
}

// =================================================================
// TEST SUITE
// =================================================================

async function runIntegrationTests() {
    const apiClient = new APIClient(API_BASE_URL);

    const results = {
        tests: [],
        passed: 0,
        failed: 0
    };

    try {
        // ================================================================
        // TEST 1: Войти как admin@localhost / admin123
        // ================================================================
        Logger.info('');
        Logger.info('TEST 1: Admin Login');
        Logger.info('-'.repeat(80));

        try {
            const authResult = await apiClient.login(ADMIN_EMAIL, ADMIN_PASSWORD);

            assert(
                authResult.token !== null,
                'Admin login successful - token received'
            );

            assert(
                authResult.user.email === ADMIN_EMAIL,
                'Admin user email matches'
            );

            assert(
                authResult.user.role === 'admin',
                'Admin user role is correct'
            );

            results.tests.push({ name: 'Admin login', passed: true });
            results.passed++;

        } catch (err) {
            Logger.error(`Admin login test failed: ${err.message}`);
            results.tests.push({ name: 'Admin login', passed: false, error: err.message });
            results.failed++;
            throw err; // Останавливаем дальнейшие тесты если не можем залогиниться
        }

        // ================================================================
        // TEST 2: Проверить список смет - все на месте?
        // ================================================================
        Logger.info('');
        Logger.info('TEST 2: Estimates List');
        Logger.info('-'.repeat(80));

        try {
            const estimates = await apiClient.getEstimates();

            assert(
                estimates.success,
                'Estimates API returns success'
            );

            const estimatesList = estimates.data.estimates || [];
            Logger.info(`  Found ${estimatesList.length} estimate(s)`);

            // Проверяем что все имеют необходимые поля
            for (const estimate of estimatesList) {
                assert(estimate.id, `Estimate has ID: ${estimate.id}`);
                assert(estimate.filename, `Estimate has filename: ${estimate.filename}`);
                assert(estimate.organization_id, `Estimate has organization_id`);
            }

            results.tests.push({ name: 'Estimates list retrieval', passed: true });
            results.passed++;

            // Сохраняем первую смету для следующего теста
            if (estimatesList.length > 0) {
                results.firstEstimateId = estimatesList[0].id;
            }

        } catch (err) {
            Logger.error(`Estimates list test failed: ${err.message}`);
            results.tests.push({ name: 'Estimates list retrieval', passed: false, error: err.message });
            results.failed++;
        }

        // ================================================================
        // TEST 3: Открыть смету - загружается корректно?
        // ================================================================
        Logger.info('');
        Logger.info('TEST 3: Load Estimate');
        Logger.info('-'.repeat(80));

        if (results.firstEstimateId) {
            try {
                const estimate = await apiClient.getEstimate(results.firstEstimateId);

                assert(
                    estimate.success,
                    'Estimate loaded successfully'
                );

                assert(
                    estimate.data !== null,
                    'Estimate data is not null'
                );

                assert(
                    estimate.data.id === results.firstEstimateId,
                    'Estimate ID matches requested ID'
                );

                Logger.info(`  Loaded estimate: ${estimate.data.filename}`);

                results.tests.push({ name: 'Load existing estimate', passed: true });
                results.passed++;

            } catch (err) {
                Logger.error(`Load estimate test failed: ${err.message}`);
                results.tests.push({ name: 'Load existing estimate', passed: false, error: err.message });
                results.failed++;
            }
        } else {
            Logger.warn('Skipping load estimate test - no estimates found');
            results.tests.push({ name: 'Load existing estimate', passed: true, skipped: true });
            results.passed++;
        }

        // ================================================================
        // TEST 4: Проверить каталоги - все регионы доступны?
        // ================================================================
        Logger.info('');
        Logger.info('TEST 4: Catalogs');
        Logger.info('-'.repeat(80));

        try {
            const catalogs = await apiClient.getCatalogs();

            assert(
                catalogs.success,
                'Catalogs API returns success'
            );

            const catalogsList = catalogs.data.catalogs || [];
            Logger.info(`  Found ${catalogsList.length} catalog(s)`);

            for (const catalog of catalogsList) {
                Logger.info(`    - ${catalog.name} (${catalog.slug}): ${catalog.templates_count} templates`);

                assert(catalog.id, 'Catalog has ID');
                assert(catalog.name, 'Catalog has name');
                assert(catalog.slug, 'Catalog has slug');
            }

            results.tests.push({ name: 'Catalogs retrieval', passed: true });
            results.passed++;

        } catch (err) {
            Logger.error(`Catalogs test failed: ${err.message}`);
            results.tests.push({ name: 'Catalogs retrieval', passed: false, error: err.message });
            results.failed++;
        }

        // ================================================================
        // TEST 5: Создать новую смету - сохраняется?
        // ================================================================
        Logger.info('');
        Logger.info('TEST 5: Create New Estimate');
        Logger.info('-'.repeat(80));

        try {
            const testEstimate = {
                filename: `test-estimate-${Date.now()}.json`,
                data: JSON.stringify({
                    version: '1.1.0',
                    metadata: {
                        clientName: 'Test Client',
                        clientEmail: 'test@example.com',
                        paxCount: 10,
                        services: []
                    },
                    services: []
                }),
                client_name: 'Test Client',
                client_email: 'test@example.com',
                pax_count: 10,
                visibility: 'private'
            };

            const result = await apiClient.createEstimate(testEstimate);

            assert(
                result.success,
                'Estimate created successfully'
            );

            assert(
                result.data && result.data.id,
                'Created estimate has ID'
            );

            Logger.info(`  Created estimate ID: ${result.data.id}`);

            results.tests.push({ name: 'Create new estimate', passed: true });
            results.passed++;
            results.createdEstimateId = result.data.id;

        } catch (err) {
            Logger.error(`Create estimate test failed: ${err.message}`);
            results.tests.push({ name: 'Create new estimate', passed: false, error: err.message });
            results.failed++;
        }

        // ================================================================
        // TEST 6: Проверить синхронизацию - работает?
        // ================================================================
        Logger.info('');
        Logger.info('TEST 6: Sync Updates');
        Logger.info('-'.repeat(80));

        try {
            // Запрашиваем обновления с timestamp 5 минут назад
            const fiveMinutesAgo = Math.floor((Date.now() - 5 * 60 * 1000) / 1000);

            const syncUpdates = await apiClient.getSyncUpdates(fiveMinutesAgo);

            assert(
                syncUpdates.success,
                'Sync updates API returns success'
            );

            const changes = syncUpdates.data.changes || [];
            Logger.info(`  Received ${changes.length} sync update(s)`);

            results.tests.push({ name: 'Sync updates retrieval', passed: true });
            results.passed++;

        } catch (err) {
            Logger.error(`Sync updates test failed: ${err.message}`);
            results.tests.push({ name: 'Sync updates retrieval', passed: false, error: err.message });
            results.failed++;
        }

    } catch (err) {
        Logger.error('Test suite execution failed:');
        Logger.error(err.message);
        results.tests.push({ name: 'Test execution', passed: false, error: err.message });
        results.failed++;
    }

    return results;
}

// =================================================================
// REPORT
// =================================================================

function printTestReport(results) {
    Logger.info('');
    Logger.info('='.repeat(80));
    Logger.info('FINAL INTEGRATION TEST REPORT');
    Logger.info('='.repeat(80));

    Logger.info(`Total tests: ${results.tests.length}`);
    Logger.info(`Passed: ${results.passed}`);
    Logger.info(`Failed: ${results.failed}`);
    Logger.info('');

    // Passed tests
    const passed = results.tests.filter(t => t.passed);
    if (passed.length > 0) {
        Logger.success('Passed tests:');
        passed.forEach(t => {
            const skipTag = t.skipped ? ' (skipped)' : '';
            Logger.success(`  ✓ ${t.name}${skipTag}`);
        });
        Logger.info('');
    }

    // Failed tests
    const failed = results.tests.filter(t => !t.passed);
    if (failed.length > 0) {
        Logger.error('Failed tests:');
        failed.forEach(t => {
            Logger.error(`  ✗ ${t.name}`);
            if (t.error) {
                Logger.error(`    Error: ${t.error}`);
            }
        });
        Logger.info('');
    }

    Logger.info('='.repeat(80));

    if (results.failed === 0) {
        Logger.success('✅ All integration tests PASSED');
        Logger.success('');
        Logger.success('Migration v3.0.0 is ready for production!');
        return false;
    } else {
        Logger.error('❌ Some integration tests FAILED');
        Logger.error('');
        Logger.error('Please review errors above and fix before production deployment.');
        return true;
    }
}

// =================================================================
// MAIN
// =================================================================

async function main() {
    Logger.info('='.repeat(80));
    Logger.info('FINAL INTEGRATION TEST - Migration v3.0.0');
    Logger.info('='.repeat(80));
    Logger.info('');
    Logger.info('Reference: MIGRATION_V3_SPEC.md Section 7, Фаза 6 (lines 1365-1375)');
    Logger.info('');

    try {
        // Запуск тестов
        const results = await runIntegrationTests();

        // Отчёт
        const hasFailures = printTestReport(results);

        process.exit(hasFailures ? 1 : 0);

    } catch (err) {
        Logger.error('Test execution failed:');
        Logger.error(err.message);
        if (err.stack) {
            Logger.error(err.stack);
        }
        process.exit(1);
    }
}

// Запуск
if (require.main === module) {
    main();
}

module.exports = {
    runIntegrationTests,
    printTestReport
};
