-- Migration 005: Migrate legacy owner_id to admin user
-- Date: 2025-11-18
-- Purpose: Update existing data from user_default to admin-user-001

BEGIN TRANSACTION;

-- Migrate estimates ownership
UPDATE estimates
SET owner_id = 'admin-user-001'
WHERE owner_id = 'user_default';

-- Migrate catalogs ownership
UPDATE catalogs
SET owner_id = 'admin-user-001'
WHERE owner_id = 'user_default';

-- Migrate backups ownership
UPDATE backups
SET owner_id = 'admin-user-001'
WHERE owner_id = 'user_default';

-- Verify migration
SELECT 'Migration 005 completed:';
SELECT 'Estimates:', COUNT(*) FROM estimates WHERE owner_id = 'admin-user-001';
SELECT 'Catalogs:', COUNT(*) FROM catalogs WHERE owner_id = 'admin-user-001';
SELECT 'Backups:', COUNT(*) FROM backups WHERE owner_id = 'admin-user-001';

COMMIT;
