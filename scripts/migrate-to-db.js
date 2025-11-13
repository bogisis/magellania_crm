#!/usr/bin/env node

/**
 * migrate-to-db.js - Миграция данных из файлов в SQLite
 *
 * Использование:
 *   node scripts/migrate-to-db.js [options]
 *
 * Options:
 *   --dry-run     Показать что будет сделано, без реального импорта
 *   --verbose     Подробный вывод
 *   --validate    Валидировать после миграции
 *
 * Что делает скрипт:
 * 1. Читает все файлы из estimate/, backup/, catalog/
 * 2. Валидирует JSON и версии
 * 3. Импортирует в SQLite с транзакциями
 * 4. Создает отчет migration_report.json
 * 5. Опционально валидирует результаты
 */

const fs = require('fs').promises;
const path = require('path');
const FileStorage = require('../storage/FileStorage');
const SQLiteStorage = require('../storage/SQLiteStorage');

// Цвета для консоли
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(70));
    log(title, 'bright');
    console.log('='.repeat(70));
}

class MigrationTool {
    constructor(options = {}) {
        this.options = {
            dryRun: options.dryRun || false,
            verbose: options.verbose || false,
            validate: options.validate || false
        };

        this.fileStorage = new FileStorage();
        this.sqliteStorage = new SQLiteStorage();

        this.stats = {
            estimates: { total: 0, success: 0, failed: 0, skipped: 0 },
            backups: { total: 0, success: 0, failed: 0, skipped: 0 },
            catalogs: { total: 0, success: 0, failed: 0, skipped: 0 },
            errors: []
        };
    }

    /**
     * Главный метод миграции
     */
    async migrate() {
        try {
            logSection('🚀 Quote Calculator - Migration to SQLite');

            if (this.options.dryRun) {
                log('⚠️  DRY RUN MODE - No changes will be made', 'yellow');
            }

            console.log('\nOptions:');
            console.log(`  Dry run: ${this.options.dryRun}`);
            console.log(`  Verbose: ${this.options.verbose}`);
            console.log(`  Validate: ${this.options.validate}`);

            // Инициализация storage
            logSection('📦 Initializing Storage');
            await this.fileStorage.init();
            await this.sqliteStorage.init();

            log('✓ FileStorage initialized', 'green');
            log('✓ SQLiteStorage initialized', 'green');

            // Миграция estimates
            await this.migrateEstimates();

            // Миграция backups
            await this.migrateBackups();

            // Миграция catalogs
            await this.migrateCatalogs();

            // Валидация (если включена)
            if (this.options.validate && !this.options.dryRun) {
                await this.validateMigration();
            }

            // Создание отчета
            await this.generateReport();

            // Финальная статистика
            this.printSummary();

        } catch (err) {
            log(`\n❌ Migration failed: ${err.message}`, 'red');
            console.error(err);
            process.exit(1);
        } finally {
            await this.sqliteStorage.close();
        }
    }

    /**
     * Миграция смет
     */
    async migrateEstimates() {
        logSection('📄 Migrating Estimates');

        const estimates = await this.fileStorage.getEstimatesList();
        this.stats.estimates.total = estimates.length;

        log(`Found ${estimates.length} estimates\n`);

        for (const estimate of estimates) {
            try {
                if (this.options.verbose) {
                    console.log(`  Processing: ${estimate.filename}`);
                }

                // Загрузить данные
                const data = await this.fileStorage.loadEstimate(estimate.filename);

                // Валидация
                const validation = this.validateEstimateData(data);
                if (!validation.valid) {
                    log(`  ⚠️  Skipping ${estimate.filename}: ${validation.error}`, 'yellow');
                    this.stats.estimates.skipped++;
                    this.stats.errors.push({
                        type: 'estimate',
                        filename: estimate.filename,
                        error: validation.error
                    });
                    continue;
                }

                // Импорт в SQLite
                if (!this.options.dryRun) {
                    await this.sqliteStorage.saveEstimate(estimate.filename, data);
                }

                this.stats.estimates.success++;

                if (this.options.verbose) {
                    log(`  ✓ Migrated: ${estimate.filename}`, 'green');
                }

            } catch (err) {
                log(`  ❌ Failed: ${estimate.filename} - ${err.message}`, 'red');
                this.stats.estimates.failed++;
                this.stats.errors.push({
                    type: 'estimate',
                    filename: estimate.filename,
                    error: err.message
                });
            }
        }

        log(`\n✓ Estimates: ${this.stats.estimates.success} migrated, ${this.stats.estimates.failed} failed, ${this.stats.estimates.skipped} skipped`, 'green');
    }

