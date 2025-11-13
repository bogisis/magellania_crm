# Quote Calculator v3.0 - Export/Import API

**Status:** ✅ Production Ready
**Version:** 2.3.0
**Date:** October 28, 2025

## Overview

Quote Calculator v3.0 includes three data portability endpoints for backup, migration, and disaster recovery:

1. **GET /api/export/all** - Export all data as JSON
2. **POST /api/import/all** - Import data from JSON
3. **GET /api/export/database** - Export SQLite database file (SQLite only)

## Endpoints

### 1. Export All Data (JSON)

Export all estimates, catalogs, settings, and backups as a single JSON file.

**Endpoint:** `GET /api/export/all`

**Query Parameters:**
- `includeBackups` (optional, boolean, default: `true`) - Include backups in export

**Response:**
```json
{
  "version": "2.3.0",
  "exportDate": "2025-10-28T23:41:09.064Z",
  "storageType": "sqlite",
  "data": {
    "estimates": [
      {
        "id": "test-batch-1",
        "filename": "batch_test_client_1_2025-11-01_5pax_test-batch-1.json",
        "data": { ... }
      }
    ],
    "catalogs": [
      {
        "filename": "catalog.json",
        "data": { ... }
      }
    ],
    "settings": { ... },
    "backups": [
      {
        "id": "backup-id",
        "data": { ... }
      }
    ]
  }
}
```

**Headers:**
- `Content-Type: application/json`
- `Content-Disposition: attachment; filename="quote-calculator-export-{timestamp}.json"`

**Example:**
```bash
# Export all data including backups
curl http://localhost:4000/api/export/all > backup-full.json

# Export without backups (smaller file)
curl "http://localhost:4000/api/export/all?includeBackups=false" > backup-no-backups.json
```

**Use Cases:**
- Daily/weekly backups
- Migration between environments
- Data analysis/reporting
- Disaster recovery

---

### 2. Import All Data (JSON)

Import data from a JSON export file. Supports both full and partial imports.

**Endpoint:** `POST /api/import/all`

**Request Body:** JSON export file from `/api/export/all`

**Middleware:** `checkDiskSpace` - Ensures sufficient disk space before import

**Response:**
```json
{
  "success": true,
  "imported": {
    "estimates": 10,
    "catalogs": 4,
    "settings": true,
    "backups": 15
  },
  "failed": {
    "estimates": [],
    "catalogs": [],
    "backups": []
  }
}
```

**Error Response (Partial Failure):**
```json
{
  "success": true,
  "imported": {
    "estimates": 8,
    "catalogs": 4,
    "settings": true,
    "backups": 15
  },
  "failed": {
    "estimates": [
      {
        "id": "problematic-id",
        "filename": "problematic.json",
        "error": "Missing estimate id"
      }
    ],
    "catalogs": [],
    "backups": []
  }
}
```

**Example:**
```bash
# Import from backup
curl -X POST http://localhost:4000/api/import/all \
  -H "Content-Type: application/json" \
  -d @backup-full.json

# Check response
{
  "success": true,
  "imported": { "estimates": 10, "catalogs": 4, "settings": true, "backups": 15 },
  "failed": { "estimates": [], "catalogs": [], "backups": [] }
}
```

**Validation:**
- Checks for `version` and `data` fields in import file
- Validates estimate IDs (uses `item.id` or `item.data.id`)
- Gracefully handles failures - continues with other items

**Behavior:**
- **Overwrites existing data** with matching IDs
- Does NOT delete data not present in import
- Creates new entries for IDs that don't exist
- Uses SQLiteStorage transactions for atomicity per item

**Use Cases:**
- Restore from backup
- Migration from staging to production
- Data recovery after corruption
- Environment synchronization

---

### 3. Export SQLite Database (Binary)

Export the entire SQLite database file as a binary download. **SQLite storage only**.

**Endpoint:** `GET /api/export/database`

**Storage:** SQLite only (returns 400 error for FileStorage)

**Response:**
- Binary SQLite database file
- Uses `db.serialize()` from better-sqlite3

**Headers:**
- `Content-Type: application/octet-stream`
- `Content-Disposition: attachment; filename="quote-calculator-db-{timestamp}.db"`
- `Content-Length: {bytes}`

**Example:**
```bash
# Export database
curl http://localhost:4000/api/export/database > backup.db

# Check file
ls -lh backup.db
# -rw-r--r-- 1 user group 648K Oct 28 20:00 backup.db

# Verify it's a valid SQLite database
sqlite3 backup.db "SELECT COUNT(*) FROM estimates"
# 10
```

**Use Cases:**
- Full database backups
- Offline analysis with SQLite tools
- Database replication
- Point-in-time snapshots

**Advantages over JSON export:**
- ✅ Includes full schema, indexes, triggers, views
- ✅ Faster export (no JSON serialization)
- ✅ Smaller file size (binary format)
- ✅ Can be used directly as a database

**Disadvantages:**
- ❌ SQLite-specific (not portable to PostgreSQL)
- ❌ Binary format (not human-readable)
- ❌ Requires SQLite storage backend

---

## Data Portability Use Cases

### Daily Backup Script
```bash
#!/bin/bash
# backup.sh - Daily backup script

DATE=$(date +%Y%m%d)

# Export all data as JSON
curl -s http://localhost:4000/api/export/all > "backups/full-$DATE.json"

# Export SQLite database (if using SQLite)
curl -s http://localhost:4000/api/export/database > "backups/db-$DATE.db"

# Keep only last 7 days
find backups/ -name "*.json" -mtime +7 -delete
find backups/ -name "*.db" -mtime +7 -delete

echo "Backup completed: $DATE"
```

