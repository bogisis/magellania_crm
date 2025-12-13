-- Migration 003: Fix settings table for multi-tenancy
-- Created: 2025-10-27
-- Description: Изменить PRIMARY KEY settings на (key, organization_id)

-- ============================================================================
-- ПЕРЕСОЗДАНИЕ ТАБЛИЦЫ settings С КОМПОЗИТНЫМ PRIMARY KEY
-- ============================================================================

-- Шаг 1: Создаём новую таблицу с правильной структурой
CREATE TABLE settings_new (
    -- Ключ-значение хранилище
    key TEXT NOT NULL,
    value TEXT NOT NULL,  -- JSON value

    -- Multi-tenancy
    organization_id TEXT NOT NULL,

    -- Метаданные
    description TEXT,

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    -- ✅ Композитный PRIMARY KEY
    PRIMARY KEY (key, organization_id)
);

-- Шаг 2: Копируем существующие данные (если есть)
INSERT INTO settings_new (key, value, organization_id, description, created_at, updated_at)
SELECT
    key,
    value,
    COALESCE(organization_id, 'org_default') as organization_id,
    description,
    created_at,
    updated_at
FROM settings;

-- Шаг 3: Удаляем старую таблицу
DROP TABLE settings;

-- Шаг 4: Переименовываем новую таблицу
ALTER TABLE settings_new RENAME TO settings;

-- Шаг 5: Пересоздаём индекс
CREATE INDEX IF NOT EXISTS idx_settings_org ON settings(organization_id);