    /**
     * Миграция backups
     */
    async migrateBackups() {
        logSection('💾 Migrating Backups');

        const backups = await this.fileStorage.getBackupsList();
        this.stats.backups.total = backups.length;

        log(`Found ${backups.length} backups\n`);

        for (const backup of backups) {
            try {
                if (this.options.verbose) {
                    console.log(`  Processing backup: ${backup.id}`);
                }

                // Загрузить данные
                const data = await this.fileStorage.loadBackup(backup.id);

                // Валидация
                const validation = this.validateEstimateData(data);
                if (!validation.valid) {
                    log(`  ⚠️  Skipping backup ${backup.id}: ${validation.error}`, 'yellow');
                    this.stats.backups.skipped++;
                    continue;
                }

                // Импорт в SQLite
                if (!this.options.dryRun) {
                    await this.sqliteStorage.saveBackup(backup.id, data);
                }

                this.stats.backups.success++;

                if (this.options.verbose) {
                    log(`  ✓ Migrated backup: ${backup.id}`, 'green');
                }

            } catch (err) {
                log(`  ❌ Failed backup: ${backup.id} - ${err.message}`, 'red');
                this.stats.backups.failed++;
                this.stats.errors.push({
                    type: 'backup',
                    id: backup.id,
                    error: err.message
                });
            }
        }

        log(`\n✓ Backups: ${this.stats.backups.success} migrated, ${this.stats.backups.failed} failed, ${this.stats.backups.skipped} skipped`, 'green');
    }

    /**
     * Миграция каталогов
     */
    async migrateCatalogs() {
        logSection('📚 Migrating Catalogs');

        const catalogs = await this.fileStorage.getCatalogsList();
        this.stats.catalogs.total = catalogs.length;

        log(`Found ${catalogs.length} catalogs\n`);

        for (const catalogName of catalogs) {
            try {
                if (this.options.verbose) {
                    console.log(`  Processing catalog: ${catalogName}`);
                }

                // Загрузить данные
                const data = await this.fileStorage.loadCatalog(catalogName);

                // Валидация
                if (!data || typeof data !== 'object') {
                    log(`  ⚠️  Skipping ${catalogName}: Invalid data`, 'yellow');
                    this.stats.catalogs.skipped++;
                    continue;
                }

                // Импорт в SQLite
                if (!this.options.dryRun) {
                    await this.sqliteStorage.saveCatalog(catalogName, data);
                }

                this.stats.catalogs.success++;

                if (this.options.verbose) {
                    log(`  ✓ Migrated catalog: ${catalogName}`, 'green');
                }

            } catch (err) {
                log(`  ❌ Failed catalog: ${catalogName} - ${err.message}`, 'red');
                this.stats.catalogs.failed++;
                this.stats.errors.push({
                    type: 'catalog',
                    name: catalogName,
                    error: err.message
                });
            }
        }

        log(`\n✓ Catalogs: ${this.stats.catalogs.success} migrated, ${this.stats.catalogs.failed} failed, ${this.stats.catalogs.skipped} skipped`, 'green');
    }

    /**
     * Валидация данных сметы
     */
    validateEstimateData(data) {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Invalid JSON' };
        }

        // Проверка обязательных полей
        if (!data.id) {
            return { valid: false, error: 'Missing id field' };
        }

        // Проверка версии (поддерживаем v1.0.0 и v1.1.0)
        if (data.version && !['1.0.0', '1.1.0'].includes(data.version)) {
            return { valid: false, error: `Unsupported version: ${data.version}` };
        }

        // Проверка services
        if (data.services && !Array.isArray(data.services)) {
            return { valid: false, error: 'Services must be an array' };
        }