### Migration from Staging to Production
```bash
# 1. Export from staging
curl http://staging:4000/api/export/all > staging-export.json

# 2. Review export
jq '.data.estimates | length' staging-export.json
# 10

# 3. Import to production
curl -X POST http://production:4000/api/import/all \
  -H "Content-Type: application/json" \
  -d @staging-export.json

# 4. Verify
curl http://production:4000/api/estimates | jq '.estimates | length'
# 10
```

### Disaster Recovery
```bash
# Scenario: Database corrupted, need to restore from backup

# 1. Stop server
docker stop quote-prod

# 2. Replace database file (option A)
cp backups/db-20251028.db db/quotes.db

# OR: Import from JSON (option B)
docker start quote-prod
curl -X POST http://localhost:4000/api/import/all \
  -H "Content-Type: application/json" \
  -d @backups/full-20251028.json

# 3. Verify
curl http://localhost:4000/health | jq '.storage.stats'
```

---

## Implementation Details

### Export Logic

**Estimates:**
```javascript
// Use id instead of filename for SQLiteStorage
const data = await storage.loadEstimate(est.id);
exportData.data.estimates.push({
  id: est.id,
  filename: est.filename,
  data: data
});
```

**Catalogs:**
```javascript
// catalogName is a string (filename), not an object
const data = await storage.loadCatalog(catalogName);
exportData.data.catalogs.push({
  filename: catalogName,
  data: data
});
```

**Error Handling:**
- Uses try-catch per item
- Logs warnings for failed items
- Continues export even if some items fail
- Returns partial export with successful items

### Import Logic

**Estimates:**
```javascript
// Use id or data.id for SQLiteStorage
const estimateId = item.id || item.data.id;
if (!estimateId) {
  throw new Error('Missing estimate id');
}
await storage.saveEstimate(estimateId, item.data);
```

**Partial Failure Handling:**
- Returns `success: true` even if some items failed
- Provides detailed `imported` and `failed` counts
- Includes error messages for failed items

### Database Export

Uses better-sqlite3's `serialize()` method:
```javascript
const dbBuffer = storage.db.serialize();
res.send(dbBuffer);
```

**Advantages:**
- Synchronous operation
- Returns Buffer directly
- Includes WAL/SHM data
- Ready-to-use database file

---

## Error Handling

### Invalid Import Data
```json
{
  "success": false,
  "error": "Invalid import data: missing version or data fields"
}
```

### Database Export with FileStorage
```json
{
  "success": false,
  "error": "Database export is only available for SQLite storage"
}
```

### Disk Space Exhausted
```json
{
  "success": false,
  "error": "Insufficient disk space"
}
```

### Partial Import Failure
```json
{
  "success": true,
  "imported": { "estimates": 8 },
  "failed": {
    "estimates": [
      { "id": "bad-id", "error": "Missing estimate id" }
    ]
  }
}
```

---

## Security Considerations

1. **No Authentication** - Currently no auth required
   - ⚠️ Add authentication before exposing to internet
   - Recommendation: Use nginx basic auth or API keys

2. **Disk Space Validation** - Uses `checkDiskSpace` middleware
   - Prevents disk exhaustion
   - Returns 507 (Insufficient Storage) if disk full

3. **File Size Limits** - Configured via `JSON_LIMIT` env var
   - Default: 50MB
   - Prevents DoS via large uploads

4. **Sensitive Data** - Exports may contain client PII
   - Store backups securely
   - Encrypt backups at rest
   - Use HTTPS for transfers

---

## Performance

### Export Performance
| Data Size | Export Time | File Size |
|-----------|-------------|-----------|
| 10 estimates, 4 catalogs | ~100ms | 228KB JSON |
| SQLite database (648KB) | ~50ms | 648KB binary |

### Import Performance
| Data Size | Import Time | Notes |
|-----------|-------------|-------|
| 10 estimates, 4 catalogs | ~200ms | With transactions |

**Optimization Tips:**
- Use `includeBackups=false` for faster exports
- Import during low-traffic periods
- Consider streaming for large datasets (future)

---

## Testing

### Manual Testing
```bash
# 1. Export all data
curl http://localhost:4000/api/export/all > test-export.json

# 2. Verify export structure
jq '.version, .storageType, (.data | keys)' test-export.json

# 3. Import back
curl -X POST http://localhost:4000/api/import/all \
  -H "Content-Type: application/json" \
  -d @test-export.json

# 4. Export database
curl http://localhost:4000/api/export/database > test-db.db

# 5. Verify database
sqlite3 test-db.db "SELECT COUNT(*) FROM estimates"
```

### Automated Testing
See `__tests__/export-import.test.js` (to be created)

---

## Changelog

### v2.3.0 (October 28, 2025) - DAY 2.3
- ✅ Added GET /api/export/all endpoint
- ✅ Added POST /api/import/all endpoint
- ✅ Added GET /api/export/database endpoint
- ✅ Winston logging for all export/import operations
- ✅ Disk space validation via middleware
- ✅ Graceful error handling with partial success reporting

---

## Future Enhancements

1. **Streaming Exports** - For large datasets (>100MB)
2. **Incremental Backups** - Export only changed data since timestamp
3. **Compression** - Gzip exports to reduce file size
4. **Encrypted Exports** - Encrypt JSON exports with password
5. **Scheduled Exports** - Cron-like scheduled backups
6. **Cloud Storage** - Direct upload to S3/GCS/Azure
7. **Import Validation** - Dry-run mode to preview changes
8. **Rollback** - Automatic rollback on import failure

---

## Support

For issues or questions:
- Check logs: `docker logs quote-prod`
- Health check: `curl http://localhost:4000/health`
- Review Winston logs: `logs/combined.log`

---

**Version:** 3.0.0
**Last Updated:** October 28, 2025
