-- Migration 004: Add users and authentication tables
-- Created: 2025-01-17
-- Description: Adds user authentication system with organizations

-- ============================================================================
-- Users table
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    -- Идентификаторы
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,

    -- Аутентификация
    password_hash TEXT NOT NULL,
    password_salt TEXT,

    -- Профиль
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,

    -- OAuth providers (для будущего Google OAuth)
    google_id TEXT UNIQUE,
    oauth_provider TEXT,  -- 'google', 'local'
    oauth_data TEXT,  -- JSON с дополнительными данными

    -- Email верификация
    email_verified INTEGER DEFAULT 0,  -- boolean
    email_verification_token TEXT,
    email_verification_expires INTEGER,

    -- Password reset
    password_reset_token TEXT,
    password_reset_expires INTEGER,

    -- Статус
    is_active INTEGER DEFAULT 1,  -- boolean
    is_admin INTEGER DEFAULT 0,   -- boolean

    -- Принадлежность к организации
    organization_id TEXT NOT NULL,

    -- Метаданные
    last_login_at INTEGER,
    last_login_ip TEXT,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until INTEGER,  -- Account lockout timestamp

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    -- Soft delete
    deleted_at INTEGER DEFAULT NULL
);

-- Индексы для users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email_verification ON users(email_verification_token);
CREATE INDEX IF NOT EXISTS idx_users_password_reset ON users(password_reset_token);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active, deleted_at);

-- ============================================================================
-- Organizations table (для multi-tenancy)
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
    -- Идентификаторы
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,  -- URL-friendly название

    -- Настройки
    settings TEXT,  -- JSON с настройками организации

    -- Subscription info (для будущего billing)
    plan TEXT DEFAULT 'free',  -- 'free', 'pro', 'enterprise'
    subscription_status TEXT DEFAULT 'active',
    subscription_expires INTEGER,

    -- Лимиты
    max_users INTEGER DEFAULT 5,
    max_estimates INTEGER DEFAULT 100,
    storage_limit_mb INTEGER DEFAULT 100,

    -- Owner
    owner_id TEXT,

    -- Метаданные
    logo_url TEXT,
    website TEXT,

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    -- Soft delete
    deleted_at INTEGER DEFAULT NULL
);

-- Индексы для organizations
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);

-- ============================================================================
-- Sessions table (для express-session с SQLite backend)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,  -- JSON session data
    expired INTEGER NOT NULL
);

-- Индекс для очистки expired sessions
CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);

-- ============================================================================
-- Audit log для аутентификации
-- ============================================================================

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
-- Обновление существующих таблиц
-- ============================================================================

-- Обновляем settings table для правильной работы с organization_id
-- (migration 003 уже создала composite primary key)

-- Добавляем дефолтную организацию если её нет
INSERT OR IGNORE INTO organizations (
    id,
    name,
    slug,
    plan,
    created_at,
    updated_at
) VALUES (
    'default-org',
    'Default Organization',
    'default',
    'free',
    strftime('%s', 'now'),
    strftime('%s', 'now')
);

-- ============================================================================
-- Triggers для автоматического обновления updated_at
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE users SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_organizations_timestamp
AFTER UPDATE ON organizations
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE organizations SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

-- ============================================================================
-- Initial data
-- ============================================================================

-- Создаём дефолтного admin пользователя (password: admin123)
-- ВАЖНО: Пароль НУЖНО СМЕНИТЬ после первого входа!
-- Hash: bcrypt с 10 rounds для 'admin123'
INSERT OR IGNORE INTO users (
    id,
    email,
    username,
    password_hash,
    full_name,
    oauth_provider,
    is_active,
    is_admin,
    email_verified,
    organization_id,
    created_at,
    updated_at
) VALUES (
    'admin-user-001',
    'admin@localhost',
    'admin',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',  -- admin123
    'Administrator',
    'local',
    1,
    1,
    1,
    'default-org',
    strftime('%s', 'now'),
    strftime('%s', 'now')
);

-- Обновляем owner_id для default organization
UPDATE organizations
SET owner_id = 'admin-user-001'
WHERE id = 'default-org' AND owner_id IS NULL;

-- ============================================================================
-- Views
-- ============================================================================

-- View для активных пользователей
CREATE VIEW IF NOT EXISTS active_users AS
SELECT * FROM users WHERE deleted_at IS NULL AND is_active = 1;

-- View для активных организаций
CREATE VIEW IF NOT EXISTS active_organizations AS
SELECT * FROM organizations WHERE deleted_at IS NULL;

-- ============================================================================
-- Comments
-- ============================================================================

/*
БЕЗОПАСНОСТЬ:

1. **Password hashing**:
   - Используем bcryptjs с минимум 10 rounds
   - Никогда не храним пароли в plain text
   - Salt генерируется автоматически bcrypt

2. **Account lockout**:
   - После 5 неудачных попыток - блокировка на 15 минут
   - locked_until timestamp для контроля
   - failed_login_attempts счётчик

3. **Email verification**:
   - Опциональная верификация email
   - Токен с expiration timestamp
   - Готовность к email-based registration

4. **Password reset**:
   - Secure токен с коротким временем жизни (1 час)
   - One-time use tokens
   - Invalidate при смене пароля

5. **Session management**:
   - SQLite-backed sessions для production
   - Secure cookie settings (httpOnly, secure, sameSite)
   - Automatic session cleanup

6. **OAuth ready**:
   - google_id для будущей интеграции
   - oauth_provider поле
   - oauth_data для дополнительной информации

MULTI-TENANCY:

1. **Organization isolation**:
   - Каждый пользователь принадлежит организации
   - Данные фильтруются по organization_id
   - Row-level security через WHERE clauses

2. **Subscription tiers**:
   - free, pro, enterprise планы
   - Лимиты на пользователей, сметы, storage
   - Готовность к billing интеграции

3. **Default organization**:
   - 'default-org' для legacy data
   - Автоматическая миграция существующих данных
   - Обратная совместимость
*/
