-- Quote Calculator Database Schema
-- SQLite 3.x with JSON1 extension
-- Version: 1.0.0
-- Created: 2025-10-26

-- ============================================================================
-- Основные таблицы
-- ============================================================================

-- Сметы (estimates)
CREATE TABLE IF NOT EXISTS estimates (
    -- Идентификаторы
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,  -- NOT UNIQUE (migration 002)

    -- Версионирование
    version TEXT DEFAULT '1.1.0',
    app_version TEXT DEFAULT '2.3.0',

    -- Данные сметы (JSON)
    data TEXT NOT NULL,  -- Весь объект сметы в JSON

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

    -- Multi-tenancy (migration 001)
    owner_id TEXT,
    organization_id TEXT
);

-- Индексы для estimates
CREATE INDEX IF NOT EXISTS idx_estimates_filename ON estimates(filename);
CREATE INDEX IF NOT EXISTS idx_estimates_client_name ON estimates(client_name);
CREATE INDEX IF NOT EXISTS idx_estimates_tour_start ON estimates(tour_start);
CREATE INDEX IF NOT EXISTS idx_estimates_updated_at ON estimates(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_deleted_at ON estimates(deleted_at);
CREATE INDEX IF NOT EXISTS idx_estimates_owner ON estimates(owner_id);
CREATE INDEX IF NOT EXISTS idx_estimates_org ON estimates(organization_id);
CREATE INDEX IF NOT EXISTS idx_estimates_org_updated ON estimates(organization_id, updated_at DESC);

-- ============================================================================

-- Backups (резервные копии смет)
CREATE TABLE IF NOT EXISTS backups (
    -- Идентификаторы
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estimate_id TEXT NOT NULL,

    -- Данные backup
    data TEXT NOT NULL,  -- JSON копия сметы

    -- Метаданные
    backup_type TEXT DEFAULT 'auto',  -- 'auto', 'manual', 'before_delete'
    created_by TEXT,  -- user_id (для будущего multi-user)

    -- Временные метки
    created_at INTEGER NOT NULL,

    -- Multi-tenancy (migration 001)
    owner_id TEXT,
    organization_id TEXT

    -- Note: No FOREIGN KEY constraint - backups should persist even if estimate is deleted
    -- This allows for historical tracking and recovery
);

-- Индексы для backups
CREATE INDEX IF NOT EXISTS idx_backups_estimate_id ON backups(estimate_id);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_owner ON backups(owner_id);
CREATE INDEX IF NOT EXISTS idx_backups_org ON backups(organization_id);

-- ============================================================================

-- Catalogs (каталоги услуг)
CREATE TABLE IF NOT EXISTS catalogs (
    -- Идентификаторы
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,

    -- Версионирование
    version TEXT DEFAULT '1.2.0',

    -- Данные каталога (JSON)
    data TEXT NOT NULL,  -- Массив шаблонов услуг

    -- Метаданные
    region TEXT,
    templates_count INTEGER DEFAULT 0,

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    -- Soft delete
    deleted_at INTEGER DEFAULT NULL,

    -- Multi-tenancy (migration 001)
    owner_id TEXT,
    organization_id TEXT,
    visibility TEXT DEFAULT 'private'
);

-- Индексы для catalogs
CREATE INDEX IF NOT EXISTS idx_catalogs_name ON catalogs(name);
CREATE INDEX IF NOT EXISTS idx_catalogs_region ON catalogs(region);
CREATE INDEX IF NOT EXISTS idx_catalogs_owner ON catalogs(owner_id);
CREATE INDEX IF NOT EXISTS idx_catalogs_org ON catalogs(organization_id);
CREATE INDEX IF NOT EXISTS idx_catalogs_org_region ON catalogs(organization_id, region);
CREATE INDEX IF NOT EXISTS idx_catalogs_visibility ON catalogs(organization_id, visibility);

-- ============================================================================

-- Settings (глобальные настройки)
CREATE TABLE IF NOT EXISTS settings (
    -- Ключ-значение хранилище
    key TEXT NOT NULL,
    value TEXT NOT NULL,  -- JSON value

    -- Multi-tenancy (migration 003)
    organization_id TEXT NOT NULL,

    -- Метаданные
    description TEXT,

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    -- Composite PRIMARY KEY (migration 003)
    PRIMARY KEY (key, organization_id)
);

-- ============================================================================

-- Audit Log (для будущего undo/redo и истории изменений)
CREATE TABLE IF NOT EXISTS audit_logs (
    -- Идентификаторы
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Связь с сущностью
    entity_type TEXT NOT NULL,  -- 'estimate', 'catalog', 'setting'
    entity_id TEXT NOT NULL,

    -- Действие
    action TEXT NOT NULL,  -- 'create', 'update', 'delete', 'restore'

    -- Данные изменения
    old_data TEXT,  -- JSON before (для undo)
    new_data TEXT,  -- JSON after (для redo)

    -- Diff (опционально, для компактности)
    diff TEXT,  -- JSON patch

    -- Метаданные
    user_id TEXT,  -- Для будущего multi-user
    ip_address TEXT,
    user_agent TEXT,

    -- Временная метка
    created_at INTEGER NOT NULL
);

-- Индексы для audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- Full-Text Search (опционально, для будущего)
-- ============================================================================

-- FTS5 virtual table для полнотекстового поиска по сметам
-- Раскомментировать когда понадобится поиск
/*
CREATE VIRTUAL TABLE IF NOT EXISTS estimates_fts USING fts5(
    id UNINDEXED,
    client_name,
    services_text,
    program_description,
    quote_comments,
    content=estimates,
    content_rowid=rowid
);

-- Triggers для синхронизации FTS
CREATE TRIGGER IF NOT EXISTS estimates_fts_insert AFTER INSERT ON estimates BEGIN
    INSERT INTO estimates_fts(rowid, id, client_name, services_text, program_description, quote_comments)
    VALUES (
        new.rowid,
        new.id,
        new.client_name,
        json_extract(new.data, '$.services'),
        json_extract(new.data, '$.programDescription'),
        json_extract(new.data, '$.quoteComments')
    );
END;

CREATE TRIGGER IF NOT EXISTS estimates_fts_update AFTER UPDATE ON estimates BEGIN
    UPDATE estimates_fts SET
        client_name = new.client_name,
        services_text = json_extract(new.data, '$.services'),
        program_description = json_extract(new.data, '$.programDescription'),
        quote_comments = json_extract(new.data, '$.quoteComments')
    WHERE rowid = new.rowid;
END;

CREATE TRIGGER IF NOT EXISTS estimates_fts_delete AFTER DELETE ON estimates BEGIN
    DELETE FROM estimates_fts WHERE rowid = old.rowid;
END;
*/

-- ============================================================================
-- Triggers для автоматического обновления updated_at
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS update_estimates_timestamp
AFTER UPDATE ON estimates
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE estimates SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_catalogs_timestamp
AFTER UPDATE ON catalogs
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE catalogs SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_settings_timestamp
AFTER UPDATE ON settings
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE settings SET updated_at = strftime('%s', 'now') WHERE key = NEW.key;
END;

-- ============================================================================
-- Вспомогательные функции (через views)
-- ============================================================================

-- View для активных (не удаленных) смет
CREATE VIEW IF NOT EXISTS active_estimates AS
SELECT * FROM estimates WHERE deleted_at IS NULL;

-- View для активных каталогов
CREATE VIEW IF NOT EXISTS active_catalogs AS
SELECT * FROM catalogs WHERE deleted_at IS NULL;

-- View для последних backups каждой сметы
CREATE VIEW IF NOT EXISTS latest_backups AS
SELECT b1.*
FROM backups b1
INNER JOIN (
    SELECT estimate_id, MAX(created_at) as max_created
    FROM backups
    GROUP BY estimate_id
) b2 ON b1.estimate_id = b2.estimate_id AND b1.created_at = b2.max_created;

-- ============================================================================
-- Initial data
-- ============================================================================

-- Дефолтные настройки
INSERT OR IGNORE INTO settings (key, value, description, created_at, updated_at)
VALUES
    ('storage_type', '"sqlite"', 'Current storage backend: file or sqlite', strftime('%s', 'now'), strftime('%s', 'now')),
    ('db_version', '"1.0.0"', 'Database schema version', strftime('%s', 'now'), strftime('%s', 'now')),
    ('app_version', '"2.3.0"', 'Application version', strftime('%s', 'now'), strftime('%s', 'now')),
    ('booking_terms', '""', 'Global booking terms and conditions', strftime('%s', 'now'), strftime('%s', 'now')),
    ('enable_audit_log', 'true', 'Enable audit logging for undo/redo', strftime('%s', 'now'), strftime('%s', 'now'));

-- ============================================================================
-- PRAGMA оптимизации
-- ============================================================================

-- Включаем WAL mode для лучшей concurrency
PRAGMA journal_mode = WAL;

-- Автоматическая очистка WAL файла при достижении 1000 страниц
PRAGMA wal_autocheckpoint = 1000;

-- Синхронизация = NORMAL для баланса между производительностью и надежностью
PRAGMA synchronous = NORMAL;

-- Включаем foreign keys
PRAGMA foreign_keys = ON;

-- Кеш размером 10MB
PRAGMA cache_size = -10000;

-- Temp store в памяти для производительности
PRAGMA temp_store = MEMORY;

-- ============================================================================
-- Комментарии к архитектуре
-- ============================================================================

/*
АРХИТЕКТУРНЫЕ РЕШЕНИЯ:

1. **JSON хранение**:
   - Используем TEXT для JSON вместо JSONB (SQLite не имеет JSONB)
   - JSON1 extension позволяет запросы через json_extract()
   - Извлеченные поля (client_name, pax_count) для быстрого поиска

2. **Optimistic locking**:
   - data_version инкрементируется при каждом UPDATE
   - data_hash позволяет детектировать изменения
   - Защита от race conditions в autosave

3. **Soft delete**:
   - deleted_at вместо DELETE для возможности восстановления
   - Views (active_*) для фильтрации удаленных записей

4. **Audit log**:
   - Хранит old_data/new_data для undo/redo
   - Опциональный diff для экономии места
   - Готовность к multi-user в будущем

5. **Performance**:
   - Индексы на часто запрашиваемые поля
   - WAL mode для concurrency
   - Кеширование метаданных (totals, counts)

6. **Миграция с файлов**:
   - Таблицы совместимы с текущей JSON структурой
   - filename сохраняется для обратной совместимости
   - Легкий rollback на file-based storage

7. **Upgrade path на PostgreSQL**:
   - Схема легко портируется (TEXT → JSONB)
   - Foreign keys уже настроены
   - Indexes соответствуют best practices
*/
