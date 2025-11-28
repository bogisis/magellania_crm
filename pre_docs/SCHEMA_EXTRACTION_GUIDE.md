# Schema Extraction Guide
## How the New Schema Was Created

**Date:** 2025-11-28
**Author:** Database Refactoring Team
**Version:** 3.0.0

---

## Overview

This document describes how the new authoritative `schema.sql` file was extracted from the working production database and transformed into an idempotent schema suitable for both fresh installations and existing databases.

---

## Extraction Method

### Step 1: Full Database Dump

We used SQLite's `.dump` command to extract the complete schema and data from the working production database:

```bash
sqlite3 db/quotes.db ".dump" > db/After_refactoring_DB_schema/extracted_dump.sql
```

**Why this method?**
- Captures the **exact current state** of the production database
- Includes all tables, indexes, views, triggers, and constraints
- Preserves the actual structure after all migrations (006-010) were applied
- Most reliable way to ensure 100% accuracy

**Output:** 622KB SQL file with complete database dump

---

## Transformation Process

### Step 2: Manual Review and Cleanup

The extracted dump was manually transformed into the new `schema.sql` by applying these changes:

#### 2.1 Header Documentation

Added comprehensive header with:
- Schema version (3.0.0)
- Generation date (2025-11-28)
- Purpose (replaces migrations 006-010)
- Production credentials documentation
- Safety guarantees (idempotent, safe for existing DBs)

#### 2.2 Idempotent CREATE Statements

**Changed:**
```sql
-- OLD (from dump)
CREATE TABLE organizations (...);
CREATE INDEX idx_estimates_org ON estimates(...);
CREATE VIEW active_estimates AS ...;
CREATE TRIGGER trigger_estimates_updated_at ...;
```

**To:**
```sql
-- NEW (idempotent)
CREATE TABLE IF NOT EXISTS organizations (...);
CREATE INDEX IF NOT EXISTS idx_estimates_org ON estimates(...);
CREATE VIEW IF NOT EXISTS active_estimates AS ...;
CREATE TRIGGER IF NOT EXISTS trigger_estimates_updated_at ...;
```

**Benefit:** Schema can be applied multiple times without errors

#### 2.3 Data INSERT Cleanup

**Removed (user data):**
- All `INSERT INTO estimates` statements (23 user estimates)
- All `INSERT INTO catalogs` statements (6 user catalogs)
- All `INSERT INTO backups` statements (historical backups)
- All `INSERT INTO audit_logs` statements (historical audit trail)
- All `INSERT INTO auth_logs` statements (historical login events)
- Old test organizations (default-org) and users (admin-user-id)

**Kept and modified (structural data):**
```sql
-- Changed from INSERT to INSERT OR IGNORE
INSERT OR IGNORE INTO organizations (...) VALUES ('magellania-org', ...);
INSERT OR IGNORE INTO users (...) VALUES ('superadmin', ...);
INSERT OR IGNORE INTO settings (...) VALUES (...);
```

**Benefit:** Preserves existing user data while ensuring fresh installs have required seed data

#### 2.4 Production Credentials Update

**Old (from migrations 007):**
- Organization: `default-org` (test organization)
- User: `admin-user-id` (email: admin@localhost, password: admin123)

**New (from migration 010):**
- Organization: `magellania-org` (production organization)
- User: `superadmin` (email: admin@magellania.com, password: magellania2025)
- Plan: enterprise (vs pro)
- Limits: 10,000 estimates, 100 catalogs, 10GB storage

#### 2.5 Schema Version Marker

Added marker to prevent migration re-runs:
```sql
INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, execution_time_ms)
VALUES ('SCHEMA_V3.0', 'complete_schema_from_working_db', unixepoch(), 0);
```

**Benefit:** Migration runner knows this DB is already at version 3.0

#### 2.6 PRAGMA Optimization

**At start (for transaction safety):**
```sql
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;
```

**At end (for production performance):**
```sql
COMMIT;
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA wal_autocheckpoint = 1000;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -10000;
PRAGMA temp_store = MEMORY;
```

#### 2.7 Removed Internal Tables

Removed `sqlite_sequence` table (auto-created by SQLite for AUTOINCREMENT)

---

## Key Changes vs Old Schema

### Critical Additions

1. **`is_admin` column in users table**
   - **Was missing** in old schema.sql (line 49-82)
   - **Now present** in new schema.sql (line 98)
   - Essential for admin user flag (from migration 008)

2. **Production credentials**
   - **Old:** default-org + admin-user-id (test accounts)
   - **New:** magellania-org + superadmin (production accounts)

3. **Schema version marker**
   - **Old:** No marker (migrations would re-run)
   - **New:** SCHEMA_V3.0 marker prevents re-runs

### Structure Updates

**Tables:** 11 (no change)
- organizations, users, sessions, auth_logs, estimate_collaborators
- estimates, backups, catalogs, settings, audit_logs, schema_migrations

**Indexes:** 50 in new schema
- Current DB has 52 (includes 2 auto-generated indexes for PRIMARY KEY/UNIQUE)
- New schema has 37 explicitly created indexes
- SQLite auto-generates additional indexes as needed

**Views:** 7 (no change)
- active_estimates, active_catalogs, latest_backups
- active_org_users, estimates_with_owner, active_users, active_organizations

**Triggers:** 5 (no change)
- Auto-update timestamps for: estimates, catalogs, organizations, users, settings

---

## Validation Process

### Structure Validation

