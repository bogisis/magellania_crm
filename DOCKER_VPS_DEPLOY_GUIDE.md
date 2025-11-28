# 🚀 Quote Calculator v3.0 - Полный деплой на VPS с Docker

**Дата:** 28 ноября 2025
**Ветка:** `db_initial_schema_refactoring`
**Версия:** 3.0.0 (новая схема БД)

---

## 📋 Содержание

1. [Предварительные требования](#предварительные-требования)
2. [Шаг 1: Подготовка сервера](#шаг-1-подготовка-сервера)
3. [Шаг 2: Клонирование и настройка](#шаг-2-клонирование-и-настройка)
4. [Шаг 3: Запуск БЕЗ SSL (HTTP only)](#шаг-3-запуск-без-ssl-http-only)
5. [Шаг 4: Настройка DNS](#шаг-4-настройка-dns)
6. [Шаг 5: Получение SSL сертификатов](#шаг-5-получение-ssl-сертификатов)
7. [Шаг 6: Включение HTTPS](#шаг-6-включение-https)
8. [Проверка и мониторинг](#проверка-и-мониторинг)
9. [Backup и восстановление](#backup-и-восстановление)
10. [Troubleshooting](#troubleshooting)

---

## Предварительные требования

### На VPS сервере должны быть установлены:

```bash
# Проверить версии
docker --version          # Docker 20.10+
docker-compose --version  # Docker Compose 1.29+
git --version            # Git 2.x+

# Если не установлены - установить:
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### Домены (опционально для SSL):

- **Production:** `crm.magellania.net` → IP вашего VPS
- **Staging:** `staging.magellania.net` → IP вашего VPS

*(Можно начать без доменов на HTTP, потом добавить SSL)*

---

## Шаг 1: Подготовка сервера

```bash
# 1. Подключиться к VPS
ssh root@YOUR_SERVER_IP

# 2. Создать директории
mkdir -p /opt/backups
mkdir -p /opt/logs

# 3. Проверить свободное место (минимум 5GB)
df -h

# 4. Проверить порты (80, 443 должны быть свободны)
netstat -tulpn | grep -E ':80|:443'

# Если заняты - остановить процессы
# sudo systemctl stop apache2  # или другой веб-сервер
```

---

## Шаг 2: Клонирование и настройка

### 2.1. Клонирование репозитория

```bash
cd /opt
git clone -b db_initial_schema_refactoring https://github.com/bogisis/magellania_crm.git quote-calculator
cd quote-calculator
```

### 2.2. Создание .env.production

```bash
cat > .env.production << 'EOF'
# Production Environment Configuration
NODE_ENV=production
PORT=4000

# Database
STORAGE_TYPE=sqlite
DB_PATH=/app/db/quotes.db

# Logging
LOG_LEVEL=info
LOG_CONSOLE=false
LOG_FILE=true

# Security (ВАЖНО: замените на случайные строки!)
JWT_SECRET=REPLACE_WITH_RANDOM_STRING_32_CHARS
SESSION_SECRET=REPLACE_WITH_RANDOM_STRING_32_CHARS

# Multi-tenancy (Production credentials)
DEFAULT_ORG_ID=magellania-org
DEFAULT_USER_ID=superadmin

# CORS (для продакшена укажите конкретный домен)
CORS_ORIGIN=*

# API Limits
JSON_LIMIT=50mb
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF
```

**⚠️ ВАЖНО:** Сгенерируйте случайные секреты:

```bash
# Генерация случайных секретов
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)

# Автоматическая замена в .env.production
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env.production
sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/" .env.production

echo "✅ Секреты сгенерированы:"
echo "JWT_SECRET=$JWT_SECRET"
echo "SESSION_SECRET=$SESSION_SECRET"
```

### 2.3. Создание .env.staging (опционально)

```bash
cat > .env.staging << 'EOF'
NODE_ENV=staging
PORT=4001
STORAGE_TYPE=sqlite
DB_PATH=/app/db/quotes.db
LOG_LEVEL=debug
LOG_CONSOLE=true
LOG_FILE=true
JWT_SECRET=staging_secret_change_me
SESSION_SECRET=staging_session_change_me
DEFAULT_ORG_ID=magellania-org
DEFAULT_USER_ID=superadmin
CORS_ORIGIN=*
JSON_LIMIT=50mb
EOF
```

### 2.4. Создание директории для бэкапов

```bash
mkdir -p /opt/quote-calculator/backups
```

---

## Шаг 3: Запуск БЕЗ SSL (HTTP only)

### 3.1. Первый запуск (HTTP, порт 80)

**ВАЖНО:** Сначала запускаем БЕЗ nginx, только приложение:

```bash
cd /opt/quote-calculator

# Запуск только production контейнера (без nginx)
docker-compose up -d --build quote-production

# Проверить статус
docker-compose ps

# Проверить логи
docker-compose logs -f quote-production
```

Должны увидеть:
```
✅ Database initialization complete!
🌐 Starting Quote Calculator server...
Server running on http://0.0.0.0:4000
```

### 3.2. Тестирование напрямую (без nginx)

```bash
# Health check
curl http://localhost:4000/health
# Ожидается: {"status":"ok","timestamp":...}

# Проверка новой схемы БД
docker exec quote-production sqlite3 /app/db/quotes.db \
  "SELECT version, name FROM schema_migrations WHERE version = 'SCHEMA_V3.0';"
# Ожидается: SCHEMA_V3.0|complete_schema_from_working_db

# Проверка production credentials
docker exec quote-production sqlite3 /app/db/quotes.db \
  "SELECT id, name, slug FROM organizations;"
# Ожидается: magellania-org|Magellania|magellania

# Проверка superadmin
docker exec quote-production sqlite3 /app/db/quotes.db \
  "SELECT id, username, email, role FROM users WHERE id='superadmin';"
# Ожидается: superadmin|superadmin|admin@magellania.com|admin
```

### 3.3. Тест логина через API

```bash
# Test login
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "superadmin",
    "password": "magellania2025"
  }'

# Должен вернуть JWT токен:
# {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...","user":{...}}
```

✅ **Если все тесты прошли - приложение работает!**

### 3.4. Открыть доступ извне (опционально)

Если хотите протестировать из браузера БЕЗ nginx:

```bash
# Остановить текущий контейнер
docker-compose down

# Запустить с пробросом порта на хост
docker run -d \
  --name quote-production-test \
  -p 4000:4000 \
  --env-file .env.production \
  -v quote-prod-db:/app/db \
  quote-calculator:production

# Теперь можно открыть в браузере:
# http://YOUR_SERVER_IP:4000
```

---

## Шаг 4: Настройка DNS

**Если планируете использовать SSL (HTTPS) - настройте DNS:**

### 4.1. A-записи в DNS провайдере

```
Тип    Имя      Значение           TTL
A      crm      YOUR_SERVER_IP     3600
A      staging  YOUR_SERVER_IP     3600
```

### 4.2. Проверка DNS

```bash
# Проверить с локальной машины (не с сервера!)
dig crm.magellania.net +short
dig staging.magellania.net +short

# Должны вернуть IP вашего VPS
```

⏱️ **Подождите 5-10 минут для распространения DNS**

---

## Шаг 5: Получение SSL сертификатов

### 5.1. Обновить домены в nginx конфигурации (если нужно)

Если ваши домены отличаются от `crm.magellania.net` и `staging.magellania.net`:

```bash
cd /opt/quote-calculator

# Заменить домены (примеры)
sed -i 's/crm.magellania.net/your-domain.com/g' nginx/conf.d/quotes.conf
sed -i 's/staging.magellania.net/staging.your-domain.com/g' nginx/conf.d/quotes.conf
```

### 5.2. Запустить весь стек (nginx + certbot)

```bash
cd /opt/quote-calculator

# Остановить тестовый контейнер если запущен
docker stop quote-production-test || true
docker rm quote-production-test || true

# Запустить полный VPS стек
docker-compose -f docker-compose.vps.yml up -d --build

# Проверить статус
docker-compose -f docker-compose.vps.yml ps
```

Должны быть запущены:
- `quote-production` (Up, healthy)
- `quote-staging` (Up, healthy)
- `quote-nginx` (Up, healthy)
- `quote-certbot` (Up)

### 5.3. Получить SSL сертификаты

**⚠️ ВАЖНО:** Убедитесь, что DNS настроен и порты 80, 443 открыты!

```bash
cd /opt/quote-calculator

# Получить сертификаты для обоих доменов
docker-compose -f docker-compose.vps.yml run --rm certbot-init

# Certbot попросит:
# 1. Email для уведомлений
# 2. Согласие с Terms of Service (Y)
# 3. Подписку на новости (n)
```

**Если успешно:**
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/crm.magellania.net/fullchain.pem
Key is saved at: /etc/letsencrypt/live/crm.magellania.net/privkey.pem
```

### 5.4. Проверка сертификатов

```bash
# Посмотреть полученные сертификаты
docker-compose -f docker-compose.vps.yml exec nginx \
  ls -la /etc/letsencrypt/live/

# Должны быть папки:
# crm.magellania.net/
# staging.magellania.net/
```

---

## Шаг 6: Включение HTTPS

### 6.1. Перезапустить nginx

```bash
cd /opt/quote-calculator

# Перезапустить nginx для применения SSL конфигурации
docker-compose -f docker-compose.vps.yml restart nginx

# Проверить логи nginx
docker-compose -f docker-compose.vps.yml logs -f nginx
```

### 6.2. Проверка HTTPS

```bash
# С сервера
curl -I https://crm.magellania.net/health
curl -I https://staging.magellania.net/health

# Должны вернуть HTTP/2 200
```

### 6.3. Проверка в браузере

Откройте в браузере:
- **Production:** https://crm.magellania.net
- **Staging:** https://staging.magellania.net

✅ **Должны увидеть зеленый замок (SSL работает)**

---

## Проверка и мониторинг

### Статус всех контейнеров

```bash
docker-compose -f docker-compose.vps.yml ps

# Все должны быть (healthy):
# quote-production    Up (healthy)
# quote-staging       Up (healthy)
# quote-nginx         Up (healthy)
# quote-certbot       Up
```

### Проверка логов

```bash
# Все логи
docker-compose -f docker-compose.vps.yml logs -f

# Только production
docker-compose -f docker-compose.vps.yml logs -f quote-production

# Только nginx
docker-compose -f docker-compose.vps.yml logs -f nginx

# Ошибки nginx
docker-compose -f docker-compose.vps.yml exec nginx tail -f /var/log/nginx/quotes-production-error.log
```

### Использование ресурсов

```bash
# CPU и Memory
docker stats

# Disk usage
docker system df

# Volumes
docker volume ls
```

### Health checks

```bash
# Production health
curl http://localhost:4000/health
curl https://crm.magellania.net/health

# Staging health
curl http://localhost:4001/health
curl https://staging.magellania.net/health
```

### Проверка БД внутри контейнера

```bash
# Войти в production контейнер
docker exec -it quote-production sh

# Внутри контейнера:
sqlite3 /app/db/quotes.db

# SQL команды:
.tables
.schema organizations
SELECT * FROM organizations;
SELECT * FROM users WHERE id='superadmin';
.quit

# Выйти из контейнера
exit
```

---

## Backup и восстановление

### Автоматический бэкап БД (ежедневно в 3:00)

```bash
# Создать скрипт бэкапа
cat > /opt/backup-quote-db.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/backups

# Backup production database volume
docker run --rm \
  -v quote-prod-db:/data \
  -v ${BACKUP_DIR}:/backup \
  alpine tar czf /backup/quote-prod-db_${DATE}.tar.gz -C /data .

# Backup staging database volume
docker run --rm \
  -v quote-staging-db:/data \
  -v ${BACKUP_DIR}:/backup \
  alpine tar czf /backup/quote-staging-db_${DATE}.tar.gz -C /data .

# Удалить бэкапы старше 30 дней
find ${BACKUP_DIR} -name "quote-*-db_*.tar.gz" -mtime +30 -delete

echo "✅ Backup complete: ${DATE}"
EOF

# Сделать исполняемым
chmod +x /opt/backup-quote-db.sh

# Добавить в crontab
crontab -e

# Добавить строку:
0 3 * * * /opt/backup-quote-db.sh >> /opt/logs/backup.log 2>&1
```

### Ручной бэкап

```bash
# Production DB
docker run --rm \
  -v quote-prod-db:/data \
  -v /opt/backups:/backup \
  alpine tar czf /backup/manual_prod_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# Staging DB
docker run --rm \
  -v quote-staging-db:/data \
  -v /opt/backups:/backup \
  alpine tar czf /backup/manual_staging_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# SSL Certificates
docker run --rm \
  -v quote-certbot-etc:/data \
  -v /opt/backups:/backup \
  alpine tar czf /backup/ssl_certs_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

### Восстановление из бэкапа

```bash
# Остановить контейнеры
cd /opt/quote-calculator
docker-compose -f docker-compose.vps.yml down

# Восстановить production БД
docker run --rm \
  -v quote-prod-db:/data \
  -v /opt/backups:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/BACKUP_FILE.tar.gz -C /data"

# Запустить контейнеры
docker-compose -f docker-compose.vps.yml up -d

# Проверить
docker-compose -f docker-compose.vps.yml logs -f quote-production
```

---

## Troubleshooting

### Проблема: Контейнеры не стартуют

```bash
# Проверить логи
docker-compose -f docker-compose.vps.yml logs

# Проверить docker daemon
sudo systemctl status docker

# Перезапустить docker
sudo systemctl restart docker
docker-compose -f docker-compose.vps.yml up -d
```

### Проблема: SSL сертификаты не получаются

```bash
# Проверить DNS
dig crm.magellania.net +short

# Проверить порт 80 доступен
curl -I http://crm.magellania.net/.well-known/acme-challenge/test

# Проверить логи certbot
docker-compose -f docker-compose.vps.yml logs certbot-init

# Попробовать вручную (dry-run)
docker-compose -f docker-compose.vps.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  --email admin@magellania.com \
  --agree-tos --dry-run \
  -d crm.magellania.net
```

### Проблема: 502 Bad Gateway

```bash
# Проверить что backend контейнеры запущены
docker-compose -f docker-compose.vps.yml ps quote-production quote-staging

# Проверить health
curl http://localhost:4000/health
curl http://localhost:4001/health

# Проверить nginx конфигурацию
docker-compose -f docker-compose.vps.yml exec nginx nginx -t

# Посмотреть nginx error log
docker-compose -f docker-compose.vps.yml exec nginx tail -50 /var/log/nginx/quotes-production-error.log
```

### Проблема: Database locked

```bash
# Остановить все контейнеры
docker-compose -f docker-compose.vps.yml down

# Проверить WAL файлы
docker run --rm -v quote-prod-db:/data alpine ls -lah /data/

# Запустить заново
docker-compose -f docker-compose.vps.yml up -d
```

### Проблема: Высокое использование CPU/Memory

```bash
# Посмотреть статистику
docker stats

# Ограничить ресурсы в docker-compose.vps.yml (уже настроено):
# resources:
#   limits:
#     cpus: '1.0'
#     memory: 512M

# Перезапустить с новыми лимитами
docker-compose -f docker-compose.vps.yml up -d --force-recreate
```

---

## Полезные команды

### Управление контейнерами

```bash
cd /opt/quote-calculator

# Запустить все
docker-compose -f docker-compose.vps.yml up -d

# Остановить все
docker-compose -f docker-compose.vps.yml down

# Перезапустить production
docker-compose -f docker-compose.vps.yml restart quote-production

# Пересобрать образы
docker-compose -f docker-compose.vps.yml build --no-cache

# Удалить все (ОПАСНО! Удалит volumes)
docker-compose -f docker-compose.vps.yml down -v
```

### Обновление кода

```bash
cd /opt/quote-calculator

# Бэкап БД перед обновлением
/opt/backup-quote-db.sh

# Остановить контейнеры
docker-compose -f docker-compose.vps.yml down

# Обновить код
git fetch origin
git checkout db_initial_schema_refactoring
git pull origin db_initial_schema_refactoring

# Пересобрать и запустить
docker-compose -f docker-compose.vps.yml up -d --build

# Проверить
docker-compose -f docker-compose.vps.yml ps
docker-compose -f docker-compose.vps.yml logs -f quote-production
```

### Очистка Docker

```bash
# Удалить неиспользуемые образы
docker image prune -a

# Удалить неиспользуемые volumes
docker volume prune

# Полная очистка (ОСТОРОЖНО!)
docker system prune -a --volumes
```

---

## Безопасность

### Изменить пароль superadmin

```bash
# Войти в production контейнер
docker exec -it quote-production sh

# Запустить Node.js
node

# JavaScript код для генерации нового хэша:
const bcrypt = require('bcrypt');
const newPassword = 'YourNewSecurePassword123!';
bcrypt.hash(newPassword, 10).then(hash => {
  console.log('New password hash:', hash);
  process.exit();
});

# Скопировать hash и выйти из Node.js

# Обновить пароль в БД:
sqlite3 /app/db/quotes.db
UPDATE users SET password_hash = 'PASTE_HASH_HERE' WHERE id = 'superadmin';
.quit

# Выйти из контейнера
exit
```

### Firewall настройки

```bash
# Разрешить только 80 и 443
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp  # SSH
sudo ufw enable
sudo ufw status
```

---

## 📊 Итоговый чеклист

- [ ] Docker и Docker Compose установлены
- [ ] Репозиторий склонирован (ветка `db_initial_schema_refactoring`)
- [ ] `.env.production` создан с случайными секретами
- [ ] Production контейнер запущен и healthy
- [ ] БД создалась с новой схемой (SCHEMA_V3.0)
- [ ] Production credentials работают (superadmin)
- [ ] DNS настроен (если нужен SSL)
- [ ] SSL сертификаты получены
- [ ] HTTPS работает
- [ ] Автоматический бэкап настроен
- [ ] Пароль superadmin изменён
- [ ] Firewall настроен

---

## 🎉 Готово!

**Production:** https://crm.magellania.net
**Staging:** https://staging.magellania.net

**Credentials:**
- Username: `superadmin`
- Password: `magellania2025` (ИЗМЕНИТЬ!)

**Мониторинг:**
```bash
watch -n 5 'docker-compose -f docker-compose.vps.yml ps'
```

---

**Вопросы?** Смотрите логи: `docker-compose -f docker-compose.vps.yml logs -f`
