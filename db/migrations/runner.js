/**
 * Database Migration Runner
 * Применяет SQL миграции к существующей базе данных
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class MigrationRunner {
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.migrationsDir = __dirname;
    }

    /**
     * Получить список примененных миграций
     */
    getAppliedMigrations() {
        try {
            const result = this.db.prepare(
                'SELECT version FROM schema_migrations ORDER BY version'
            ).all();
            return result.map(r => r.version);
        } catch (err) {
            // Таблица ещё не создана
            return [];
        }
    }

    /**
     * Получить список доступных миграций
     */
    getAvailableMigrations() {
        const files = fs.readdirSync(this.migrationsDir)
            .filter(f => f.endsWith('.sql') && f.match(/^\d+_/))
            .sort();

        return files.map(file => {
            const version = parseInt(file.split('_')[0]);
            const name = file.replace(/^\d+_/, '').replace('.sql', '');
            return {
                version,
                name,
                filename: file,
                path: path.join(this.migrationsDir, file)
            };
        });
    }

    /**
     * Применить миграцию
     */
    applyMigration(migration) {
        console.log(`Applying migration ${migration.version}: ${migration.name}...`);

        const sql = fs.readFileSync(migration.path, 'utf-8');

        // Выполняем миграцию в транзакции
        const transaction = this.db.transaction(() => {
            // Выполняем SQL (может быть несколько statements)
            this.db.exec(sql);
        });

        try {
            transaction();
            console.log(`✓ Migration ${migration.version} applied successfully`);
            return true;
        } catch (err) {
            console.error(`✗ Migration ${migration.version} failed:`, err.message);
            throw err;
        }
    }

    /**
     * Откатить миграцию (если есть down.sql)
     */
    rollbackMigration(migration) {
        const downPath = migration.path.replace('.sql', '.down.sql');

        if (!fs.existsSync(downPath)) {
            throw new Error(`No rollback script found for migration ${migration.version}`);
        }

        console.log(`Rolling back migration ${migration.version}...`);

        const sql = fs.readFileSync(downPath, 'utf-8');

        const transaction = this.db.transaction(() => {
            this.db.exec(sql);

            // Удаляем запись из schema_migrations
            this.db.prepare('DELETE FROM schema_migrations WHERE version = ?')
                .run(migration.version);
        });

        try {
            transaction();
            console.log(`✓ Migration ${migration.version} rolled back`);
            return true;
        } catch (err) {
            console.error(`✗ Rollback failed:`, err.message);
            throw err;
        }
    }

    /**
     * Запустить все непримененные миграции
     */
    migrate() {
        const applied = this.getAppliedMigrations();
        const available = this.getAvailableMigrations();

        const pending = available.filter(m => !applied.includes(m.version));

        if (pending.length === 0) {
            console.log('No pending migrations');
            return;
        }

        console.log(`Found ${pending.length} pending migration(s)`);

        for (const migration of pending) {
            this.applyMigration(migration);
        }

        console.log(`\n✓ All migrations applied successfully`);
    }

    /**
     * Показать статус миграций
     */
    status() {
        const applied = this.getAppliedMigrations();
        const available = this.getAvailableMigrations();

        console.log('\nMigration Status:');
        console.log('=================\n');

        for (const migration of available) {
            const isApplied = applied.includes(migration.version);
            const status = isApplied ? '✓ Applied' : '○ Pending';
            console.log(`${status}  ${migration.version}: ${migration.name}`);
        }

        console.log('');
    }

    close() {
        this.db.close();
    }
}

// CLI interface
if (require.main === module) {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../quotes.db');
    const command = process.argv[2] || 'migrate';

    const runner = new MigrationRunner(dbPath);

    try {
        switch (command) {
            case 'migrate':
            case 'up':
                runner.migrate();
                break;

            case 'status':
                runner.status();
                break;

            case 'rollback':
            case 'down':
                const migrations = runner.getAvailableMigrations();
                const last = migrations[migrations.length - 1];
                if (last) {
                    runner.rollbackMigration(last);
                } else {
                    console.log('No migrations to rollback');
                }
                break;

            default:
                console.log('Usage: node runner.js [migrate|status|rollback]');
                process.exit(1);
        }

        runner.close();
    } catch (err) {
        console.error('Migration failed:', err);
        runner.close();
        process.exit(1);
    }
}

module.exports = MigrationRunner;
