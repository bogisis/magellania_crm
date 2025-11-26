#!/usr/bin/env node

/**
 * Migrate Settings from localStorage to Database
 *
 * Мигрирует пользовательские и организационные настройки из localStorage backup в базу данных через API
 *
 * Использование:
 *   node scripts/migrate-settings.js [backup-file.json]
 *
 * Backup file format:
 * {
 *   "quoteCalc_theme": "dark",
 *   "quoteCalc_currentMode": "advanced",
 *   "quoteCalc_currentRegion": "Ushuaia",
 *   "quoteCalc_regions": "[\"Ushuaia\", \"Patagonia\", \"Buenos Aires\"]"
 * }
 *
 * Требования:
 *   - Сервер должен быть запущен (node server-with-db.js)
 *   - База данных мигрирована (migrations 006, 007, 008)
 *   - Пользователь admin@localhost создан
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 * Reference: MIGRATION_V3_SPEC.md Section 7, Фаза 3 (lines 1308-1328)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// =================================================================
// CONFIGURATION
// =================================================================

const API_BASE_URL = process.env.API_URL || 'http://localhost:4000';
const BACKUP_FILE = process.argv[2] || path.join(__dirname, '..', 'localStorage-backup.json');

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
     * Обновить настройки
     */
    async updateSettings(scope, settings) {
        Logger.info(`Updating ${scope} settings...`);

        try {
            const response = await this.axios.put('/api/v1/settings', {
                scope,
                settings
            });

            Logger.success(`${scope} settings updated successfully`);
            return response.data;

        } catch (err) {
            Logger.error(`Failed to update ${scope} settings: ${err.response?.data?.error || err.message}`);
            throw err;
        }
    }

    /**
     * Получить настройки
     */
    async getSettings(scope) {
        try {
            const response = await this.axios.get(`/api/v1/settings?scope=${scope}`);
            return response.data;
        } catch (err) {
            Logger.error(`Failed to get ${scope} settings: ${err.response?.data?.error || err.message}`);
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
 * Извлечь user settings из backup
 *
 * Согласно MIGRATION_V3_SPEC.md (lines 1311-1318):
 * - theme: localStorage.getItem('quoteCalc_theme')
 * - currentMode: localStorage.getItem('quoteCalc_currentMode')
 */
function extractUserSettings(backup) {
    Logger.info('Extracting user settings...');

    const settings = {};

    // Theme
    if (backup['quoteCalc_theme']) {
        settings.theme = backup['quoteCalc_theme'];
        Logger.info(`  theme: ${settings.theme}`);
    }

    // Current mode
    if (backup['quoteCalc_currentMode']) {
        settings.currentMode = backup['quoteCalc_currentMode'];
        Logger.info(`  currentMode: ${settings.currentMode}`);
    }

    if (Object.keys(settings).length === 0) {
        Logger.warn('No user settings found in backup');
        return null;
    }

    Logger.success(`Extracted ${Object.keys(settings).length} user settings`);
    return settings;
}

/**
 * Извлечь organization settings из backup
 *
 * Согласно MIGRATION_V3_SPEC.md (lines 1320-1327):
 * - currentRegion: localStorage.getItem('quoteCalc_currentRegion')
 * - regions: JSON.parse(localStorage.getItem('quoteCalc_regions'))
 */
function extractOrgSettings(backup) {
    Logger.info('Extracting organization settings...');

    const settings = {};

    // Current region
    if (backup['quoteCalc_currentRegion']) {
        settings.currentRegion = backup['quoteCalc_currentRegion'];
        Logger.info(`  currentRegion: ${settings.currentRegion}`);
    }

    // Regions list
    if (backup['quoteCalc_regions']) {
        try {
            settings.regions = JSON.parse(backup['quoteCalc_regions']);
            Logger.info(`  regions: ${settings.regions.join(', ')}`);
        } catch (err) {
            Logger.warn(`Failed to parse regions: ${err.message}`);
        }
    }

    if (Object.keys(settings).length === 0) {
        Logger.warn('No organization settings found in backup');
        return null;
    }

    Logger.success(`Extracted ${Object.keys(settings).length} organization settings`);
    return settings;
}

/**
 * Мигрировать user settings
 */
async function migrateUserSettings(apiClient, settings) {
    if (!settings) {
        Logger.warn('Skipping user settings migration (no data)');
        return { success: false, skipped: true };
    }

    try {
        await apiClient.updateSettings('user', settings);
        return { success: true, settings };
    } catch (err) {
        Logger.error(`User settings migration failed: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Мигрировать organization settings
 */
async function migrateOrgSettings(apiClient, settings) {
    if (!settings) {
        Logger.warn('Skipping organization settings migration (no data)');
        return { success: false, skipped: true };
    }

    try {
        await apiClient.updateSettings('organization', settings);
        return { success: true, settings };
    } catch (err) {
        Logger.error(`Organization settings migration failed: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Показать отчёт о миграции
 */
function printMigrationReport(userResult, orgResult) {
    Logger.info('');
    Logger.info('='.repeat(80));
    Logger.info('MIGRATION REPORT');
    Logger.info('='.repeat(80));

    // User settings
    Logger.info('User Settings:');
    if (userResult.success) {
        Logger.success('  ✓ Migrated successfully');
        Logger.info(`  Settings: ${JSON.stringify(userResult.settings)}`);
    } else if (userResult.skipped) {
        Logger.warn('  ○ Skipped (no data)');
    } else {
        Logger.error(`  ✗ Failed: ${userResult.error}`);
    }

    Logger.info('');

    // Organization settings
    Logger.info('Organization Settings:');
    if (orgResult.success) {
        Logger.success('  ✓ Migrated successfully');
        Logger.info(`  Settings: ${JSON.stringify(orgResult.settings)}`);
    } else if (orgResult.skipped) {
        Logger.warn('  ○ Skipped (no data)');
    } else {
        Logger.error(`  ✗ Failed: ${orgResult.error}`);
    }

    Logger.info('');
    Logger.info('='.repeat(80));

    // Overall status
    const hasFailures = !userResult.success && !userResult.skipped ||
                        !orgResult.success && !orgResult.skipped;

    if (hasFailures) {
        Logger.error('Migration completed with FAILURES');
    } else {
        Logger.success('Migration completed SUCCESSFULLY');
    }

    return hasFailures;
}

// =================================================================
// MAIN
// =================================================================

async function main() {
    Logger.info('='.repeat(80));
    Logger.info('MIGRATE SETTINGS FROM LOCALSTORAGE TO DATABASE');
    Logger.info('='.repeat(80));
    Logger.info('');

    try {
        // 1. Прочитать backup файл
        const backup = readLocalStorageBackup(BACKUP_FILE);

        // 2. Создать API client
        const apiClient = new APIClient(API_BASE_URL);

        // 3. Войти в систему
        await apiClient.login(ADMIN_EMAIL, ADMIN_PASSWORD);

        // 4. Извлечь настройки
        const userSettings = extractUserSettings(backup);
        const orgSettings = extractOrgSettings(backup);

        // 5. Мигрировать user settings
        const userResult = await migrateUserSettings(apiClient, userSettings);

        // 6. Мигрировать organization settings
        const orgResult = await migrateOrgSettings(apiClient, orgSettings);

        // 7. Показать отчёт
        const hasFailures = printMigrationReport(userResult, orgResult);

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
    extractUserSettings,
    extractOrgSettings,
    migrateUserSettings,
    migrateOrgSettings
};
