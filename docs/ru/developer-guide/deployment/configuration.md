# Конфигурация окружения

Подробное руководство по настройке конфигурационных файлов для развертывания на VPS.

---

## 🎯 Обзор

Для развертывания Quote Calculator на VPS необходимо настроить:

1. **Environment переменные** (.env файлы)
2. **Docker Compose конфигурацию** (docker-compose.vps.yml)
3. **Nginx конфигурацию** (nginx/conf.d/quotes.conf)

---

## 📁 Структура конфигурации

```
/opt/quote-calculator/
├── .env.production          # Production окружение
├── .env.staging             # Staging окружение
├── docker-compose.vps.yml   # Docker конфигурация для VPS
├── nginx/
│   ├── nginx.conf          # Основная конфигурация Nginx
│   └── conf.d/
│       └── quotes.conf     # Конфигурация для quote-calculator
└── server.js               # Приложение
```

---

## 🔧 Environment переменные

### Файл .env.production

```bash
# ============================================================================
# Server Configuration
# ============================================================================

# Server port (внутренний порт контейнера)
PORT=4000

# Node environment
NODE_ENV=production

# Application environment
APP_ENV=production

# ============================================================================
# Storage Configuration
# ============================================================================

# Storage type: 'sqlite' (рекомендуется для production)
STORAGE_TYPE=sqlite

# Database path (внутри контейнера)
DB_PATH=/app/db/quotes.db

# Dual-write mode (отключен для production)
DUAL_WRITE_MODE=false

# ============================================================================
# Data Integrity & Safety
# ============================================================================

# Enable audit logging
ENABLE_AUDIT_LOG=true

# Enable optimistic locking (защита от concurrent edits)
ENABLE_OPTIMISTIC_LOCKING=true

# ============================================================================
# Performance
# ============================================================================

# JSON payload size limit
JSON_LIMIT=50mb

# Request timeout (30 seconds)
REQUEST_TIMEOUT=30000

# ============================================================================
# Logging (Winston)
# ============================================================================

# Log level: error, warn, info
LOG_LEVEL=info

# Console logging (ОТКЛЮЧЕНО для production - только file logs)
LOG_CONSOLE=false

# Log directory (внутри контейнера)
LOG_DIR=/app/logs

# SQL query logging (ОТКЛЮЧЕНО для production)
LOG_SQL_QUERIES=false

# ============================================================================
# Security
# ============================================================================

# CORS origins (укажите ваш домен)
# Например: CORS_ORIGIN=https://quotes.yourdomain.com
CORS_ORIGIN=*

# Допустимые HTTP методы
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
```

### Файл .env.staging

```bash
# ============================================================================
# Server Configuration
# ============================================================================

# Server port (внутренний порт контейнера)
PORT=4001

# Node environment
NODE_ENV=staging

# Application environment
APP_ENV=staging

# ============================================================================
# Storage Configuration
# ============================================================================

# Storage type: 'sqlite'
STORAGE_TYPE=sqlite

# Database path (внутри контейнера, отдельная БД от production)
DB_PATH=/app/db/quotes.db

# Dual-write mode (можно включить для тестирования миграции)
DUAL_WRITE_MODE=false

# ============================================================================
# Data Integrity & Safety
# ============================================================================

# Enable audit logging
ENABLE_AUDIT_LOG=true

# Enable optimistic locking
ENABLE_OPTIMISTIC_LOCKING=true

# ============================================================================
# Performance
# ============================================================================

# JSON payload size limit
JSON_LIMIT=50mb

# Request timeout (30 seconds)
REQUEST_TIMEOUT=30000

# ============================================================================
# Logging (Winston)
# ============================================================================

# Log level: debug для staging (больше информации для отладки)
LOG_LEVEL=debug

# Console logging (ВКЛЮЧЕНО для staging - удобнее смотреть логи)
LOG_CONSOLE=true

# Log directory (внутри контейнера)
LOG_DIR=/app/logs

# SQL query logging (ВКЛЮЧЕНО для staging - помогает отлаживать)
LOG_SQL_QUERIES=true

# ============================================================================
# Security
# ============================================================================

# CORS origins (для staging можно оставить более мягкие настройки)
CORS_ORIGIN=*

# Допустимые HTTP методы
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
```

