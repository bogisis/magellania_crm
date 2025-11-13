# Docker Deployment Guide - Quick Start

## 🚀 Quick Start (5 минут)

### 1. Первый запуск

```bash
# Создать volumes (один раз)
docker volume create quote-prod-catalog
docker volume create quote-prod-estimate
docker volume create quote-prod-backup
docker volume create quote-staging-catalog
docker volume create quote-staging-estimate
docker volume create quote-staging-backup

# Запустить оба окружения
docker-compose up -d

# Проверить статус
docker-compose ps

# Проверить health
curl http://localhost:3005/health  # Production
curl http://localhost:3006/health  # Staging
```

### 2. Открыть в браузере

- **Production**: http://localhost:3005
- **Staging**: http://localhost:3006

---

## 📋 Доступные команды (npm scripts)

```bash
# Docker основные команды
npm run docker:build          # Собрать образы
npm run docker:up             # Запустить все контейнеры
npm run docker:down           # Остановить все контейнеры
npm run docker:logs           # Просмотр логов

# Отдельные окружения
npm run docker:prod           # Запустить только Production
npm run docker:staging        # Запустить только Staging

# Операции
npm run docker:health         # Health check
npm run docker:backup         # Создать бэкап
npm run docker:deploy         # Zero-downtime deploy
npm run docker:rollback       # Откатить на предыдущую версию

# Автобэкапы
npm run docker:backup-service # Запустить continuous backup

# Production promotion (ВАЖНО!)
npm run promote:production    # Промоутить staging → production
npm run release:create        # Создать git tag для релиза
npm run release:list          # Посмотреть последние релизы
```

---

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────┐
│              DOCKER HOST                        │
│                                                 │
│  ┌──────────────────┐   ┌──────────────────┐   │
│  │   PRODUCTION     │   │    STAGING       │   │
│  │   Port: 3005     │   │    Port: 3006    │   │
│  └────────┬─────────┘   └────────┬─────────┘   │
│           │                      │              │
│           ↓                      ↓              │
│  ┌──────────────────┐   ┌──────────────────┐   │
│  │  PROD VOLUMES    │   │ STAGING VOLUMES  │   │
│  │  - catalog       │   │  - catalog       │   │
│  │  - estimate      │   │  - estimate      │   │
│  │  - backup        │   │  - backup        │   │
│  └──────────────────┘   └──────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## 🔧 Типичные операции

### Просмотр логов

```bash
# Все контейнеры
docker-compose logs -f

# Только production
docker logs quote-prod -f

# Только staging
docker logs quote-staging -f
```

### Рестарт сервисов

```bash
# Рестарт production
docker-compose restart quote-production

# Рестарт staging
docker-compose restart quote-staging
```

### Проверка volumes

```bash
# Список volumes
docker volume ls | grep quote

# Информация о volume
docker volume inspect quote-prod-catalog

# Размер данных
docker system df -v | grep quote
```

---

## 🔄 Deployment Workflow

### ⚠️ ВАЖНО: Правильный процесс деплоя

**Staging → Production архитектура:**

```
1. Разработка → git push origin staging
   ↓
2. GitHub Actions → АВТОДЕПЛОЙ в STAGING (3006)
   ↓
3. Тестирование на staging
   ↓
4. Создать release → git tag v2.3.0 && git push --tags
   ↓
5. GitHub Actions → ЖДЁТ APPROVAL от admin
   ↓
6. Admin утверждает → ДЕПЛОЙ в PRODUCTION (3005)
   ↓
7. Production обновлён ✅ (данные сохранены!)
```

### Staging Deployment (автоматический)

```bash
# Разработка новой функции
git checkout -b feature/new-calculator
# ... работа ...
git commit -m "feat: add calculator"

# Merge в staging
git checkout staging
git merge feature/new-calculator

# Push → автодеплой
git push origin staging

# → АВТОМАТИЧЕСКИ деплоится в STAGING (3006)
# → БЕЗ approval
# → Время: 2-5 минут

# Проверить:
curl http://your-server:3006/health
```

