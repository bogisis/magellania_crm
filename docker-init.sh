#!/bin/sh
# Docker initialization script
# Initializes database and starts the server

set -e

echo "🚀 Quote Calculator - Docker Initialization"
echo "==========================================="

# Database path
DB_PATH="${DB_PATH:-/usr/src/app/db/quotes.db}"
export DB_PATH

# Check if database needs initialization
if [ ! -f "$DB_PATH" ]; then
    echo "📁 Database file not found at $DB_PATH"
    echo "✨ Creating new database from schema..."

    # Create db directory if it doesn't exist
    mkdir -p "$(dirname "$DB_PATH")"

    # Apply base schema for fresh install
    echo ""
    echo "📋 Applying base schema (db/schema.sql)..."
    sqlite3 "$DB_PATH" < db/schema.sql

    echo "✅ Base schema applied successfully"

    # Mark migrations 001-003 as already applied (schema.sql includes these)
    echo ""
    echo "📝 Marking base migrations as applied..."
    sqlite3 "$DB_PATH" << EOF
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (1, 'add_multitenancy', strftime('%s', 'now'));
INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (2, 'remove_filename_unique', strftime('%s', 'now'));
INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (3, 'fix_settings_multitenancy', strftime('%s', 'now'));
EOF

    # Run remaining migrations (004_add_users_auth.sql, 005_migrate_owner_id.sql)
    echo ""
    echo "🔄 Running remaining migrations..."
    node db/migrations/runner.js up

else
    echo "📁 Database found at $DB_PATH"

    # Check if migrations are needed
    echo ""
    echo "🔄 Checking for pending migrations..."
    node db/migrations/runner.js up
fi

# Show final migration status
echo ""
echo "📊 Migration status:"
node db/migrations/runner.js status

echo ""
echo "✅ Database initialization complete!"
echo ""
echo "🌐 Starting Quote Calculator server..."
echo "==========================================="
echo ""

# Start the server
exec node server-with-db.js
