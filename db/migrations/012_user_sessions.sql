-- Migration 012: User Sessions Tracking
-- Date: 2025-12-13
-- Purpose: Track active JWT sessions, enable force logout, detect concurrent logins
--
-- Features:
-- - Session tracking with JWT token hash
-- - Force logout capability
-- - Concurrent login detection
-- - IP address and user agent tracking
-- - Activity timestamps for session management
--
-- Security:
-- - Stores SHA-256 hash of JWT token (not plaintext)
-- - Multi-tenancy via organization_id
-- - Foreign key constraints for data integrity

-- ============================================================================
-- 1. Create user_sessions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,   -- SHA-256 hash of JWT token
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    is_active INTEGER DEFAULT 1,       -- 0 = manually logged out, 1 = active

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- ============================================================================
-- 2. Create indexes for performance
-- ============================================================================

-- Fast token lookup for authentication middleware
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash) WHERE is_active = 1;

-- Fast lookup of user's active sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id) WHERE is_active = 1;

-- Fast cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active, expires_at);

-- Organization-scoped queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_org ON user_sessions(organization_id);

-- ============================================================================
-- 3. Create trigger for automatic session cleanup
-- ============================================================================

-- Automatically mark expired sessions as inactive
CREATE TRIGGER IF NOT EXISTS cleanup_expired_sessions
AFTER INSERT ON user_sessions
BEGIN
    UPDATE user_sessions
    SET is_active = 0
    WHERE is_active = 1
      AND expires_at < datetime('now')
      AND id != NEW.id;  -- Don't affect the newly inserted session
END;

-- ============================================================================
-- 4. Migration verification
-- ============================================================================

-- Verify table structure
SELECT
    'user_sessions table created' as status,
    COUNT(*) as column_count
FROM pragma_table_info('user_sessions');

-- Verify indexes
SELECT
    'Indexes created' as status,
    COUNT(*) as index_count
FROM sqlite_master
WHERE type = 'index'
  AND tbl_name = 'user_sessions'
  AND name LIKE 'idx_user_sessions_%';

-- Verify triggers
SELECT
    'Triggers created' as status,
    COUNT(*) as trigger_count
FROM sqlite_master
WHERE type = 'trigger'
  AND tbl_name = 'user_sessions';
