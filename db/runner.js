#!/usr/bin/env node

/**
 * Migration Runner для Quote Calculator v3.0.0
 *
 * Автоматическое применение и откат SQL миграций
 *
 * Usage:
 *   node db/migrations/runner.js up              - Применить все новые миграции
 *   node db/migrations/runner.js up 006          - Применить конкретную миграцию
 *   node db/migrations/runner.js down            - Откатить последнюю миграцию
 *   node db/migrations/runner.js down 005        - Откатить до конкретной версии
 *   node db/migrations/runner.js status          - Показать статус миграций
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// =================================================================
// CONFIGURATION
// =================================================================

const MIGRATIONS_DIR = path.join(__dirname);
const DB_PATH = path.join(__dirname, '..', 'quotes.db');
const LOG_PATH = path.join(__dirname, 'migration.log');

// =================================================================
// MIGRATION TRACKING TABLE
// =================================================================

const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    execution_time_ms INTEGER,
    checksum TEXT
);
`;

// =================================================================
// LOGGER
// =================================================================

class Logger {
    static log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${level}] ${message}\n`;

        // Console output
        console.log(logLine.trim());

        // File output
        try {
            fs.appendFileSync(LOG_PATH, logLine);
        } catch (err) {
            console.error('Failed to write to log file:', err.message);
        }
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
// MIGRATION RUNNER
// =================================================================

class MigrationRunner {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
    }

    /**
     * Инициализация подключения к БД
     */
    connect() {
        try {
            this.db = new Database(this.dbPath);
            this.db.pragma('foreign_keys = OFF'); // Будет включено после миграций
            this.db.pragma('journal_mode = WAL');

            // Создать таблицу для отслеживания миграций
            this.db.exec(MIGRATIONS_TABLE_SQL);

            Logger.info(`Connected to database: ${this.dbPath}`);
        } catch (err) {
            Logger.error(`Failed to connect to database: ${err.message}`);
            throw err;
        }
    }

    /**
     * Закрытие подключения
     */
    close() {
        if (this.db) {
            this.db.close();
            Logger.info('Database connection closed');
        }
    }

    /**
     * Получить список доступных миграций из файлов
     */
    getAvailableMigrations() {
        const files = fs.readdirSync(MIGRATIONS_DIR)
            .filter(f => f.match(/^\d{3}_.*\.sql$/))
            .sort();

        return files.map(filename => {
            const version = filename.substring(0, 3);
            const name = filename.substring(4, filename.length - 4);
            const filepath = path.join(MIGRATIONS_DIR, filename);
            const sql = fs.readFileSync(filepath, 'utf-8');
            const checksum = this.calculateChecksum(sql);

            return { version, name, filename, filepath, sql, checksum };
        });
    }

    /**
     * Получить список применённых миграций
     */
    getAppliedMigrations() {
        const stmt = this.db.prepare(
            'SELECT version, name, applied_at, execution_time_ms, checksum FROM schema_migrations ORDER BY version ASC'
        );
        return stmt.all();
    }

    /**
     * Вычислить checksum для SQL файла
     */
    calculateChecksum(content) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Проверить, применена ли миграция
     */
    isMigrationApplied(version) {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM schema_migrations WHERE version = ?');
        const result = stmt.get(version);
        return result.count > 0;
    }

    /**
     * Применить одну миграцию
     */
    applyMigration(migration) {
        const startTime = Date.now();

        Logger.info(`Applying migration ${migration.version}: ${migration.name}`);

        try {
            // Выполнить SQL миграции
            this.db.exec(migration.sql);

            const executionTime = Date.now() - startTime;

            // Записать в schema_migrations
            const stmt = this.db.prepare(`
                INSERT INTO schema_migrations (version, name, applied_at, execution_time_ms, checksum)
                VALUES (?, ?, ?, ?, ?)
            `);
            stmt.run(
                migration.version,
                migration.name,
                Math.floor(Date.now() / 1000),
                executionTime,
                migration.checksum
            );

            Logger.success(`Migration ${migration.version} applied successfully in ${executionTime}ms`);
            return true;

        } catch (err) {
            Logger.error(`Migration ${migration.version} failed: ${err.message}`);
            throw err;
        }
    }

    /**
     * Откатить миграцию (заглушка - требует down-файлов)
     */
    rollbackMigration(version) {
        Logger.warn(`Rollback for migration ${version} is not implemented yet`);
        Logger.warn('Manual rollback required - see db/migrations/README.md');

        // TODO: Implement down migrations
        // Для этого нужны отдельные файлы 006_down.sql, 007_down.sql и т.д.

        return false;
    }

    /**
     * Удалить запись о миграции из schema_migrations
     */
    removeMigrationRecord(version) {
        const stmt = this.db.prepare('DELETE FROM schema_migrations WHERE version = ?');
        stmt.run(version);
        Logger.info(`Migration ${version} removed from schema_migrations`);
    }

    /**
     * Показать статус всех миграций
     */
    showStatus() {
        const available = this.getAvailableMigrations();
        const applied = this.getAppliedMigrations();
        const appliedVersions = new Set(applied.map(m => m.version));

        Logger.info('='.repeat(80));
        Logger.info('MIGRATION STATUS');
        Logger.info('='.repeat(80));

        Logger.info(`Database: ${this.dbPath}`);
        Logger.info(`Total available migrations: ${available.length}`);
        Logger.info(`Total applied migrations: ${applied.length}`);
        Logger.info('');

        Logger.info('Available migrations:');
        available.forEach(mig => {
            const status = appliedVersions.has(mig.version) ? '✅ APPLIED' : '⏳ PENDING';
            Logger.info(`  ${mig.version} - ${mig.name} [${status}]`);
        });

        Logger.info('');
        Logger.info('Applied migrations:');
        applied.forEach(mig => {
            const date = new Date(mig.applied_at * 1000).toISOString();
            Logger.info(`  ${mig.version} - ${mig.name} (applied: ${date}, ${mig.execution_time_ms}ms)`);
        });

        Logger.info('='.repeat(80));
    }

    /**
     * Применить все новые миграции
     */
    migrateUp(targetVersion = null) {
        const available = this.getAvailableMigrations();
        const applied = this.getAppliedMigrations();
        const appliedVersions = new Set(applied.map(m => m.version));

        let migrationsToApply = available.filter(mig => !appliedVersions.has(mig.version));

        if (targetVersion) {
            migrationsToApply = migrationsToApply.filter(mig => mig.version <= targetVersion);
        }

        if (migrationsToApply.length === 0) {
            Logger.info('No new migrations to apply');
            return;
        }

        Logger.info(`Found ${migrationsToApply.length} migration(s) to apply`);

        for (const migration of migrationsToApply) {
            try {
                this.applyMigration(migration);
            } catch (err) {
                Logger.error(`Migration failed, stopping execution`);
                throw err;
            }
        }

        Logger.success('All migrations applied successfully');
    }

    /**
     * Откатить миграции
     */
    migrateDown(targetVersion = null) {
        const applied = this.getAppliedMigrations();

        if (applied.length === 0) {
            Logger.info('No migrations to rollback');
            return;
        }

        let migrationsToRollback;

        if (targetVersion) {
            // Откатить до конкретной версии
            migrationsToRollback = applied.filter(mig => mig.version > targetVersion).reverse();
        } else {
            // Откатить только последнюю
            migrationsToRollback = [applied[applied.length - 1]];
        }

        if (migrationsToRollback.length === 0) {
            Logger.info('No migrations to rollback');
            return;
        }

        Logger.warn(`This will rollback ${migrationsToRollback.length} migration(s)`);
        Logger.warn('Rollback logic is not automated yet');
        Logger.warn('Please refer to db/migrations/README.md for manual rollback procedures');

        for (const migration of migrationsToRollback) {
            Logger.warn(`  - ${migration.version}: ${migration.name}`);
        }

        Logger.warn('');
        Logger.warn('To manually rollback:');
        Logger.warn('1. Create backup: cp db/quotes.db db/quotes.db.backup-$(date +%s)');
        Logger.warn('2. Follow rollback SQL from db/migrations/README.md');
        Logger.warn('3. Remove migration record: DELETE FROM schema_migrations WHERE version = ?');
    }

    /**
     * Создать backup БД перед миграцией
     */
    createBackup() {
        const timestamp = Math.floor(Date.now() / 1000);
        const backupPath = `${this.dbPath}.backup-${timestamp}`;

        try {
            fs.copyFileSync(this.dbPath, backupPath);
            Logger.success(`Backup created: ${backupPath}`);
            return backupPath;
        } catch (err) {
            Logger.error(`Failed to create backup: ${err.message}`);
            throw err;
        }
    }

    /**
     * Проверка integrity БД
     */
    checkIntegrity() {
        try {
            const result = this.db.prepare('PRAGMA integrity_check').get();
            if (result.integrity_check === 'ok') {
                Logger.success('Database integrity check: OK');
                return true;
            } else {
                Logger.error(`Database integrity check failed: ${result.integrity_check}`);
                return false;
            }
        } catch (err) {
            Logger.error(`Integrity check error: ${err.message}`);
            return false;
        }
    }
}

