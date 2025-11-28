-- Migration 008: Make Multi-Tenancy Fields NOT NULL
-- Description: Устанавливает NOT NULL constraint на organization_id и owner_id после миграции данных
-- Created: 2025-11-19
-- Version: 3.0.0
-- ВАЖНО: Эта миграция должна запускаться ПОСЛЕ 006 и 007!

-- =================================================================
-- VERIFICATION BEFORE MIGRATION
-- =================================================================

-- Проверка: все estimates должны иметь organization_id и owner_id
-- Если эта проверка не проходит, миграция 007 не была выполнена корректно!

-- Uncomment to run verification:
-- SELECT 'Estimates without org_id:' as check, COUNT(*) as count FROM estimates WHERE organization_id IS NULL;
-- SELECT 'Estimates without owner_id:' as check, COUNT(*) as count FROM estimates WHERE owner_id IS NULL;
-- SELECT 'Catalogs without org_id:' as check, COUNT(*) as count FROM catalogs WHERE organization_id IS NULL;
-- SELECT 'Catalogs without owner_id:' as check, COUNT(*) as count FROM catalogs WHERE owner_id IS NULL;

-- Если хотя бы один COUNT > 0, миграция НЕ ДОЛЖНА выполняться!

-- =================================================================
-- IMPORTANT NOTE ABOUT SQLite LIMITATIONS
-- =================================================================

-- SQLite не поддерживает ALTER COLUMN для добавления NOT NULL к существующей колонке.
-- Необходимо создать новую таблицу с правильными constraints и скопировать данные.
-- Это безопасная операция в рамках транзакции.

-- =================================================================
-- STEP 1: Recreate ESTIMATES table with NOT NULL constraints
-- =================================================================

PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

-- Создать новую таблицу с правильными constraints
CREATE TABLE estimates_new (
    -- ID-First Pattern
    id TEXT PRIMARY KEY NOT NULL,
    filename TEXT NOT NULL,

    -- Multi-Tenancy (ОБЯЗАТЕЛЬНЫЕ поля с NOT NULL)
    organization_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,

    -- Visibility & Sharing
    visibility TEXT DEFAULT 'private' NOT NULL,
    shared_with TEXT,

    -- Single Source of Truth
    data TEXT NOT NULL,

    -- Версионирование
    version TEXT DEFAULT '1.1.0',
    app_version TEXT DEFAULT '2.3.0',

    -- Optimistic Locking
    data_version INTEGER DEFAULT 1 NOT NULL,
    data_hash TEXT,

    -- Метаданные
    client_name TEXT,
    client_email TEXT,
    client_phone TEXT,
    pax_count INTEGER DEFAULT 0,
    tour_start TEXT,
    tour_end TEXT,

    -- Расчёты
    total_cost REAL DEFAULT 0,
    total_profit REAL DEFAULT 0,
    services_count INTEGER DEFAULT 0,

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_accessed_at INTEGER,
    deleted_at INTEGER DEFAULT NULL,

    -- Шаблонность
    is_template BOOLEAN DEFAULT 0,
    template_name TEXT,

    -- Foreign Keys
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Скопировать данные из старой таблицы
INSERT INTO estimates_new
SELECT
    id,
    filename,
    organization_id,
    owner_id,
    visibility,
    shared_with,
    data,
    version,
    app_version,
    data_version,
    data_hash,
    client_name,
    client_email,
    client_phone,
    pax_count,
    tour_start,
    tour_end,
    total_cost,
    total_profit,
    services_count,
    created_at,
    updated_at,
    last_accessed_at,
    deleted_at,
    is_template,
    template_name
FROM estimates;

-- Удалить старую таблицу
DROP TABLE estimates;

-- Переименовать новую таблицу
ALTER TABLE estimates_new RENAME TO estimates;

-- Воссоздать индексы для estimates
CREATE INDEX idx_estimates_org_updated ON estimates(organization_id, updated_at DESC);
CREATE INDEX idx_estimates_owner ON estimates(owner_id, created_at DESC);
CREATE INDEX idx_estimates_visibility ON estimates(organization_id, visibility);
CREATE INDEX idx_estimates_client ON estimates(organization_id, client_name);
CREATE INDEX idx_estimates_tour_dates ON estimates(organization_id, tour_start, tour_end);
CREATE INDEX idx_estimates_accessed ON estimates(last_accessed_at DESC);
CREATE INDEX idx_estimates_templates ON estimates(organization_id, is_template);

-- =================================================================
-- STEP 2: Recreate CATALOGS table with NOT NULL constraints
-- =================================================================

-- Создать новую таблицу с правильными constraints
CREATE TABLE catalogs_new (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,

    -- Naming
    name TEXT NOT NULL,
    slug TEXT NOT NULL,

    -- Multi-Tenancy (ОБЯЗАТЕЛЬНЫЕ поля с NOT NULL)
    organization_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,

    -- Visibility & Sharing
    visibility TEXT DEFAULT 'private' NOT NULL,
    shared_with_orgs TEXT,

    -- Data
    data TEXT NOT NULL,

    -- Версионирование
    version TEXT DEFAULT '1.2.0',
    app_version TEXT DEFAULT '2.3.0',

    -- Optimistic Locking
    data_version INTEGER DEFAULT 1 NOT NULL,
    data_hash TEXT,

    -- Метаданные
    region TEXT,
    templates_count INTEGER DEFAULT 0,
    categories_count INTEGER DEFAULT 0,

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_accessed_at INTEGER,
    deleted_at INTEGER DEFAULT NULL,

    -- Foreign Keys
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,

    -- Constraints
    UNIQUE(organization_id, slug)
);

-- Скопировать данные
INSERT INTO catalogs_new
SELECT
    id,
    name,
    slug,
    organization_id,
    owner_id,
    visibility,
    shared_with_orgs,
    data,
    version,
    app_version,
    data_version,
    data_hash,
    region,
    templates_count,
    categories_count,
    created_at,
    updated_at,
    last_accessed_at,
    deleted_at
FROM catalogs;

-- Удалить старую таблицу
DROP TABLE catalogs;

-- Переименовать новую таблицу
ALTER TABLE catalogs_new RENAME TO catalogs;

-- Воссоздать индексы для catalogs
CREATE INDEX idx_catalogs_org ON catalogs(organization_id, updated_at DESC);
CREATE INDEX idx_catalogs_visibility ON catalogs(visibility, organization_id);
CREATE INDEX idx_catalogs_region ON catalogs(organization_id, region);
CREATE INDEX idx_catalogs_slug ON catalogs(slug);
CREATE INDEX idx_catalogs_accessed ON catalogs(last_accessed_at DESC);

-- =================================================================
-- STEP 3: Add remaining indexes
-- =================================================================

-- Backups indexes (дополнительные)
CREATE INDEX IF NOT EXISTS idx_backups_expires ON backups(expires_at);

-- Audit logs indexes (дополнительные)
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, entity_type);