### Создание файлов на VPS

```bash
# SSH в VPS
ssh deployer@your-vps-ip

# Перейти в директорию проекта
cd /opt/quote-calculator

# Создать .env.production
cat > .env.production << 'EOF'
PORT=4000
NODE_ENV=production
STORAGE_TYPE=sqlite
DB_PATH=/app/db/quotes.db
LOG_LEVEL=info
LOG_CONSOLE=false
ENABLE_AUDIT_LOG=true
ENABLE_OPTIMISTIC_LOCKING=true
EOF

# Создать .env.staging
cat > .env.staging << 'EOF'
PORT=4001
NODE_ENV=staging
STORAGE_TYPE=sqlite
DB_PATH=/app/db/quotes.db
LOG_LEVEL=debug
LOG_CONSOLE=true
LOG_SQL_QUERIES=true
ENABLE_AUDIT_LOG=true
ENABLE_OPTIMISTIC_LOCKING=true
EOF

# Проверка
ls -la .env.*
```

!!! warning "Безопасность"
    Никогда не коммитьте .env файлы с реальными секретами в Git! Убедитесь что они в .gitignore.

---

## 🐳 Docker Compose конфигурация

### Основной файл docker-compose.vps.yml

Этот файл уже создан в проекте. Основные секции:

#### Services

```yaml
services:
  # Production контейнер
  quote-production:
    build:
      context: .
      dockerfile: Dockerfile
      target: prod
    env_file: .env.production
    ports: []  # Порты не открываются наружу
    volumes:
      - quote-prod-db:/app/db
      - quote-prod-logs:/app/logs
    restart: unless-stopped

  # Staging контейнер
  quote-staging:
    build:
      context: .
      dockerfile: Dockerfile
      target: prod
    env_file: .env.staging
    ports: []
    volumes:
      - quote-staging-db:/app/db
      - quote-staging-logs:/app/logs
    restart: unless-stopped

  # Nginx reverse proxy
  nginx:
    image: nginx:1.25-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - certbot-etc:/etc/letsencrypt:ro
    depends_on:
      - quote-production
      - quote-staging
```

#### Volumes

```yaml
volumes:
  # Production данные
  quote-prod-db:
    name: quote-prod-db
    labels:
      backup: required

  # Staging данные
  quote-staging-db:
    name: quote-staging-db
    labels:
      backup: optional

  # SSL сертификаты
  certbot-etc:
    name: quote-certbot-etc
    labels:
      backup: required
```

### Переменные окружения для Docker Compose

Для настройки SSL сертификатов:

```bash
# На VPS создать файл с переменными
cat > /opt/quote-calculator/.env.docker << 'EOF'
# Domain configuration
DOMAIN=yourdomain.com
STAGING_DOMAIN=staging.yourdomain.com
CERTBOT_EMAIL=admin@yourdomain.com
EOF
```

---

## 🌐 Nginx конфигурация

### Базовая конфигурация nginx/conf.d/quotes.conf

```nginx
# ============================================================================
# PRODUCTION
# ============================================================================

# HTTP redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS Production
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Proxy to production container
    location / {
        proxy_pass http://quote-production:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location /health {
        proxy_pass http://quote-production:4000/health;
        access_log off;
    }
}

# ============================================================================
# STAGING
# ============================================================================

# HTTP redirect to HTTPS
server {
    listen 80;
    server_name staging.yourdomain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS Staging
server {
    listen 443 ssl http2;
    server_name staging.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;

    # Staging header
    add_header X-Environment "staging" always;
    add_header X-Robots-Tag "noindex, nofollow" always;

    location / {
        proxy_pass http://quote-staging:4001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Настройка Nginx конфигурации

```bash
# SSH в VPS
ssh deployer@your-vps-ip
cd /opt/quote-calculator

# Создать директорию для Nginx конфигов
mkdir -p nginx/conf.d

# Редактировать конфигурацию
nano nginx/conf.d/quotes.conf

# Замените:
# - yourdomain.com на ваш реальный домен
# - staging.yourdomain.com на ваш staging домен

