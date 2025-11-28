# Database Recovery Instructions
## Step-by-Step Recovery Procedures

**Date:** 2025-11-28
**Version:** Schema v3.0.0

---

## Quick Recovery (30 Seconds)

If the new schema causes any issues, follow these steps to restore the old system:

```bash
#!/bin/bash
# Navigate to project root
cd "/Users/bogisis/Desktop/сметы/for_deploy copy"

# 1. Stop server (if running)
ps aux | grep "node.*server" | grep -v grep | awk '{print $2}' | xargs kill

# 2. Restore database
cp "db/After_refactoring_DB_schema/quotes.db" db/quotes.db
cp "db/After_refactoring_DB_schema/quotes.db-shm" db/quotes.db-shm 2>/dev/null || true
cp "db/After_refactoring_DB_schema/quotes.db-wal" db/quotes.db-wal 2>/dev/null || true

# 3. Restore old schema
cp "db/After_refactoring_DB_schema/old_schema.sql" db/schema.sql

# 4. Restore migrations
cp db/After_refactoring_DB_schema/migrations/*.sql db/migrations/

# 5. Verify integrity
sqlite3 db/quotes.db "PRAGMA integrity_check;"

# 6. Fix permissions (if needed)
chmod 644 db/quotes.db*
chown $(whoami) db/quotes.db*

# 7. Restart server
npm start

echo "✅ Recovery complete!"
```

**Time:** 30 seconds
**Data loss:** Zero (complete backup)

---

## Detailed Recovery Scenarios

### Scenario 1: Schema Causes Server Startup Failure

**Symptoms:**
- Server won't start after schema update
- Error: "Failed to initialize SQLite database"
- Database integrity check fails

**Recovery Steps:**

#### Step 1: Stop the Server

```bash
# Find server process
ps aux | grep "node.*server.js" | grep -v grep

# Kill by PID (replace <PID> with actual PID)
kill <PID>

# OR kill all node processes (careful!)
pkill -f "node.*server"

# Verify stopped
lsof -ti:4000
# Should return nothing
```

#### Step 2: Verify Backup Integrity

```bash
# Check backup exists
ls -lh db/After_refactoring_DB_schema/quotes.db

# Check backup integrity
sqlite3 "db/After_refactoring_DB_schema/quotes.db" "PRAGMA integrity_check;"
# Expected: "ok"

# Check backup data
sqlite3 "db/After_refactoring_DB_schema/quotes.db" <<EOF
SELECT COUNT(*) as total_estimates FROM estimates;
SELECT COUNT(*) as active_estimates FROM estimates WHERE deleted_at IS NULL;
SELECT COUNT(*) as total_catalogs FROM catalogs;
SELECT COUNT(*) as active_catalogs FROM catalogs WHERE deleted_at IS NULL;
EOF
# Expected: 23 total, 8 active estimates; 6 total, 4 active catalogs
```

#### Step 3: Restore Database Files

```bash
# Create safety backup of current state
mkdir -p db/failed_schema_backup
cp db/quotes.db* db/failed_schema_backup/

# Restore from backup
cp "db/After_refactoring_DB_schema/quotes.db" db/quotes.db

# Restore WAL files (if they exist)
if [ -f "db/After_refactoring_DB_schema/quotes.db-shm" ]; then
    cp "db/After_refactoring_DB_schema/quotes.db-shm" db/quotes.db-shm
fi

if [ -f "db/After_refactoring_DB_schema/quotes.db-wal" ]; then
    cp "db/After_refactoring_DB_schema/quotes.db-wal" db/quotes.db-wal
fi
```

#### Step 4: Restore Old Schema

```bash
# Backup new schema (for investigation)
cp db/schema.sql db/failed_schema.sql

# Restore old schema
cp "db/After_refactoring_DB_schema/old_schema.sql" db/schema.sql
```

#### Step 5: Restore Migrations

```bash
# Restore all migration files
cp db/After_refactoring_DB_schema/migrations/*.sql db/migrations/
```

#### Step 6: Verify and Restart

```bash
# Verify database integrity
sqlite3 db/quotes.db "PRAGMA integrity_check;"
# Expected: "ok"

# Verify data
sqlite3 db/quotes.db "SELECT COUNT(*) FROM estimates;"
# Expected: 23

# Fix permissions if needed
chmod 644 db/quotes.db*
chown $(whoami) db/quotes.db*

# Restart server
npm start
```

