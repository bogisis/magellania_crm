# Deployment Workflow Fix - Summary

**Дата:** 20 октября 2025  
**Статус:** ✅ Исправлено и готово к использованию

---

## 🔥 Проблема

**До исправления:**
- ❌ Push в `main` → автоматический деплой в production (ОПАСНО!)
- ❌ Production деплоился без approval
- ❌ Нет разделения staging/production workflow
- ❌ Риск деплоя нестабильного кода в production

---

## ✅ Решение

**После исправлений:**
- ✅ Push в `staging` → автодеплой в staging (3006)
- ✅ Production деплой ТОЛЬКО через approval от admin
- ✅ Staging для тестирования, Production для стабильного кода
- ✅ Git tags для версионирования релизов
- ✅ Production данные НИКОГДА не трогаются (только код обновляется)

---

## 📦 Изменённые файлы

### 1. Удалены

- ❌ `.github/workflows/deploy.yml` (старый неправильный workflow)

### 2. Созданы

**Workflows:**
- ✅ `.github/workflows/deploy-staging.yml` - автодеплой staging
- ✅ `.github/workflows/promote-production.yml` - promotion с approval

**Scripts:**
- ✅ `scripts/promote-to-production.sh` - локальный promotion script

**Документация:**
- ✅ `docs/DEPLOYMENT_WORKFLOW.md` - полная документация процесса
- ✅ `WORKFLOW_FIX_SUMMARY.md` - этот файл

### 3. Обновлены

- ✅ `package.json` - добавлены promotion scripts
- ✅ `README_DOCKER.md` - обновлён раздел deployment

---

## 🚀 Новый Workflow

### Разработка → Staging (автоматически)

```bash
# 1. Создать feature branch
git checkout -b feature/new-function

# 2. Разработка + коммиты
git commit -m "feat: add new function"

# 3. Merge в staging
git checkout staging
git merge feature/new-function
git push origin staging

# → АВТОМАТИЧЕСКИ деплоится в STAGING (3006)
# → GitHub Actions: Deploy to Staging
# → Время: 2-5 минут
# → БЕЗ approval
```

### Staging → Production (с approval)

```bash
# 1. Тестирование на staging
curl http://your-server:3006/health

# 2. Создать git tag
git checkout staging
git tag v2.3.0
git push origin v2.3.0

# 3. GitHub Actions запускает "Promote to Production"
# → Run tests
# → Check staging health
# → WAIT FOR ADMIN APPROVAL ⏸️

# 4. Admin утверждает в GitHub UI
# → Backup production
# → Deploy staging → production
# → Health check (rollback if failed)
# → Create GitHub Release

# 5. Production обновлён!
curl http://your-server:3005/health
```

---

## 🔑 Ключевые особенности

### Production Safety

✅ **Mandatory approval** - только admin может утвердить  
✅ **Staging health check** - проверка перед promotion  
✅ **Automatic backup** - бэкап production перед деплоем  
✅ **Health check + rollback** - автооткат при ошибках  
✅ **Data preservation** - production данные не трогаются  

### Git Strategy

```
main (production code)
  ↑
  | Git tag v2.X.X + approval
  |
staging (development code)
  ↑
  | Auto-deploy
  |
feature/* (features)
```

### Docker Image Tags

```
:latest → production (стабильная версия)
:staging → staging (тестовая версия)
:v2.3.0 → конкретные релизы (immutable)
:staging-abc123 → staging commits
```

---

## 📋 Необходимая настройка

### 1. GitHub Secrets

```
Settings → Secrets and variables → Actions → New secret

DOCKER_USERNAME=your-dockerhub-username
DOCKER_PASSWORD=<docker-hub-token>
SERVER_HOST=your-server.com
SERVER_USER=deploy
SSH_PRIVATE_KEY=<private-key>
```

### 2. GitHub Environment (для approval)

```
Settings → Environments → New environment

Name: production
Required reviewers: [добавить admin/owner]
Save
```

### 3. Создать staging branch

```bash
git checkout -b staging
git push origin staging
```

---

## 🎯 Использование

### Команды npm

