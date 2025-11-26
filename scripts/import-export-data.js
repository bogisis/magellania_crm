#!/usr/bin/env node

/**
 * Import Export Data into Database
 *
 * Импортирует экспортированные данные (estimates + catalogs) в базу данных
 *
 * Использование:
 *   node scripts/import-export-data.js <estimates-file> <catalog-file>
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

            Logger.success(`Login successful: ${this.user.username}`);
            return { token: this.token, user: this.user };

        } catch (err) {
            Logger.error(`Login failed: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }

    async createEstimate(data) {
        try {
            const response = await this.axios.post('/api/v1/estimates', data);
            return response.data;
        } catch (err) {
            Logger.error(`Failed to create estimate: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }

    async createCatalog(data) {
        try {
            const response = await this.axios.post('/api/v1/catalogs', data);
            return response.data;
        } catch (err) {
            Logger.error(`Failed to create catalog: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }
}

// =================================================================
// IMPORT LOGIC
// =================================================================

/**
 * Загрузить файл экспорта
 */
function loadExportFile(filePath) {
    Logger.info(`Loading export file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        Logger.error(`File not found: ${filePath}`);
        throw new Error('Export file not found');
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    const exportData = JSON.parse(data);

    Logger.success(`Export file loaded (version: ${exportData.version})`);
    return exportData;
}

/**
 * Импортировать estimates
 */
async function importEstimates(apiClient, estimates) {
    Logger.info('');
    Logger.info('='.repeat(80));
    Logger.info('IMPORTING ESTIMATES');
    Logger.info('='.repeat(80));

    const results = {
        success: 0,
        failed: 0,
        errors: []
    };

    for (const estimate of estimates) {
        try {
            Logger.info(`Importing estimate: ${estimate.filename}`);

            // Prepare data for API
            const apiData = {
                filename: estimate.filename,
                data: JSON.stringify(estimate.data),
                client_name: estimate.data.clientName || '',
                client_email: estimate.data.clientEmail || '',
                client_phone: estimate.data.clientPhone || '',
                pax_count: estimate.data.paxCount || 0,
                tour_start: estimate.data.tourStart || null,
                tour_end: estimate.data.tourEnd || null,
                visibility: 'organization'
            };

            await apiClient.createEstimate(apiData);
            Logger.success(`  ✓ Imported: ${estimate.filename}`);
            results.success++;

        } catch (err) {
            Logger.error(`  ✗ Failed: ${estimate.filename} - ${err.message}`);
            results.failed++;
            results.errors.push({
                filename: estimate.filename,
                error: err.message
            });
        }
    }

    Logger.info('');
    Logger.info(`Estimates import completed: ${results.success} success, ${results.failed} failed`);
    return results;
}

/**
 * Импортировать catalogs
 */
async function importCatalogs(apiClient, catalogData) {
    Logger.info('');
    Logger.info('='.repeat(80));
    Logger.info('IMPORTING CATALOGS');
    Logger.info('='.repeat(80));

    const results = {
        success: 0,
        failed: 0,
        errors: []
    };

    const regions = catalogData.regions || [];
    const regionData = catalogData.regionData || {};

    for (const region of regions) {
        try {
            Logger.info(`Importing catalog: ${region}`);

            const data = regionData[region];
            if (!data) {
                Logger.warn(`  ○ Skipping ${region} - no data`);
                continue;
            }

            const templates = data.templates || [];
            const categories = data.categories || [];

            Logger.info(`  Templates: ${templates.length}, Categories: ${categories.length}`);

            // Prepare data for API
            const apiData = {
                name: `${region} Services`,
                slug: region.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-'),
                region: region,
                data: JSON.stringify({ templates, categories }),
                visibility: 'organization'
            };

            await apiClient.createCatalog(apiData);
            Logger.success(`  ✓ Imported: ${region} (${templates.length} templates)`);
            results.success++;

        } catch (err) {
            Logger.error(`  ✗ Failed: ${region} - ${err.message}`);
            results.failed++;
            results.errors.push({
                region: region,
                error: err.message
            });
        }
    }

    Logger.info('');
    Logger.info(`Catalogs import completed: ${results.success} success, ${results.failed} failed`);
    return results;
}

/**
 * Показать отчёт
 */
function printImportReport(estimatesResult, catalogsResult) {
    Logger.info('');
    Logger.info('='.repeat(80));
    Logger.info('IMPORT REPORT');
    Logger.info('='.repeat(80));

    Logger.info('Estimates:');
    Logger.info(`  Success: ${estimatesResult.success}`);
    Logger.info(`  Failed: ${estimatesResult.failed}`);

    if (estimatesResult.errors.length > 0) {
        Logger.error('  Errors:');
        estimatesResult.errors.forEach(e => {
            Logger.error(`    - ${e.filename}: ${e.error}`);
        });
    }

    Logger.info('');
    Logger.info('Catalogs:');
    Logger.info(`  Success: ${catalogsResult.success}`);
    Logger.info(`  Failed: ${catalogsResult.failed}`);

    if (catalogsResult.errors.length > 0) {
        Logger.error('  Errors:');
        catalogsResult.errors.forEach(e => {
            Logger.error(`    - ${e.region}: ${e.error}`);
        });
    }

    Logger.info('');
    Logger.info('='.repeat(80));

    const hasFailures = estimatesResult.failed > 0 || catalogsResult.failed > 0;

    if (hasFailures) {
        Logger.error('Import completed with FAILURES');
    } else {
        Logger.success('✅ Import completed SUCCESSFULLY');
    }

    return hasFailures;
}

// =================================================================
// MAIN
// =================================================================

async function main() {
    Logger.info('='.repeat(80));
    Logger.info('IMPORT EXPORT DATA INTO DATABASE');
    Logger.info('='.repeat(80));
    Logger.info('');

    // Check arguments
    const estimatesFile = process.argv[2];
    const catalogFile = process.argv[3];

    if (!estimatesFile || !catalogFile) {
        Logger.error('Usage: node scripts/import-export-data.js <estimates-file> <catalog-file>');
        Logger.error('');
        Logger.error('Example:');
        Logger.error('  node scripts/import-export-data.js \\');
        Logger.error('    "/Users/bogisis/Downloads/Quote Calculator Export Nov 19 2025.json" \\');
        Logger.error('    "/Users/bogisis/Downloads/Magellania CRM Backup Nov 19 2025 (1).json"');
        process.exit(1);
    }

    try {
        // 1. Load export files
        const estimatesExport = loadExportFile(estimatesFile);
        const catalogExport = loadExportFile(catalogFile);

        // 2. Create API client and login
        const apiClient = new APIClient(API_BASE_URL);
        await apiClient.login(ADMIN_EMAIL, ADMIN_PASSWORD);

        // 3. Import estimates
        const estimatesResult = await importEstimates(apiClient, estimatesExport.data.estimates);

        // 4. Import catalogs
        const catalogsResult = await importCatalogs(apiClient, catalogExport);

        // 5. Print report
        const hasFailures = printImportReport(estimatesResult, catalogsResult);

        process.exit(hasFailures ? 1 : 0);

    } catch (err) {
        Logger.error('Import failed:');
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
    importEstimates,
    importCatalogs
};