**Result:** System restored to pre-refactoring state

---

### Scenario 2: Data Corruption or Loss

**Symptoms:**
- Estimates or catalogs missing
- User data lost
- Integrity check fails

**Recovery Steps:**

#### Option A: Restore from Backup (Recommended)

```bash
# Follow steps from Scenario 1
# This restores the complete database as it was before refactoring
```

#### Option B: Restore from SQL Dump

If WAL files are corrupted or database file is damaged:

```bash
# Stop server
ps aux | grep "node.*server" | xargs kill

# Backup corrupted database (for investigation)
mv db/quotes.db db/quotes.db.corrupted

# Recreate from SQL dump
sqlite3 db/quotes.db < "db/After_refactoring_DB_schema/extracted_dump.sql"

# Verify integrity
sqlite3 db/quotes.db "PRAGMA integrity_check;"

# Verify data
sqlite3 db/quotes.db "SELECT COUNT(*) FROM estimates WHERE deleted_at IS NULL;"
# Expected: 8 active estimates

# Restart server
npm start
```

**Data restored:** Complete database as of 2025-11-28 (backup creation time)

---

### Scenario 3: Git Rollback

If you committed the changes but want to revert:

```bash
# Check current branch
git branch
# Should show: * db_initial_schema_refactoring

# Option A: Revert the commit (keep branch)
git log --oneline -5  # Find commit hash
git revert <commit-hash>

# Option B: Delete branch and start over
git checkout main
git branch -D db_initial_schema_refactoring

# Restore files from backup
cp db/After_refactoring_DB_schema/quotes.db db/quotes.db
cp db/After_refactoring_DB_schema/old_schema.sql db/schema.sql
cp db/After_refactoring_DB_schema/migrations/*.sql db/migrations/
```

---

### Scenario 4: Partial Deployment (Migrations Restored, Schema Updated)

If schema.sql was updated but migrations weren't deleted:

```bash
# This is actually safe! The new schema.sql is idempotent
# But if you want to fully rollback:

# Restore old schema
cp db/After_refactoring_DB_schema/old_schema.sql db/schema.sql

# Verify migrations are present
ls db/migrations/00*.sql
# Should see: 006, 007, 008, 009, 010

# Restart server
npm start
```

---

## Common Issues and Solutions

### Issue 1: "database is locked"

**Cause:** Another process is accessing the database

**Solution:**
```bash
# Find processes using the database
lsof db/quotes.db

# Kill those processes
kill <PID>

# Remove stale WAL files
rm -f db/quotes.db-shm db/quotes.db-wal

# Restart server
npm start
```

### Issue 2: "disk I/O error"

**Cause:** Permissions issue or disk full

**Solution:**
```bash
# Check disk space
df -h .

# Fix permissions
chmod 644 db/quotes.db*
chown $(whoami) db/quotes.db*

# Verify integrity
sqlite3 db/quotes.db "PRAGMA integrity_check;"
```

### Issue 3: "file is not a database"

**Cause:** Database file corrupted

**Solution:**
```bash
# Restore from backup
cp db/After_refactoring_DB_schema/quotes.db db/quotes.db

# OR restore from SQL dump
rm db/quotes.db
sqlite3 db/quotes.db < db/After_refactoring_DB_schema/extracted_dump.sql
```

### Issue 4: "no such column: is_admin"

**Cause:** Schema.sql doesn't have the `is_admin` column

**Solution:**
```bash
# This means you're using OLD schema.sql
# Either restore new schema or add column manually:

sqlite3 db/quotes.db "ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0;"

# Or restore new schema.sql:
cp db/new_schema.sql db/schema.sql
```

### Issue 5: Missing Estimates or Catalogs

**Cause:** Soft-deleted records

**Solution:**
```bash
# Check if they're soft-deleted
sqlite3 db/quotes.db <<EOF
SELECT COUNT(*) as all_estimates FROM estimates;
SELECT COUNT(*) as active_estimates FROM estimates WHERE deleted_at IS NULL;
EOF

# If some are soft-deleted but should be active:
sqlite3 db/quotes.db "UPDATE estimates SET deleted_at = NULL WHERE id = 'uuid-here';"
```

---

## Verification Checklist

After any recovery, verify these:

