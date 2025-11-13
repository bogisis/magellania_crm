# Quote Calculator v3.0 - Docker Deployment Guide

## Quick Start

### Production Deployment (Single User)

```bash
# Build and start production container
docker-compose up -d quote-production

# Check logs
docker-compose logs -f quote-production

# Check health
curl http://localhost:4000/api/health

# Open app
# Navigate to http://localhost:4000
```

### Development Mode

```bash
# Build and start development container
docker-compose -f docker-compose.dev.yml up

# With code hot-reload (bind mounts)
docker-compose -f docker-compose.dev.yml up
```

### Staging + Production

```bash
# Start both environments
docker-compose up -d quote-production quote-staging

# Production: http://localhost:4000
# Staging: http://localhost:4001
```

## Docker Architecture

### Multi-Stage Build

```
Dockerfile:
├── base     (Node.js 18 Alpine + SQLite)
├── deps     (Production dependencies)
├── dev      (Development with all dependencies)
└── prod     (Minimal production image)
```

### Persistent Volumes

**Production:**
- `prod-db` - SQLite database (quotes.db)
- `prod-logs` - Winston logs (combined.log, error.log)
- `prod-catalog` - Service catalogs
- `prod-estimate` - Legacy file storage (if dual-write enabled)
- `prod-backup` - Legacy backups (if dual-write enabled)
- `prod-settings` - Application settings

**Staging:**
- Separate volumes: `staging-db`, `staging-logs`, etc.
- Read-only access to production volumes for data copying

### Ports

- **Production**: 4000 (host) → 4000 (container)
- **Staging**: 4001 (host) → 4000 (container)

## Environment Variables

Create `.env` file from `.env.example`:

```bash
cp .env.example .env
```

**Key Variables:**
```env
NODE_ENV=production
STORAGE_TYPE=sqlite
DUAL_WRITE_MODE=false
LOG_LEVEL=info
LOG_CONSOLE=false
PORT=4000
```

## Docker Commands

### Build

```bash
# Build production image
docker-compose build quote-production

# Build specific stage (dev)
docker-compose build --build-arg NODE_VERSION=18 quote-production

# Build without cache
docker-compose build --no-cache quote-production
```

### Run

```bash
# Start production (detached)
docker-compose up -d quote-production

# Start with logs visible
docker-compose up quote-production

# Start staging
docker-compose up -d quote-staging

# Start both
docker-compose up -d
```

### Logs

```bash
# View logs (follow)
docker-compose logs -f quote-production

# Last 100 lines
docker-compose logs --tail=100 quote-production

# All containers
docker-compose logs -f
```

### Health Check

```bash
# Via curl
curl http://localhost:4000/api/health

# Via docker (inside container)
docker exec quote-prod node -e "require('http').get('http://localhost:4000/api/health', (r) => {console.log(r.statusCode)})"

# View health status
docker ps
# Look for "healthy" in STATUS column
```

### Stop/Remove

```bash
# Stop containers
docker-compose stop

# Stop specific
docker-compose stop quote-production

# Stop and remove
docker-compose down

# Remove with volumes (⚠️ DELETES DATA)
docker-compose down -v
```

## Backup Strategy

### Manual Backup

```bash
# Backup SQLite database
docker cp quote-prod:/usr/src/app/db/quotes.db ./backups/quotes-$(date +%Y%m%d-%H%M%S).db

# Backup all volumes
docker run --rm \
  -v quote-prod-db:/backup/db:ro \
  -v $(pwd)/backups:/archive \
  alpine tar -czf /archive/full-backup-$(date +%Y%m%d-%H%M%S).tar.gz /backup
```

### Automated Backup (Optional)

```bash
# Start backup service (runs hourly)
docker-compose --profile backup up -d backup-service

# Check backups
ls -lh ./backups/
```

## Data Migration

### From File Storage to SQLite (in Docker)

```bash
# 1. Start container with file storage
STORAGE_TYPE=file docker-compose up -d quote-production

# 2. Copy existing files to container
docker cp ./estimate quote-prod:/usr/src/app/estimate
docker cp ./backup quote-prod:/usr/src/app/backup
docker cp ./catalog quote-prod:/usr/src/app/catalog

# 3. Run migration inside container
docker exec -it quote-prod npm run migrate:run

# 4. Switch to SQLite
docker-compose down
# Edit .env: STORAGE_TYPE=sqlite
docker-compose up -d quote-production
```

### Between Staging and Production

```bash
# Copy staging DB to production (CAREFUL!)
docker cp quote-staging:/usr/src/app/db/quotes.db /tmp/staging-quotes.db
docker cp /tmp/staging-quotes.db quote-prod:/usr/src/app/db/quotes.db

# Restart production
docker-compose restart quote-production
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs quote-production

# Check container status
docker ps -a

# Inspect container
docker inspect quote-prod

# Enter container
docker exec -it quote-prod sh
```

