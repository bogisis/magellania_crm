-- Migration 004: Add users and authentication tables
-- Created: 2025-01-17
-- Description: Adds user authentication system with organizations
-- NOTE: Table creation is now handled in migration 001. This migration now only adds data, triggers, and views.

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
    'org_default',
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
    'org_default',
    strftime('%s', 'now'),
    strftime('%s', 'now')
);

-- Обновляем owner_id для default organization
UPDATE organizations
SET owner_id = 'admin-user-001'
WHERE id = 'org_default' AND owner_id IS NULL;

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
