-- Migration 013: Permissions and RBAC System
-- Date: 2025-12-13
-- Purpose: Fine-grained role-based access control with organization-scoped permissions
--
-- Features:
-- - Permission definitions with resource-action pattern
-- - Role-to-permission mapping
-- - Organization-scoped permissions
-- - Default permissions for superadmin and admin roles
--
-- Permission naming convention:
-- - Format: resource.action (e.g., "users.create", "estimates.delete")
-- - Resources: users, organizations, estimates, catalogs, settings, audit_log
-- - Actions: create, read, update, delete, list, manage
--
-- Roles hierarchy:
-- - superadmin: Full access across all organizations
-- - admin: Full access within their organization only
-- - (future) user: Limited access (read estimates, create quotes)

-- ============================================================================
-- 1. Create permissions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,            -- e.g., "users.create"
    description TEXT,
    resource TEXT NOT NULL,                -- e.g., "users", "estimates"
    action TEXT NOT NULL,                  -- e.g., "create", "read", "delete"
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. Create role_permissions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,                    -- "superadmin" or "admin"
    permission_id TEXT NOT NULL,
    organization_id TEXT,                  -- NULL = global (superadmin), NOT NULL = org-specific (admin)
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    granted_by TEXT,                       -- user_id who granted this permission

    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL,

    -- Ensure no duplicate role-permission combinations per organization
    UNIQUE(role, permission_id, organization_id)
);

-- ============================================================================
-- 3. Create indexes for performance
-- ============================================================================

-- Fast permission lookup by name
CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(name);

-- Fast permission lookup by resource
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource);

-- Fast role permission lookup
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_org ON role_permissions(organization_id);

-- Combined index for RBAC checks: role + organization
CREATE INDEX IF NOT EXISTS idx_role_permissions_check ON role_permissions(role, organization_id);

-- ============================================================================
-- 4. Insert default permissions
-- ============================================================================

-- User Management Permissions
INSERT OR IGNORE INTO permissions (id, name, description, resource, action) VALUES
('perm_users_create', 'users.create', 'Create new users', 'users', 'create'),
('perm_users_read', 'users.read', 'View user details', 'users', 'read'),
('perm_users_update', 'users.update', 'Update user information', 'users', 'update'),
('perm_users_delete', 'users.delete', 'Delete users', 'users', 'delete'),
('perm_users_list', 'users.list', 'List all users', 'users', 'list'),
('perm_users_reset_password', 'users.reset_password', 'Reset user passwords', 'users', 'reset_password'),
('perm_users_manage_sessions', 'users.manage_sessions', 'Manage user sessions', 'users', 'manage_sessions');

-- Organization Management Permissions
INSERT OR IGNORE INTO permissions (id, name, description, resource, action) VALUES
('perm_orgs_create', 'organizations.create', 'Create new organizations', 'organizations', 'create'),
('perm_orgs_read', 'organizations.read', 'View organization details', 'organizations', 'read'),
('perm_orgs_update', 'organizations.update', 'Update organization settings', 'organizations', 'update'),
('perm_orgs_delete', 'organizations.delete', 'Delete organizations', 'organizations', 'delete'),
('perm_orgs_list', 'organizations.list', 'List all organizations', 'organizations', 'list');

-- Estimate Management Permissions
INSERT OR IGNORE INTO permissions (id, name, description, resource, action) VALUES
('perm_estimates_create', 'estimates.create', 'Create new estimates', 'estimates', 'create'),
('perm_estimates_read', 'estimates.read', 'View estimate details', 'estimates', 'read'),
('perm_estimates_update', 'estimates.update', 'Update estimates', 'estimates', 'update'),
('perm_estimates_delete', 'estimates.delete', 'Delete estimates', 'estimates', 'delete'),
('perm_estimates_list', 'estimates.list', 'List all estimates', 'estimates', 'list');

-- Catalog Management Permissions
INSERT OR IGNORE INTO permissions (id, name, description, resource, action) VALUES
('perm_catalogs_create', 'catalogs.create', 'Create new catalogs', 'catalogs', 'create'),
('perm_catalogs_read', 'catalogs.read', 'View catalog details', 'catalogs', 'read'),
('perm_catalogs_update', 'catalogs.update', 'Update catalogs', 'catalogs', 'update'),
('perm_catalogs_delete', 'catalogs.delete', 'Delete catalogs', 'catalogs', 'delete'),
('perm_catalogs_list', 'catalogs.list', 'List all catalogs', 'catalogs', 'list');

-- Settings Management Permissions
INSERT OR IGNORE INTO permissions (id, name, description, resource, action) VALUES
('perm_settings_read', 'settings.read', 'View settings', 'settings', 'read'),
('perm_settings_update', 'settings.update', 'Update settings', 'settings', 'update');

-- Audit Log Permissions
INSERT OR IGNORE INTO permissions (id, name, description, resource, action) VALUES
('perm_audit_read', 'audit_log.read', 'View audit logs', 'audit_log', 'read'),
('perm_audit_list', 'audit_log.list', 'List audit log entries', 'audit_log', 'list');

-- ============================================================================
-- 5. Grant permissions to superadmin role (global, all organizations)
-- ============================================================================

-- Superadmin gets ALL permissions globally (organization_id = NULL)
INSERT OR IGNORE INTO role_permissions (id, role, permission_id, organization_id, granted_by)
SELECT
    'rperm_superadmin_' || substr(id, 6) as id,
    'superadmin' as role,
    id as permission_id,
    NULL as organization_id,  -- Global permissions
    'system' as granted_by
FROM permissions;

-- ============================================================================
-- 6. Grant permissions to admin role for magellania-org
-- ============================================================================

-- Admin gets all permissions EXCEPT organization management (within their org only)
INSERT OR IGNORE INTO role_permissions (id, role, permission_id, organization_id, granted_by)
SELECT
    'rperm_admin_magellania_' || substr(id, 6) as id,
    'admin' as role,
    id as permission_id,
    'magellania-org' as organization_id,  -- Scoped to magellania-org
    'system' as granted_by
FROM permissions
WHERE resource != 'organizations'  -- Admins cannot manage organizations
   OR (resource = 'organizations' AND action IN ('read', 'update'));  -- But can read/update their own org

-- ============================================================================
-- 7. Create trigger for updated_at timestamp
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS update_permissions_timestamp
AFTER UPDATE ON permissions
BEGIN
    UPDATE permissions
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- ============================================================================
-- 8. Migration verification
-- ============================================================================

-- Verify permissions table
SELECT
    'permissions table created' as status,
    COUNT(*) as permission_count
FROM permissions;

-- Verify role_permissions table
SELECT
    'role_permissions created' as status,
    COUNT(*) as mapping_count
FROM role_permissions;

-- Verify superadmin has global permissions
SELECT
    'superadmin global permissions' as status,
    COUNT(*) as count
FROM role_permissions
WHERE role = 'superadmin'
  AND organization_id IS NULL;

-- Verify admin has org-scoped permissions
SELECT
    'admin org permissions' as status,
    COUNT(*) as count
FROM role_permissions
WHERE role = 'admin'
  AND organization_id = 'magellania-org';
