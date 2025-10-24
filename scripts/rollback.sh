#!/bin/bash
set -e

echo "⏪ Starting rollback..."

BACKUP_DIR="/tmp/backups/pre-deploy"
LATEST_BACKUP=$(ls -t $BACKUP_DIR | head -1)

if [ -z "$LATEST_BACKUP" ]; then
    echo "❌ No backup found!"
    exit 1
fi

echo "📦 Rolling back to: $LATEST_BACKUP"

# Stop current container
docker stop quote-prod
docker rm quote-prod

# Restore volumes from backup
docker run --rm \
  -v quote-prod-catalog:/target \
  -v $BACKUP_DIR/$LATEST_BACKUP:/backup:ro \
  alpine sh -c "cd /target && tar xzf /backup/catalog.tar.gz"

docker run --rm \
  -v quote-prod-estimate:/target \
  -v $BACKUP_DIR/$LATEST_BACKUP:/backup:ro \
  alpine sh -c "cd /target && tar xzf /backup/estimate.tar.gz"

docker run --rm \
  -v quote-prod-backup:/target \
  -v $BACKUP_DIR/$LATEST_BACKUP:/backup:ro \
  alpine sh -c "cd /target && tar xzf /backup/backup.tar.gz"

# Start previous version
docker-compose up -d quote-production

echo "✅ Rollback completed!"
