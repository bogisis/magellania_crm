#!/bin/bash
# Quote Calculator v3.0 - Database Compatibility Checker
# ============================================================================
# Проверка версии и структуры SQLite базы данных перед миграцией
#
# Usage:
#   ./scripts/check-db-compatibility.sh <db-file>
#
# Example:
#   ./scripts/check-db-compatibility.sh ./db-exports/quotes-local-20250113.db
#
# Checks:
#   - Database file integrity
#   - Schema version compatibility
#   - Table structure
#   - Record counts
#   - Data consistency
# ============================================================================

set -e  # Exit on error

# ============================================================================
# Configuration
# ============================================================================

DB_FILE=$1
EXPECTED_SCHEMA_VERSION="1.0.0"  # Ожидаемая версия схемы

# ============================================================================
# Helper Functions
# ============================================================================

print_usage() {
    echo "Usage: $0 <db-file>"
    echo ""
    echo "Example:"
    echo "  $0 ./db-exports/quotes-local-20250113.db"
}

check_sqlite3() {
    if ! command -v sqlite3 &> /dev/null; then
        echo "❌ Error: sqlite3 not found. Please install it:"
        echo "   macOS: brew install sqlite3"
        echo "   Ubuntu: apt install sqlite3"
        exit 1
    fi
}

# ============================================================================
# Check Functions
# ============================================================================

check_file_exists() {
    echo "🔍 Checking file existence..."

    if [ ! -f "$DB_FILE" ]; then
        echo "❌ Error: Database file not found: $DB_FILE"
        exit 1
    fi

    if [ ! -s "$DB_FILE" ]; then
        echo "❌ Error: Database file is empty"
        exit 1
    fi

    local size=$(ls -lh "$DB_FILE" | awk '{print $5}')
    echo "✅ File exists: $size"
}

check_integrity() {
    echo ""
    echo "🔍 Checking database integrity..."

    local result=$(sqlite3 "$DB_FILE" "PRAGMA integrity_check;")

    if [ "$result" = "ok" ]; then
        echo "✅ Integrity: OK"
    else
        echo "❌ Integrity check failed:"
        echo "$result"
        exit 1
    fi
}

