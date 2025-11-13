# Docker установка

**Версия:** 2.3.0
**Дата обновления:** 6 ноября 2025

## Введение

Docker установка - это **рекомендуемый способ** для продакшн окружения. Обеспечивает изоляцию, легкое обновление и автоматическое управление данными.

## Преимущества Docker установки

✅ **Изолированная среда** - не зависит от системных пакетов
✅ **Легкое обновление** - `docker-compose pull && docker-compose up -d`
✅ **Автоматические backups** - встроенная система резервного копирования
✅ **Продакшн готово** - оптимизированная конфигурация
✅ **Масштабирование** - легко добавить реплики
✅ **Откат** - быстрое возвращение к предыдущей версии

---

## Требования

Перед началом убедитесь, что у вас установлено:

- ✅ **Docker** версии 20.10 или выше
- ✅ **Docker Compose** версии 2.0 или выше

### Проверка версий

```bash
# Проверить Docker
docker --version
# Ожидается: Docker version 20.10.x или выше

# Проверить Docker Compose
docker-compose --version
# Ожидается: Docker Compose version v2.x.x или выше
```

### Установка Docker

**macOS:**
```bash
# Скачать Docker Desktop
# https://www.docker.com/products/docker-desktop
```

**Linux (Ubuntu/Debian):**
```bash
# Установить Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Добавить пользователя в группу docker
sudo usermod -aG docker $USER

# Установить Docker Compose
sudo apt-get install docker-compose-plugin
```

**Windows:**
```bash
# Скачать Docker Desktop для Windows
# https://www.docker.com/products/docker-desktop
```

---

## Быстрая установка

### Шаг 1: Скачать проект

```bash
git clone https://github.com/your-org/quote-calculator.git
cd quote-calculator
```

### Шаг 2: Запустить контейнеры

```bash
docker-compose up -d
```

**Что происходит:**
- Скачиваются Docker images (~200MB)
- Создаются контейнеры для приложения
- Инициализируется SQLite база данных
- Запускается сервер на порту 4000

**Ожидаемый вывод:**
```
[+] Running 2/2
 ✔ Network quote-calculator_default  Created
 ✔ Container quote-calculator-app-1  Started
```

### Шаг 3: Проверить работу

```bash
# Проверить статус контейнеров
docker-compose ps

# Проверить health check
curl http://localhost:4000/health

# Открыть в браузере
open http://localhost:4000
```

**Готово!** Система запущена и работает.

---

## Docker Compose конфигурация

### Файл docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: quote-calculator-app
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - STORAGE_TYPE=sqlite
      - PORT=4000
      - JSON_LIMIT=50mb
      - LOG_LEVEL=info
    volumes:
      # Персистентные данные
      - ./db:/app/db
      - ./logs:/app/logs
      - ./backup:/app/backup
      # Legacy файлы (опционально)
      - ./estimate:/app/estimate
      - ./catalog:/app/catalog
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Переменные окружения

Создайте файл `.env` в корне проекта:

```bash
# .env
NODE_ENV=production
STORAGE_TYPE=sqlite
PORT=4000
JSON_LIMIT=50mb
LOG_LEVEL=info
DB_PATH=/app/db/quotes.db
```

---

## Dockerfile

```dockerfile
FROM node:16-alpine

WORKDIR /app

# Установить зависимости
COPY package*.json ./
RUN npm ci --only=production

# Скопировать исходники
COPY . .

# Создать необходимые директории
RUN mkdir -p db logs backup estimate catalog

# Открыть порт
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Запустить сервер
CMD ["node", "server-with-db.js"]
```

---

## Управление контейнерами

### Запуск

```bash
# Запустить в фоновом режиме
docker-compose up -d

# Запустить с логами
docker-compose up

# Пересобрать и запустить
docker-compose up -d --build
```

### Остановка

```bash
# Остановить контейнеры
docker-compose stop

# Остановить и удалить контейнеры
docker-compose down

# Остановить и удалить контейнеры + volumes (⚠️ удалит данные!)
docker-compose down -v
```

### Перезапуск

```bash
# Перезапустить все контейнеры
docker-compose restart

# Перезапустить конкретный сервис
docker-compose restart app
```

