#!/bin/bash
set -e

echo "🚀 Promoting Staging to Production"
echo "=================================="

# ========== Configuration ==========
STAGING_URL="http://localhost:3006/health"
PROD_URL="http://localhost:3005/health"
BACKUP_DIR="/tmp/backups/pre-promote"
IMAGE_NAME="${DOCKER_USERNAME:-quote-calculator}"

# ========== Pre-promotion checks ==========
echo ""
echo "🔍 Pre-promotion checks..."

# Check staging is healthy
echo "   Checking staging health..."
if ! curl -f $STAGING_URL > /dev/null 2>&1; then
    echo "   ❌ Staging is unhealthy! Cannot promote."
    exit 1
fi
echo "   ✅ Staging is healthy"

# Check production is running
echo "   Checking production status..."
if ! docker ps | grep -q quote-prod; then
    echo "   ⚠️  Production container not running!"
    read -p "   Start production first? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose up -d quote-production
        sleep 5
    else
        exit 1
    fi
fi
echo "   ✅ Production is running"

# ========== Confirmation ==========
echo ""
echo "⚠️  WARNING: This will promote staging to production!"
echo ""
echo "Current versions:"
docker exec quote-staging curl -s http://localhost:3000/health | grep -o '"version":"[^"]*"' || echo "staging version: unknown"
docker exec quote-prod curl -s http://localhost:3000/health | grep -o '"version":"[^"]*"' || echo "production version: unknown"
echo ""

read -p "Continue with promotion? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Promotion cancelled"
    exit 1
fi

# ========== Backup production ==========
echo ""
echo "💾 Creating production backup..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"
mkdir -p $BACKUP_PATH

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

echo "✅ Backup saved: $BACKUP_PATH"

# ========== Get staging image ==========
echo ""
echo "📦 Getting staging image..."

# Get staging container's image
STAGING_IMAGE=$(docker inspect quote-staging --format='{{.Config.Image}}')
echo "   Staging image: $STAGING_IMAGE"

# ========== Deploy to production ==========
echo ""
echo "🔄 Deploying to production..."

# Stop production container
docker stop quote-prod

# Remove old container
docker rm quote-prod

# Run new container with staging image
# ВАЖНО: Используем staging код, НО production volumes (данные не трогаются!)
docker run -d \
  --name quote-prod \
  -p 3005:3000 \
  -v quote-prod-catalog:/app/catalog \
  -v quote-prod-estimate:/app/estimate \
  -v quote-prod-backup:/app/backup \
  -e NODE_ENV=production \
  -e APP_ENV=production \
  -e PORT=3000 \
  --restart unless-stopped \
  $STAGING_IMAGE

# ========== Health check ==========
echo ""
echo "🏥 Health checking production..."
sleep 10

MAX_RETRIES=12
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f $PROD_URL > /dev/null 2>&1; then
        echo "✅ Production is healthy!"
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo "❌ Production failed health check! Rolling back..."
        
        # Rollback
        docker stop quote-prod
        docker rm quote-prod
        
        # Restore from backup
        docker run --rm \
          -v quote-prod-catalog:/target \
          -v $BACKUP_PATH:/backup:ro \
          alpine sh -c "cd /target && tar xzf /backup/catalog.tar.gz"
        
        docker run --rm \
          -v quote-prod-estimate:/target \
          -v $BACKUP_PATH:/backup:ro \
          alpine sh -c "cd /target && tar xzf /backup/estimate.tar.gz"
        
        docker run --rm \
          -v quote-prod-backup:/target \
          -v $BACKUP_PATH:/backup:ro \
          alpine sh -c "cd /target && tar xzf /backup/backup.tar.gz"
        
        # Restart old version
        docker-compose up -d quote-production
        
        echo "❌ Rollback completed. Check logs for errors."
        exit 1
    fi

    echo "⏳ Waiting for health check... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 5
done

# ========== Success ==========
echo ""
echo "======================================"
echo "✅ PROMOTION SUCCESSFUL!"
echo "======================================"
echo ""
echo "Production is now running staging code"
echo "Production data was NOT modified (preserved)"
echo "Backup available at: $BACKUP_PATH"
echo ""
echo "🔗 Production: http://localhost:3005"
echo ""

# Optional: Tag the promoted image as latest
read -p "Tag this image as 'latest' in Docker Hub? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -n "$DOCKER_USERNAME" ]; then
        docker tag $STAGING_IMAGE $DOCKER_USERNAME/quote-calculator:latest
        docker push $DOCKER_USERNAME/quote-calculator:latest
        echo "✅ Pushed to Docker Hub as 'latest'"
    else
        echo "⚠️  DOCKER_USERNAME not set, skipping Docker Hub push"
    fi
fi

echo ""
echo "🎉 Promotion completed!"
