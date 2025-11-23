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
    slug TEXT UNIQUE,
    settings TEXT,
    plan TEXT DEFAULT 'free',
    subscription_status TEXT DEFAULT 'active',
    subscription_expires INTEGER,
    max_users INTEGER DEFAULT 5,
    max_estimates INTEGER DEFAULT 100,
    storage_limit_mb INTEGER DEFAULT 100,
    owner_id TEXT,
    logo_url TEXT,
    website TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_deleted ON organizations(deleted_at);

-- ============================================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    google_id TEXT UNIQUE,
    oauth_provider TEXT,
    oauth_data TEXT,
    email_verified INTEGER DEFAULT 0,
    email_verification_token TEXT,
    email_verification_expires INTEGER,
    password_reset_token TEXT,
    password_reset_expires INTEGER,
    is_active INTEGER DEFAULT 1,
    is_admin INTEGER DEFAULT 0,
    organization_id TEXT NOT NULL,
    last_login_at INTEGER,
    last_login_ip TEXT,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until INTEGER,
    preferences TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

-- ============================================================================

-- Sessions (для будущего JWT/session auth)
CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);

-- ============================================================================

-- Audit log для аутентификации
CREATE TABLE IF NOT EXISTS auth_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT NOT NULL,  -- 'login', 'logout', 'register', 'password_reset', 'failed_login'
    ip_address TEXT,
    user_agent TEXT,
    success INTEGER DEFAULT 1,  -- boolean
    error_message TEXT,
    metadata TEXT,  -- JSON с дополнительными данными
    created_at INTEGER NOT NULL
);

-- Индексы для auth_logs
CREATE INDEX IF NOT EXISTS idx_auth_logs_user ON auth_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_logs_action ON auth_logs(action);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created ON auth_logs(created_at DESC);

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
INSERT OR IGNORE INTO users (id, email, password_hash, full_name, organization_id, is_admin, is_active, created_at, updated_at)
VALUES (
    'user_default',
    'admin@local',
    '!', -- Placeholder password hash, as it's NOT NULL
    'Default Admin',
    'org_default',
    1,
    1,
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
    u.full_name as owner_name,
    u.email as owner_email,
    o.name as organization_name
FROM estimates e
LEFT JOIN users u ON e.owner_id = u.id
LEFT JOIN organizations o ON e.organization_id = o.id
WHERE e.deleted_at IS NULL;