### Логи

```bash
# Посмотреть логи
docker-compose logs

# Следить за логами
docker-compose logs -f

# Последние 100 строк
docker-compose logs --tail=100

# Логи конкретного контейнера
docker-compose logs app
```

### Статус

```bash
# Статус контейнеров
docker-compose ps

# Детальная информация
docker-compose ps -a

# Потребление ресурсов
docker stats quote-calculator-app
```

---

## Volumes и данные

### Персистентные volumes

Docker Compose автоматически создает bind mounts для:

```yaml
volumes:
  - ./db:/app/db              # База данных SQLite
  - ./logs:/app/logs          # Логи сервера
  - ./backup:/app/backup      # Автоматические backups
  - ./estimate:/app/estimate  # Legacy JSON сметы
  - ./catalog:/app/catalog    # Legacy JSON каталоги
```

**Важно:** Данные хранятся на хосте и сохраняются при перезапуске контейнеров.

### Просмотр volumes

```bash
# Список volumes
docker volume ls

# Информация о volume
docker volume inspect quote-calculator_db_data
```

### Backup volumes

```bash
# Способ 1: Копирование директорий на хосте
cp -r db/ backup/db-$(date +%Y%m%d)/
cp -r logs/ backup/logs-$(date +%Y%m%d)/

# Способ 2: Экспорт через API
curl http://localhost:4000/api/export/all > backup-$(date +%Y%m%d).json

# Способ 3: Экспорт базы данных
curl http://localhost:4000/api/export/database > backup-$(date +%Y%m%d).db
```

---

## Обновление

### Способ 1: Автоматическое обновление

```bash
# Остановить контейнеры
docker-compose down

# Обновить код
git pull origin main

# Пересобрать образы
docker-compose build

# Запустить обновленные контейнеры
docker-compose up -d

# Проверить логи
docker-compose logs -f
```

### Способ 2: Обновление только образа

```bash
# Скачать новые образы
docker-compose pull

# Перезапустить с новыми образами
docker-compose up -d

# Удалить старые образы
docker image prune -f
```

### Откат к предыдущей версии

```bash
# Остановить контейнеры
docker-compose down

# Откатить код
git checkout v2.2.0

# Пересобрать
docker-compose build

# Запустить
docker-compose up -d
```

---

## Production конфигурация

### docker-compose.prod.yml

Для продакшена используйте оптимизированную конфигурацию:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.prod
    container_name: quote-prod
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - STORAGE_TYPE=sqlite
      - LOG_LEVEL=warn
    volumes:
      - db_data:/app/db
      - logs_data:/app/logs
      - backup_data:/app/backup
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 60s
      timeout: 10s
      retries: 5
      start_period: 60s
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

  # Nginx reverse proxy
  nginx:
    image: nginx:alpine
    container_name: quote-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    restart: always

volumes:
  db_data:
    driver: local
  logs_data:
    driver: local
  backup_data:
    driver: local
```

### Запуск production конфигурации

```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

## Мониторинг и health checks

### Docker health check

Docker автоматически проверяет здоровье контейнера:

```bash
# Проверить health status
docker inspect --format='{{.State.Health.Status}}' quote-calculator-app

# История health checks
docker inspect --format='{{json .State.Health}}' quote-calculator-app | jq
```

### Kubernetes readiness/liveness probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 4000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: 4000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 1
```

### Prometheus метрики

Если используете Prometheus:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'quote-calculator'
    static_configs:
      - targets: ['quote-calculator-app:4000']
    metrics_path: '/metrics'
```

---

## Scaling и load balancing

### Горизонтальное масштабирование

```yaml
# docker-compose.scale.yml
version: '3.8'

services:
  app:
    # ... конфигурация ...
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx-lb.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - app
```

### nginx-lb.conf для load balancing

```nginx
upstream quote_backend {
    least_conn;
    server app_1:4000;
    server app_2:4000;
    server app_3:4000;
}

server {
    listen 80;

    location / {
        proxy_pass http://quote_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Запуск с масштабированием

```bash
# Запустить 3 реплики
docker-compose -f docker-compose.scale.yml up -d --scale app=3