# Сохранить: Ctrl+X, Y, Enter
```

### Проверка Nginx конфигурации

```bash
# После запуска контейнеров
docker-compose -f docker-compose.vps.yml exec nginx nginx -t

# Вывод должен быть:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful

# Перезагрузка при изменениях
docker-compose -f docker-compose.vps.yml exec nginx nginx -s reload
```

---

## 🔐 Переменные для SSL

### Настройка переменных окружения

```bash
# На VPS установить переменные для получения SSL
export DOMAIN=yourdomain.com
export STAGING_DOMAIN=staging.yourdomain.com
export CERTBOT_EMAIL=admin@yourdomain.com

# Сохранить в .bashrc для постоянства
echo "export DOMAIN=yourdomain.com" >> ~/.bashrc
echo "export CERTBOT_EMAIL=admin@yourdomain.com" >> ~/.bashrc

# Применить
source ~/.bashrc
```

---

## 📊 Проверка конфигурации

### Чеклист перед запуском

- [ ] `.env.production` создан и настроен
- [ ] `.env.staging` создан и настроен
- [ ] `nginx/conf.d/quotes.conf` обновлен с реальным доменом
- [ ] DNS A-записи настроены для домена и субдомена
- [ ] Переменные DOMAIN и CERTBOT_EMAIL установлены
- [ ] docker-compose.vps.yml без ошибок (`docker-compose config`)

### Команды проверки

```bash
# Проверка .env файлов
cat .env.production | grep -E "^(PORT|NODE_ENV|STORAGE_TYPE)"
cat .env.staging | grep -E "^(PORT|NODE_ENV|STORAGE_TYPE)"

# Проверка Nginx конфига (локально)
grep -E "server_name" nginx/conf.d/quotes.conf

# Проверка Docker Compose
docker-compose -f docker-compose.vps.yml config | grep -E "(image|env_file|ports)"

# Проверка DNS
dig yourdomain.com +short
dig staging.yourdomain.com +short
```

---

## 🔄 Применение изменений

### Первичное развертывание

```bash
# 1. Создать конфигурационные файлы (см. выше)

# 2. Собрать образы
docker-compose -f docker-compose.vps.yml build

# 3. Запустить контейнеры
docker-compose -f docker-compose.vps.yml up -d

# 4. Проверить статус
docker-compose -f docker-compose.vps.yml ps
```

### Обновление конфигурации

```bash
# После изменения .env файлов:
docker-compose -f docker-compose.vps.yml restart quote-production
docker-compose -f docker-compose.vps.yml restart quote-staging

# После изменения Nginx конфига:
docker-compose -f docker-compose.vps.yml exec nginx nginx -s reload

# Или полный перезапуск Nginx:
docker-compose -f docker-compose.vps.yml restart nginx
```

---

## 🐛 Troubleshooting

### Проблема: Environment переменные не применяются

```bash
# Проверить что файл существует
ls -la .env.production

# Проверить что файл указан в docker-compose
grep "env_file" docker-compose.vps.yml

# Пересоздать контейнер
docker-compose -f docker-compose.vps.yml up -d --force-recreate quote-production

# Проверить переменные внутри контейнера
docker exec quote-production env | grep NODE_ENV
```

### Проблема: Nginx не видит backend

```bash
# Проверить что контейнеры в одной сети
docker network inspect quote-vps-network

# Проверить DNS резолюцию внутри Nginx
docker exec quote-nginx ping quote-production -c 1
docker exec quote-nginx ping quote-staging -c 1

# Проверить порты backend
docker exec quote-production netstat -tulpn | grep 4000
```

### Проблема: SSL сертификат не найден

```bash
# Проверить наличие сертификата
docker exec quote-nginx ls -la /etc/letsencrypt/live/

# Если пусто - нужно получить сертификат
# См. руководство по SSL
```

---

## 📚 Дополнительные ресурсы

- [Nginx Documentation](https://nginx.org/en/docs/)
- [Docker Compose File Reference](https://docs.docker.com/compose/compose-file/)
- [Environment Variables Best Practices](https://12factor.net/config)
- [SSL Setup Guide](ssl.md)

---

[← Назад к Deployment](index.md) | [SSL Setup →](ssl.md)