### Database Locked

```bash
# WAL mode should prevent this, but if it happens:

# 1. Stop container
docker-compose stop quote-production

# 2. Checkpoint WAL (inside stopped container won't work, copy out)
docker cp quote-prod:/usr/src/app/db/quotes.db /tmp/
sqlite3 /tmp/quotes.db "PRAGMA wal_checkpoint(FULL);"

# 3. Copy back
docker cp /tmp/quotes.db quote-prod:/usr/src/app/db/quotes.db

# 4. Restart
docker-compose start quote-production
```

### High Memory Usage

```bash
# Check resource usage
docker stats quote-prod

# Adjust limits in docker-compose.yml:
deploy:
  resources:
    limits:
      memory: 256M  # Reduce if needed
```

### Logs Growing Too Large

```bash
# Check log size
docker inspect quote-prod --format='{{.LogPath}}'
ls -lh /var/lib/docker/containers/.../...json.log

# Rotate logs (configured in docker-compose.yml):
logging:
  options:
    max-size: "10m"  # Adjust if needed
    max-file: "3"
```

## Security

### Non-Root User

Container runs as `nodejs` user (UID 1001):

```bash
# Verify
docker exec quote-prod whoami
# Output: nodejs
```

### Health Checks

Automatic health monitoring:

```bash
# View health status
docker ps
# STATUS shows "healthy" or "unhealthy"

# Manual health check
curl http://localhost:4000/api/health
```

### Resource Limits

Production limits (docker-compose.yml):
- CPU: 1.0 limit, 0.5 reservation
- Memory: 512M limit, 256M reservation

## Monitoring

### Watchtower (Auto-Updates)

Enabled by default for prod/staging:

```bash
# Start watchtower (separate compose file)
docker-compose -f docker-compose.watchtower.yml up -d

# Watchtower will:
# - Check for new images
# - Pull and restart containers
# - Respect stop-timeout: 30s
```

### Winston Logs

Logs are persisted in `prod-logs` volume:

```bash
# View logs inside container
docker exec quote-prod cat /usr/src/app/logs/combined.log
docker exec quote-prod cat /usr/src/app/logs/error.log

# Copy logs to host
docker cp quote-prod:/usr/src/app/logs ./container-logs
```

## Performance

### Image Size

```bash
# Check image size
docker images quote-calculator

# Typical sizes:
# - Base: ~150MB
# - Dev: ~250MB
# - Prod: ~180MB
```

### Build Cache

```bash
# Use BuildKit for faster builds
DOCKER_BUILDKIT=1 docker-compose build

# Clear cache if needed
docker builder prune
```

## Cloud Deployment

### VPS Deployment (Generic)

```bash
# 1. SSH to VPS
ssh user@your-vps.com

# 2. Install Docker + Docker Compose
# (varies by OS)

# 3. Clone/upload code
git clone <repo> quote-calculator
cd quote-calculator

# 4. Configure
cp .env.example .env
nano .env  # Edit as needed

# 5. Start
docker-compose up -d quote-production

# 6. Setup nginx reverse proxy (optional)
# See DEPLOYMENT.md for nginx config
```

### Recommended VPS Specs (Single User)

- **CPU**: 1 core minimum
- **RAM**: 512MB minimum (1GB recommended)
- **Disk**: 10GB minimum
- **OS**: Ubuntu 22.04 LTS or similar

## NPM Scripts

Convenience scripts in `package.json`:

```bash
# Build
npm run docker:build

# Start
npm run docker:up

# Stop
npm run docker:down

# View logs
npm run docker:logs

# Health check
npm run docker:health

# Backup
npm run docker:backup

# Deploy (build + up)
npm run docker:deploy
```

## FAQ

**Q: Can I use Docker for development?**
A: Yes! Use `docker-compose.dev.yml` with bind mounts for hot-reload.

**Q: How do I update to a new version?**
A: Rebuild the image: `docker-compose build && docker-compose up -d`

**Q: Where is my data stored?**
A: In Docker named volumes. Use `docker volume inspect quote-prod-db` to see location.

**Q: Can I run multiple instances?**
A: Yes, but this is a **single-user app**. Multi-tenant support is built in but not exposed in UI.

**Q: What if I lose my data?**
A: Always backup! See "Backup Strategy" section above.

## Support

For issues:
1. Check logs: `docker-compose logs -f`
2. Check health: `curl http://localhost:4000/api/health`
3. Inspect container: `docker inspect quote-prod`
4. Check file permissions: `docker exec quote-prod ls -la /usr/src/app`

---

**Version**: 3.0.0
**Last Updated**: October 28, 2025
