-- Migration 007: Migrate Existing Data
-- Description: Создаёт дефолтную организацию и админа, мигрирует существующие данные
-- Created: 2025-11-19
-- Version: 3.0.0

-- =================================================================
-- STEP 1: Create Default Organization
-- =================================================================

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
) VALUES (
    'default-org',
    'Default Organization',
    'default',
    'pro',                          -- Даём Pro план для существующих пользователей
    'admin-user-id',                -- Будет создан на следующем шаге
    100,                            -- Большие лимиты для миграции
    1000,
    50,
    5000,
    10000,
    0,                              -- Обновится после миграции
    0,                              -- Обновится после миграции
    0,                              -- Обновится после миграции
    0,
    1,
    unixepoch(),
    unixepoch()
);

-- =================================================================
-- STEP 2: Create Default Admin User
-- =================================================================

-- Password hash для 'admin123' (bcrypt, 10 rounds)
-- ВАЖНО: Пользователь ДОЛЖЕН сменить пароль после первого входа!
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
) VALUES (
    'admin-user-id',
    'admin@localhost',
    'admin',                        -- Без суффикса для первого admin
    '$2b$10$amUBhN8kJvF84MZ.e4hwo.Ji5/anVfj0u8xqVJuSuNhdiOZ6EMKfe',  -- admin123
    'Administrator',
    'admin',
    'default-org',
    1,
    1,                              -- Email verified для первого admin
    unixepoch(),
    unixepoch()
);

-- =================================================================
-- STEP 3: Migrate Existing Estimates
-- =================================================================

-- Обновить все существующие сметы:
-- - Установить organization_id на default-org
-- - Установить owner_id на admin-user-id
-- - Установить visibility на 'organization' (доступно всем в org)

UPDATE estimates
SET
    organization_id = 'default-org',
    owner_id = 'admin-user-id',
    visibility = 'organization',
    last_accessed_at = updated_at        -- Инициализируем last_accessed
WHERE organization_id IS NULL;

-- =================================================================
-- STEP 4: Migrate Existing Catalogs (if any)
-- =================================================================

UPDATE catalogs
SET
    organization_id = 'default-org',
    owner_id = 'admin-user-id',
    visibility = 'organization'
WHERE organization_id IS NULL;

-- =================================================================
-- STEP 5: Update Organization Counters
-- =================================================================

-- Подсчитать количество смет
UPDATE organizations
SET current_estimates_count = (
    SELECT COUNT(*)
    FROM estimates
    WHERE organization_id = 'default-org'
      AND deleted_at IS NULL
)
WHERE id = 'default-org';

-- Подсчитать количество каталогов
UPDATE organizations
SET current_catalogs_count = (
    SELECT COUNT(*)
    FROM catalogs
    WHERE organization_id = 'default-org'
      AND deleted_at IS NULL
)
WHERE id = 'default-org';

-- Установить current_users_count = 1 (admin)
UPDATE organizations
SET current_users_count = 1
WHERE id = 'default-org';

-- =================================================================
-- STEP 6: Create Default Settings
-- =================================================================

-- App-level settings
INSERT INTO settings (scope, scope_id, key, value, value_type, created_at, updated_at)
VALUES
    ('app', 'global', 'storage_type', '"sqlite"', 'string', unixepoch(), unixepoch()),
    ('app', 'global', 'db_version', '"1.0.0"', 'string', unixepoch(), unixepoch()),
    ('app', 'global', 'maintenance_mode', 'false', 'boolean', unixepoch(), unixepoch());

-- Organization-level settings (default values)
INSERT INTO settings (scope, scope_id, key, value, value_type, created_at, updated_at)
VALUES
    ('organization', 'default-org', 'currency', '"$"', 'string', unixepoch(), unixepoch()),
    ('organization', 'default-org', 'default_tax_rate', '0', 'number', unixepoch(), unixepoch()),
    ('organization', 'default-org', 'default_hidden_markup', '10', 'number', unixepoch(), unixepoch()),
    ('organization', 'default-org', 'booking_terms', '""', 'string', unixepoch(), unixepoch());

-- User-level settings (для admin)
INSERT INTO settings (scope, scope_id, key, value, value_type, created_at, updated_at)
VALUES
    ('user', 'admin-user-id', 'theme', '"light"', 'string', unixepoch(), unixepoch()),
    ('user', 'admin-user-id', 'language', '"ru"', 'string', unixepoch(), unixepoch()),
    ('user', 'admin-user-id', 'default_pax_count', '27', 'number', unixepoch(), unixepoch()),
    ('user', 'admin-user-id', 'autosave_interval_sec', '8', 'number', unixepoch(), unixepoch());

-- =================================================================
-- STEP 7: Create Audit Log for Migration
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
    'migration-007',
    'migration',
    'admin-user-id',
    'default-org',
    '{"migration": "007", "description": "Migrated existing data to multi-tenant structure", "estimates_migrated": ' ||
        (SELECT COUNT(*) FROM estimates WHERE organization_id = 'default-org') ||
    ', "catalogs_migrated": ' ||
        (SELECT COUNT(*) FROM catalogs WHERE organization_id = 'default-org') ||
    '}',
    unixepoch()
);

-- =================================================================
-- VERIFICATION QUERIES (for manual check)
-- =================================================================

-- Uncomment to verify migration results:

-- SELECT 'Organizations created:' as info, COUNT(*) as count FROM organizations;
-- SELECT 'Users created:' as info, COUNT(*) as count FROM users;
-- SELECT 'Estimates migrated:' as info, COUNT(*) as count FROM estimates WHERE organization_id = 'default-org';
-- SELECT 'Catalogs migrated:' as info, COUNT(*) as count FROM catalogs WHERE organization_id = 'default-org';
-- SELECT 'Settings created:' as info, COUNT(*) as count FROM settings;

-- Check for any estimates without organization_id (should be 0):
-- SELECT 'Estimates without org_id:' as info, COUNT(*) as count FROM estimates WHERE organization_id IS NULL;

-- Check organization counters:
-- SELECT id, name, current_users_count, current_estimates_count, current_catalogs_count
-- FROM organizations WHERE id = 'default-org';
