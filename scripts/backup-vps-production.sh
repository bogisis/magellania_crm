#!/bin/bash
# Quote Calculator v3.0 - VPS Production Backup Script
# ============================================================================
# Автоматический бэкап production базы данных и volumes на VPS
#
# Usage:
#   ./scripts/backup-vps-production.sh
#
# Cron example (daily at 2 AM):
#   0 2 * * * /opt/quote-calculator/scripts/backup-vps-production.sh >> /opt/logs/backup.log 2>&1
#
# Features:
#   - Backup SQLite database
#   - Backup catalog volume
#   - Daily и weekly retention policies
#   - Automatic cleanup of old backups
#   - Email notifications (опционально)
# ============================================================================

set -e  # Exit on error

# ============================================================================
# Configuration
# ============================================================================

BACKUP_ROOT="${BACKUP_ROOT:-/opt/backups/quote-production}"
DATE=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday

DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"

CONTAINER_NAME="quote-production"

# Retention policies (days)
DAILY_RETENTION=7   # Keep daily backups for 7 days
WEEKLY_RETENTION=28  # Keep weekly backups for 4 weeks

# Email notifications (set EMAIL_TO to enable)
EMAIL_TO="${BACKUP_EMAIL_TO:-}"
EMAIL_FROM="${BACKUP_EMAIL_FROM:-backup@quotes.local}"

# ============================================================================
# Helper Functions
# ============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

send_notification() {
    local subject=$1
    local message=$2

    if [ -n "$EMAIL_TO" ]; then
        echo "$message" | mail -s "$subject" -r "$EMAIL_FROM" "$EMAIL_TO"
    fi
}

check_container() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log "❌ Error: Container '$CONTAINER_NAME' is not running"
        send_notification "Backup Failed: Container not running" "Production container is not running. Backup aborted."
        exit 1
    fi
}

# ============================================================================
# Backup Functions
# ============================================================================

backup_database() {
    log "📦 Backing up SQLite database..."

    mkdir -p "$DAILY_DIR"

    local db_backup_file="$DAILY_DIR/quotes-db-$DATE.db"

    # Copy database from container
    if docker cp "${CONTAINER_NAME}:/app/db/quotes.db" "$db_backup_file"; then
        log "✅ Database backed up: $db_backup_file"

        # Verify integrity
        if sqlite3 "$db_backup_file" "PRAGMA integrity_check;" | grep -q "ok"; then
            log "✅ Database integrity verified"

            # Get record counts
            local estimates=$(sqlite3 "$db_backup_file" "SELECT COUNT(*) FROM estimates;")
            log "   Estimates: $estimates"

            # Create weekly backup on Sunday
            if [ "$DAY_OF_WEEK" -eq 7 ]; then
                mkdir -p "$WEEKLY_DIR"
                local week_num=$(date +%W)
                cp "$db_backup_file" "$WEEKLY_DIR/quotes-db-week-${week_num}.db"
                log "✅ Weekly backup created: week-${week_num}"
            fi
        else
            log "❌ Database integrity check failed!"
            send_notification "Backup Warning: Integrity Check Failed" "Database backup created but integrity check failed."
        fi
    else
        log "❌ Error: Failed to backup database"
        send_notification "Backup Failed: Database Copy Error" "Could not copy database from container."
        exit 1
    fi
}

backup_catalog() {
    log "📦 Backing up catalog volume..."

    local catalog_backup="$DAILY_DIR/catalog-$DATE.tar.gz"

    # Backup catalog volume using temporary container
    if docker run --rm \
        -v quote-prod-catalog:/source:ro \
        -v "$DAILY_DIR":/backup \
        alpine tar czf "/backup/catalog-$DATE.tar.gz" -C /source . 2>/dev/null; then

        log "✅ Catalog backed up: $catalog_backup"
    else
        log "⚠️  Warning: Failed to backup catalog volume"
    fi
}

cleanup_old_backups() {
    log "🧹 Cleaning up old backups..."

    # Delete daily backups older than retention period
    local deleted_daily=$(find "$DAILY_DIR" -name "quotes-db-*.db" -mtime +$DAILY_RETENTION -delete -print | wc -l)
    if [ "$deleted_daily" -gt 0 ]; then
        log "   Deleted $deleted_daily old daily database backups"
    fi

    deleted_daily=$(find "$DAILY_DIR" -name "catalog-*.tar.gz" -mtime +$DAILY_RETENTION -delete -print | wc -l)
    if [ "$deleted_daily" -gt 0 ]; then
        log "   Deleted $deleted_daily old daily catalog backups"
    fi

    # Delete weekly backups older than retention period
    if [ -d "$WEEKLY_DIR" ]; then
        local deleted_weekly=$(find "$WEEKLY_DIR" -name "quotes-db-*.db" -mtime +$WEEKLY_RETENTION -delete -print | wc -l)
        if [ "$deleted_weekly" -gt 0 ]; then
            log "   Deleted $deleted_weekly old weekly backups"
        fi
    fi
}

calculate_backup_size() {
    log "📊 Backup statistics..."

    if [ -d "$BACKUP_ROOT" ]; then
        local total_size=$(du -sh "$BACKUP_ROOT" | awk '{print $1}')
        local daily_count=$(ls -1 "$DAILY_DIR"/quotes-db-*.db 2>/dev/null | wc -l)
        local weekly_count=$(ls -1 "$WEEKLY_DIR"/quotes-db-*.db 2>/dev/null | wc -l)

        log "   Total backup size: $total_size"
        log "   Daily backups: $daily_count"
        log "   Weekly backups: $weekly_count"
    fi
}

# ============================================================================
# Main Script
# ============================================================================

main() {
    log "🗄️  Starting production backup..."
    log "======================================"

    # Check if running on VPS (optional safety check)
    if [ ! -f "/opt/quote-calculator/.env.production" ]; then
        log "⚠️  Warning: Not running on production VPS?"
    fi

    # Check container is running
    check_container

    # Perform backups
    backup_database
    backup_catalog

    # Cleanup old backups
    cleanup_old_backups

    # Show statistics
    calculate_backup_size

    log "✅ Backup completed successfully!"

    # Send success notification
    send_notification "Backup Successful: Quote Calculator Production" \
        "Production backup completed at $(date '+%Y-%m-%d %H:%M:%S')"
}

# Run main function
main
