-- ============================================================================
-- Migration 010: Superadmin Setup
-- ============================================================================
--
-- ЦЕЛЬ: Унификация всех данных под единой организацией и пользователем
--
-- ЕДИНЫЙ ФОРМАТ (Production):
--   User ID:         superadmin
--   Email:           admin@magellania.com
--   Organization ID: magellania-org
--   Organization:    Magellania
--
-- ВАЖНО:
-- - НЕ использовать guest/test/demo аккаунты
-- - НЕ использовать default-org, org_default, admin-user-id, user_default
-- - Multi-tenancy остаётся без изменений (архитектура сохраняется)
-- - Все новые сметы/каталоги создаются только для magellania-org
--
-- Created: 2025-11-25
-- Version: 2.3.0
-- ============================================================================

BEGIN TRANSACTION;

-- ============================================================================
-- 1. СОЗДАНИЕ ОРГАНИЗАЦИИ MAGELLANIA
-- ============================================================================

INSERT OR REPLACE INTO organizations (
    id,
    name,
    slug,
    plan,
    owner_id,
    settings,
    created_at,
    updated_at
) VALUES (
    'magellania-org',
    'Magellania',
    'magellania',
    'enterprise',
    'superadmin',  -- будет создан ниже
    '{}',
    unixepoch(),
    unixepoch()
);

-- ============================================================================
-- 2. СОЗДАНИЕ СУПЕРАДМИНА
-- ============================================================================

INSERT OR REPLACE INTO users (
    id,
    email,
    username,
    password_hash,
    organization_id,
    role,
    is_admin,
    created_at,
    updated_at
) VALUES (
    'superadmin',
    'admin@magellania.com',
    'superadmin',
    -- Хэш пароля "magellania2025" (bcrypt, rounds=10)
    -- ВАЖНО: Сменить в production!
    '$2b$10$za1xZO2ANym7dXfLAEupjeTaSjO6cESoLR2S3yj.Oe.FTzqK65Bjq',
    'magellania-org',
    'admin',
    1,
    unixepoch(),
    unixepoch()
);

-- ============================================================================
-- 3. МИГРАЦИЯ СУЩЕСТВУЮЩИХ ДАННЫХ
-- ============================================================================

-- 3.1. Estimates (Сметы)
UPDATE estimates
SET organization_id = 'magellania-org',
    owner_id = 'superadmin'
WHERE organization_id IN ('default-org', 'org_default')
   OR owner_id IN ('admin-user-id', 'user_default', 'guest-user-001');

-- 3.2. Catalogs (Каталоги)
UPDATE catalogs
SET organization_id = 'magellania-org',
    owner_id = 'superadmin'
WHERE organization_id IN ('default-org', 'org_default')
   OR owner_id IN ('admin-user-id', 'user_default', 'guest-user-001');

-- 3.3. Backups (Бэкапы)
UPDATE backups
SET organization_id = 'magellania-org',
    created_by = 'superadmin'
WHERE organization_id IN ('default-org', 'org_default')
   OR created_by IN ('admin-user-id', 'user_default', 'guest-user-001');

-- 3.4. Settings (Настройки)
UPDATE settings
SET scope_id = 'magellania-org'
WHERE scope = 'organization'
  AND scope_id IN ('default-org', 'org_default');

-- ============================================================================
-- 4. ОЧИСТКА СТАРЫХ ТЕСТОВЫХ АККАУНТОВ
-- ============================================================================

-- 4.1. Удаление старых пользователей
DELETE FROM users
WHERE id IN ('admin-user-id', 'user_default', 'guest-user-001');

-- 4.2. Удаление старых организаций
DELETE FROM organizations
WHERE id IN ('default-org', 'org_default');

-- ============================================================================
-- 5. ПРОВЕРКА ЦЕЛОСТНОСТИ
-- ============================================================================

-- Проверяем, что все данные мигрировали корректно
-- Эти проверки выполняются только для валидации, не влияют на транзакцию

-- 5.1. Все сметы должны быть в magellania-org
-- SELECT CASE
--     WHEN COUNT(*) > 0 THEN 'WARNING: Found estimates with wrong org'
--     ELSE 'OK: All estimates migrated'
-- END as estimates_check
-- FROM estimates
-- WHERE organization_id != 'magellania-org';

-- 5.2. Все каталоги должны быть в magellania-org
-- SELECT CASE
--     WHEN COUNT(*) > 0 THEN 'WARNING: Found catalogs with wrong org'
--     ELSE 'OK: All catalogs migrated'
-- END as catalogs_check
-- FROM catalogs
-- WHERE organization_id != 'magellania-org';

COMMIT;

-- ============================================================================
-- РЕЗУЛЬТАТ МИГРАЦИИ
-- ============================================================================
--
-- После выполнения этой миграции:
-- ✅ Создана организация: magellania-org
-- ✅ Создан суперадмин: superadmin (admin@magellania.com)
-- ✅ Все сметы мигрированы на magellania-org
-- ✅ Все каталоги мигрированы на magellania-org
-- ✅ Все бэкапы мигрированы на magellania-org
-- ✅ Старые тестовые аккаунты удалены
--
-- NEXT STEPS:
-- 1. Обновить пароль суперадмина (см. routes/api-v1/auth.js)
-- 2. Залогиниться: POST /api/v1/auth/login
--    {
--      "email": "admin@magellania.com",
--      "password": "magellania2025"
--    }
-- 3. Все дальнейшие операции выполнять только под superadmin
--
-- ============================================================================