# Проверить
docker-compose ps
```

---

## Безопасность

### Ограничение ресурсов

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Read-only filesystem

```yaml
services:
  app:
    read_only: true
    tmpfs:
      - /tmp
      - /app/logs
```

### Запуск от non-root пользователя

```dockerfile
# В Dockerfile
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser

USER appuser
```

### Secrets management

```yaml
services:
  app:
    secrets:
      - db_password
      - api_key

secrets:
  db_password:
    file: ./secrets/db_password.txt
  api_key:
    file: ./secrets/api_key.txt
```

---

## Backup и восстановление

### Автоматический backup скрипт

```bash
#!/bin/bash
# docker-backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/docker"

# Создать директорию
mkdir -p $BACKUP_DIR

# Backup через API
docker exec quote-calculator-app \
  curl -s http://localhost:4000/api/export/all > $BACKUP_DIR/full-$DATE.json

# Backup базы данных
docker exec quote-calculator-app \
  curl -s http://localhost:4000/api/export/database > $BACKUP_DIR/db-$DATE.db

# Backup volumes
docker run --rm \
  -v quote-calculator_db_data:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/volumes-$DATE.tar.gz /data

# Удалить старые backups (>7 дней)
find $BACKUP_DIR -name "*.json" -mtime +7 -delete
find $BACKUP_DIR -name "*.db" -mtime +7 -delete

echo "Backup completed: $DATE"
```

### Автоматизация с cron

```bash
# Добавить в crontab
crontab -e

# Backup каждый день в 2:00
0 2 * * * /path/to/docker-backup.sh >> /var/log/quote-backup.log 2>&1
```

### Восстановление

```bash
# Восстановление из JSON
curl -X POST http://localhost:4000/api/import/all \
  -H "Content-Type: application/json" \
  -d @backup-20251106_120000.json

# Восстановление базы данных
docker-compose down
cp backup/db-20251106_120000.db db/quotes.db
docker-compose up -d
```

---

## Типичные проблемы

### Порт уже используется

**Ошибка:**
```
Error: Bind for 0.0.0.0:4000 failed: port is already allocated
```

**Решение:**
```bash
# Изменить порт в docker-compose.yml
ports:
  - "3000:4000"  # Хост:Контейнер

# Или остановить процесс, использующий порт
lsof -i :4000
kill -9 <PID>
```

### Контейнер падает

**Решение:**
```bash
# Посмотреть логи
docker-compose logs app

# Проверить health check
docker inspect quote-calculator-app | grep -A 10 Health

# Перезапустить
docker-compose restart app
```

### Недостаточно места на диске

**Ошибка:**
```
Error: no space left on device
```

**Решение:**
```bash
# Очистить неиспользуемые образы
docker image prune -a

# Очистить volumes
docker volume prune

# Очистить все
docker system prune -a --volumes
```

### Permission denied на volumes

**Решение:**
```bash
# Дать права на директории
chmod -R 755 db/ logs/ backup/

# Или в Dockerfile изменить владельца
RUN chown -R appuser:appuser /app
```

---

## Производительность

### Оптимизация образа

```dockerfile
# Multi-stage build для минимального размера
FROM node:16-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:16-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
CMD ["node", "server-with-db.js"]
```

### Кэширование слоев

```dockerfile
# Сначала копировать только package.json
COPY package*.json ./
RUN npm ci

# Потом исходники (изменяются чаще)
COPY . .
```

---

## Что дальше?

После успешной установки:

1. 📖 **[Начало работы](../getting-started/first-estimate.md)**
2. 🎯 **[Интерфейс приложения](../getting-started/interface.md)**
3. 📚 **[Работа со сметами](../working-with-estimates/index.md)**

---

## Дополнительные ресурсы

- 📖 **[Docker документация](https://docs.docker.com/)**
- 📖 **[Docker Compose документация](https://docs.docker.com/compose/)**
- 🔧 **[Production Deployment](../../developer-guide/deployment/production.md)**

---

**Предыдущий шаг:** [← Локальная установка](local.md)
**Следующий шаг:** [Системные требования →](requirements.md)
