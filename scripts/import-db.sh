#!/bin/bash
# Quote Calculator v3.0 - Database Import Script
# ============================================================================
# Импорт SQLite базы данных в указанное окружение
#
# Usage:
#   ./scripts/import-db.sh <db-file> <target-environment>
#
# Environments:
#   local-dev       - Локальный development контейнер
#   local-staging   - Локальный staging контейнер
#   vps-staging     - VPS staging контейнер (через SSH)
#   vps-production  - VPS production контейнер (через SSH)
#
# Examples:
#   ./scripts/import-db.sh ./db-exports/quotes-local-dev-20250113.db local-staging
#   ./scripts/import-db.sh ./db-exports/quotes-staging-20250113.db vps-production
#
# Safety:
#   - Автоматический бэкап текущей БД перед импортом
#   - Проверка целостности импортируемой БД
#   - Подтверждение для production импорта
#   - Возможность отката через бэкап
# ============================================================================

set -e  # Exit on error

# ============================================================================
# Configuration
# ============================================================================

DB_FILE=$1
ENVIRONMENT=${2:-local-dev}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./db-exports/backups"

# VPS configuration
VPS_HOST="${VPS_HOST:-your-vps-ip}"
VPS_USER="${VPS_USER:-deployer}"
VPS_PROJECT_DIR="${VPS_PROJECT_DIR:-/opt/quote-calculator}"

# Container names по окружениям
declare -A CONTAINERS=(
    ["local-dev"]="quote-dev"
    ["local-staging"]="quote-staging"
    ["vps-staging"]="quote-staging"
    ["vps-production"]="quote-production"
)

# ============================================================================
# Helper Functions
# ============================================================================

print_usage() {
    echo "Usage: $0 <db-file> <target-environment>"
    echo ""
    echo "Arguments:"
    echo "  db-file              - Path to SQLite database file to import"
    echo "  target-environment   - Target environment for import"
    echo ""
    echo "Environments:"
    echo "  local-dev       - Local development container"
    echo "  local-staging   - Local staging container"
    echo "  vps-staging     - VPS staging container (via SSH)"
    echo "  vps-production  - VPS production container (via SSH)"
    echo ""
    echo "Examples:"
    echo "  $0 ./db-exports/quotes-local-20250113.db local-staging"
    echo "  $0 ./db-exports/quotes-staging-20250113.db vps-production"
}

check_sqlite3() {
    if ! command -v sqlite3 &> /dev/null; then
        echo "❌ Error: sqlite3 not found. Please install it:"
        echo "   macOS: brew install sqlite3"
        echo "   Ubuntu: apt install sqlite3"
        exit 1
    fi
}

validate_db_file() {
    local db_file=$1

    echo "🔍 Validating database file..."

    # Check file exists
    if [ ! -f "$db_file" ]; then
        echo "❌ Error: Database file not found: $db_file"
        exit 1
    fi

    # Check file is not empty
    if [ ! -s "$db_file" ]; then
        echo "❌ Error: Database file is empty: $db_file"
        exit 1
    fi

    # Check SQLite integrity
    if ! sqlite3 "$db_file" "PRAGMA integrity_check;" | grep -q "ok"; then
        echo "❌ Error: Database integrity check failed!"
        echo "   The database file may be corrupted."
        exit 1
    fi

    echo "✅ Database file is valid"
}

show_db_info() {
    local db_file=$1

    echo ""
    echo "📊 Database Information:"
    echo "========================"

    # File size
    local size=$(ls -lh "$db_file" | awk '{print $5}')
    echo "File size: $size"

    # Record counts
    echo ""
    echo "Record counts:"
    sqlite3 "$db_file" <<EOF
.mode column
SELECT
    'estimates' as table_name,
    COUNT(*) as count
FROM estimates
UNION ALL
SELECT 'backups', COUNT(*) FROM backups
UNION ALL
SELECT 'catalogs', COUNT(*) FROM catalogs
UNION ALL
SELECT 'settings', COUNT(*) FROM settings;
EOF

    # Schema version
    echo ""
    echo "Schema version:"
    sqlite3 "$db_file" "SELECT * FROM schema_info LIMIT 1;" 2>/dev/null || echo "No schema_info table"
}

confirm_import() {
    local target_env=$1

    echo ""
    echo "⚠️  You are about to REPLACE the database in: $target_env"
    echo ""
    read -p "Continue with import? (y/N): " confirm

    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "❌ Import cancelled"
        exit 0
    fi
}

confirm_production_import() {
    echo ""
    echo "🚨 WARNING: PRODUCTION DATABASE IMPORT 🚨"
    echo "=========================================="
    echo ""
    echo "This will REPLACE the production database!"
    echo "All current production data will be backed up, but this is a CRITICAL operation."
    echo ""
    read -p "Type 'PRODUCTION' (all caps) to confirm: " confirm

    if [ "$confirm" != "PRODUCTION" ]; then
        echo "❌ Production import cancelled"
        exit 0
    fi

    echo ""
    read -p "Are you absolutely sure? (yes/NO): " final_confirm

    if [ "$final_confirm" != "yes" ]; then
        echo "❌ Production import cancelled"
        exit 0
    fi
}

# ============================================================================
# Import Functions
# ============================================================================

backup_current_db_local() {
    local container=$1

    echo "💾 Creating backup of current database..."

    mkdir -p "$BACKUP_DIR"

    local backup_file="${BACKUP_DIR}/backup-before-import-${TIMESTAMP}.db"

    if docker cp "${container}:/app/db/quotes.db" "$backup_file" 2>/dev/null; then
        echo "✅ Backup created: $backup_file"
    else
        echo "⚠️  Warning: Could not create backup (database may not exist yet)"
    fi
}

