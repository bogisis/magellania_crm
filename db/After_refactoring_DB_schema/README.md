# Database Backup - Schema Refactoring

**Created:** 2025-11-28
**Purpose:** Complete backup before replacing sequential migrations with single authoritative schema
**Backup Size:** ~924KB (quotes.db) + 622KB (dump) + 17KB (schema) + migrations

---

## Contents

- `quotes.db` - Production database backup (924KB, 23 estimates, 6 catalogs)
- `quotes.db-shm` - WAL shared memory file (32KB)
- `quotes.db-wal` - Write-ahead log file (0B after checkpoint)
- `old_schema.sql` - Original schema.sql before refactoring (17KB)
- `extracted_dump.sql` - Complete database dump for reference (622KB)
- `migrations/` - All migration files (006-010 + historical)

---

## Quick Recovery (30 seconds)

### If new schema causes issues:

```bash
# Navigate to project root
cd "/Users/bogisis/Desktop/сметы/for_deploy copy"

# Stop server
ps aux | grep "node.*server" | grep -v grep | awk '{print $2}' | xargs kill

# Restore database
cp "db/After_refactoring_DB_schema/quotes.db" db/quotes.db
cp "db/After_refactoring_DB_schema/quotes.db-shm" db/quotes.db-shm 2>/dev/null || true
cp "db/After_refactoring_DB_schema/quotes.db-wal" db/quotes.db-wal 2>/dev/null || true

# Restore old schema
cp "db/After_refactoring_DB_schema/old_schema.sql" db/schema.sql

# Restore migrations (if needed)
cp -r "db/After_refactoring_DB_schema/migrations/"* db/migrations/

# Verify integrity
sqlite3 db/quotes.db "PRAGMA integrity_check;"

# Fix permissions
chmod 644 db/quotes.db*
chown $(whoami) db/quotes.db*

# Restart server
npm start
```

---

## Verify Backup Integrity

```bash
# Check backup
sqlite3 "db/After_refactoring_DB_schema/quotes.db" "PRAGMA integrity_check;"
# Expected: "ok"

# Count records
sqlite3 "db/After_refactoring_DB_schema/quotes.db" <<EOF
SELECT 'Estimates:' as type, COUNT(*) as count FROM estimates WHERE deleted_at IS NULL
UNION ALL SELECT 'Catalogs:', COUNT(*) FROM catalogs WHERE deleted_at IS NULL
UNION ALL SELECT 'Users:', COUNT(*) FROM users WHERE deleted_at IS NULL
UNION ALL SELECT 'Organizations:', COUNT(*) FROM organizations WHERE deleted_at IS NULL;
EOF
# Expected: 23 estimates, 6 catalogs, 2 users, 2 orgs
```

---

## Restore from SQL Dump

If WAL files are corrupted, use SQL dump:

```bash
# Navigate to project root
cd "/Users/bogisis/Desktop/сметы/for_deploy copy"

# Stop server
ps aux | grep "node.*server" | grep -v grep | awk '{print $2}' | xargs kill

# Backup current (if exists)
mv db/quotes.db db/quotes.db.before_restore

# Create new database from dump
sqlite3 db/quotes.db < "db/After_refactoring_DB_schema/extracted_dump.sql"

# Verify integrity
sqlite3 db/quotes.db "PRAGMA integrity_check;"

# Restart server
npm start
```

---

## Fix Database Permissions

If you encounter permission errors:

```bash
# Fix ownership
chown $(whoami) db/quotes.db*

# Fix permissions
chmod 644 db/quotes.db
chmod 644 db/quotes.db-shm 2>/dev/null || true
chmod 644 db/quotes.db-wal 2>/dev/null || true

# Verify
ls -l db/quotes.db*
```

---

## Common Issues

### Issue: "database is locked"
**Solution:** Stop all node processes accessing the database
```bash
ps aux | grep node | grep -v grep | awk '{print $2}' | xargs kill
rm -f db/quotes.db-shm db/quotes.db-wal  # Remove stale WAL files
npm start
```

### Issue: "disk I/O error"
**Solution:** Check disk space and permissions
```bash
df -h .  # Check disk space
ls -l db/quotes.db*  # Check permissions
chmod 644 db/quotes.db*
```

### Issue: "file is not a database"
**Solution:** Database file corrupted, restore from dump
```bash
rm db/quotes.db
sqlite3 db/quotes.db < "db/After_refactoring_DB_schema/extracted_dump.sql"
```

---

## Production Credentials (CRITICAL)

After recovery, verify production credentials are intact:

```sql
sqlite3 db/quotes.db <<EOF
SELECT id, email, username, organization_id, role
FROM users
WHERE id='superadmin';
EOF
```

**Expected:**
- ID: superadmin
- Email: admin@magellania.com
- Username: superadmin
- Organization: magellania-org
- Role: admin

---

## What Changed in Refactoring

### Before (Sequential Migrations)
- Base schema: `db/schema.sql` (potentially outdated)
- Migrations: 006 → 007 → 008 → 009 → 010 (applied sequentially)
- **Problem:** 99% failure rate during deployment

### After (Single Authoritative Schema)
- Complete schema: `db/schema.sql` (extracted from working production DB)
- Migrations 006-010: Deleted (backed up here)
- **Benefit:** Zero migration errors, instant initialization

---

## Contact

For issues or questions about this backup:
- Check documentation in `/pre_docs/RECOVERY_INSTRUCTIONS.md`
- Review refactoring plan in `/pre_docs/DB_REFACTORING_PLAN.md`

**Backup created:** 2025-11-28
**Last verified:** 2025-11-28
