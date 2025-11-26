-- Migration 006: Add Multi-Tenancy Fields
-- Description: Добавляет поля для multi-tenancy в существующие таблицы
-- Created: 2025-11-19
-- Version: 3.0.0

-- =================================================================
-- ESTIMATES TABLE: Add multi-tenancy and visibility fields
-- =================================================================

ALTER TABLE estimates ADD COLUMN organization_id TEXT;
ALTER TABLE estimates ADD COLUMN owner_id TEXT;
ALTER TABLE estimates ADD COLUMN visibility TEXT DEFAULT 'private';
ALTER TABLE estimates ADD COLUMN shared_with TEXT;

-- Add new fields for enhanced functionality
ALTER TABLE estimates ADD COLUMN last_accessed_at INTEGER;
ALTER TABLE estimates ADD COLUMN is_template BOOLEAN DEFAULT 0;
ALTER TABLE estimates ADD COLUMN template_name TEXT;

-- =================================================================
-- CATALOGS TABLE: Add multi-tenancy fields (if not exists)
-- =================================================================

-- Check if catalogs table exists, if not create basic structure
CREATE TABLE IF NOT EXISTS catalogs (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    version TEXT DEFAULT '1.2.0',
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Add multi-tenancy fields to catalogs
ALTER TABLE catalogs ADD COLUMN organization_id TEXT;
ALTER TABLE catalogs ADD COLUMN owner_id TEXT;
ALTER TABLE catalogs ADD COLUMN visibility TEXT DEFAULT 'private';
ALTER TABLE catalogs ADD COLUMN shared_with_orgs TEXT;
ALTER TABLE catalogs ADD COLUMN slug TEXT;
ALTER TABLE catalogs ADD COLUMN region TEXT;
ALTER TABLE catalogs ADD COLUMN templates_count INTEGER DEFAULT 0;
ALTER TABLE catalogs ADD COLUMN categories_count INTEGER DEFAULT 0;
ALTER TABLE catalogs ADD COLUMN data_version INTEGER DEFAULT 1;
ALTER TABLE catalogs ADD COLUMN data_hash TEXT;
ALTER TABLE catalogs ADD COLUMN last_accessed_at INTEGER;
ALTER TABLE catalogs ADD COLUMN deleted_at INTEGER DEFAULT NULL;

-- =================================================================
-- CREATE ORGANIZATIONS TABLE
-- =================================================================

CREATE TABLE IF NOT EXISTS organizations (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,

    -- Naming
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,

    -- Branding
    logo_url TEXT,
    primary_color TEXT,

    -- Contact
    email TEXT,
    phone TEXT,
    website TEXT,
    address TEXT,

    -- Settings
    settings TEXT,

    -- Subscription & Billing
    plan TEXT DEFAULT 'free' NOT NULL,
    subscription_status TEXT DEFAULT 'active',
    trial_ends_at INTEGER,
    subscription_starts_at INTEGER,
    subscription_ends_at INTEGER,
    billing_email TEXT,

    -- Limits
    max_users INTEGER DEFAULT 5,
    max_estimates INTEGER DEFAULT 100,
    max_catalogs INTEGER DEFAULT 10,
    storage_limit_mb INTEGER DEFAULT 100,
    api_rate_limit INTEGER DEFAULT 1000,

    -- Current Usage
    current_users_count INTEGER DEFAULT 0,
    current_estimates_count INTEGER DEFAULT 0,
    current_catalogs_count INTEGER DEFAULT 0,
    current_storage_mb REAL DEFAULT 0,

    -- Owner
    owner_id TEXT NOT NULL,

    -- Status
    is_active INTEGER DEFAULT 1,
    suspended_at INTEGER,
    suspension_reason TEXT,

    -- Timestamps
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL
);

-- =================================================================
-- CREATE USERS TABLE
-- =================================================================

CREATE TABLE IF NOT EXISTS users (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,

    -- Authentication
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,

    -- Profile
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    job_title TEXT,

    -- Multi-Tenancy & Role
    organization_id TEXT NOT NULL,
    role TEXT DEFAULT 'user' NOT NULL,
    permissions TEXT,

    -- OAuth
    google_id TEXT UNIQUE,
    oauth_provider TEXT,
    oauth_data TEXT,

    -- Email Verification
    email_verified INTEGER DEFAULT 0,
    email_verification_token TEXT,
    email_verification_expires INTEGER,

    -- Password Reset
    password_reset_token TEXT,
    password_reset_expires INTEGER,

    -- Security
    last_login_at INTEGER,
    last_login_ip TEXT,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until INTEGER,
    two_factor_enabled INTEGER DEFAULT 0,
    two_factor_secret TEXT,

    -- Status
    is_active INTEGER DEFAULT 1,
    deactivated_at INTEGER,
    deactivation_reason TEXT,

    -- Timestamps
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL
);

-- =================================================================
-- CREATE SETTINGS TABLE
-- =================================================================

CREATE TABLE IF NOT EXISTS settings (
    -- Composite Primary Key
    scope TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    key TEXT NOT NULL,

    -- Value
    value TEXT NOT NULL,
    value_type TEXT DEFAULT 'string',

    -- Metadata
    description TEXT,
    is_public BOOLEAN DEFAULT 0,
    is_encrypted BOOLEAN DEFAULT 0,

    -- Timestamps
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    PRIMARY KEY (scope, scope_id, key)
);

-- =================================================================
-- CREATE BACKUPS TABLE
-- =================================================================

CREATE TABLE IF NOT EXISTS backups (
    -- Primary Key
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Target Reference
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,

    -- Backup Data
    data TEXT NOT NULL,
    data_version INTEGER NOT NULL,
    data_hash TEXT NOT NULL,

    -- Metadata
    backup_type TEXT DEFAULT 'auto',
    trigger_event TEXT,

    -- Multi-Tenancy
    organization_id TEXT NOT NULL,
    created_by TEXT,

    -- Retention
    expires_at INTEGER,
    is_permanent BOOLEAN DEFAULT 0,

    -- Timestamp
    created_at INTEGER NOT NULL
);

-- =================================================================
-- CREATE AUDIT_LOGS TABLE
-- =================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    -- Primary Key
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Target Entity
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,

    -- Action
    action TEXT NOT NULL,

    -- Changes
    changes TEXT,
    snapshot_before TEXT,
    snapshot_after TEXT,

    -- Actor
    user_id TEXT NOT NULL,
    user_ip TEXT,
    user_agent TEXT,

    -- Multi-Tenancy
    organization_id TEXT NOT NULL,

    -- Metadata
    metadata TEXT,

    -- Timestamp
    created_at INTEGER NOT NULL
);

-- =================================================================
-- CREATE INDEXES (initial set)
-- =================================================================

-- Estimates indexes
CREATE INDEX IF NOT EXISTS idx_estimates_org_updated ON estimates(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_accessed ON estimates(last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_templates ON estimates(organization_id, is_template);

-- Catalogs indexes
CREATE INDEX IF NOT EXISTS idx_catalogs_org ON catalogs(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalogs_slug ON catalogs(slug);

-- Organizations indexes
CREATE INDEX IF NOT EXISTS idx_orgs_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_orgs_active ON organizations(is_active, created_at DESC);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id, role);

-- Settings indexes
CREATE INDEX IF NOT EXISTS idx_settings_scope ON settings(scope, scope_id);

-- Backups indexes
CREATE INDEX IF NOT EXISTS idx_backups_entity ON backups(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_org ON backups(organization_id, created_at DESC);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(organization_id, created_at DESC);
