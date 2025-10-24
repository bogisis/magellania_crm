#!/bin/bash
set -e  # Exit on any error

echo "🚀 Starting deployment..."

# ========== Configuration ==========
IMAGE_NAME="quote-calculator"
CONTAINER_NAME="quote-prod"
BACKUP_DIR="/tmp/backups/pre-deploy"
HEALTH_CHECK_URL="http://localhost:3005/health"

# ========== Pre-deployment checks ==========
echo "🔍 Pre-deployment checks..."

# Check if production is running
if ! docker ps | grep -q $CONTAINER_NAME; then
    echo "⚠️  Production container not running!"
    exit 1
fi

# Check production health
if ! curl -f $HEALTH_CHECK_URL > /dev/null 2>&1; then
    echo "❌ Production is unhealthy! Aborting deployment."
    exit 1
fi

# ========== Backup ==========
echo "💾 Creating backup..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"
mkdir -p $BACKUP_PATH

# Backup volumes
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

# ========== Pull new image ==========
echo "📦 Pulling new image..."
docker pull $IMAGE_NAME:latest

# ========== Start new container on temp port ==========
echo "🔄 Starting new container..."
docker run -d \
  --name ${CONTAINER_NAME}-new \
  -p 3007:3000 \
  -v quote-prod-catalog:/app/catalog \
  -v quote-prod-estimate:/app/estimate \
  -v quote-prod-backup:/app/backup \
  -e NODE_ENV=production \
  -e APP_ENV=production \
  $IMAGE_NAME:latest

# ========== Health check new container ==========
echo "🏥 Health checking new container..."
sleep 5

MAX_RETRIES=12
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f http://localhost:3007/health > /dev/null 2>&1; then
        echo "✅ New container is healthy!"
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo "❌ New container failed health check! Rolling back..."
        docker stop ${CONTAINER_NAME}-new
        docker rm ${CONTAINER_NAME}-new
        exit 1
    fi

    echo "⏳ Waiting for health check... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 5
done

# ========== Switch traffic ==========
echo "🔀 Switching traffic..."

# Stop old container
docker stop $CONTAINER_NAME

# Rename containers
docker rename $CONTAINER_NAME ${CONTAINER_NAME}-old
docker rename ${CONTAINER_NAME}-new $CONTAINER_NAME

# Update port mapping (stop and start with correct port)
docker stop $CONTAINER_NAME
docker rm $CONTAINER_NAME

docker run -d \
  --name $CONTAINER_NAME \
  -p 3005:3000 \
  -v quote-prod-catalog:/app/catalog \
  -v quote-prod-estimate:/app/estimate \
  -v quote-prod-backup:/app/backup \
  -e NODE_ENV=production \
  -e APP_ENV=production \
  --restart unless-stopped \
  $IMAGE_NAME:latest

# Wait for final health check
sleep 5
if curl -f $HEALTH_CHECK_URL > /dev/null 2>&1; then
    echo "✅ Deployment successful!"

    # Cleanup old container
    docker rm ${CONTAINER_NAME}-old

    # Update staging
    echo "🔄 Updating staging..."
    docker-compose up -d quote-staging
else
    echo "❌ Final health check failed!"
    exit 1
fi

echo "🎉 Deployment completed successfully!"