-- Users indexes (дополнительные)
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active, organization_id);

-- Organizations indexes (дополнительные)
CREATE INDEX IF NOT EXISTS idx_orgs_plan ON organizations(plan, subscription_status);

-- Settings indexes (дополнительные)
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- =================================================================
-- STEP 4: Add triggers for auto-update timestamps
-- =================================================================

-- Trigger для auto-update updated_at в estimates
CREATE TRIGGER IF NOT EXISTS trigger_estimates_updated_at
AFTER UPDATE ON estimates
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE estimates SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- Trigger для auto-update updated_at в catalogs
CREATE TRIGGER IF NOT EXISTS trigger_catalogs_updated_at
AFTER UPDATE ON catalogs
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE catalogs SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- Trigger для auto-update updated_at в organizations
CREATE TRIGGER IF NOT EXISTS trigger_organizations_updated_at
AFTER UPDATE ON organizations
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE organizations SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- Trigger для auto-update updated_at в users
CREATE TRIGGER IF NOT EXISTS trigger_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE users SET updated_at = unixepoch() WHERE id = NEW.id;
END;

-- Trigger для auto-update updated_at в settings
CREATE TRIGGER IF NOT EXISTS trigger_settings_updated_at
AFTER UPDATE ON settings
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE settings SET updated_at = unixepoch()
    WHERE scope = NEW.scope AND scope_id = NEW.scope_id AND key = NEW.key;
END;

-- =================================================================
-- STEP 5: Create audit log for migration
-- =================================================================

INSERT INTO audit_logs (
    entity_type,
    entity_id,
    action,
    user_id,
    organization_id,
    metadata,
    created_at
) VALUES (
    'system',
    'migration-008',
    'migration',
    'admin-user-id',
    'default-org',
    '{"migration": "008", "description": "Applied NOT NULL constraints and created triggers", "tables_modified": ["estimates", "catalogs"], "indexes_created": ' ||
        (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%') ||
    ', "triggers_created": ' ||
        (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'trigger_%') ||
    '}',
    unixepoch()
);

-- Завершить транзакцию
COMMIT;

-- Включить foreign keys обратно
PRAGMA foreign_keys=ON;

-- =================================================================
-- VERIFICATION AFTER MIGRATION
-- =================================================================

-- Uncomment to verify migration results:

-- Check table structure:
-- PRAGMA table_info(estimates);
-- PRAGMA table_info(catalogs);

-- Check indexes:
-- SELECT name, tbl_name FROM sqlite_master WHERE type='index' ORDER BY tbl_name, name;

-- Check triggers:
-- SELECT name, tbl_name FROM sqlite_master WHERE type='trigger' ORDER BY tbl_name, name;

-- Check foreign keys are enabled:
-- PRAGMA foreign_keys;

-- Count records in all tables:
-- SELECT 'estimates' as table_name, COUNT(*) as count FROM estimates
-- UNION ALL
-- SELECT 'catalogs', COUNT(*) FROM catalogs
-- UNION ALL
-- SELECT 'organizations', COUNT(*) FROM organizations
-- UNION ALL
-- SELECT 'users', COUNT(*) FROM users
-- UNION ALL
-- SELECT 'settings', COUNT(*) FROM settings
-- UNION ALL
-- SELECT 'backups', COUNT(*) FROM backups
-- UNION ALL
-- SELECT 'audit_logs', COUNT(*) FROM audit_logs;
