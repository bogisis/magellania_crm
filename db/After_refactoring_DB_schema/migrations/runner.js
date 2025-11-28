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
        this.db.pragma('foreign_keys = ON'); // Moved here
        this.migrationsDir = __dirname;
        this.baseSchemaPath = path.join(__dirname, '../schema.sql');
    }

    /**
     * Apply the base schema from db/schema.sql if it hasn't been applied yet.
     */
    applyBaseSchema() {
        try {
            // Check if a key table (e.g., estimates) already exists.
            const tableExists = this.db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='estimates'"
            ).get();

            if (tableExists) {
                // If the table exists, we assume the base schema is already in place.
                return;
            }

            console.log('Applying base schema from db/schema.sql...');
            const sql = fs.readFileSync(this.baseSchemaPath, 'utf-8');
            this.db.exec(sql);
            console.log('✓ Base schema applied successfully.');
        } catch (err) {
            console.error(`✗ Failed to apply base schema: ${err.message}`);
            throw err;
        }
    }

    /**
     * Получить список примененных миграций
     */
    getAppliedMigrations() {
        try {
            // Ensure schema_migrations table exists before querying it.
            this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL);");
            const result = this.db.prepare(
                'SELECT version FROM schema_migrations ORDER BY version'
            ).all();
            return result.map(r => r.version);
        } catch (err) {
            // This should not happen anymore with the CREATE TABLE IF NOT EXISTS.
            console.error(`Error getting applied migrations: ${err.message}`);
            return [];
        }
    }

    /**
     * Получить список доступных миграций
     */
    getAvailableMigrations() {
        const files = fs.readdirSync(this.migrationsDir)
            .filter(f => f.endsWith('.sql') && f.match(/^\d+_/))
            .sort((a, b) => parseInt(a) - parseInt(b)); // Sort numerically

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
            this.db.exec(sql);
            // Record the migration in the same transaction
            this.db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
               .run(migration.version, migration.name, Math.floor(Date.now() / 1000));
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
        // First, ensure the base schema is in place.
        this.applyBaseSchema();

        const applied = this.getAppliedMigrations();
        const available = this.getAvailableMigrations();

        const pending = available.filter(m => !applied.includes(m.version));

        if (pending.length === 0) {
            console.log('No pending migrations.');
            return;
        }

        console.log(`Found ${pending.length} pending migration(s)`);

        for (const migration of pending) {
            this.applyMigration(migration);
        }

        console.log(`\n✓ All migrations applied successfully.`);
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
