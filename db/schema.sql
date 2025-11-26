-- Quote Calculator Database Schema
-- SQLite 3.x with JSON1 extension
-- Version: 3.0.0 (after all multi-tenancy migrations)
-- Created: 2025-11-23 (generated)

PRAGMA foreign_keys=OFF;

-- ============================================================================
-- Tables
-- ============================================================================

-- Organizations (Tenants)
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    primary_color TEXT,
    email TEXT,
    phone TEXT,
    website TEXT,
    address TEXT,
    settings TEXT,
    plan TEXT DEFAULT 'free' NOT NULL,
    subscription_status TEXT DEFAULT 'active',
    trial_ends_at INTEGER,
    subscription_starts_at INTEGER,
    subscription_ends_at INTEGER,
    billing_email TEXT,
    max_users INTEGER DEFAULT 5,
    max_estimates INTEGER DEFAULT 100,
    max_catalogs INTEGER DEFAULT 10,
    storage_limit_mb INTEGER DEFAULT 100,
    api_rate_limit INTEGER DEFAULT 1000,
    current_users_count INTEGER DEFAULT 0,
    current_estimates_count INTEGER DEFAULT 0,
    current_catalogs_count INTEGER DEFAULT 0,
    current_storage_mb REAL DEFAULT 0,
    owner_id TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    suspended_at INTEGER,
    suspension_reason TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    job_title TEXT,
    organization_id TEXT NOT NULL,
    role TEXT DEFAULT 'user' NOT NULL,
    permissions TEXT,
    google_id TEXT UNIQUE,
    oauth_provider TEXT,
    oauth_data TEXT,
    email_verified INTEGER DEFAULT 0,
    email_verification_token TEXT,
    email_verification_expires INTEGER,
    password_reset_token TEXT,
    password_reset_expires INTEGER,
    last_login_at INTEGER,
    last_login_ip TEXT,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until INTEGER,
    two_factor_enabled INTEGER DEFAULT 0,
    two_factor_secret TEXT,
    is_active INTEGER DEFAULT 1,
    deactivated_at INTEGER,
    deactivation_reason TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Sessions (for JWT/session auth)
CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
);

-- Audit log for authentication specific actions
CREATE TABLE IF NOT EXISTS auth_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT NOT NULL,  -- 'login', 'logout', 'register', 'password_reset', 'failed_login'
    ip_address TEXT,
    user_agent TEXT,
    success INTEGER DEFAULT 1,  -- boolean
    error_message TEXT,
    metadata TEXT,  -- JSON with additional data
    created_at INTEGER NOT NULL
);

-- Collaborators (for shared estimates)
CREATE TABLE IF NOT EXISTS estimate_collaborators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estimate_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'viewer',  -- owner, editor, viewer
    can_edit INTEGER DEFAULT 0,
    can_delete INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    created_by TEXT,
    UNIQUE(estimate_id, user_id),
    FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Estimates
CREATE TABLE IF NOT EXISTS estimates (
    id TEXT PRIMARY KEY NOT NULL,
    filename TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    visibility TEXT DEFAULT 'private' NOT NULL,
    shared_with TEXT,
    data TEXT NOT NULL,
    version TEXT DEFAULT '1.1.0',
    app_version TEXT DEFAULT '2.3.0',
    data_version INTEGER DEFAULT 1 NOT NULL,
    data_hash TEXT,
    client_name TEXT,
    client_email TEXT,
    client_phone TEXT,
    pax_count INTEGER DEFAULT 0,
    tour_start TEXT,
    tour_end TEXT,
    total_cost REAL DEFAULT 0,
    total_profit REAL DEFAULT 0,
    services_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_accessed_at INTEGER,
    deleted_at INTEGER DEFAULT NULL,
    is_template BOOLEAN DEFAULT 0,
    template_name TEXT,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Backups
CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    data TEXT NOT NULL,
    data_version INTEGER NOT NULL,
    data_hash TEXT NOT NULL,
    backup_type TEXT DEFAULT 'auto',
    trigger_event TEXT,
    organization_id TEXT NOT NULL,
    created_by TEXT,
    expires_at INTEGER,
    is_permanent BOOLEAN DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- Catalogs
CREATE TABLE IF NOT EXISTS catalogs (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    visibility TEXT DEFAULT 'private' NOT NULL,
    shared_with_orgs TEXT,
    data TEXT NOT NULL,
    version TEXT DEFAULT '1.2.0',
    app_version TEXT DEFAULT '2.3.0',
    data_version INTEGER DEFAULT 1 NOT NULL,
    data_hash TEXT,
    region TEXT,
    templates_count INTEGER DEFAULT 0,
    categories_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_accessed_at INTEGER,
    deleted_at INTEGER DEFAULT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(organization_id, slug)
);

-- Settings (scope-based key-value store)
CREATE TABLE IF NOT EXISTS settings (
    scope TEXT NOT NULL CHECK (scope IN ('app', 'organization', 'user')),
    scope_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'object', 'array')),
    description TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (scope, scope_id, key)
);

