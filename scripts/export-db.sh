#!/bin/bash
# Quote Calculator v3.0 - Database Export Script
# ============================================================================
# Экспорт SQLite базы данных из указанного окружения
#
# Usage:
#   ./scripts/export-db.sh <environment>
#
# Environments:
#   local-dev       - Локальный development контейнер
#   local-staging   - Локальный staging контейнер
#   vps-staging     - VPS staging контейнер (через SSH)
#   vps-production  - VPS production контейнер (через SSH)
#
# Examples:
#   ./scripts/export-db.sh local-dev
#   ./scripts/export-db.sh vps-production
#
# Output:
#   Файл сохраняется в ./db-exports/quotes-{env}-{timestamp}.db
# ============================================================================

set -e  # Exit on error

# ============================================================================
# Configuration
# ============================================================================

ENVIRONMENT=${1:-local-dev}
OUTPUT_DIR="./db-exports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="quotes-${ENVIRONMENT}-${TIMESTAMP}.db"
OUTPUT_PATH="${OUTPUT_DIR}/${OUTPUT_FILE}"

# VPS configuration (настройте перед использованием)
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
    echo "Usage: $0 <environment>"
    echo ""
    echo "Environments:"
    echo "  local-dev       - Local development container"
    echo "  local-staging   - Local staging container"
    echo "  vps-staging     - VPS staging container (via SSH)"
    echo "  vps-production  - VPS production container (via SSH)"
    echo ""
    echo "Example:"
    echo "  $0 local-dev"
    echo "  $0 vps-production"
}

check_sqlite3() {
    if ! command -v sqlite3 &> /dev/null; then
        echo "❌ Error: sqlite3 not found. Please install it:"
        echo "   macOS: brew install sqlite3"
        echo "   Ubuntu: apt install sqlite3"
        exit 1
    fi
}

get_db_info() {
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

    # Last modified dates
    echo ""
    echo "Last modifications:"
    sqlite3 "$db_file" <<EOF
.mode column
SELECT 'Last estimate: ' || MAX(updated_at) FROM estimates
UNION ALL
SELECT 'Last backup: ' || MAX(updated_at) FROM backups;
EOF
}

# ============================================================================
# Export Functions
# ============================================================================

export_local() {
    local container=$1

    echo "🔍 Checking if container '$container' is running..."

    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "❌ Error: Container '$container' is not running"
        echo ""
        echo "Available containers:"
        docker ps --format "table {{.Names}}\t{{.Status}}"
        exit 1
    fi

    echo "📦 Exporting database from local container..."

    # Copy database from container
    if docker cp "${container}:/app/db/quotes.db" "$OUTPUT_PATH" 2>/dev/null; then
        echo "✅ Database exported successfully!"
    else
        echo "⚠️  Warning: Could not find /app/db/quotes.db"
        echo "    Trying alternative path /app/db/..."

        # Try to find DB file in container
        echo "    Searching for database..."
        docker exec "$container" find /app -name "*.db" -type f
        exit 1
    fi
}

export_vps() {
    local container=$1
    local env_name=$2

    echo "🔍 Checking VPS connection..."

    # Test SSH connection
    if ! ssh -q "${VPS_USER}@${VPS_HOST}" "echo 'SSH OK'" 2>/dev/null; then
        echo "❌ Error: Cannot connect to VPS"
        echo "   Host: ${VPS_USER}@${VPS_HOST}"
        echo ""
        echo "Please configure VPS_HOST and VPS_USER environment variables:"
        echo "   export VPS_HOST=your-vps-ip"
        echo "   export VPS_USER=deployer"
        exit 1
    fi

    echo "🔍 Checking if container '$container' is running on VPS..."

    if ! ssh "${VPS_USER}@${VPS_HOST}" "docker ps --format '{{.Names}}' | grep -q '^${container}$'"; then
        echo "❌ Error: Container '$container' is not running on VPS"
        echo ""
        echo "Available containers on VPS:"
        ssh "${VPS_USER}@${VPS_HOST}" "docker ps --format 'table {{.Names}}\t{{.Status}}'"
        exit 1
    fi

    echo "📦 Exporting database from VPS $env_name..."

    # Copy DB from container to VPS temp directory
    ssh "${VPS_USER}@${VPS_HOST}" \
        "docker cp ${container}:/app/db/quotes.db /tmp/quotes-export.db"

    # Download from VPS to local
    scp "${VPS_USER}@${VPS_HOST}:/tmp/quotes-export.db" "$OUTPUT_PATH"

    # Cleanup temp file on VPS
    ssh "${VPS_USER}@${VPS_HOST}" "rm /tmp/quotes-export.db"

    echo "✅ Database exported successfully from VPS!"
}

# ============================================================================
# Main Script
# ============================================================================

main() {
    echo ""
    echo "🗄️  Quote Calculator - Database Export"
    echo "========================================"
    echo ""

    # Validate environment
    if [[ ! -v CONTAINERS[$ENVIRONMENT] ]]; then
        echo "❌ Error: Unknown environment '$ENVIRONMENT'"
        echo ""
        print_usage
        exit 1
    fi

    # Check sqlite3 availability
    check_sqlite3

    # Create output directory
    mkdir -p "$OUTPUT_DIR"

    # Get container name
    CONTAINER="${CONTAINERS[$ENVIRONMENT]}"

    # Export based on environment
    case $ENVIRONMENT in
        local-dev|local-staging)
            export_local "$CONTAINER"
            ;;
        vps-staging|vps-production)
            export_vps "$CONTAINER" "$ENVIRONMENT"
            ;;
    esac

    # Verify exported file
    if [ ! -f "$OUTPUT_PATH" ]; then
        echo "❌ Error: Export failed - file not created"
        exit 1
    fi

    # Check database integrity
    echo ""
    echo "🔍 Verifying database integrity..."

    if sqlite3 "$OUTPUT_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
        echo "✅ Database integrity: OK"
    else
        echo "❌ Database integrity check failed!"
        exit 1
    fi

    # Display database information
    get_db_info "$OUTPUT_PATH"

    # Success message
    echo ""
    echo "✅ Export completed successfully!"
    echo "📁 File: $OUTPUT_PATH"
    echo ""
    echo "Next steps:"
    echo "  1. Check database: npm run db:check $OUTPUT_PATH"
    echo "  2. Import to another environment: npm run db:import <target-env> $OUTPUT_PATH"
    echo ""
}

# Run main function
main