### Production Promotion (с approval)

**Вариант A: Через Git Tag (рекомендуется)**

```bash
# 1. Staging протестирован → создать release
git checkout staging
git tag v2.3.0
git push origin v2.3.0

# 2. GitHub Actions → запускает promotion workflow
# 3. Admin получает approval request
# 4. Admin утверждает → deploy в production
# 5. Production обновлён!

# Проверить:
curl http://your-server:3005/health
```

**Вариант B: Manual (через GitHub UI)**

```
1. GitHub → Actions → Promote to Production
2. Run workflow → выбрать staging tag
3. Admin approval
4. Deploy в production
```

**Вариант C: Локальный скрипт**

```bash
# На сервере:
npm run promote:production

# Интерактивный процесс:
# - Проверка staging
# - Confirmation
# - Backup production
# - Deploy
# - Health check
```

### GitHub Secrets (необходимые)

- `DOCKER_USERNAME` - Docker Hub username
- `DOCKER_PASSWORD` - Docker Hub token
- `SERVER_HOST` - IP/hostname сервера
- `SERVER_USER` - SSH user
- `SSH_PRIVATE_KEY` - SSH private key

### GitHub Environment (для approval)

```
Settings → Environments → New environment: "production"
→ Required reviewers: добавить admin/owner
→ Save
```

### Вариант 2: Watchtower (автообновление)

```bash
# Запустить с Watchtower
docker-compose -f docker-compose.yml -f docker-compose.watchtower.yml up -d

# Watchtower будет проверять Docker Hub каждые 5 минут
# и автоматически обновлять контейнеры при появлении новых образов
```

---

## 🛡️ Безопасность данных

### Гарантии сохранности

✅ **Данные переживают**:
- Рестарт контейнеров
- Обновление образов
- Удаление контейнеров
- Перезагрузку хоста

❌ **Данные НЕ переживут**:
- `docker-compose down -v` (флаг -v удаляет volumes!)
- `docker volume rm quote-prod-catalog`
- `docker volume prune` (если volumes не используются)

### Бэкапы

**Автоматические** (continuous backup service):
```bash
npm run docker:backup-service
# Бэкапы сохраняются в ./backups каждый час
# Хранятся 30 дней
```

**Ручные**:
```bash
npm run docker:backup
# Бэкап сохраняется в /tmp/backups/pre-deploy
```

**Восстановление**:
```bash
npm run docker:rollback
# Откатывается на последний бэкап
```

---

## 🐛 Troubleshooting

### Контейнер не стартует

```bash
# Проверить логи
docker logs quote-prod --tail 50

# Проверить порты
sudo lsof -i :3005

# Запустить в interactive режиме
docker run -it --rm quote-calculator:latest sh
```

### Порты заняты

```bash
# Найти процесс
sudo lsof -i :3005

# Убить процесс
sudo kill -9 <PID>
```

### Volumes не монтируются

```bash
# Проверить существование
docker volume ls | grep quote

# Пересоздать
docker volume rm quote-prod-catalog
docker volume create quote-prod-catalog
```

---

## 📚 Дополнительная документация

Полная документация: `docs/DOCKER_DEPLOYMENT.md`

- Детальная архитектура
- Все варианты CI/CD
- Продвинутые сценарии
- Enterprise features
- Мониторинг и алерты

---

## ✅ Checklist первого деплоя

- [ ] Создать volumes
- [ ] Запустить `docker-compose up -d`
- [ ] Проверить health: `npm run docker:health`
- [ ] Открыть http://localhost:3005
- [ ] Открыть http://localhost:3006
- [ ] Настроить GitHub Secrets (опционально)
- [ ] Запустить Watchtower (опционально)
- [ ] Настроить continuous backup (опционально)

---

**Готово к использованию!** 🎉

При проблемах: см. `docs/DOCKER_DEPLOYMENT.md` раздел "Troubleshooting"
