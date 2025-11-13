/**
 * Database Setup Helper for Tests
 *
 * Создает тестовые БД с применением всех миграций v3.0
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

/**
 * Создать тестовую БД с актуальной v3.0 схемой
 * @param {string} dbPath - путь к файлу БД
 */
function createTestDatabase(dbPath) {
    // Remove existing database
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }

    // Remove WAL files if exist
    ['.db-shm', '.db-wal'].forEach(ext => {
        const file = dbPath.replace('.db', ext);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    });

    // Create with base schema
    const db = new Database(dbPath);
    const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');
    db.exec(fs.readFileSync(schemaPath, 'utf8'));
    db.close();

    // Apply v3.0.0 migrations
    const migrationsDb = new Database(dbPath);

    try {
        // Migration 001: Add multi-tenancy
        const migration001 = path.join(__dirname, '..', '..', 'db', 'migrations', '001_add_multitenancy.sql');
        migrationsDb.exec(fs.readFileSync(migration001, 'utf8'));

        // Migration 002: Remove filename UNIQUE
        const migration002 = path.join(__dirname, '..', '..', 'db', 'migrations', '002_remove_filename_unique.sql');
        migrationsDb.exec(fs.readFileSync(migration002, 'utf8'));

        // Migration 003: Fix settings multi-tenancy
        const migration003 = path.join(__dirname, '..', '..', 'db', 'migrations', '003_fix_settings_multitenancy.sql');
        migrationsDb.exec(fs.readFileSync(migration003, 'utf8'));

    } finally {
        migrationsDb.close();
    }

    return dbPath;
}

/**
 * Cleanup тестовой БД
 * @param {string} dbPath - путь к файлу БД
 */
function cleanupTestDatabase(dbPath) {
    // Remove database file
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }

    // Remove WAL files
    ['.db-shm', '.db-wal'].forEach(ext => {
        const file = dbPath.replace('.db', ext);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    });
}

module.exports = {
    createTestDatabase,
    cleanupTestDatabase
};