-- Audit Logs (general entity changes)
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    changes TEXT,
    snapshot_before TEXT,
    snapshot_after TEXT,
    user_id TEXT NOT NULL,
    user_ip TEXT,
    user_agent TEXT,
    organization_id TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL
);

-- Schema Migrations Tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    execution_time_ms INTEGER,
    checksum TEXT
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Estimates indexes
CREATE INDEX IF NOT EXISTS idx_estimates_org_updated ON estimates(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_owner ON estimates(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_visibility ON estimates(organization_id, visibility);
CREATE INDEX IF NOT EXISTS idx_estimates_client ON estimates(organization_id, client_name);
CREATE INDEX IF NOT EXISTS idx_estimates_tour_dates ON estimates(organization_id, tour_start, tour_end);
CREATE INDEX IF NOT EXISTS idx_estimates_accessed ON estimates(last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_templates ON estimates(organization_id, is_template);
CREATE INDEX IF NOT EXISTS idx_estimates_filename ON estimates(filename);

-- Catalogs indexes
CREATE INDEX IF NOT EXISTS idx_catalogs_org ON catalogs(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalogs_visibility ON catalogs(visibility, organization_id);
CREATE INDEX IF NOT EXISTS idx_catalogs_region ON catalogs(organization_id, region);
CREATE INDEX IF NOT EXISTS idx_catalogs_slug ON catalogs(slug);
CREATE INDEX IF NOT EXISTS idx_catalogs_accessed ON catalogs(last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalogs_name ON catalogs(name);

-- Organizations indexes
CREATE INDEX IF NOT EXISTS idx_orgs_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_orgs_active ON organizations(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orgs_plan ON organizations(plan, subscription_status);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id, role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active, organization_id);

-- Settings indexes
CREATE INDEX IF NOT EXISTS idx_settings_scope ON settings(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_settings_updated ON settings(updated_at);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- Backups indexes
CREATE INDEX IF NOT EXISTS idx_backups_entity ON backups(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_org ON backups(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_expires ON backups(expires_at);

-- Audit logs indexes (for `audit_logs` table)
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, entity_type);

-- Auth logs indexes (for `auth_logs` table)
CREATE INDEX IF NOT EXISTS idx_auth_logs_user ON auth_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_logs_action ON auth_logs(action);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created ON auth_logs(created_at DESC);

-- Sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);

-- Collaborators indexes
CREATE INDEX IF NOT EXISTS idx_collaborators_estimate ON estimate_collaborators(estimate_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_user ON estimate_collaborators(user_id);

-- ============================================================================
-- Views
-- ============================================================================

-- View for active (non-deleted) estimates
CREATE VIEW IF NOT EXISTS active_estimates AS
SELECT * FROM estimates WHERE deleted_at IS NULL;

-- View for active catalogs
CREATE VIEW IF NOT EXISTS active_catalogs AS
SELECT * FROM catalogs WHERE deleted_at IS NULL;

-- View for latest backups of each entity
CREATE VIEW IF NOT EXISTS latest_backups AS
SELECT b1.*
FROM backups b1
INNER JOIN (
    SELECT entity_type, entity_id, MAX(created_at) as max_created
    FROM backups
    GROUP BY entity_type, entity_id
) b2 ON b1.entity_type = b2.entity_type AND b1.entity_id = b2.entity_id AND b1.created_at = b2.max_created;

-- View for active users of an organization
CREATE VIEW IF NOT EXISTS active_org_users AS
SELECT u.*, o.name as organization_name, o.plan as organization_plan
FROM users u
INNER JOIN organizations o ON u.organization_id = o.id
WHERE u.deleted_at IS NULL AND u.is_active = 1 AND o.deleted_at IS NULL AND o.is_active = 1;

-- View for estimates with owner and organization information
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

-- View for active users
CREATE VIEW IF NOT EXISTS active_users AS
SELECT * FROM users WHERE deleted_at IS NULL AND is_active = 1;

-- View for active organizations
CREATE VIEW IF NOT EXISTS active_organizations AS
SELECT * FROM organizations WHERE deleted_at IS NULL AND is_active = 1;

-- ============================================================================
-- Triggers for automatic updated_at timestamps
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS trigger_estimates_updated_at
AFTER UPDATE ON estimates
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE estimates SET updated_at = unixepoch() WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trigger_catalogs_updated_at
AFTER UPDATE ON catalogs
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE catalogs SET updated_at = unixepoch() WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trigger_organizations_updated_at
AFTER UPDATE ON organizations
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE organizations SET updated_at = unixepoch() WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trigger_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE users SET updated_at = unixepoch() WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trigger_settings_updated_at
AFTER UPDATE ON settings
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE settings SET updated_at = unixepoch()
    WHERE scope = NEW.scope AND scope_id = NEW.scope_id AND key = NEW.key;
END;

-- ============================================================================
-- Initial Data for Default Organization, Admin User, and Settings (from Migration 007)
-- This section assumes a fresh database creation. For a migration run, this data
-- would typically be inserted by the migration scripts themselves.
-- ============================================================================

INSERT OR IGNORE INTO organizations (
    id, name, slug, plan, owner_id, max_users, max_estimates, max_catalogs,
    storage_limit_mb, api_rate_limit, current_users_count, current_estimates_count,
    current_catalogs_count, current_storage_mb, is_active, created_at, updated_at
) VALUES (
    'default-org', 'Default Organization', 'default', 'pro', 'admin-user-id',
    100, 1000, 50, 5000, 10000, 0, 0, 0, 0, 1, unixepoch(), unixepoch()
);

INSERT OR IGNORE INTO users (
    id, email, username, password_hash, full_name, role, organization_id,
    is_active, email_verified, created_at, updated_at
) VALUES (
    'admin-user-id', 'admin@localhost', 'admin',
    '$2b$10$amUBhN8kJvF84MZ.e4hwo.Ji5/anVfj0u8xqVJuSuNhdiOZ6EMKfe', -- Hash for 'admin123'
    'Administrator', 'admin', 'default-org', 1, 1, unixepoch(), unixepoch()
);

-- App-level settings
INSERT OR IGNORE INTO settings (scope, scope_id, key, value, value_type, created_at, updated_at)
VALUES
    ('app', 'global', 'storage_type', '"sqlite"', 'string', unixepoch(), unixepoch()),
    ('app', 'global', 'db_version', '"1.0.0"', 'string', unixepoch(), unixepoch()),
    ('app', 'global', 'maintenance_mode', 'false', 'boolean', unixepoch(), unixepoch());

-- Organization-level settings (default values)
INSERT OR IGNORE INTO settings (scope, scope_id, key, value, value_type, created_at, updated_at)
VALUES
    ('organization', 'default-org', 'currency', '"$"', 'string', unixepoch(), unixepoch()),
    ('organization', 'default-org', 'default_tax_rate', '0', 'number', unixepoch(), unixepoch()),
    ('organization', 'default-org', 'default_hidden_markup', '10', 'number', unixepoch(), unixepoch()),
    ('organization', 'default-org', 'booking_terms', '""', 'string', unixepoch(), unixepoch());

-- User-level settings (for admin)
INSERT OR IGNORE INTO settings (scope, scope_id, key, value, value_type, created_at, updated_at)
VALUES
    ('user', 'admin-user-id', 'theme', '"light"', 'string', unixepoch(), unixepoch()),
    ('user', 'admin-user-id', 'language', '"ru"', 'string', unixepoch(), unixepoch()),
    ('user', 'admin-user-id', 'default_pax_count', '27', 'number', unixepoch(), unixepoch()),
    ('user', 'admin-user-id', 'autosave_interval_sec', '8', 'number', unixepoch(), unixepoch());

-- Audit log for migration 007
INSERT OR IGNORE INTO audit_logs (entity_type, entity_id, action, user_id, organization_id, metadata, created_at)
VALUES (
    'system', 'migration-007', 'migration', 'admin-user-id', 'default-org',
    '{"migration": "007", "description": "Migrated existing data to multi-tenant structure", "estimates_migrated": 0, "catalogs_migrated": 0}',
    unixepoch()
);

-- ============================================================================
-- PRAGMA optimizations
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA wal_autocheckpoint = 1000;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -10000;
PRAGMA temp_store = MEMORY;