```bash
# Compare table counts
sqlite3 quotes.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"
sqlite3 test_new_schema.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"
# Result: Both return 11 ✅

# Compare schemas
diff <(sqlite3 quotes.db .schema) <(sqlite3 test_new_schema.db .schema)
# Result: Only formatting differences ✅
```

### Data Integrity Validation

```bash
# Test idempotency (apply to existing DB)
cp quotes.db test_idempotent.db
sqlite3 test_idempotent.db < schema.sql

# Verify data preserved
sqlite3 test_idempotent.db "SELECT COUNT(*) FROM estimates WHERE deleted_at IS NULL;"
# Result: 8 (no data loss) ✅
```

### Functional Validation

```bash
# Test fresh install
rm -f test_fresh.db
sqlite3 test_fresh.db < schema.sql

# Verify credentials
sqlite3 test_fresh.db "SELECT COUNT(*) FROM users WHERE id='superadmin';"
# Result: 1 ✅

# Test triggers
# (see TESTING_REPORT.md for full results)
```

---

## Technical Details

### Column Data Types

All column data types preserved exactly as in production DB:
- `TEXT` for strings, UUIDs, JSON
- `INTEGER` for timestamps (Unix epoch), counts, booleans
- `REAL` for floating-point numbers (storage_mb, costs)

### Foreign Key Constraints

All FK constraints preserved with CASCADE delete:
```sql
FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
```

### Unique Constraints

All unique constraints preserved:
- `organizations(slug)` - Organization slugs must be unique
- `users(email)` - Email addresses must be unique
- `users(username)` - Usernames must be unique
- `catalogs(organization_id, slug)` - Composite unique on org + slug
- `settings(scope, scope_id, key)` - Composite primary key

### Check Constraints

```sql
-- Settings scope validation
CHECK (scope IN ('app', 'organization', 'user'))

-- Settings value_type validation
CHECK (value_type IN ('string', 'number', 'boolean', 'object', 'array'))
```

---

## Size Comparison

| File | Lines | Size | Description |
|------|-------|------|-------------|
| Old schema.sql | 453 | 17KB | Missing is_admin, test credentials |
| New schema.sql | 533 | 20KB | Complete, production-ready |
| extracted_dump.sql | 10,945 | 622KB | Full dump with all data |

**New schema is 18% larger** (80 more lines) due to:
- Better documentation (header + comments)
- Schema version marker
- Audit log entry for initialization
- More comprehensive initial settings

---

## Why This Approach Was Chosen

### Alternatives Considered

1. **Manual schema writing from migrations**
   - ❌ Prone to errors (easy to miss columns like is_admin)
   - ❌ Time-consuming to trace through 5 migrations
   - ❌ Risk of missing subtle changes

2. **Scripted transformation of old schema.sql**
   - ❌ Old schema.sql was outdated (missing is_admin)
   - ❌ Would propagate existing issues
   - ❌ No guarantee of matching production DB

3. **SQLite .dump extraction (chosen)**
   - ✅ Guaranteed to match production DB exactly
   - ✅ Includes all changes from migrations 006-010
   - ✅ Single source of truth
   - ✅ Easy to verify (compare with working DB)

### Benefits of This Approach

1. **100% Accuracy**
   - Extracted from actual working database
   - No translation errors
   - All columns, indexes, triggers present

2. **Future-Proof**
   - Can repeat process after any migration
   - Extract → Clean → Deploy
   - Schema.sql always matches latest DB state

3. **Auditable**
   - Complete dump preserved (extracted_dump.sql)
   - Can diff against old schema.sql
   - Clear transformation steps documented

4. **Safe**
   - Tested on copies before deployment
   - Idempotent design prevents errors
   - Rollback capability maintained

---

## Lessons Learned

### What Went Well

1. **SQLite .dump was perfect**
   - Captured everything accurately
   - Easy to work with
   - Reliable output

2. **Manual cleanup was manageable**
   - Only 30-45 minutes of work
   - Clear transformation rules
   - Easy to verify

3. **Testing caught all issues**
   - Idempotency test revealed data preservation
   - Fresh install test confirmed credentials
   - Trigger test verified functionality

### What Could Be Improved

1. **Automate cleanup next time**
   - Script to convert `CREATE` → `CREATE IF NOT EXISTS`
   - Script to convert `INSERT` → `INSERT OR IGNORE`
   - Script to remove user data while keeping seed data

2. **Better index documentation**
   - Document why each index exists
   - Note which queries use each index
   - Performance impact of each index

3. **Schema versioning from start**
   - Should have used schema version marker from v1.0
   - Would have simplified migration tracking

---

## Next Steps

### For Future Migrations

When adding new migrations (100+):

1. **Apply migration to production DB**
   ```bash
   sqlite3 db/quotes.db < db/migrations/100_add_feature_x.sql
   ```

2. **Extract new schema**
   ```bash
   sqlite3 db/quotes.db ".dump" > extracted_new.sql
   ```

3. **Clean and update schema.sql**
   - Follow transformation process above
   - Increment schema version (SCHEMA_V3.1, SCHEMA_V3.2, etc.)
   - Test thoroughly

4. **Keep schema.sql authoritative**
   - Migration files are incremental changes
   - schema.sql is always the complete current state
   - Fresh installs use schema.sql only

---

## References

- **Plan:** `pre_docs/DB_REFACTORING_PLAN.md`
- **Testing:** `pre_docs/TESTING_REPORT.md`
- **Migration Changes:** `pre_docs/MIGRATION_SYSTEM_CHANGES.md`
- **Recovery:** `pre_docs/RECOVERY_INSTRUCTIONS.md`
- **Backup:** `db/After_refactoring_DB_schema/README.md`

---

**End of Schema Extraction Guide**
