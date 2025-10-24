#!/bin/bash
set -e

echo "💾 Creating pre-deployment backup..."

BACKUP_DIR="/tmp/backups/pre-deploy"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"
mkdir -p $BACKUP_PATH

# Backup через временный контейнер
docker run --rm \
  -v quote-prod-catalog:/source:ro \
  -v $BACKUP_PATH:/backup \
  alpine tar czf /backup/catalog.tar.gz -C /source .

docker run --rm \
  -v quote-prod-estimate:/source:ro \
  -v $BACKUP_PATH:/backup \
  alpine tar czf /backup/estimate.tar.gz -C /source .

docker run --rm \
  -v quote-prod-backup:/source:ro \
  -v $BACKUP_PATH:/backup \
  alpine tar czf /backup/backup.tar.gz -C /source .

echo "✅ Бэкап сохранён: $BACKUP_PATH"
