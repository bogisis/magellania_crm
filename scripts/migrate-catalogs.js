#!/usr/bin/env node

/**
 * Migrate Catalogs from localStorage to Database
 *
 * Мигрирует каталоги услуг из localStorage backup в базу данных через API
 *
 * Использование:
 *   node scripts/migrate-catalogs.js [backup-file.json]
 *
 * Backup file format:
 * {
 *   "quoteCalc_templates_Ushuaia": [...],
 *   "quoteCalc_categories_Ushuaia": [...],
 *   "quoteCalc_templates_Patagonia": [...],
 *   "quoteCalc_categories_Patagonia": [...],
 *   ...
 * }
 *
 * Требования:
 *   - Сервер должен быть запущен (node server-with-db.js)
 *   - База данных мигрирована (migrations 006, 007, 008)
 *   - Пользователь admin@localhost создан
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// =================================================================
// CONFIGURATION
// =================================================================

const API_BASE_URL = process.env.API_URL || 'http://localhost:4000';
const BACKUP_FILE = process.argv[2] || path.join(__dirname, '..', 'localStorage-backup.json');
const DEFAULT_REGIONS = ['Ushuaia', 'Patagonia', 'Buenos Aires'];

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

            this.token = response.data.token;
            this.axios.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;

            Logger.success('Login successful');
            return this.token;

        } catch (err) {
            Logger.error(`Login failed: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }

    /**
     * Создать каталог
     */
    async createCatalog(catalogData) {
        Logger.info(`Creating catalog: ${catalogData.name}...`);

        try {
            const response = await this.axios.post('/api/v1/catalogs', catalogData);
            Logger.success(`Catalog created: ${catalogData.name} (ID: ${response.data.id})`);
            return response.data;

        } catch (err) {
            Logger.error(`Failed to create catalog ${catalogData.name}: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }

    /**
     * Получить все каталоги
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
// MIGRATION LOGIC
// =================================================================

/**
 * Прочитать localStorage backup из файла
 */
function readLocalStorageBackup(backupFile) {
    Logger.info(`Reading backup file: ${backupFile}`);

    if (!fs.existsSync(backupFile)) {
        Logger.error(`Backup file not found: ${backupFile}`);
        Logger.error('');
        Logger.error('To create a backup file:');
        Logger.error('1. Open the app in browser');
        Logger.error('2. Open DevTools Console');
        Logger.error('3. Run: JSON.stringify(localStorage)');
        Logger.error('4. Save output to localStorage-backup.json');
        throw new Error('Backup file not found');
    }

    const data = fs.readFileSync(backupFile, 'utf-8');
    const backup = JSON.parse(data);

    Logger.success(`Backup file loaded (${Object.keys(backup).length} keys)`);
    return backup;
}

/**
 * Извлечь данные каталога для региона
 */
function extractCatalogData(backup, region) {
    const templatesKey = `quoteCalc_templates_${region}`;
    const categoriesKey = `quoteCalc_categories_${region}`;

    const templatesRaw = backup[templatesKey];
    const categoriesRaw = backup[categoriesKey];

    if (!templatesRaw && !categoriesRaw) {
        Logger.warn(`No data found for region: ${region}`);
        return null;
    }

    // Parse JSON strings
    const templates = templatesRaw ? JSON.parse(templatesRaw) : [];
    const categories = categoriesRaw ? JSON.parse(categoriesRaw) : [];

    Logger.info(`  Region ${region}: ${templates.length} templates, ${categories.length} categories`);

    return {
        templates,
        categories
    };
}

/**
 * Мигрировать каталог для региона
 */
async function migrateCatalogForRegion(apiClient, region, catalogData) {
    if (!catalogData) {
        return null;
    }

    const { templates, categories } = catalogData;

    // Подготовить данные для API
    const payload = {
        name: `${region} Services`,
        slug: region.toLowerCase().replace(/\s+/g, '-'),
        region: region,
        data: JSON.stringify({
            templates,
            categories
        }),
        visibility: 'organization',
        templates_count: templates.length,
        categories_count: categories.length,
        version: '1.2.0'
    };

    try {
        const result = await apiClient.createCatalog(payload);
        return result;
    } catch (err) {
        // Если каталог уже существует, пропустить
        if (err.response?.status === 409) {
            Logger.warn(`Catalog ${payload.name} already exists, skipping`);
            return null;
        }
        throw err;
    }
}

/**
 * Мигрировать все каталоги
 */
async function migrateAllCatalogs(apiClient, backup, regions) {
    Logger.info('Starting catalog migration...');
    Logger.info(`Regions to migrate: ${regions.join(', ')}`);
    Logger.info('');

    const results = [];

    for (const region of regions) {
        try {
            const catalogData = extractCatalogData(backup, region);
            const result = await migrateCatalogForRegion(apiClient, region, catalogData);
            results.push({ region, success: true, result });

        } catch (err) {
            Logger.error(`Failed to migrate ${region}: ${err.message}`);
            results.push({ region, success: false, error: err.message });
        }
    }

    return results;
}

/**
 * Показать отчёт о миграции
 */
function printMigrationReport(results) {
    Logger.info('');
    Logger.info('='.repeat(80));
    Logger.info('MIGRATION REPORT');
    Logger.info('='.repeat(80));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    Logger.info(`Total regions: ${results.length}`);
    Logger.info(`Successful: ${successful.length}`);
    Logger.info(`Failed: ${failed.length}`);
    Logger.info('');

    if (successful.length > 0) {
        Logger.success('Successfully migrated:');
        successful.forEach(r => {
            Logger.success(`  ✓ ${r.region}`);
        });
        Logger.info('');
    }

    if (failed.length > 0) {
        Logger.error('Failed to migrate:');
        failed.forEach(r => {
            Logger.error(`  ✗ ${r.region}: ${r.error}`);
        });
        Logger.info('');
    }

    Logger.info('='.repeat(80));
}

// =================================================================
// MAIN
// =================================================================

async function main() {
    Logger.info('='.repeat(80));
    Logger.info('MIGRATE CATALOGS FROM LOCALSTORAGE TO DATABASE');
    Logger.info('='.repeat(80));
    Logger.info('');

    try {
        // 1. Прочитать backup файл
        const backup = readLocalStorageBackup(BACKUP_FILE);

        // 2. Создать API client
        const apiClient = new APIClient(API_BASE_URL);

        // 3. Войти в систему
        await apiClient.login(ADMIN_EMAIL, ADMIN_PASSWORD);

        // 4. Мигрировать каталоги
        const results = await migrateAllCatalogs(apiClient, backup, DEFAULT_REGIONS);

        // 5. Показать отчёт
        printMigrationReport(results);

        // Проверить успешность
        const hasFailures = results.some(r => !r.success);
        process.exit(hasFailures ? 1 : 0);

    } catch (err) {
        Logger.error('Migration failed:');
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
    readLocalStorageBackup,
    extractCatalogData,
    migrateCatalogForRegion,
    migrateAllCatalogs
};