### Database Integrity

```bash
# ✅ Integrity check
sqlite3 db/quotes.db "PRAGMA integrity_check;"
# Expected: "ok"

# ✅ Foreign key check
sqlite3 db/quotes.db "PRAGMA foreign_key_check;"
# Expected: (no output - means no violations)
```

### Data Counts

```bash
# ✅ Estimate counts
sqlite3 db/quotes.db "SELECT COUNT(*) FROM estimates WHERE deleted_at IS NULL;"
# Expected: 8 active estimates

# ✅ Catalog counts
sqlite3 db/quotes.db "SELECT COUNT(*) FROM catalogs WHERE deleted_at IS NULL;"
# Expected: 4 active catalogs

# ✅ User counts
sqlite3 db/quotes.db "SELECT COUNT(*) FROM users WHERE deleted_at IS NULL;"
# Expected: 2 users (superadmin + admin-user-id or similar)

# ✅ Organization counts
sqlite3 db/quotes.db "SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL;"
# Expected: 2 organizations
```

### Production Credentials

```bash
# ✅ Superadmin exists
sqlite3 db/quotes.db <<EOF
SELECT id, email, username, organization_id, role, is_admin
FROM users
WHERE id='superadmin';
EOF
# Expected: superadmin, admin@magellania.com, superadmin, magellania-org, admin, 1
```

### Server Functionality

```bash
# ✅ Server starts
npm start
# Should see: "Server listening on port 4000"

# ✅ Health check (in another terminal)
curl http://localhost:4000/health
# Expected: {"status":"ok"}

# ✅ Login test
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@magellania.com","password":"magellania2025"}'
# Expected: {"token":"...","user":{"id":"superadmin",...}}
```

---

## Prevention for Future

### Always Backup Before Changes

```bash
# Before any schema/migration changes
TIMESTAMP=$(date +%s)
sqlite3 db/quotes.db "PRAGMA wal_checkpoint(FULL);"
cp db/quotes.db "db/quotes.db.backup_${TIMESTAMP}"
cp db/schema.sql "db/schema.sql.backup_${TIMESTAMP}"
```

### Test on Copy First

```bash
# Test schema changes on a copy
cp db/quotes.db db/test_quotes.db
sqlite3 db/test_quotes.db < db/new_schema.sql

# Verify integrity
sqlite3 db/test_quotes.db "PRAGMA integrity_check;"

# Only then apply to production
```

### Keep Multiple Backups

```bash
# Rotate backups (keep last 5)
ls -t db/quotes.db.backup_* | tail -n +6 | xargs rm -f

# Always keep the "before refactoring" backup
cp db/After_refactoring_DB_schema/quotes.db db/PERMANENT_BACKUP_20251128.db
```

---

## Support and Escalation

### If Recovery Fails

1. **Check logs:** `/tmp/server_start.log`, `~/.npm/_logs/`
2. **Verify backup integrity:** `sqlite3 backup.db "PRAGMA integrity_check;"`
3. **Review error messages:** Note exact error text
4. **Document state:** `git status`, `ls -la db/`
5. **Contact support** with above information

### Debugging Tools

```bash
# SQLite version
sqlite3 --version

# Database info
sqlite3 db/quotes.db ".dbinfo"

# Table list
sqlite3 db/quotes.db ".tables"

# Schema dump
sqlite3 db/quotes.db ".schema" > current_schema.txt

# Data integrity
sqlite3 db/quotes.db "PRAGMA integrity_check;"
sqlite3 db/quotes.db "PRAGMA foreign_key_check;"
```

---

## Recovery Time Estimates

| Scenario | Time | Data Loss | Downtime |
|----------|------|-----------|----------|
| Quick rollback | 30 sec | None | 30 sec |
| Full restore from backup | 2 min | None | 2 min |
| Restore from SQL dump | 5 min | None | 5 min |
| Git revert | 1 min | None | 1 min |
| Investigate + fix | 10-30 min | Depends | 10-30 min |

---

## References

- **Backup Location:** `db/After_refactoring_DB_schema/`
- **Backup README:** `db/After_refactoring_DB_schema/README.md`
- **Refactoring Plan:** `pre_docs/DB_REFACTORING_PLAN.md`
- **Testing Report:** `pre_docs/TESTING_REPORT.md`

---

**End of Recovery Instructions**
