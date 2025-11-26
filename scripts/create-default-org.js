#!/usr/bin/env node

/**
 * Create Default Organization and Admin User
 *
 * Создаёт дефолтную организацию и администратора для Quote Calculator v3.0.0
 *
 * Использование:
 *   node scripts/create-default-org.js
 *
 * Требования:
 *   - База данных должна существовать
 *   - Миграции 006, 007, 008 должны быть применены
 *   - bcrypt должен быть установлен
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

// =================================================================
// CONFIGURATION
// =================================================================

const DB_PATH = path.join(__dirname, '..', 'db', 'quotes.db');
const DEFAULT_ORG_ID = 'default-org';
const DEFAULT_ADMIN_ID = 'admin-user-id';
const DEFAULT_ADMIN_EMAIL = 'admin@localhost';
const DEFAULT_ADMIN_PASSWORD = 'admin123'; // ДОЛЖЕН БЫТЬ ИЗМЕНЁН после первого входа
const BCRYPT_ROUNDS = 10;

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
// MAIN LOGIC
// =================================================================

async function createDefaultOrganization(db) {
    Logger.info('Creating default organization...');

    // Проверить, существует ли уже организация
    const existing = db.prepare('SELECT id FROM organizations WHERE id = ?').get(DEFAULT_ORG_ID);

    if (existing) {
        Logger.warn(`Organization ${DEFAULT_ORG_ID} already exists, skipping creation`);
        return false;
    }

    // Создать организацию
    const stmt = db.prepare(`
        INSERT INTO organizations (
            id,
            name,
            slug,
            plan,
            owner_id,
            max_users,
            max_estimates,
            max_catalogs,
            storage_limit_mb,
            api_rate_limit,
            current_users_count,
            current_estimates_count,
            current_catalogs_count,
            current_storage_mb,
            is_active,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        DEFAULT_ORG_ID,
        'Default Organization',
        'default',
        'pro',
        DEFAULT_ADMIN_ID,
        100,    // max_users
        1000,   // max_estimates
        50,     // max_catalogs
        5000,   // storage_limit_mb
        10000,  // api_rate_limit
        1,      // current_users_count (будет админ)
        0,      // current_estimates_count
        0,      // current_catalogs_count
        0,      // current_storage_mb
        1,      // is_active
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000)
    );

    Logger.success('Default organization created successfully');
    return true;
}

async function createDefaultAdmin(db) {
    Logger.info('Creating default admin user...');

    // Проверить, существует ли уже пользователь
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(DEFAULT_ADMIN_ID);

    if (existing) {
        Logger.warn(`User ${DEFAULT_ADMIN_ID} already exists, skipping creation`);
        return false;
    }

    // Генерировать password hash
    Logger.info('Generating password hash...');
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, BCRYPT_ROUNDS);

    // Создать пользователя
    const stmt = db.prepare(`
        INSERT INTO users (
            id,
            email,
            username,
            password_hash,
            full_name,
            role,
            organization_id,
            is_active,
            email_verified,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        DEFAULT_ADMIN_ID,
        DEFAULT_ADMIN_EMAIL,
        'admin',
        passwordHash,
        'Administrator',
        'admin',
        DEFAULT_ORG_ID,
        1,  // is_active
        1,  // email_verified
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000)
    );

    Logger.success('Default admin user created successfully');
    Logger.warn('');
    Logger.warn('='.repeat(80));
    Logger.warn('IMPORTANT: Default admin credentials');
    Logger.warn('='.repeat(80));
    Logger.warn(`Email: ${DEFAULT_ADMIN_EMAIL}`);
    Logger.warn(`Password: ${DEFAULT_ADMIN_PASSWORD}`);
    Logger.warn('');
    Logger.warn('⚠️  CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!');
    Logger.warn('='.repeat(80));
    Logger.warn('');

    return true;
}

async function createDefaultSettings(db) {
    Logger.info('Creating default settings...');

    // App-level settings
    const appSettings = [
        { key: 'storage_type', value: '"sqlite"', type: 'string' },
        { key: 'db_version', value: '"1.0.0"', type: 'string' },
        { key: 'maintenance_mode', value: 'false', type: 'boolean' }
    ];

    for (const setting of appSettings) {
        const existing = db.prepare(
            'SELECT COUNT(*) as count FROM settings WHERE scope = ? AND scope_id = ? AND key = ?'
        ).get('app', 'global', setting.key);

        if (existing.count === 0) {
            db.prepare(`
                INSERT INTO settings (scope, scope_id, key, value, value_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                'app',
                'global',
                setting.key,
                setting.value,
                setting.type,
                Math.floor(Date.now() / 1000),
                Math.floor(Date.now() / 1000)
            );
            Logger.info(`Created app setting: ${setting.key}`);
        }
    }

    // Organization-level settings
    const orgSettings = [
        { key: 'currency', value: '"$"', type: 'string' },
        { key: 'default_tax_rate', value: '0', type: 'number' },
        { key: 'default_hidden_markup', value: '10', type: 'number' },
        { key: 'booking_terms', value: '""', type: 'string' }
    ];

    for (const setting of orgSettings) {
        const existing = db.prepare(
            'SELECT COUNT(*) as count FROM settings WHERE scope = ? AND scope_id = ? AND key = ?'
        ).get('organization', DEFAULT_ORG_ID, setting.key);

        if (existing.count === 0) {
            db.prepare(`
                INSERT INTO settings (scope, scope_id, key, value, value_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                'organization',
                DEFAULT_ORG_ID,
                setting.key,
                setting.value,
                setting.type,
                Math.floor(Date.now() / 1000),
                Math.floor(Date.now() / 1000)
            );
            Logger.info(`Created organization setting: ${setting.key}`);
        }
    }

    // User-level settings
    const userSettings = [
        { key: 'theme', value: '"light"', type: 'string' },
        { key: 'language', value: '"ru"', type: 'string' },
        { key: 'default_pax_count', value: '27', type: 'number' },
        { key: 'autosave_interval_sec', value: '8', type: 'number' }
    ];

    for (const setting of userSettings) {
        const existing = db.prepare(
            'SELECT COUNT(*) as count FROM settings WHERE scope = ? AND scope_id = ? AND key = ?'
        ).get('user', DEFAULT_ADMIN_ID, setting.key);

        if (existing.count === 0) {
            db.prepare(`
                INSERT INTO settings (scope, scope_id, key, value, value_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                'user',
                DEFAULT_ADMIN_ID,
                setting.key,
                setting.value,
                setting.type,
                Math.floor(Date.now() / 1000),
                Math.floor(Date.now() / 1000)
            );
            Logger.info(`Created user setting: ${setting.key}`);
        }
    }

    Logger.success('Default settings created successfully');
}

async function createAuditLog(db) {
    Logger.info('Creating audit log entry...');

    const estimatesCount = db.prepare(
        'SELECT COUNT(*) as count FROM estimates WHERE organization_id = ?'
    ).get(DEFAULT_ORG_ID).count;

    const catalogsCount = db.prepare(
        'SELECT COUNT(*) as count FROM catalogs WHERE organization_id = ?'
    ).get(DEFAULT_ORG_ID).count;

    db.prepare(`
        INSERT INTO audit_logs (
            entity_type,
            entity_id,
            action,
            user_id,
            organization_id,
            metadata,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        'system',
        'create-default-org',
        'script',
        DEFAULT_ADMIN_ID,
        DEFAULT_ORG_ID,
        JSON.stringify({
            script: 'create-default-org.js',
            description: 'Created default organization and admin user',
            estimates_count: estimatesCount,
            catalogs_count: catalogsCount
        }),
        Math.floor(Date.now() / 1000)
    );

    Logger.success('Audit log entry created');
}

// =================================================================
// MAIN
// =================================================================

async function main() {
    Logger.info('='.repeat(80));
    Logger.info('CREATE DEFAULT ORGANIZATION AND ADMIN USER');
    Logger.info('='.repeat(80));

    // Проверить существование БД
    if (!fs.existsSync(DB_PATH)) {
        Logger.error(`Database not found: ${DB_PATH}`);
        Logger.error('Please create the database and apply migrations first');
        process.exit(1);
    }

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    try {
        // Проверить, что таблицы существуют
        const tables = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('organizations', 'users', 'settings', 'audit_logs')"
        ).all();

        if (tables.length < 4) {
            Logger.error('Required tables not found. Please apply migrations 006, 007, 008 first.');
            Logger.error('Run: node db/migrations/runner.js up');
            process.exit(1);
        }

        // Создать организацию
        const orgCreated = await createDefaultOrganization(db);

        // Создать админа
        const adminCreated = await createDefaultAdmin(db);

        // Создать настройки
        await createDefaultSettings(db);

        // Создать audit log
        await createAuditLog(db);

        Logger.info('='.repeat(80));
        if (orgCreated || adminCreated) {
            Logger.success('Setup completed successfully!');
        } else {
            Logger.info('All resources already exist, nothing to create');
        }
        Logger.info('='.repeat(80));

    } catch (err) {
        Logger.error(`Script failed: ${err.message}`);
        Logger.error(err.stack);
        process.exit(1);
    } finally {
        db.close();
    }
}

// Запуск
if (require.main === module) {
    main();
}

module.exports = { createDefaultOrganization, createDefaultAdmin, createDefaultSettings };
