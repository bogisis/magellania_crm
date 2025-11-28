-- Migration 009: Fix settings table to support scope-based access
-- Created: 2025-11-19
-- Description: Добавить scope, scope_id, value_type для поддержки app/org/user настроек

-- ============================================================================
-- ПЕРЕСОЗДАНИЕ ТАБЛИЦЫ settings С ПРАВИЛЬНОЙ СХЕМОЙ
-- ============================================================================

-- Шаг 1: Создаём новую таблицу с scope поддержкой
CREATE TABLE settings_new (
    -- Scope-based key-value store
    scope TEXT NOT NULL CHECK (scope IN ('app', 'organization', 'user')),
    scope_id TEXT NOT NULL,  -- 'global', organization_id, или user_id
    key TEXT NOT NULL,
    value TEXT NOT NULL,     -- JSON value
    value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'object', 'array')),

    -- Метаданные
    description TEXT,

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    -- ✅ Композитный PRIMARY KEY
    PRIMARY KEY (scope, scope_id, key)
);

-- Шаг 2: Мигрируем существующие данные
-- Все существующие настройки были organization-scoped
INSERT INTO settings_new (scope, scope_id, key, value, value_type, description, created_at, updated_at)
SELECT
    'organization' as scope,
    organization_id as scope_id,
    key,
    value,
    'object' as value_type,  -- Default type
    description,
    created_at,
    updated_at
FROM settings;

-- Шаг 3: Удаляем старую таблицу
DROP TABLE settings;

-- Шаг 4: Переименовываем новую таблицу
ALTER TABLE settings_new RENAME TO settings;

-- Шаг 5: Создаём индексы
CREATE INDEX IF NOT EXISTS idx_settings_scope ON settings(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_settings_updated ON settings(updated_at);

-- ============================================================================
-- MIGRATION METADATA
-- ============================================================================

INSERT INTO schema_migrations (version, name, applied_at)
VALUES (9, 'fix_settings_scope', strftime('%s', 'now'));
