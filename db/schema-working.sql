PRAGMA foreign_keys=OFF;
CREATE TABLE backups (
CREATE TABLE catalogs (
CREATE TABLE audit_logs (
CREATE TABLE organizations (
CREATE TABLE users (
CREATE TABLE sessions (
CREATE TABLE estimate_collaborators (
CREATE TABLE schema_migrations (
CREATE TABLE IF NOT EXISTS "estimates" (
CREATE TABLE IF NOT EXISTS "settings" (
CREATE INDEX idx_backups_estimate_id ON backups(estimate_id);
CREATE INDEX idx_backups_created_at ON backups(created_at DESC);
CREATE INDEX idx_catalogs_name ON catalogs(name);
CREATE INDEX idx_catalogs_region ON catalogs(region);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_deleted ON organizations(deleted_at);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_role ON users(organization_id, role);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_collaborators_estimate ON estimate_collaborators(estimate_id);
CREATE INDEX idx_collaborators_user ON estimate_collaborators(user_id);
CREATE INDEX idx_backups_owner ON backups(owner_id);
CREATE INDEX idx_backups_org ON backups(organization_id);
CREATE INDEX idx_catalogs_owner ON catalogs(owner_id);
CREATE INDEX idx_catalogs_org ON catalogs(organization_id);
CREATE INDEX idx_catalogs_org_region ON catalogs(organization_id, region);
CREATE INDEX idx_catalogs_visibility ON catalogs(organization_id, visibility);
CREATE INDEX idx_estimates_filename ON estimates(filename);
CREATE INDEX idx_estimates_client_name ON estimates(client_name);
CREATE INDEX idx_estimates_tour_start ON estimates(tour_start);
CREATE INDEX idx_estimates_updated_at ON estimates(updated_at DESC);
CREATE INDEX idx_estimates_deleted_at ON estimates(deleted_at);
CREATE INDEX idx_estimates_owner ON estimates(owner_id);
CREATE INDEX idx_estimates_org ON estimates(organization_id);
CREATE INDEX idx_estimates_org_updated ON estimates(organization_id, updated_at DESC);
CREATE INDEX idx_settings_org ON settings(organization_id);
