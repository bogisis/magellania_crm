# Docker Deployment Guide

> **Quote Calculator v3.0 - Production-Ready Docker Deployment**

---

## 📋 Содержание

- [Quick Start](#quick-start)
- [Архитектура](#архитектура)
- [Гарантии сохранности данных](#гарантии-сохранности-данных)
- [Конфигурация](#конфигурация)
- [Docker Commands](#docker-commands)
- [Production + Staging](#production--staging)
- [Backup & Recovery](#backup--recovery)
- [Data Migration](#data-migration)
- [CI/CD Автодеплой](#cicd-автодеплой)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Monitoring](#monitoring)

---

## Quick Start

### За 5 минут: Production

```bash
# 1. Запустить production container
docker-compose up -d quote-production

# 2. Проверить logs
docker-compose logs -f quote-production

# 3. Health check
curl http://localhost:4000/api/health

# 4. Открыть приложение
open http://localhost:4000
```

### Development Mode

```bash
# С hot-reload (bind mounts)
docker-compose -f docker-compose.dev.yml up

# Код на хосте автоматически синхронизируется
```

### Production + Staging

```bash
# Запустить оба окружения
docker-compose up -d

# Production: http://localhost:4000
# Staging: http://localhost:4001 (если настроен)
```

---

## Архитектура

### Multi-Stage Build

```
Dockerfile stages:
├── base     → Node.js 18 Alpine + SQLite
├── deps     → Production dependencies
├── dev      → Development (all deps)
└── prod     → Minimal production image
```

**Преимущества:**
- Оптимизированный размер образа (~180MB production)
- Кэширование слоёв для быстрой сборки
- Безопасность (multi-stage удаляет dev dependencies)

### Docker Volumes Architecture

```
┌─────────────────────────────────────────────────┐
│              DOCKER HOST                        │
│                                                 │
│  ┌──────────────────┐   ┌──────────────────┐   │
│  │   PRODUCTION     │   │    STAGING       │   │
│  │   Port: 4000     │   │    Port: 4001    │   │
│  └────────┬─────────┘   └────────┬─────────┘   │
│           │                      │              │
│           ↓                      ↓              │
│  ┌──────────────────┐   ┌──────────────────┐   │
│  │  PROD VOLUMES    │   │ STAGING VOLUMES  │   │
│  │  - db            │   │  - db            │   │
│  │  - logs          │   │  - logs          │   │
│  │  - catalog       │   │  - catalog       │   │
│  │  - estimate      │   │  - estimate      │   │
│  │  - backup        │   │  - backup        │   │
│  └──────────────────┘   └──────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Persistent Volumes

**Production:**
- `prod-db` - SQLite database (quotes.db)
- `prod-logs` - Winston logs (combined.log, error.log)
- `prod-catalog` - Service catalogs
- `prod-estimate` - Estimate files
- `prod-backup` - Backups
- `prod-settings` - Application settings

**Staging:**
- Отдельные volumes: `staging-db`, `staging-logs`, и т.д.
- Read-only доступ к production volumes (для копирования данных)

### Network & Ports

- **Production**: 4000 (host) → 4000 (container)
- **Staging**: 4001 (host) → 4000 (container)
- **Internal**: Containers communicate via Docker network

---

## Гарантии сохранности данных

### Как работают Docker Volumes

**Контейнер ≠ Данные**

```
┌─────────────────────────────────────┐
│  КОНТЕЙНЕР (эфемерный)              │
│  - Удаляется при деплое             │
│  - Пересоздаётся каждый раз         │
│  - НЕ содержит пользовательских     │
│    данных                           │
└─────────────────────────────────────┘
              ↓ монтирует
┌─────────────────────────────────────┐
│  DOCKER VOLUME (постоянный)         │
│  - Живёт независимо от контейнера   │
│  - Остаётся после удаления          │
│  - Содержит ВСЕ данные              │
│    пользователей                    │
└─────────────────────────────────────┘
```

### Сценарии и гарантии

| Сценарий | Данные сохранены? | Почему |
|----------|-------------------|--------|
| **Деплой нового образа** | ✅ ДА | Volumes не связаны с образами |
| **Контейнер упал** | ✅ ДА | Restart монтирует те же volumes |
| **Удалить контейнер** | ✅ ДА | `docker rm` не трогает volumes |
| **Удалить образ** | ✅ ДА | Образы и volumes независимы |
| **Перезагрузка хоста** | ✅ ДА | Volumes хранятся на диске |
| **docker-compose down** | ✅ ДА | Volumes остаются (если не `-v`) |
| **docker system prune** | ⚠️ ЗАВИСИТ | Unused volumes удалятся! |
| **docker volume rm** | ❌ НЕТ | Явное удаление volume |

### ЕДИНСТВЕННЫЙ способ потерять данные

```bash
# ⚠️ ОПАСНО! Явное удаление volumes
docker-compose down -v          # Флаг -v удаляет volumes!
docker volume rm prod-db        # Явное удаление
docker volume prune             # Удаление unused volumes
```

### 3 уровня защиты данных

#### Level 1: Named Volumes (минимум)

```yaml
# docker-compose.yml
volumes:
  prod-db:
    name: quote-prod-db
  prod-logs:
    name: quote-prod-logs
  prod-catalog:
    name: quote-prod-catalog
```

**Гарантия:** Данные переживают пересоздание контейнеров

#### Level 2: Pre-Deploy Backup (рекомендуется)

```bash
#!/bin/bash
# Автоматический backup перед каждым деплоем

BACKUP_DIR="/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

# Backup через временный контейнер
docker run --rm \
  -v prod-db:/source:ro \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/db.tar.gz -C /source .

echo "✅ Backup saved: $BACKUP_DIR"
```

**Гарантия:** Можно восстановить состояние до деплоя

#### Level 3: Continuous Backup (enterprise)

```yaml
# docker-compose.yml
services:
  backup-service:
    image: offen/docker-volume-backup:latest
    restart: always
    volumes:
      - prod-db:/backup/db:ro
      - prod-logs:/backup/logs:ro
      - /mnt/backups:/archive
    environment:
      - BACKUP_CRON_EXPRESSION=0 * * * *  # Каждый час
      - BACKUP_RETENTION_DAYS=30
```

**Гарантия:** Point-in-time recovery (любой момент за 30 дней)

---

## Конфигурация

### Environment Variables

Создать `.env` файл:

```bash
cp .env.example .env
```

**Основные переменные:**

```env
# Server
NODE_ENV=production
PORT=4000

# Storage
STORAGE_TYPE=sqlite
DB_PATH=db/quotes.db
DUAL_WRITE_MODE=false

# Logging
LOG_LEVEL=info
LOG_CONSOLE=false

# Performance
JSON_LIMIT=50mb
REQUEST_TIMEOUT=30000

# Multi-tenant (опционально)
MULTI_TENANT=false
```

### Docker Compose Configuration

**Файл: docker-compose.yml**

```yaml
version: '3.8'

services:
  # ========== PRODUCTION ==========
  quote-production:
    build:
      context: .
      dockerfile: Dockerfile
      target: prod
      args:
        NODE_VERSION: 18
    image: quote-calculator:latest
    container_name: quote-prod
    ports:
      - "4000:4000"
    volumes:
      # Named volumes для данных
      - prod-db:/usr/src/app/db
      - prod-logs:/usr/src/app/logs
      - prod-catalog:/usr/src/app/catalog
      - prod-estimate:/usr/src/app/estimate
      - prod-backup:/usr/src/app/backup
    environment:
      - NODE_ENV=production
      - STORAGE_TYPE=sqlite
      - LOG_LEVEL=info
      - LOG_CONSOLE=false
      - PORT=4000
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
    labels:
      - com.centurylinklabs.watchtower.enable=true

  # ========== STAGING (optional) ==========
  quote-staging:
    build:
      context: .
      dockerfile: Dockerfile
      target: prod
    image: quote-calculator:staging
    container_name: quote-staging
    ports:
      - "4001:4000"
    volumes:
      - staging-db:/usr/src/app/db
      - staging-logs:/usr/src/app/logs
      - staging-catalog:/usr/src/app/catalog
      - staging-estimate:/usr/src/app/estimate
      - staging-backup:/usr/src/app/backup
      # Read-only доступ к production
      - prod-catalog:/usr/src/app/prod-catalog:ro
      - prod-estimate:/usr/src/app/prod-estimate:ro
    environment:
      - NODE_ENV=staging
      - STORAGE_TYPE=sqlite
      - LOG_LEVEL=debug
      - PORT=4000
    restart: unless-stopped
    depends_on:
      - quote-production
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M

  # ========== BACKUP SERVICE (optional) ==========
  backup-service:
    image: offen/docker-volume-backup:latest
    container_name: quote-backup
    restart: always
    volumes:
      - prod-db:/backup/db:ro
      - prod-logs:/backup/logs:ro
      - ./backups:/archive
    environment:
      - BACKUP_CRON_EXPRESSION=0 * * * *
      - BACKUP_RETENTION_DAYS=30
      - BACKUP_FILENAME=quote-%Y%m%d-%H%M%S.tar.gz
    profiles:
      - backup

# ========== VOLUMES ==========
volumes:
  # Production
  prod-db:
    name: quote-prod-db
  prod-logs:
    name: quote-prod-logs
  prod-catalog:
    name: quote-prod-catalog
  prod-estimate:
    name: quote-prod-estimate
  prod-backup:
    name: quote-prod-backup

  # Staging
  staging-db:
    name: quote-staging-db
  staging-logs:
    name: quote-staging-logs
  staging-catalog:
    name: quote-staging-catalog
  staging-estimate:
    name: quote-staging-estimate
  staging-backup:
    name: quote-staging-backup
```

### Dockerfile (Multi-Stage)

```dockerfile
# ========== Stage 1: Base ==========
FROM node:18-alpine AS base

RUN apk add --no-cache sqlite-dev

WORKDIR /usr/src/app

# ========== Stage 2: Dependencies ==========
FROM base AS deps

COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# ========== Stage 3: Development ==========
FROM base AS dev

COPY package*.json ./
RUN npm install

COPY . .

USER node
EXPOSE 4000

CMD ["npm", "run", "dev"]

# ========== Stage 4: Production ==========
FROM base AS prod

LABEL maintainer="quote-calculator"
LABEL version="3.0.0"

# Copy dependencies
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy application code
COPY server-with-db.js .
COPY apiClient.js .
COPY utils.js .
COPY index.html .
COPY package*.json .

# Storage directories
RUN mkdir -p db catalog estimate backup logs settings && \
    chown -R node:node /usr/src/app

# Non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

EXPOSE 4000

CMD ["node", "server-with-db.js"]
```

### .dockerignore

```
# Dependencies
node_modules
npm-debug.log

# Git
.git
.gitignore

# IDE
.vscode
.idea
*.swp

# Documentation
*.md
docs/

# Tests
__tests__/
coverage/
jest.config.js

# Deployment
docker-compose*.yml
Dockerfile
.dockerignore

# OS
.DS_Store
Thumbs.db

# Data (не включаем в образ)
db/*.db
backup/*
estimate/*.json
catalog/*.json
logs/*.log

# Environment
.env
.env.*
```

---

## Docker Commands

### Build

```bash
# Build production image
docker-compose build quote-production

# Build без cache
docker-compose build --no-cache

# Build с конкретным stage
docker build --target dev -t quote-calculator:dev .
```

### Run

```bash
# Запуск production (detached)
docker-compose up -d quote-production

# Запуск с видимыми логами
docker-compose up quote-production

# Запуск staging
docker-compose up -d quote-staging

# Запуск всех сервисов
docker-compose up -d
```

### Logs

```bash
# View logs (follow)
docker-compose logs -f quote-production

# Last 100 lines
docker-compose logs --tail=100 quote-production

# Все контейнеры
docker-compose logs -f

# Только errors
docker-compose logs quote-production | grep ERROR
```

### Health Check

```bash
# Via curl
curl http://localhost:4000/api/health

# Via docker exec
docker exec quote-prod wget -qO- http://localhost:4000/api/health

# Check container health status
docker ps
# Ищем "healthy" в STATUS column
```

### Stop/Remove

```bash
# Stop containers
docker-compose stop

# Stop конкретный
docker-compose stop quote-production

# Stop и remove
docker-compose down

# Remove with volumes (⚠️ DELETES DATA!)
docker-compose down -v
```

### Inspect

```bash
# Inspect container
docker inspect quote-prod

# Inspect volume
docker volume inspect quote-prod-db

# Container stats
docker stats quote-prod

# Disk usage
docker system df
```

---

## Production + Staging

### Архитектура двух окружений

```
Production (4000)     Staging (4001)
     ↓                     ↓
   prod-db            staging-db
   prod-logs          staging-logs
   prod-catalog       staging-catalog
        ↑                  ↑
        └──────(read-only)─┘
```

**Ключевые принципы:**
1. Production - стабильная версия с real data
2. Staging - тестирование с копией production data
3. Data isolation - каждое окружение имеет свои volumes
4. Read-only access - staging может читать production данные

### Запуск обоих окружений

```bash
# 1. Запустить production и staging
docker-compose up -d

# 2. Проверить статус
docker-compose ps

# 3. Health checks
curl http://localhost:4000/api/health  # Production
curl http://localhost:4001/api/health  # Staging

# 4. Открыть в браузере
open http://localhost:4000  # Production
open http://localhost:4001  # Staging
```

### Workflow: Staging → Production

```
1. Разработка → git push origin staging
   ↓
2. GitHub Actions → АВТОДЕПЛОЙ в STAGING (4001)
   ↓
3. Тестирование на staging
   ↓
4. Создать release → git tag v3.0.0 && git push --tags
   ↓
5. GitHub Actions → ЖДЁТ APPROVAL от admin
   ↓
6. Admin утверждает → ДЕПЛОЙ в PRODUCTION (4000)
   ↓
7. Production обновлён ✅ (данные сохранены!)
```

---

## Backup & Recovery

### Automated Backup

Использовать `backup-service`:

```bash
# Start with backup service
docker-compose --profile backup up -d

# Backups сохраняются в ./backups/
ls -lh backups/
```

**Конфигурация:**
- Частота: Каждый час
- Хранение: 30 дней
- Формат: .tar.gz
- Расположение: `./backups/` на хосте

### Manual Backup

#### Option 1: Via API

```bash
# Export all data as JSON
curl http://localhost:4000/api/export/all > backup-$(date +%Y%m%d).json

# Export database binary
curl http://localhost:4000/api/export/database > backup-$(date +%Y%m%d).db
```

#### Option 2: Docker Volume Backup

```bash
# Backup database volume
docker run --rm \
  -v quote-prod-db:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/db-backup-$(date +%Y%m%d).tar.gz -C /data .

# Backup all volumes
for vol in db logs catalog estimate backup; do
  docker run --rm \
    -v quote-prod-${vol}:/data \
    -v $(pwd)/backups:/backup \
    alpine tar czf /backup/${vol}-backup-$(date +%Y%m%d).tar.gz -C /data .
done
```

#### Option 3: Database File Copy

```bash
# Copy database file directly
docker cp quote-prod:/usr/src/app/db/quotes.db ./backups/quotes-$(date +%Y%m%d).db
```

### Recovery

#### From JSON Export

```bash
# Import via API
curl -X POST http://localhost:4000/api/import/all \
  -H "Content-Type: application/json" \
  -d @backup-20251105.json
```

#### From Volume Backup

```bash
# Stop services
docker-compose down

# Restore database
docker run --rm \
  -v quote-prod-db:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/db-backup-20251105.tar.gz -C /data"

# Restart services
docker-compose up -d
```

---

## Data Migration

### From File Storage to SQLite

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

---

## CI/CD Автодеплой

### Вариант 1: GitHub Actions (рекомендуется)

**Файл: `.github/workflows/deploy.yml`**

```yaml
name: Deploy to Docker

on:
  push:
    branches:
      - main      # Production
      - staging   # Staging
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Determine environment
        id: env
        run: |
          if [ "${{ github.ref }}" == "refs/heads/main" ]; then
            echo "env=production" >> $GITHUB_OUTPUT
            echo "port=4000" >> $GITHUB_OUTPUT
          else
            echo "env=staging" >> $GITHUB_OUTPUT
            echo "port=4001" >> $GITHUB_OUTPUT
          fi

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: ${{ secrets.DOCKER_USERNAME }}/quote-calculator:${{ steps.env.outputs.env }}

      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/quote-calculator
            docker-compose pull
            docker-compose up -d ${{ steps.env.outputs.env }}
```

**Необходимые GitHub Secrets:**
- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`
- `SERVER_HOST`
- `SERVER_USER`
- `SSH_PRIVATE_KEY`

### Вариант 2: Watchtower (самый простой)

**Файл: `docker-compose.watchtower.yml`**

```yaml
version: '3.8'

services:
  watchtower:
    image: containrrr/watchtower:latest
    container_name: watchtower
    restart: always
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_POLL_INTERVAL=300  # 5 минут
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_LABEL_ENABLE=true
    labels:
      - com.centurylinklabs.watchtower.enable=false
```

**Запуск:**

```bash
# Production + Staging + Watchtower
docker-compose -f docker-compose.yml -f docker-compose.watchtower.yml up -d

# Watchtower будет:
# 1. Каждые 5 минут проверять Docker Hub
# 2. При новом образе автоматически обновлять контейнеры
# 3. Сохранять volumes (данные не теряются)
```

### Вариант 3: GitLab CI

**Файл: `.gitlab-ci.yml`**

```yaml
stages:
  - test
  - build
  - deploy

test:
  stage: test
  image: node:18-alpine
  script:
    - npm ci
    - npm test

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_REF_SLUG .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_REF_SLUG

deploy:production:
  stage: deploy
  only:
    - main
  when: manual
  script:
    - ssh $SERVER_USER@$SERVER_HOST "cd /opt/quote-calculator && docker-compose pull && docker-compose up -d"
```

---

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

# Check volumes
docker volume ls | grep quote
```

### Database Locked

```bash
# SQLite WAL mode should prevent this, but if it happens:

# 1. Stop container
docker-compose stop quote-production

# 2. Copy DB out
docker cp quote-prod:/usr/src/app/db/quotes.db /tmp/

# 3. Checkpoint WAL
sqlite3 /tmp/quotes.db "PRAGMA wal_checkpoint(FULL);"

# 4. Copy back
docker cp /tmp/quotes.db quote-prod:/usr/src/app/db/quotes.db

# 5. Restart
docker-compose start quote-production
```

### High Memory Usage

```bash
# Check stats
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

# Configure in docker-compose.yml:
logging:
  options:
    max-size: "10m"
    max-file: "3"
```

### Networking Issues

```bash
# Check network
docker network ls
docker network inspect quote-calculator_default

# Test connectivity
docker exec quote-prod ping google.com

# Check ports
docker port quote-prod
```

---

## Security

### Non-Root User

Container runs as `node` user (non-root):

```bash
# Verify
docker exec quote-prod whoami
# Output: node
```

### Health Checks

Automatic health monitoring configured:

```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "http://localhost:4000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### Resource Limits

Production limits prevent resource exhaustion:

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 256M
```

### Secrets Management

```bash
# Use Docker secrets (Swarm mode)
echo "secret-value" | docker secret create db_password -

# Or use .env file (never commit!)
echo "DB_PASSWORD=secret" >> .env
```

---

## Monitoring

### Watchtower Auto-Updates

```yaml
# Label containers for Watchtower
labels:
  - com.centurylinklabs.watchtower.enable=true
  - com.centurylinklabs.watchtower.stop-timeout=30s
```

### Winston Logs

Logs persisted in `prod-logs` volume:

```bash
# View logs inside container
docker exec quote-prod cat /usr/src/app/logs/combined.log
docker exec quote-prod cat /usr/src/app/logs/error.log

# Copy logs to host
docker cp quote-prod:/usr/src/app/logs ./container-logs
```

### Performance Metrics

```bash
# Container stats
docker stats

# Image size
docker images quote-calculator

# Volume usage
docker system df -v | grep quote
```

---

## Performance

### Image Size Optimization

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

### Runtime Optimization

```bash
# Increase memory (if needed)
NODE_OPTIONS="--max-old-space-size=512"

# Adjust worker connections
# (configure in nginx if using reverse proxy)
```

---

## Cloud Deployment

### VPS Deployment (Generic)

```bash
# 1. SSH to VPS
ssh user@your-vps.com

# 2. Install Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
apt-get install docker-compose-plugin

# 3. Clone/upload code
git clone <repo> quote-calculator
cd quote-calculator

# 4. Configure
cp .env.example .env
nano .env

# 5. Start
docker-compose up -d

# 6. Setup nginx reverse proxy (optional)
# See production.md for nginx config
```

### Recommended VPS Specs

**Single User:**
- CPU: 1 core minimum
- RAM: 512MB minimum (1GB recommended)
- Disk: 10GB minimum
- OS: Ubuntu 22.04 LTS

**Production + Staging:**
- CPU: 2 cores
- RAM: 2GB (4GB recommended)
- Disk: 20GB SSD

---

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

---

## FAQ

**Q: Can I use Docker for development?**
A: Yes! Use `docker-compose.dev.yml` with bind mounts for hot-reload.

**Q: How do I update to a new version?**
A: Rebuild the image: `docker-compose build && docker-compose up -d`

**Q: Where is my data stored?**
A: In Docker named volumes. Use `docker volume inspect quote-prod-db` to see location.

**Q: Can I run multiple instances?**
A: Yes, but this is a single-user app. Adjust ports in docker-compose.yml.

**Q: What if I lose my data?**
A: Always backup! See "Backup & Recovery" section.

**Q: How to migrate from file storage?**
A: See "Data Migration" section above.

---

## Support

**For issues:**
1. Check logs: `docker-compose logs -f`
2. Check health: `curl http://localhost:4000/api/health`
3. Inspect container: `docker inspect quote-prod`
4. Check file permissions: `docker exec quote-prod ls -la /usr/src/app`
5. Consult troubleshooting section
6. Create GitHub issue with logs

---

**Version:** 3.0.0
**Last Updated:** 5 ноября 2025
**Status:** ✅ Production Ready

[← Назад к Deployment](index.md) | [Production Deployment →](production.md)