        return { valid: true };
    }

    /**
     * Валидация миграции
     */
    async validateMigration() {
        logSection('🔍 Validating Migration');

        let validationErrors = 0;

        // Проверка estimates
        const fileEstimates = await this.fileStorage.getEstimatesList();
        const dbEstimates = await this.sqliteStorage.getEstimatesList();

        log(`\nEstimates: ${fileEstimates.length} in files, ${dbEstimates.length} in DB`);

        if (fileEstimates.length !== dbEstimates.length) {
            log(`  ⚠️  Count mismatch!`, 'yellow');
            validationErrors++;
        }

        // Spot check - сравнить несколько случайных смет
        const sampleSize = Math.min(5, fileEstimates.length);
        log(`\nSpot checking ${sampleSize} random estimates...`);

        for (let i = 0; i < sampleSize; i++) {
            const randomEstimate = fileEstimates[Math.floor(Math.random() * fileEstimates.length)];

            try {
                const fileData = await this.fileStorage.loadEstimate(randomEstimate.filename);
                const dbData = await this.sqliteStorage.loadEstimate(randomEstimate.filename);

                // Сравнить критичные поля
                if (fileData.id !== dbData.id) {
                    log(`  ❌ ID mismatch for ${randomEstimate.filename}`, 'red');
                    validationErrors++;
                } else if (fileData.services?.length !== dbData.services?.length) {
                    log(`  ❌ Services count mismatch for ${randomEstimate.filename}`, 'red');
                    validationErrors++;
                } else {
                    log(`  ✓ ${randomEstimate.filename} validated`, 'green');
                }
            } catch (err) {
                log(`  ❌ Validation error for ${randomEstimate.filename}: ${err.message}`, 'red');
                validationErrors++;
            }
        }

        if (validationErrors === 0) {
            log(`\n✓ Validation passed!`, 'green');
        } else {
            log(`\n⚠️  Validation found ${validationErrors} issues`, 'yellow');
        }
    }

    /**
     * Генерация отчета миграции
     */
    async generateReport() {
        logSection('📊 Generating Migration Report');

        const report = {
            timestamp: new Date().toISOString(),
            options: this.options,
            stats: this.stats,
            summary: {
                totalItems: this.stats.estimates.total + this.stats.backups.total + this.stats.catalogs.total,
                totalSuccess: this.stats.estimates.success + this.stats.backups.success + this.stats.catalogs.success,
                totalFailed: this.stats.estimates.failed + this.stats.backups.failed + this.stats.catalogs.failed,
                totalSkipped: this.stats.estimates.skipped + this.stats.backups.skipped + this.stats.catalogs.skipped
            }
        };

        const reportPath = path.join(process.cwd(), 'migration_report.json');

        if (!this.options.dryRun) {
            await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
            log(`\n✓ Report saved to: ${reportPath}`, 'green');
        } else {
            log(`\n⚠️  Dry run - report not saved`, 'yellow');
        }

        return report;
    }

    /**
     * Вывести финальную статистику
     */
    printSummary() {
        logSection('✨ Migration Summary');

        const total = this.stats.estimates.total + this.stats.backups.total + this.stats.catalogs.total;
        const success = this.stats.estimates.success + this.stats.backups.success + this.stats.catalogs.success;
        const failed = this.stats.estimates.failed + this.stats.backups.failed + this.stats.catalogs.failed;
        const skipped = this.stats.estimates.skipped + this.stats.backups.skipped + this.stats.catalogs.skipped;

        console.log('\n📈 Overall Statistics:');
        console.log(`  Total items:     ${total}`);
        log(`  ✓ Migrated:      ${success}`, 'green');
        if (failed > 0) {
            log(`  ❌ Failed:        ${failed}`, 'red');
        }
        if (skipped > 0) {
            log(`  ⚠️  Skipped:       ${skipped}`, 'yellow');
        }

        console.log('\n📋 By Type:');
        console.log(`  Estimates: ${this.stats.estimates.success}/${this.stats.estimates.total}`);
        console.log(`  Backups:   ${this.stats.backups.success}/${this.stats.backups.total}`);
        console.log(`  Catalogs:  ${this.stats.catalogs.success}/${this.stats.catalogs.total}`);

        if (this.stats.errors.length > 0) {
            console.log('\n⚠️  Errors:');
            this.stats.errors.slice(0, 10).forEach(err => {
                console.log(`  - ${err.type}: ${err.filename || err.id} - ${err.error}`);
            });
            if (this.stats.errors.length > 10) {
                console.log(`  ... and ${this.stats.errors.length - 10} more (see migration_report.json)`);
            }
        }

        if (!this.options.dryRun && success === total && failed === 0) {
            log('\n🎉 Migration completed successfully!', 'green');
            console.log('\nNext steps:');
            console.log('  1. Review migration_report.json');
            console.log('  2. Update .env: STORAGE_TYPE=sqlite');
            console.log('  3. Restart server: npm start');
            console.log('  4. Test the application');
            console.log('  5. Backup the database: cp db/quotes.db db/quotes.backup.db');
        } else if (this.options.dryRun) {
            log('\n✓ Dry run completed. Review the output and run without --dry-run to migrate.', 'cyan');
        } else {
            log('\n⚠️  Migration completed with errors. Review migration_report.json', 'yellow');
        }
    }
}

// Парсинг аргументов командной строки
const args = process.argv.slice(2);
const options = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    validate: args.includes('--validate')
};

// Запуск миграции
const tool = new MigrationTool(options);
tool.migrate().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
