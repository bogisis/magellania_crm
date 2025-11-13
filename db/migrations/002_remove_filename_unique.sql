-- Migration 002: Remove filename UNIQUE constraint
-- Created: 2025-10-27
-- Description: Убираем UNIQUE constraint с filename (ID-First архитектура)

-- SQLite не поддерживает ALTER TABLE DROP CONSTRAINT
-- Поэтому используем метод: создать новую таблицу → копировать данные → заменить

-- ============================================================================
-- ПЕРЕСОЗДАНИЕ ТАБЛИЦЫ estimates БЕЗ filename UNIQUE
-- ============================================================================

-- Шаг 0: Удаляем зависимые VIEWs (будут пересозданы позже)
DROP VIEW IF EXISTS active_estimates;
DROP VIEW IF EXISTS estimates_with_owner;

-- Шаг 1: Создаём новую таблицу с правильной структурой
CREATE TABLE estimates_new (
    -- Идентификаторы
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,  -- ❌ Убран UNIQUE constraint

    -- Версионирование
    version TEXT DEFAULT '1.1.0',
    app_version TEXT DEFAULT '2.3.0',

    -- Данные сметы (JSON)
    data TEXT NOT NULL,

    -- Метаданные для быстрого поиска (извлечены из JSON)
    client_name TEXT,
    client_email TEXT,
    client_phone TEXT,
    pax_count INTEGER DEFAULT 0,
    tour_start TEXT,  -- ISO 8601 date
    tour_end TEXT,

    -- Расчеты (кешированные для поиска)
    total_cost REAL DEFAULT 0,
    total_profit REAL DEFAULT 0,
    services_count INTEGER DEFAULT 0,

    -- Optimistic locking
    data_version INTEGER DEFAULT 1,
    data_hash TEXT,  -- SHA256 hash для детекции изменений

    -- Временные метки
    created_at INTEGER NOT NULL,  -- Unix timestamp
    updated_at INTEGER NOT NULL,

    -- Soft delete
    deleted_at INTEGER DEFAULT NULL,

    -- Multi-tenancy (добавлено в migration 001)
    owner_id TEXT,
    organization_id TEXT
);

-- Шаг 2: Копируем все данные из старой таблицы
INSERT INTO estimates_new
SELECT
    id, filename, version, app_version, data,
    client_name, client_email, client_phone,
    pax_count, tour_start, tour_end,
    total_cost, total_profit, services_count,
    data_version, data_hash,
    created_at, updated_at, deleted_at,
    owner_id, organization_id
FROM estimates;

-- Шаг 3: Удаляем старую таблицу
DROP TABLE estimates;

-- Шаг 4: Переименовываем новую таблицу
ALTER TABLE estimates_new RENAME TO estimates;

-- Шаг 5: Пересоздаём индексы
CREATE INDEX idx_estimates_filename ON estimates(filename);  -- ✅ Обычный индекс, не UNIQUE
CREATE INDEX idx_estimates_client_name ON estimates(client_name);
CREATE INDEX idx_estimates_tour_start ON estimates(tour_start);
CREATE INDEX idx_estimates_updated_at ON estimates(updated_at DESC);
CREATE INDEX idx_estimates_deleted_at ON estimates(deleted_at);

-- Индексы для multi-tenancy
CREATE INDEX idx_estimates_owner ON estimates(owner_id);
CREATE INDEX idx_estimates_org ON estimates(organization_id);
CREATE INDEX idx_estimates_org_updated ON estimates(organization_id, updated_at DESC);

-- Шаг 6: Пересоздаём VIEWs
CREATE VIEW active_estimates AS
SELECT * FROM estimates WHERE deleted_at IS NULL;

CREATE VIEW estimates_with_owner AS
SELECT
    e.*,
    u.name as owner_name,
    u.email as owner_email,
    o.name as organization_name
FROM estimates e
LEFT JOIN users u ON e.owner_id = u.id
LEFT JOIN organizations o ON e.organization_id = o.id
WHERE e.deleted_at IS NULL;

-- ============================================================================
-- MIGRATION METADATA
-- ============================================================================

INSERT INTO schema_migrations (version, name, applied_at)
VALUES (2, 'remove_filename_unique', strftime('%s', 'now'));
