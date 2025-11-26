# 🐛 VPS Deployment Fix - Инструкции

**Дата:** 26 ноября 2025
**Коммит:** `e9138be`
**Проблема:** Docker контейнер не может создать базу данных

---

## ✅ Что было исправлено

### 1. **Неправильный путь копирования node_modules**
```dockerfile
# БЫЛО (ошибка):
COPY --from=deps /usr/src/app/node_modules ./node_modules

# СТАЛО (исправлено):
COPY --from=deps /app/node_modules ./node_modules
```

### 2. **Проблема с правами доступа**
```dockerfile
# БЫЛО (ошибка):
USER nodejs                              # Переключились на nodejs
COPY --chown=nodejs:nodejs . .           # Копируем как nodejs
RUN chmod +x docker-init.sh              # nodejs НЕ МОЖЕТ chmod!

# СТАЛО (исправлено):
COPY . .                                 # Копируем как root
RUN chmod +x docker-init.sh              # chmod как root - работает!
RUN chown -R nodejs:nodejs /app          # Даём права nodejs на всё
USER nodejs                              # Только потом переключаемся
```

### 3. **Оба stage исправлены**
- ✅ dev stage
- ✅ prod stage

---

## 🚀 Инструкции по обновлению на VPS

### Шаг 1: Подключитесь к VPS

```bash
ssh deployer@srv1126646
cd /opt/quote-calculator
```

### Шаг 2: Пулл последних изменений

```bash
git pull origin main
```

**Должны увидеть:**
```
remote: Counting objects: ...
Receiving objects: 100%
Updating e779843..e9138be
Fast-forward
 Dockerfile | 32 ++++++++++++++------------------
 1 file changed, 17 insertions(+), 15 deletions(-)
```

### Шаг 3: Остановить контейнеры

```bash
docker-compose -f docker-compose.vps.yml down
```

### Шаг 4: Пересобрать образы (ВАЖНО!)

```bash
# Полная пересборка без кэша
docker-compose -f docker-compose.vps.yml build --no-cache

# Или для staging отдельно:
docker-compose -f docker-compose.vps.yml build --no-cache quote-staging
```

**Ожидаемый вывод:**
```
Building quote-staging
[+] Building 45.2s (16/16) FINISHED
=> [internal] load build definition from Dockerfile
=> [base 1/3] WORKDIR /app
=> [prod 2/6] COPY --from=deps /app/node_modules ./node_modules
=> [prod 3/6] RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
=> [prod 4/6] COPY . .
=> [prod 5/6] RUN chmod +x docker-init.sh
=> [prod 6/6] RUN mkdir -p db logs ... && chown -R nodejs:nodejs /app
=> exporting to image
```

### Шаг 5: Запустить контейнеры

```bash
docker-compose -f docker-compose.vps.yml up -d
```

### Шаг 6: Проверить логи

```bash
# Проверить staging контейнер
docker-compose -f docker-compose.vps.yml logs -f quote-staging
```

**Должны увидеть:**
```
quote-staging  | 🚀 Quote Calculator - Docker Initialization
quote-staging  | ===========================================
quote-staging  | 📁 Database file not found at /app/db/quotes.db
quote-staging  | ✨ Creating new database from schema...
quote-staging  |
quote-staging  | 📋 Applying base schema (db/schema.sql)...
quote-staging  | ✅ Base schema applied successfully          ← ЭТА СТРОКА!
quote-staging  |
quote-staging  | 📝 Marking base migrations as applied...
quote-staging  | 🔄 Running remaining migrations...
quote-staging  | ✅ Database initialization complete!
quote-staging  |
quote-staging  | 🌐 Starting Quote Calculator server...
quote-staging  | Server listening on port 4001
```

### Шаг 7: Проверить работоспособность

```bash
# Проверить health endpoint
curl http://localhost:4001/health

# Проверить main page
curl http://localhost:4001/
```

