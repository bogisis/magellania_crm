# Deployment Workflow Documentation

**Версия:** v2.3.0  
**Дата:** 20 октября 2025  
**Статус:** Production Ready

---

## 📋 Оглавление

1. [Git Branching Strategy](#git-branching-strategy)
2. [Development Workflow](#development-workflow)
3. [Staging Deployment](#staging-deployment)
4. [Production Promotion](#production-promotion)
5. [Release Management](#release-management)
6. [Emergency Procedures](#emergency-procedures)

---

## Git Branching Strategy

```
main (production code)
  ↑
  | Git tag v2.X.X
  | OR Manual promotion with approval
  |
staging (development/testing code)
  ↑
  | Feature branches merge here
  |
feature/* (individual features)
```

### Branches

**`main`** - Production-ready code
- Protected branch
- Только через promotion из staging
- Автоматически деплоится в production после approval

**`staging`** - Development/Testing code
- Автоматически деплоится в staging (3006)
- Все фичи мержатся сюда для тестирования
- После проверки - промоут в production

**`feature/*`** - Feature branches
- Создаются от staging
- После завершения - merge в staging
- Удаляются после merge

---

## Development Workflow

### 1. Начало работы над новой функцией

```bash
# Обновить staging
git checkout staging
git pull origin staging

# Создать feature branch
git checkout -b feature/new-calculator
```

### 2. Разработка

```bash
# Работа + коммиты
git add .
git commit -m "feat: add new calculator logic"

# Пуш feature branch (опционально, для backup)
git push origin feature/new-calculator
```

### 3. Тестирование локально

```bash
# Запустить тесты
npm test

# Запустить локально
npm start

# Проверить в браузере
open http://localhost:3000
```

### 4. Merge в staging

```bash
# Обновить staging
git checkout staging
git pull origin staging

# Merge feature
git merge feature/new-calculator

# Resolve conflicts если есть
git mergetool

# Пуш в staging
git push origin staging

# → АВТОМАТИЧЕСКИ деплоится в STAGING (3006)
```

### 5. Проверка на staging

```bash
# Подождать 2-5 минут для деплоя
# Проверить GitHub Actions: https://github.com/yourrepo/actions

# Проверить staging
open http://your-server:3006

# Проверить health
curl http://your-server:3006/health

# Тестировать функционал
```

### 6. Удалить feature branch

```bash
# Локально
git branch -d feature/new-calculator

# Удалённо (если пушили)
git push origin --delete feature/new-calculator
```

---

## Staging Deployment

### Автоматический процесс

**Триггер:** `git push origin staging`

**Workflow:** `.github/workflows/deploy-staging.yml`

**Процесс:**
1. ✅ Run tests
2. ✅ Build Docker image
3. ✅ Push to Docker Hub (tag: `staging`)
4. ✅ SSH to server
5. ✅ Pull new image
6. ✅ Restart staging container
7. ✅ Health check

**Время:** 2-5 минут

**URL:** http://your-server:3006

### Troubleshooting

```bash
# Проверить логи GitHub Actions
# → GitHub → Actions → Deploy to Staging

# Проверить логи staging на сервере
ssh user@your-server
docker logs quote-staging -f

# Проверить health
curl http://localhost:3006/health

# Restart вручную
docker-compose restart quote-staging
```

---

## Production Promotion

### ⚠️ ВАЖНО: Production данные НИКОГДА не трогаются!

При промоушене в production:
- ✅ Код обновляется (staging → production)
- ✅ Production volumes остаются нетронутыми
- ✅ Все сметы, каталоги, бэкапы сохраняются

### Вариант A: Через Git Tag (рекомендуется)

```bash
# 1. Убедиться что staging протестирован
curl http://your-server:3006/health

# 2. Создать git tag
git checkout staging
git tag v2.3.0

# 3. Пуш tag
git push origin v2.3.0

# 4. Зайти на GitHub Actions
# → Workflow "Promote to Production" запустится автоматически

# 5. Approval
# → GitHub покажет approval request
# → ТОЛЬКО admin/owner может approve
# → Нажать "Approve and deploy"

# 6. Ждать деплоя (3-5 минут)

# 7. Проверить production
curl http://your-server:3005/health
open http://your-server:3005
```

### Вариант B: Manual Workflow Dispatch

```bash
# 1. Зайти на GitHub
# → Actions → Promote to Production → Run workflow

# 2. Указать параметры
# - Staging image tag: staging (или staging-abc123)
# - Skip tests: false

# 3. Run workflow

# 4. Approval
# → Дождаться approval request
# → Approve

# 5. Проверить production
curl http://your-server:3005/health
```

### Promotion Process

**Workflow:** `.github/workflows/promote-production.yml`

**Этапы:**
1. ✅ Run tests (можно пропустить для hotfix)
2. ✅ Check staging health
3. ⏸️  **WAIT FOR ADMIN APPROVAL**
4. ✅ Backup production volumes
5. ✅ Pull staging image
6. ✅ Retag staging → production (latest)
7. ✅ Deploy to production
8. ✅ Health check (rollback if failed)
9. ✅ Create GitHub Release (если через tag)

**Время:** 5-10 минут (включая approval)

---

## Release Management

### Versioning

Используем [Semantic Versioning](https://semver.org/):

```
v2.3.0
 │ │ │
 │ │ └─ PATCH: Bug fixes, small changes
 │ └─── MINOR: New features (backward compatible)
 └───── MAJOR: Breaking changes
```

### Creating a Release

```bash
# 1. Определить версию
npm run release:list  # Посмотреть последние releases

# 2. Создать tag
git checkout staging
git tag v2.3.0 -m "Release v2.3.0: Add new calculator"

# 3. Push tag
git push origin v2.3.0

# → Автоматически создаёт GitHub Release
# → Запускает promotion workflow
```

### Release Notes

GitHub Release создаётся автоматически с:
- Version number
- Deployment timestamp
- Commit SHA
- Production URL

Можно дополнить вручную:
- Changelog
- Breaking changes
- Migration notes

---

## Emergency Procedures

### Hotfix в Production

```bash
# 1. Создать hotfix branch от main (!)
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# 2. Фикс
git commit -m "fix: critical bug in calculator"

# 3. Merge в staging для проверки
git checkout staging
git merge hotfix/critical-bug
git push origin staging

# → Проверить на staging

# 4. Если всё ОК - срочный промоут
git checkout staging
git tag v2.3.1-hotfix
git push origin v2.3.1-hotfix

# 5. GitHub Actions → Skip tests (галочка)
# 6. Approval → Deploy

# 7. Merge hotfix в main
git checkout main
git merge hotfix/critical-bug
git push origin main
```

### Rollback Production

**Автоматический rollback:**
- Если health check failed → автоматический rollback

**Ручной rollback:**

```bash
# На сервере:
ssh user@your-server
cd /opt/quote-calculator

# Вариант 1: Rollback скрипт
./scripts/rollback.sh

# Вариант 2: Deploy конкретной версии
docker pull youruser/quote-calculator:v2.2.0
docker stop quote-prod
docker rm quote-prod
docker run -d \
  --name quote-prod \
  -p 3005:3000 \
  -v quote-prod-catalog:/app/catalog \
  -v quote-prod-estimate:/app/estimate \
  -v quote-prod-backup:/app/backup \
  -e NODE_ENV=production \
  -e APP_ENV=production \
  --restart unless-stopped \
  youruser/quote-calculator:v2.2.0
```

### Staging → Production Promotion (Local)

Если GitHub Actions недоступен:

```bash
# На сервере:
ssh user@your-server
cd /opt/quote-calculator

# Запустить promotion скрипт
./scripts/promote-to-production.sh

# → Интерактивный процесс:
# 1. Проверка staging health
# 2. Confirmation
# 3. Backup production
# 4. Deploy staging → production
# 5. Health check (rollback if failed)
```

---

## Monitoring

### Health Checks

```bash
# Все окружения
npm run docker:health

# Staging только
curl http://your-server:3006/health

# Production только  
curl http://your-server:3005/health
```

### Logs

```bash
# Real-time staging logs
docker logs quote-staging -f

# Real-time production logs
docker logs quote-prod -f

# Последние 100 строк
docker logs quote-prod --tail 100
```

### GitHub Actions

```
https://github.com/yourrepo/actions

→ Deploy to Staging (зелёная ✅ или красная ❌)
→ Promote to Production (с approval индикатором)
```

---

## Best Practices

### ✅ DO

- Всегда тестировать на staging перед production
- Создавать git tags для releases
- Писать понятные commit messages
- Проверять health после deployment
- Держать staging максимально близко к production

### ❌ DON'T

- Не пушить напрямую в main
- Не деплоить в production без approval
- Не пропускать тесты (кроме emergency)
- Не удалять production volumes
- Не мигрировать данные без бэкапа

---

## Troubleshooting

### Staging деплой failed

```bash
# 1. Проверить GitHub Actions логи
# 2. Проверить тесты прошли
npm test

# 3. Проверить Docker build локально
docker build -t test .

# 4. Проверить staging на сервере
ssh user@server
docker logs quote-staging --tail 100
```

### Production promotion failed

```bash
# 1. Проверить staging healthy
curl http://server:3006/health

# 2. Проверить approval granted

# 3. Проверить Docker Hub
docker pull youruser/quote-calculator:staging

# 4. Проверить production rollback logs
ssh user@server
cat /var/log/quote-production.log
```

### Production down

```bash
# 1. Immediate rollback
./scripts/rollback.sh

# 2. Check logs
docker logs quote-prod --tail 200

# 3. Check volumes
docker volume ls | grep quote

# 4. Check health
curl http://localhost:3005/health

# 5. Notify team
```

---

## Quick Reference

### Commands

```bash
# Development
git checkout -b feature/name
git push origin staging

# Release
git tag v2.X.X
git push --tags

# Emergency
npm run promote:production
./scripts/rollback.sh

# Monitoring
npm run docker:health
docker logs quote-prod -f
```

### URLs

- **Staging:** http://your-server:3006
- **Production:** http://your-server:3005
- **GitHub Actions:** https://github.com/yourrepo/actions

---

**Документация готова!** 🎉

При вопросах: см. README_DOCKER.md или docs/DOCKER_DEPLOYMENT.md