```bash
# Локальное тестирование
npm run docker:up
npm run docker:health

# Promotion (локально на сервере)
npm run promote:production

# Release management
npm run release:create   # Создать git tag
npm run release:list     # Посмотреть releases
```

### Git workflow

```bash
# Development
git checkout -b feature/name
git push origin staging → автодеплой в staging

# Release
git tag v2.3.0
git push --tags → approval → production

# Hotfix
git checkout -b hotfix/critical
git push origin staging → staging → tag → production
```

---

## 🛡️ Data Safety

### ⚠️ КРИТИЧЕСКИ ВАЖНО

**При promotion staging → production:**

- ✅ **КОД обновляется** (staging image → production container)
- ✅ **ДАННЫЕ сохраняются** (production volumes не трогаются)
- ✅ **Backup создаётся** (перед каждым promotion)
- ✅ **Rollback доступен** (в случае проблем)

**Это означает:**

```
Production volumes (НЕ ТРОГАЮТСЯ):
  - quote-prod-catalog (все каталоги сохранены)
  - quote-prod-estimate (все сметы сохранены)
  - quote-prod-backup (все бэкапы сохранены)

Production container (ОБНОВЛЯЕТСЯ):
  - Код из staging
  - Новые функции
  - Bug fixes
  - Монтирует ТЕ ЖЕ volumes
```

**Пользователи не теряют данные!**

---

## 📚 Документация

### Подробные гайды

1. **docs/DEPLOYMENT_WORKFLOW.md** - полный workflow процесс
   - Git branching strategy
   - Development workflow
   - Staging deployment
   - Production promotion
   - Emergency procedures

2. **README_DOCKER.md** - quick start
   - Быстрый запуск
   - Доступные команды
   - Deployment workflow

3. **docs/DOCKER_DEPLOYMENT.md** - полная Docker документация
   - Архитектура
   - CI/CD варианты
   - Data safety
   - Troubleshooting

---

## ✅ Checklist внедрения

### GitHub:
- [ ] Создать GitHub Secrets (5 штук)
- [ ] Создать GitHub Environment "production" с reviewers
- [ ] Создать staging branch: `git checkout -b staging && git push origin staging`

### Тестирование:
- [ ] Push в staging → проверить автодеплой
- [ ] Создать тестовый tag → проверить approval workflow
- [ ] Approve → проверить production деплой

### Production:
- [ ] Убедиться что staging протестирован
- [ ] Создать первый production release (v2.3.0)
- [ ] Approve и задеплоить
- [ ] Проверить что production работает
- [ ] Проверить что данные сохранены

---

## 🆘 Troubleshooting

### Staging не деплоится

```bash
# 1. Проверить GitHub Actions
# → GitHub → Actions → Deploy to Staging → Logs

# 2. Проверить tests passed
npm test

# 3. Проверить Docker Hub credentials (secrets)
```

### Approval не появляется

```bash
# 1. Проверить GitHub Environment настроен
# → Settings → Environments → production → Required reviewers

# 2. Проверить права пользователя (должен быть admin/owner)

# 3. Создать environment если нет:
Settings → Environments → New environment: "production"
```

### Production деплой failed

```bash
# 1. Automatic rollback should have triggered
# 2. Check GitHub Actions logs
# 3. Check production:
ssh user@server
docker logs quote-prod --tail 100

# 4. Manual rollback:
./scripts/rollback.sh
```

---

## 🎉 Результат

**Было:**
- ❌ Push в main → автодеплой production (опасно)
- ❌ Нет контроля
- ❌ Риск потери данных

**Стало:**
- ✅ Staging для тестирования (автоматически)
- ✅ Production через approval (безопасно)
- ✅ Полный контроль над релизами
- ✅ Данные всегда сохранены
- ✅ Rollback при проблемах
- ✅ Git tags для версионирования

---

**Workflow исправлен и готов к использованию!** 🚀

**Next steps:**
1. Настроить GitHub Secrets
2. Создать production environment
3. Протестировать staging деплой
4. Сделать первый production release

**Документация:**
- Quick start: README_DOCKER.md
- Full workflow: docs/DEPLOYMENT_WORKFLOW.md
- Docker details: docs/DOCKER_DEPLOYMENT.md