**Ожидаемый результат:**
- Health endpoint должен вернуть 200 OK
- Main page должен вернуть HTML с login формой

---

## 🔍 Troubleshooting

### Если снова ошибка "unable to open database file"

**Проверьте volume permissions:**
```bash
# Посмотреть volumes
docker volume ls | grep quote-staging

# Инспектировать volume
docker volume inspect quote-staging-db

# Удалить старый volume и пересоздать
docker-compose -f docker-compose.vps.yml down -v
docker-compose -f docker-compose.vps.yml up -d
```

### Если контейнер не стартует

**Проверьте логи:**
```bash
docker-compose -f docker-compose.vps.yml logs quote-staging

# Или напрямую через Docker:
docker logs quote-staging
```

### Если образ не собирается

**Очистите Docker кэш:**
```bash
# Удалить все неиспользуемые образы
docker system prune -a

# Пересобрать с нуля
docker-compose -f docker-compose.vps.yml build --no-cache --pull
```

---

## 📊 Проверка после деплоя

### 1. Проверить статус контейнеров
```bash
docker-compose -f docker-compose.vps.yml ps
```

**Ожидаемый вывод:**
```
NAME              STATUS          PORTS
quote-staging     Up 2 minutes    0.0.0.0:4001->4001/tcp
quote-production  Up 2 minutes    0.0.0.0:4000->4000/tcp
quote-nginx       Up 2 minutes    0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

### 2. Проверить базу данных

```bash
# Войти в контейнер
docker exec -it quote-staging sh

# Внутри контейнера:
ls -la /app/db/
sqlite3 /app/db/quotes.db "SELECT name FROM sqlite_master WHERE type='table';"
```

**Должны увидеть таблицы:**
```
users
organizations
catalogs
estimates
settings
schema_migrations
```

### 3. Проверить миграции

```bash
docker exec -it quote-staging sqlite3 /app/db/quotes.db "SELECT * FROM schema_migrations;"
```

**Должно показать примененные миграции 1-10.**

---

## ✅ Checklist финального деплоя

- [ ] Git pull выполнен успешно
- [ ] Образы пересобраны с --no-cache
- [ ] Контейнеры запущены без ошибок
- [ ] База данных создана (/app/db/quotes.db существует)
- [ ] Миграции применены (1-10 в schema_migrations)
- [ ] Health check возвращает 200 OK
- [ ] Логи не содержат ошибок
- [ ] Можно открыть http://staging.magellania.net (если nginx настроен)

---

## 📝 Дополнительные команды

### Просмотр логов в real-time
```bash
# Все контейнеры
docker-compose -f docker-compose.vps.yml logs -f

# Только staging
docker-compose -f docker-compose.vps.yml logs -f quote-staging

# Последние 100 строк
docker-compose -f docker-compose.vps.yml logs --tail=100 quote-staging
```

### Рестарт контейнера
```bash
docker-compose -f docker-compose.vps.yml restart quote-staging
```

### Пересоздание контейнера
```bash
docker-compose -f docker-compose.vps.yml up -d --force-recreate quote-staging
```

### Очистка всех данных (ОПАСНО!)
```bash
# Удалить контейнеры И volumes
docker-compose -f docker-compose.vps.yml down -v

# Пересоздать с нуля
docker-compose -f docker-compose.vps.yml up -d
```

---

## 🎯 Итоговый результат

После выполнения всех шагов:

✅ Docker контейнер стартует успешно
✅ База данных создается автоматически
✅ Миграции применяются корректно
✅ Сервер доступен на порту 4001
✅ Логи не содержат ошибок
✅ Health check проходит успешно

**Система готова к использованию! 🎉**

---

**Если возникают проблемы, отправьте логи:**
```bash
docker-compose -f docker-compose.vps.yml logs quote-staging > /tmp/staging-logs.txt
cat /tmp/staging-logs.txt
```