backup_current_db_vps() {
    local container=$1

    echo "💾 Creating backup of current database on VPS..."

    # Create backup on VPS
    ssh "${VPS_USER}@${VPS_HOST}" \
        "mkdir -p ${VPS_PROJECT_DIR}/db-exports/backups && \
         docker cp ${container}:/app/db/quotes.db ${VPS_PROJECT_DIR}/db-exports/backups/backup-before-import-${TIMESTAMP}.db 2>/dev/null || echo 'No existing DB to backup'"

    echo "✅ Backup created on VPS"
}

import_to_local() {
    local container=$1
    local db_file=$2

    echo "📦 Importing database to local container '$container'..."

    # Check container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "❌ Error: Container '$container' is not running"
        echo ""
        echo "Available containers:"
        docker ps --format "table {{.Names}}\t{{.Status}}"
        exit 1
    fi

    # Backup current database
    backup_current_db_local "$container"

    # Copy new database to container
    if docker cp "$db_file" "${container}:/app/db/quotes.db"; then
        echo "✅ Database file copied to container"
    else
        echo "❌ Error: Failed to copy database to container"
        exit 1
    fi

    # Restart container to ensure clean state
    echo "🔄 Restarting container..."
    docker restart "$container" > /dev/null

    # Wait for container to be ready
    echo "⏳ Waiting for container to be ready..."
    sleep 3

    # Verify container is healthy
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "✅ Container restarted successfully"
    else
        echo "❌ Error: Container failed to restart"
        exit 1
    fi
}

import_to_vps() {
    local container=$1
    local db_file=$2
    local env_name=$3

    echo "📦 Importing database to VPS $env_name..."

    # Check SSH connection
    if ! ssh -q "${VPS_USER}@${VPS_HOST}" "echo 'SSH OK'" 2>/dev/null; then
        echo "❌ Error: Cannot connect to VPS"
        echo "   Host: ${VPS_USER}@${VPS_HOST}"
        exit 1
    fi

    # Check container is running
    if ! ssh "${VPS_USER}@${VPS_HOST}" "docker ps --format '{{.Names}}' | grep -q '^${container}$'"; then
        echo "❌ Error: Container '$container' is not running on VPS"
        exit 1
    fi

    # Backup current database on VPS
    backup_current_db_vps "$container"

    # Upload new database to VPS
    echo "📤 Uploading database to VPS..."
    scp "$db_file" "${VPS_USER}@${VPS_HOST}:/tmp/quotes-import.db"

    # Copy to container and restart
    echo "📦 Installing database in container..."
    ssh "${VPS_USER}@${VPS_HOST}" <<EOF
        docker cp /tmp/quotes-import.db ${container}:/app/db/quotes.db && \
        rm /tmp/quotes-import.db && \
        docker restart ${container}
EOF

    # Wait for container to be ready
    echo "⏳ Waiting for container to be ready..."
    sleep 5

    # Verify container is healthy
    if ssh "${VPS_USER}@${VPS_HOST}" "docker ps --format '{{.Names}}' | grep -q '^${container}$'"; then
        echo "✅ Container restarted successfully on VPS"
    else
        echo "❌ Error: Container failed to restart on VPS"
        exit 1
    fi

    echo "✅ Database imported successfully to VPS!"
}

# ============================================================================
# Main Script
# ============================================================================

main() {
    echo ""
    echo "📥 Quote Calculator - Database Import"
    echo "======================================"
    echo ""

    # Check arguments
    if [ -z "$DB_FILE" ] || [ -z "$ENVIRONMENT" ]; then
        print_usage
        exit 1
    fi

    # Validate environment
    if [[ ! -v CONTAINERS[$ENVIRONMENT] ]]; then
        echo "❌ Error: Unknown environment '$ENVIRONMENT'"
        echo ""
        print_usage
        exit 1
    fi

    # Check dependencies
    check_sqlite3

    # Validate database file
    validate_db_file "$DB_FILE"

    # Show database info
    show_db_info "$DB_FILE"

    # Get confirmation
    if [[ "$ENVIRONMENT" == "vps-production" ]]; then
        confirm_production_import
    else
        confirm_import "$ENVIRONMENT"
    fi

    # Get container name
    CONTAINER="${CONTAINERS[$ENVIRONMENT]}"

    # Import based on environment
    echo ""
    case $ENVIRONMENT in
        local-dev|local-staging)
            import_to_local "$CONTAINER" "$DB_FILE"
            ;;
        vps-staging|vps-production)
            import_to_vps "$CONTAINER" "$DB_FILE" "$ENVIRONMENT"
            ;;
    esac

    # Success message
    echo ""
    echo "✅ Import completed successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Verify data in the application"
    echo "  2. Check logs: docker logs $CONTAINER"

    if [[ "$ENVIRONMENT" == vps-* ]]; then
        echo "  3. Check health: curl https://your-domain.com/health"
    else
        echo "  3. Open application: http://localhost:${PORT:-4000}"
    fi

    echo ""
    echo "Rollback (if needed):"
    echo "  Backup file: ${BACKUP_DIR}/backup-before-import-${TIMESTAMP}.db"
    echo "  Restore: $0 ${BACKUP_DIR}/backup-before-import-${TIMESTAMP}.db $ENVIRONMENT"
    echo ""
}

# Run main function
main
