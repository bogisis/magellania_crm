-- Migration 001: Add Multi-Tenancy Support
-- Created: 2025-10-27
-- Description: Добавление organizations, users, sessions для multi-user режима

-- ============================================================================
-- НОВЫЕ ТАБЛИЦЫ ДЛЯ AUTH И MULTI-TENANCY
-- ============================================================================

-- Organizations (Tenants)
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,

    -- Subscription
    plan TEXT DEFAULT 'free',  -- free, pro, enterprise
    max_users INTEGER DEFAULT 5,
    max_estimates INTEGER DEFAULT 100,

    -- Settings
    settings TEXT,  -- JSON: брендинг, лого, и т.д.

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    -- Soft delete
    deleted_at INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_deleted ON organizations(deleted_at);

-- ============================================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    email_verified INTEGER DEFAULT 0,

    -- Auth (для будущего)
    password_hash TEXT,

    -- Profile
    name TEXT,
    avatar_url TEXT,

    -- Organization membership
    organization_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',  -- owner, admin, member, viewer

    -- Settings
    preferences TEXT,  -- JSON: язык, timezone, и т.д.

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER,

    -- Soft delete
    deleted_at INTEGER DEFAULT NULL,

    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(organization_id, role);

-- ============================================================================

-- Sessions (для будущего JWT/session auth)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,

    -- Security
    ip_address TEXT,
    user_agent TEXT,

    -- Expiration
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_activity_at INTEGER,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============================================================================

-- Collaborators (для shared estimates в будущем)
CREATE TABLE IF NOT EXISTS estimate_collaborators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estimate_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    -- Permissions
    role TEXT DEFAULT 'viewer',  -- owner, editor, viewer
    can_edit INTEGER DEFAULT 0,
    can_delete INTEGER DEFAULT 0,

    -- Временные метки
    created_at INTEGER NOT NULL,
    created_by TEXT,

    UNIQUE(estimate_id, user_id),
    FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collaborators_estimate ON estimate_collaborators(estimate_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_user ON estimate_collaborators(user_id);

-- ============================================================================
-- МОДИФИКАЦИЯ СУЩЕСТВУЮЩИХ ТАБЛИЦ
-- ============================================================================

-- Добавляем owner_id и organization_id в estimates
ALTER TABLE estimates ADD COLUMN owner_id TEXT;
ALTER TABLE estimates ADD COLUMN organization_id TEXT;

-- Индексы для multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_estimates_owner ON estimates(owner_id);
CREATE INDEX IF NOT EXISTS idx_estimates_org ON estimates(organization_id);
CREATE INDEX IF NOT EXISTS idx_estimates_org_updated ON estimates(organization_id, updated_at DESC);

-- ============================================================================

-- Добавляем owner_id и organization_id в backups
ALTER TABLE backups ADD COLUMN owner_id TEXT;
ALTER TABLE backups ADD COLUMN organization_id TEXT;

CREATE INDEX IF NOT EXISTS idx_backups_owner ON backups(owner_id);
CREATE INDEX IF NOT EXISTS idx_backups_org ON backups(organization_id);

-- ============================================================================

-- Добавляем owner_id, organization_id и visibility в catalogs
ALTER TABLE catalogs ADD COLUMN owner_id TEXT;
ALTER TABLE catalogs ADD COLUMN organization_id TEXT;
ALTER TABLE catalogs ADD COLUMN visibility TEXT DEFAULT 'private';
-- visibility: private (только владелец), team (все члены орг), organization (включая viewers)

CREATE INDEX IF NOT EXISTS idx_catalogs_owner ON catalogs(owner_id);
CREATE INDEX IF NOT EXISTS idx_catalogs_org ON catalogs(organization_id);
CREATE INDEX IF NOT EXISTS idx_catalogs_org_region ON catalogs(organization_id, region);
CREATE INDEX IF NOT EXISTS idx_catalogs_visibility ON catalogs(organization_id, visibility);

-- ============================================================================

-- Добавляем organization_id в settings (настройки теперь per-organization)
ALTER TABLE settings ADD COLUMN organization_id TEXT;

CREATE INDEX IF NOT EXISTS idx_settings_org ON settings(organization_id);

-- ============================================================================
-- BACKWARD COMPATIBILITY DATA
-- ============================================================================

-- Создаём default organization для существующих данных
INSERT OR IGNORE INTO organizations (id, name, slug, plan, max_users, max_estimates, created_at, updated_at)
VALUES (
    'org_default',
    'Default Organization',
    'default',
    'enterprise',  -- unlimited для backward compatibility
    999999,
    999999,
    strftime('%s', 'now'),
    strftime('%s', 'now')
);

-- Создаём default user
INSERT OR IGNORE INTO users (id, email, name, organization_id, role, created_at, updated_at)
VALUES (
    'user_default',
    'admin@local',
    'Default Admin',
    'org_default',
    'owner',
    strftime('%s', 'now'),
    strftime('%s', 'now')
);

-- Мигрируем существующие estimates
UPDATE estimates
SET owner_id = 'user_default', organization_id = 'org_default'
WHERE owner_id IS NULL;

-- Мигрируем существующие backups
UPDATE backups
SET owner_id = 'user_default', organization_id = 'org_default'
WHERE owner_id IS NULL;

-- Мигрируем существующие catalogs
UPDATE catalogs
SET owner_id = 'user_default', organization_id = 'org_default', visibility = 'organization'
WHERE owner_id IS NULL;

-- Мигрируем существующие settings
UPDATE settings
SET organization_id = 'org_default'
WHERE organization_id IS NULL;

-- ============================================================================
-- VIEWS ДЛЯ УПРОЩЕНИЯ ЗАПРОСОВ
-- ============================================================================

-- View для активных пользователей организации
CREATE VIEW IF NOT EXISTS active_org_users AS
SELECT u.*, o.name as organization_name, o.plan as organization_plan
FROM users u
INNER JOIN organizations o ON u.organization_id = o.id
WHERE u.deleted_at IS NULL AND o.deleted_at IS NULL;

-- View для estimates с информацией о владельце
CREATE VIEW IF NOT EXISTS estimates_with_owner AS
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

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
);

INSERT INTO schema_migrations (version, name, applied_at)
VALUES (1, 'add_multitenancy', strftime('%s', 'now'));