// =================================================================
// CLI INTERFACE
// =================================================================

function printUsage() {
    console.log(`
Migration Runner для Quote Calculator v3.0.0

Usage:
  node db/migrations/runner.js <command> [version]

Commands:
  up [version]    - Применить все новые миграции (или до конкретной версии)
  down [version]  - Откатить последнюю миграцию (или до конкретной версии)
  status          - Показать статус всех миграций

Examples:
  node db/migrations/runner.js up              - Применить все новые миграции
  node db/migrations/runner.js up 006          - Применить миграции до 006 включительно
  node db/migrations/runner.js down            - Откатить последнюю миграцию
  node db/migrations/runner.js down 005        - Откатить до версии 005
  node db/migrations/runner.js status          - Показать статус

Options:
  --help, -h      - Показать эту справку
`);
}

// =================================================================
// MAIN
// =================================================================

function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }

    const command = args[0];
    const version = args[1] || null;

    // Проверить существование БД
    if (!fs.existsSync(DB_PATH)) {
        Logger.error(`Database not found: ${DB_PATH}`);
        Logger.error('Please create the database first');
        process.exit(1);
    }

    const runner = new MigrationRunner(DB_PATH);

    try {
        runner.connect();

        switch (command) {
            case 'up':
                Logger.info('='.repeat(80));
                Logger.info('STARTING MIGRATION UP');
                Logger.info('='.repeat(80));

                // Создать backup перед миграцией
                runner.createBackup();

                // Проверить integrity
                if (!runner.checkIntegrity()) {
                    Logger.error('Database integrity check failed, aborting migration');
                    process.exit(1);
                }

                // Применить миграции
                runner.migrateUp(version);

                // Проверить integrity после миграции
                runner.checkIntegrity();

                Logger.info('='.repeat(80));
                break;

            case 'down':
                Logger.info('='.repeat(80));
                Logger.info('STARTING MIGRATION DOWN');
                Logger.info('='.repeat(80));

                // Создать backup перед rollback
                runner.createBackup();

                // Откатить миграции
                runner.migrateDown(version);

                Logger.info('='.repeat(80));
                break;

            case 'status':
                runner.showStatus();
                break;

            default:
                Logger.error(`Unknown command: ${command}`);
                printUsage();
                process.exit(1);
        }

        runner.close();
        process.exit(0);

    } catch (err) {
        Logger.error(`Migration runner failed: ${err.message}`);
        Logger.error(err.stack);
        runner.close();
        process.exit(1);
    }
}

// Запуск
if (require.main === module) {
    main();
}

module.exports = { MigrationRunner, Logger };