check_schema_version() {
    echo ""
    echo "🔍 Checking schema version..."

    # Check if schema_info table exists
    local has_schema_info=$(sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_info';" | wc -l)

    if [ "$has_schema_info" -eq 0 ]; then
        echo "⚠️  Warning: No schema_info table found"
        echo "   This may be an old database format"
        return
    fi

    # Get schema version
    local version=$(sqlite3 "$DB_FILE" "SELECT version FROM schema_info LIMIT 1;" 2>/dev/null)

    if [ -z "$version" ]; then
        echo "⚠️  Warning: Cannot read schema version"
        return
    fi

    echo "📋 Schema version: $version"

    # Check compatibility
    if [ "$version" = "$EXPECTED_SCHEMA_VERSION" ]; then
        echo "✅ Compatible with expected version: $EXPECTED_SCHEMA_VERSION"
    else
        echo "⚠️  Schema version mismatch!"
        echo "   Expected: $EXPECTED_SCHEMA_VERSION"
        echo "   Found: $version"
        echo "   Migration may be required"
    fi
}

check_tables() {
    echo ""
    echo "🔍 Checking table structure..."
    echo ""

    local tables=$(sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")

    if [ -z "$tables" ]; then
        echo "❌ Error: No tables found in database"
        exit 1
    fi

    echo "📊 Tables found:"
    echo "$tables" | while read -r table; do
        echo "  - $table"
    done

    # Check required tables
    local required_tables=("estimates" "backups" "catalogs" "settings")
    echo ""
    echo "Required tables:"

    for table in "${required_tables[@]}"; do
        if echo "$tables" | grep -q "^${table}$"; then
            echo "  ✅ $table"
        else
            echo "  ❌ $table (missing)"
        fi
    done
}

check_record_counts() {
    echo ""
    echo "🔍 Checking record counts..."
    echo ""

    sqlite3 "$DB_FILE" <<EOF
.mode column
.headers on
SELECT
    'estimates' as Table,
    COUNT(*) as Records
FROM estimates
UNION ALL
SELECT 'backups', COUNT(*) FROM backups
UNION ALL
SELECT 'catalogs', COUNT(*) FROM catalogs
UNION ALL
SELECT 'settings', COUNT(*) FROM settings;
EOF
}

check_estimates_table() {
    echo ""
    echo "🔍 Checking estimates table structure..."

    local columns=$(sqlite3 "$DB_FILE" "PRAGMA table_info(estimates);" | awk -F'|' '{print $2}')

    if [ -z "$columns" ]; then
        echo "❌ Error: Cannot read estimates table structure"
        return
    fi

    echo ""
    echo "Columns:"
    echo "$columns" | while read -r col; do
        echo "  - $col"
    done

    # Check required columns
    local required_cols=("id" "filename" "data" "data_version" "created_at" "updated_at")
    echo ""
    echo "Required columns:"

    for col in "${required_cols[@]}"; do
        if echo "$columns" | grep -q "^${col}$"; then
            echo "  ✅ $col"
        else
            echo "  ⚠️  $col (missing)"
        fi
    done
}

check_data_consistency() {
    echo ""
    echo "🔍 Checking data consistency..."

    # Check for NULL ids
    local null_ids=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM estimates WHERE id IS NULL OR id = '';")
    if [ "$null_ids" -gt 0 ]; then
        echo "  ⚠️  Found $null_ids estimates with NULL/empty ids"
    else
        echo "  ✅ All estimates have valid ids"
    fi

    # Check for NULL filenames
    local null_filenames=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM estimates WHERE filename IS NULL OR filename = '';")
    if [ "$null_filenames" -gt 0 ]; then
        echo "  ⚠️  Found $null_filenames estimates with NULL/empty filenames"
    else
        echo "  ✅ All estimates have valid filenames"
    fi

    # Check for duplicate ids
    local dup_ids=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM (SELECT id, COUNT(*) as cnt FROM estimates GROUP BY id HAVING cnt > 1);")
    if [ "$dup_ids" -gt 0 ]; then
        echo "  ❌ Found $dup_ids duplicate ids!"
    else
        echo "  ✅ No duplicate ids"
    fi

    # Check for duplicate filenames
    local dup_filenames=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM (SELECT filename, COUNT(*) as cnt FROM estimates GROUP BY filename HAVING cnt > 1);")
    if [ "$dup_filenames" -gt 0 ]; then
        echo "  ⚠️  Found $dup_filenames duplicate filenames"
    else
        echo "  ✅ No duplicate filenames"
    fi

    # Check JSON data validity (sample)
    echo ""
    echo "  Checking JSON data validity (sample)..."
    local invalid_json=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM estimates WHERE json_valid(data) = 0;" 2>/dev/null || echo "0")
    if [ "$invalid_json" -gt 0 ]; then
        echo "  ❌ Found $invalid_json records with invalid JSON!"
    else
        echo "  ✅ All JSON data appears valid"
    fi
}

check_timestamps() {
    echo ""
    echo "🔍 Checking timestamps..."

    # Latest created
    local latest_created=$(sqlite3 "$DB_FILE" "SELECT MAX(created_at) FROM estimates;")
    echo "  Latest created: $latest_created"

    # Latest updated
    local latest_updated=$(sqlite3 "$DB_FILE" "SELECT MAX(updated_at) FROM estimates;")
    echo "  Latest updated: $latest_updated"

    # Oldest estimate
    local oldest=$(sqlite3 "$DB_FILE" "SELECT MIN(created_at) FROM estimates;")
    echo "  Oldest estimate: $oldest"
}

show_summary() {
    echo ""
    echo "📋 Database Summary:"
    echo "===================="

    # File info
    local size=$(ls -lh "$DB_FILE" | awk '{print $5}')
    local modified=$(ls -l "$DB_FILE" | awk '{print $6, $7, $8}')

    echo "File: $(basename "$DB_FILE")"
    echo "Size: $size"
    echo "Modified: $modified"
    echo ""

    # Total records
    local total_estimates=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM estimates;")
    local total_backups=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM backups;")
    local total_catalogs=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM catalogs;")

    echo "Total Estimates: $total_estimates"
    echo "Total Backups: $total_backups"
    echo "Total Catalogs: $total_catalogs"
}

# ============================================================================
# Main Script
# ============================================================================

main() {
    echo ""
    echo "🔍 Quote Calculator - Database Compatibility Check"
    echo "==================================================="
    echo ""

    # Check arguments
    if [ -z "$DB_FILE" ]; then
        print_usage
        exit 1
    fi

    # Check dependencies
    check_sqlite3

    # Run checks
    check_file_exists
    check_integrity
    check_schema_version
    check_tables
    check_record_counts
    check_estimates_table
    check_data_consistency
    check_timestamps
    show_summary

    # Final verdict
    echo ""
    echo "✅ Compatibility check completed!"
    echo ""
    echo "Next steps:"
    echo "  1. If all checks passed, database is ready for migration"
    echo "  2. Import: ./scripts/import-db.sh $DB_FILE <target-environment>"
    echo ""
}

# Run main function
main
