#!/usr/bin/env node

/**
 * Validate Migration v3.0.0
 *
 * Проверяет корректность миграции данных:
 * - Организации созданы
 * - Все estimates имеют organization_id
 * - Catalogs мигрированы
 * - Админ может войти в систему
 *
 * Использование:
 *   node scripts/validate-migration.js
 *
 * Требования:
 *   - Сервер должен быть запущен (node server-with-db.js)
 *   - База данных мигрирована (migrations 006, 007, 008)
 *   - Catalogs и settings мигрированы
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 * Reference: MIGRATION_V3_SPEC.md Section 7, Фаза 4 (lines 1330-1352)
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
            this.axios.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;

            Logger.success('Login successful');
            return this.token;

        } catch (err) {
            Logger.error(`Login failed: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }

    /**
     * Получить список организаций
     */
    async getOrganizations() {
        try {
            const response = await this.axios.get('/api/v1/organizations');
            return response.data;
        } catch (err) {
            // If not superuser, try to get current org
            if (err.response?.status === 403) {
                Logger.warn('Not a superuser, checking current organization...');
                // Get current user's organization
                return { success: true, data: { organizations: [] } };
            }
            throw err;
        }
    }

    /**
     * Получить список смет
     */
    async getEstimates(limit = 1000) {
        try {
            const response = await this.axios.get(`/api/v1/estimates?limit=${limit}`);
            return response.data;
        } catch (err) {
            Logger.error(`Failed to get estimates: ${err.response?.data?.error || err.message}`);
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
}

// =================================================================
// VALIDATION LOGIC
// =================================================================

/**
 * Assertion helper
 */
function assert(condition, message) {
    if (!condition) {
        Logger.error(`❌ ASSERTION FAILED: ${message}`);
        throw new Error(message);
    }
    Logger.success(`✓ ${message}`);
}

/**
 * Validate Migration согласно MIGRATION_V3_SPEC.md (lines 1333-1351)
 */
async function validateMigration(apiClient) {

    const results = {
        checks: [],
        passed: 0,
        failed: 0
    };

    try {
        // ================================================================
        // CHECK 1: Проверить организацию
        // ================================================================
        Logger.info('');
        Logger.info('CHECK 1: Organizations');
        Logger.info('-'.repeat(80));

        try {
            const orgs = await apiClient.getOrganizations();

            if (orgs.data && orgs.data.organizations) {
                assert(
                    orgs.data.organizations.length > 0,
                    'No organizations found'
                );
                Logger.info(`  Found ${orgs.data.organizations.length} organization(s)`);
                results.checks.push({ name: 'Organizations exist', passed: true });
                results.passed++;
            } else {
                // Not a superuser, skip detailed org check
                Logger.warn('  Cannot check organizations (not a superuser)');
                results.checks.push({ name: 'Organizations check', passed: true, skipped: true });
                results.passed++;
            }
        } catch (err) {
            Logger.error(`  Organizations check failed: ${err.message}`);
            results.checks.push({ name: 'Organizations exist', passed: false, error: err.message });
            results.failed++;
        }

        // ================================================================
        // CHECK 2: Проверить estimates
        // ================================================================
        Logger.info('');
        Logger.info('CHECK 2: Estimates');
        Logger.info('-'.repeat(80));

        try {
            const estimates = await apiClient.getEstimates();

            assert(
                estimates.success,
                'Failed to fetch estimates'
            );

            const estimatesList = estimates.data.estimates || [];
            Logger.info(`  Found ${estimatesList.length} estimate(s)`);

            // Проверить что все имеют organization_id
            const withoutOrg = estimatesList.filter(e => !e.organization_id);

            assert(
                withoutOrg.length === 0,
                `Estimates without organization_id found: ${withoutOrg.length}`
            );

            Logger.success(`  All ${estimatesList.length} estimates have organization_id`);
            results.checks.push({ name: 'All estimates have organization_id', passed: true });
            results.passed++;

        } catch (err) {
            Logger.error(`  Estimates check failed: ${err.message}`);
            results.checks.push({ name: 'Estimates validation', passed: false, error: err.message });
            results.failed++;
        }

        // ================================================================
        // CHECK 3: Проверить catalogs
        // ================================================================
        Logger.info('');
        Logger.info('CHECK 3: Catalogs');
        Logger.info('-'.repeat(80));

        try {
            const catalogs = await apiClient.getCatalogs();

            assert(
                catalogs.success,
                'Failed to fetch catalogs'
            );

            const catalogsList = catalogs.data.catalogs || [];

            assert(
                catalogsList.length > 0,
                'No catalogs found'
            );

            Logger.info(`  Found ${catalogsList.length} catalog(s)`);

            for (const catalog of catalogsList) {
                Logger.info(`    - ${catalog.name} (${catalog.slug}): ${catalog.templates_count} templates`);
            }

            results.checks.push({ name: 'Catalogs migrated', passed: true });
            results.passed++;

        } catch (err) {
            Logger.error(`  Catalogs check failed: ${err.message}`);
            results.checks.push({ name: 'Catalogs validation', passed: false, error: err.message });
            results.failed++;
        }

        // ================================================================
        // CHECK 4: Проверить админа (должен быть залогинен к этому моменту)
        // ================================================================
        Logger.info('');
        Logger.info('CHECK 4: Admin Login');
        Logger.info('-'.repeat(80));

        try {
            assert(
                apiClient.token !== null,
                'Admin login failed'
            );

            Logger.success(`  Admin logged in successfully`);
            results.checks.push({ name: 'Admin can login', passed: true });
            results.passed++;

        } catch (err) {
            Logger.error(`  Admin login check failed: ${err.message}`);
            results.checks.push({ name: 'Admin login', passed: false, error: err.message });
            results.failed++;
        }

    } catch (err) {
        Logger.error('Validation process failed:');
        Logger.error(err.message);
        results.checks.push({ name: 'Validation process', passed: false, error: err.message });
        results.failed++;
    }

    return results;
}

/**
 * Показать отчёт о валидации
 */
function printValidationReport(results) {
    Logger.info('');
    Logger.info('='.repeat(80));
    Logger.info('VALIDATION REPORT');
    Logger.info('='.repeat(80));

    Logger.info(`Total checks: ${results.checks.length}`);
    Logger.info(`Passed: ${results.passed}`);
    Logger.info(`Failed: ${results.failed}`);
    Logger.info('');

    // Passed checks
    const passed = results.checks.filter(c => c.passed);
    if (passed.length > 0) {
        Logger.success('Passed checks:');
        passed.forEach(c => {
            const skipTag = c.skipped ? ' (skipped)' : '';
            Logger.success(`  ✓ ${c.name}${skipTag}`);
        });
        Logger.info('');
    }

    // Failed checks
    const failed = results.checks.filter(c => !c.passed);
    if (failed.length > 0) {
        Logger.error('Failed checks:');
        failed.forEach(c => {
            Logger.error(`  ✗ ${c.name}`);
            if (c.error) {
                Logger.error(`    Error: ${c.error}`);
            }
        });
        Logger.info('');
    }

    Logger.info('='.repeat(80));

    if (results.failed === 0) {
        Logger.success('✅ Migration validated successfully');
        return false;
    } else {
        Logger.error('❌ Migration validation FAILED');
        return true;
    }
}

// =================================================================
// MAIN
// =================================================================

async function main() {
    Logger.info('='.repeat(80));
    Logger.info('VALIDATE MIGRATION v3.0.0');
    Logger.info('='.repeat(80));
    Logger.info('');

    try {
        // 1. Создать API client и войти
        const apiClient = new APIClient(API_BASE_URL);
        await apiClient.login(ADMIN_EMAIL, ADMIN_PASSWORD);

        // 2. Запустить валидацию
        const results = await validateMigration(apiClient);

        // 3. Показать отчёт
        const hasFailures = printValidationReport(results);

        process.exit(hasFailures ? 1 : 0);

    } catch (err) {
        Logger.error('Validation failed:');
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
    validateMigration,
    printValidationReport
};
