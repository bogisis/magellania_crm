#!/bin/bash
# Quote Calculator - VPS Backup Script
# Automated backup for production and staging databases on VPS
# 
# Usage:
#   ./scripts/backup-vps.sh
#
# Cron (daily at 3:00 AM):
#   0 3 * * * /home/deployer/quote-calculator/scripts/backup-vps.sh >> /home/deployer/quote-calculator/backup.log 2>&1

# ============================================================================
# Configuration
# ============================================================================

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/backups
PROJECT_DIR=/opt/quote-calculator

# Создать директорию для backup если не существует
mkdir -p ${BACKUP_DIR}

# ============================================================================
# Backup Production Database
# ============================================================================

echo "[$(date)] Starting production backup..."

# Backup SQLite database из контейнера
docker exec quote-production sqlite3 /app/db/quotes.db ".backup /app/db/backup_prod_${DATE}.db"

# Копировать backup из контейнера на хост
docker cp quote-production:/app/db/backup_prod_${DATE}.db ${BACKUP_DIR}/prod_${DATE}.db

# Проверить успешность backup
if [ $? -eq 0 ]; then
    echo "[$(date)] ✓ Production backup completed: prod_${DATE}.db"
    
    # Удалить временный backup из контейнера
    docker exec quote-production rm /app/db/backup_prod_${DATE}.db
else
    echo "[$(date)] ✗ Production backup failed!"
fi

# ============================================================================
# Backup Staging Database
# ============================================================================

echo "[$(date)] Starting staging backup..."

# Backup SQLite database из контейнера
docker exec quote-staging sqlite3 /app/db/quotes.db ".backup /app/db/backup_staging_${DATE}.db"

# Копировать backup из контейнера на хост
docker cp quote-staging:/app/db/backup_staging_${DATE}.db ${BACKUP_DIR}/staging_${DATE}.db

# Проверить успешность backup
if [ $? -eq 0 ]; then
    echo "[$(date)] ✓ Staging backup completed: staging_${DATE}.db"
    
    # Удалить временный backup из контейнера
    docker exec quote-staging rm /app/db/backup_staging_${DATE}.db
else
    echo "[$(date)] ✗ Staging backup failed!"
fi

# ============================================================================
# Cleanup старых backups (хранить только последние 7 дней)
# ============================================================================

echo "[$(date)] Cleaning up old backups..."

find ${BACKUP_DIR} -name "prod_*.db" -mtime +7 -delete
find ${BACKUP_DIR} -name "staging_*.db" -mtime +7 -delete

echo "[$(date)] ✓ Cleanup completed"

# ============================================================================
# Backup summary
# ============================================================================

echo "[$(date)] ============================================"
echo "[$(date)] Backup summary:"
echo "[$(date)]   Production: ${BACKUP_DIR}/prod_${DATE}.db"
echo "[$(date)]   Staging:    ${BACKUP_DIR}/staging_${DATE}.db"
echo "[$(date)] "
echo "[$(date)] Total backups in directory:"
ls -lh ${BACKUP_DIR}/*.db | wc -l
echo "[$(date)] ============================================"

# ============================================================================
# Optional: Compress old backups (старше 1 дня)
# ============================================================================

# Раскомментировать если нужна компрессия:
# find ${BACKUP_DIR} -name "*.db" -mtime +1 ! -name "*.gz" -exec gzip {} \;

# ============================================================================
# Optional: Upload to remote storage
# ============================================================================

# Пример для AWS S3:
# aws s3 cp ${BACKUP_DIR}/prod_${DATE}.db s3://my-bucket/backups/

# Пример для rsync на другой сервер:
# rsync -avz ${BACKUP_DIR}/prod_${DATE}.db backup-server:/backups/

