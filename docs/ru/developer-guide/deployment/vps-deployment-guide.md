# Пошаговое развертывание Quote Calculator на VPS

Полная инструкция по развертыванию приложения на Hostinger VPS с доменами `crm.magellania.net` (production) и `staging.magellania.net` (staging).

---

## 📋 Предварительные требования

Убедитесь что выполнено:

- ✅ **VPS настроен** (см. [vps-setup.md](vps-setup.md))
  - Docker и Docker Compose установлены
  - UFW firewall настроен (порты 22, 80, 443 открыты)
  - Пользователь `deployer` создан
  - Portainer запущен (опционально)

- ✅ **DNS настроен**
  - `crm.magellania.net` → `69.62.104.218` ✅
  - `staging.magellania.net` → `69.62.104.218` ✅
  - DNS пропагация завершена (проверено через `dig`)

- ✅ **Git репозиторий готов**
  - Все конфигурационные файлы закоммичены
  - `.env`, `.env.production`, `.env.staging` настроены
  - `nginx/conf.d/quotes.conf` обновлен с реальными доменами

---

## 🎯 Обзор процесса

**Время развертывания:** 10-15 минут

Что будет развернуто:
1. **Production контейнер** - `crm.magellania.net` (порт 4000)
2. **Staging контейнер** - `staging.magellania.net` (порт 4001)
3. **Nginx reverse proxy** - SSL termination + routing
4. **Certbot** - автоматические SSL сертификаты
5. **Automated backups** - ежедневные бэкапы баз данных

---

## 🚀 Шаг 1: Подключение к VPS

```bash
# Подключение через SSH
ssh deployer@69.62.104.218

# Или если настроен SSH config:
# ssh vps-magellania
```

---

## 📦 Шаг 2: Клонирование репозитория

```bash
# Создать директории для проекта и бэкапов
sudo mkdir -p /opt/quote-calculator
sudo mkdir -p /opt/backups
sudo chown deployer:deployer /opt/quote-calculator
sudo chown deployer:deployer /opt/backups

# Перейти в директорию проекта
cd /opt/quote-calculator

# Клонировать репозиторий
git clone https://github.com/bogisis/magellania_crm.git .

# Проверить что все файлы на месте
ls -la

# Должны быть:
# - docker-compose.vps.yml
# - .env
# - .env.production
# - .env.staging
# - nginx/conf.d/quotes.conf
# - scripts/backup-vps.sh
```

**Важно:** Если репозиторий приватный, нужно настроить SSH ключи для GitHub:

```bash
# Генерация SSH ключа для GitHub
ssh-keygen -t ed25519 -C "deployer@magellania-vps"

# Вывести публичный ключ
cat ~/.ssh/id_ed25519.pub

# Скопировать и добавить в GitHub: Settings → SSH and GPG keys → New SSH key
```

---

## 🔧 Шаг 3: Проверка конфигурации

```bash
# Проверить .env файл
cat .env

# Должно быть:
# DOMAIN=crm.magellania.net
# STAGING_DOMAIN=staging.magellania.net
# CERTBOT_EMAIL=admin@magellania.net

# Проверить nginx конфигурацию
cat nginx/conf.d/quotes.conf | grep server_name

# Должно быть:
# server_name crm.magellania.net;
# server_name staging.magellania.net;

# Проверить права на скрипт бэкапа
chmod +x scripts/backup-vps.sh
```

---

## 🌐 Шаг 4: Первоначальный запуск Nginx (для Let's Encrypt)

Перед получением SSL сертификатов нужно запустить Nginx, чтобы Let's Encrypt мог пройти HTTP-01 challenge.

```bash
# Запустить только Nginx (без SSL пока)
docker compose -f docker-compose.vps.yml up -d nginx

# Проверить что Nginx запустился
docker ps | grep nginx

# Проверить логи
docker logs quote-nginx

# Проверить что порт 80 открыт
curl -I http://crm.magellania.net
curl -I http://staging.magellania.net

# Ожидаемый ответ: HTTP/1.1 502 Bad Gateway (это нормально, backend еще не запущен)
```

---

## 🔐 Шаг 5: Получение SSL сертификатов

Теперь запросим SSL сертификаты для обоих доменов.

```bash
# ВАЖНО: Certbot попытается получить сертификаты для обоих доменов одной командой
# Убедитесь что DNS записи проверены и работают!

# Получить сертификаты
docker compose -f docker-compose.vps.yml run --rm certbot-init

# Вы должны увидеть:
# ✅ Successfully received certificate.
# ✅ Certificate is saved at: /etc/letsencrypt/live/crm.magellania.net/fullchain.pem
# ✅ Certificate is saved at: /etc/letsencrypt/live/staging.magellania.net/fullchain.pem
```

**Если получили ошибку:**

```bash
# Проверка 1: DNS работает?
dig crm.magellania.net +short
dig staging.magellania.net +short
# Оба должны вернуть: 69.62.104.218

# Проверка 2: Порт 80 доступен?
curl -I http://crm.magellania.net/.well-known/acme-challenge/test
# Ожидается: 404 (это нормально)

# Проверка 3: Firewall открыт?
sudo ufw status | grep 80

# Если проблемы, смотрите логи:
docker logs quote-nginx
docker logs quote-certbot-init
```

---

## 🎉 Шаг 6: Запуск полного стека

После успешного получения SSL сертификатов запускаем все контейнеры.

```bash
# Перезапустить Nginx (чтобы подхватил SSL)
docker compose -f docker-compose.vps.yml restart nginx

# Запустить production и staging контейнеры
docker compose -f docker-compose.vps.yml up -d

# Проверить что все контейнеры запущены
docker ps

# Должны быть запущены:
# - quote-production (порт 4000)
# - quote-staging (порт 4001)
# - quote-nginx (порты 80, 443)
# - quote-certbot (автообновление SSL)
```

**Мониторинг запуска:**

```bash
# Следить за логами в реальном времени
docker compose -f docker-compose.vps.yml logs -f

# Ctrl+C для выхода

# Проверить логи отдельных контейнеров
docker logs quote-production
docker logs quote-staging
docker logs quote-nginx

# Проверить health checks
docker inspect quote-production | grep -A 10 Health
```

---

## ✅ Шаг 7: Проверка работоспособности

### 7.1 Health checks

```bash
# Production health
curl -k https://crm.magellania.net/health

# Ожидаемый ответ:
# {"status":"ok","timestamp":"2025-01-17T..."}

# Staging health
curl -k https://staging.magellania.net/health

# Ожидаемый ответ:
# {"status":"ok","timestamp":"2025-01-17T..."}
```

### 7.2 Браузер

Откройте в браузере:

1. **Production:** https://crm.magellania.net
   - ✅ Должен открыться Quote Calculator
   - ✅ Зеленый замочек SSL
   - ✅ Сертификат от Let's Encrypt

2. **Staging:** https://staging.magellania.net
   - ✅ Должен открыться Quote Calculator
   - ✅ Зеленый замочек SSL
   - ✅ Header: `X-Environment: staging`

### 7.3 Проверка API

```bash
# Production API
curl -X GET https://crm.magellania.net/api/estimates

# Staging API
curl -X GET https://staging.magellania.net/api/estimates

# Ожидаемый ответ: [] (пустой массив, т.к. нет данных пока)
```

---

## 📊 Шаг 8: Мониторинг и логи

### Docker статистика

```bash
# Потребление ресурсов
docker stats

# Должно быть примерно:
# quote-production: ~100-200MB RAM, ~5% CPU
# quote-staging:    ~80-150MB RAM,  ~3% CPU
# quote-nginx:      ~10-20MB RAM,   ~1% CPU
```

### Логи

```bash
# Все логи
docker compose -f docker-compose.vps.yml logs -f

# Production логи
docker logs -f quote-production

# Nginx access logs
docker exec quote-nginx tail -f /var/log/nginx/quotes-production-access.log

# Nginx error logs
docker exec quote-nginx tail -f /var/log/nginx/quotes-production-error.log
```

### Portainer (если установлен)

1. Открыть: https://69.62.104.218:9443
2. Войти с admin credentials
3. Containers → Видны все контейнеры
4. Volumes → Видны все volumes (db, logs, catalogs, etc.)

---

## 🔄 Шаг 9: Настройка автоматических бэкапов

```bash
# Проверить скрипт бэкапа
cat /opt/quote-calculator/scripts/backup-vps.sh

# Сделать исполняемым (если еще не сделано)
chmod +x /opt/quote-calculator/scripts/backup-vps.sh

# Протестировать бэкап вручную
cd /opt/quote-calculator
./scripts/backup-vps.sh

# Проверить что бэкапы созданы
ls -lh /opt/backups/

# Должны быть:
# prod_YYYYMMDD_HHMMSS.db
# staging_YYYYMMDD_HHMMSS.db

# Настроить cron для автоматических бэкапов (3:00 AM каждый день)
crontab -e

# Добавить строку:
0 3 * * * /opt/quote-calculator/scripts/backup-vps.sh >> /opt/quote-calculator/backup.log 2>&1

# Сохранить и выйти (Ctrl+X, Y, Enter)

# Проверить что cron настроен
crontab -l
```

**Проверка бэкапов:**

```bash
# Просмотр лога бэкапов (после первого запуска)
tail -f /opt/quote-calculator/backup.log

# Список всех бэкапов
ls -lh /opt/backups/ | sort

# Тест восстановления из бэкапа (не удаляет текущую БД)
sqlite3 /tmp/test.db ".restore /opt/backups/prod_20250117_030001.db"
sqlite3 /tmp/test.db ".tables"
```

---

## 🔄 Шаг 10: Обновление приложения (в будущем)

Когда нужно обновить приложение с новым кодом:

```bash
# Подключиться к VPS
ssh deployer@69.62.104.218

# Перейти в директорию проекта
cd /opt/quote-calculator

# Создать бэкап перед обновлением (ОБЯЗАТЕЛЬНО!)
./scripts/backup-vps.sh

# Получить последние изменения
git pull origin main

# Пересобрать и перезапустить контейнеры
docker compose -f docker-compose.vps.yml build
docker compose -f docker-compose.vps.yml up -d

# Проверить что все запустилось
docker ps
docker compose -f docker-compose.vps.yml logs -f
```

---

## 🛠️ Управление контейнерами

### Остановка

```bash
# Остановить все
docker compose -f docker-compose.vps.yml stop

# Остановить только production
docker stop quote-production

# Остановить только staging
docker stop quote-staging
```

### Перезапуск

```bash
# Перезапустить все
docker compose -f docker-compose.vps.yml restart

# Перезапустить только production
docker restart quote-production

# Перезапустить только nginx
docker restart quote-nginx
```

### Просмотр логов

```bash
# Все логи
docker compose -f docker-compose.vps.yml logs -f

# Последние 100 строк production
docker logs --tail 100 quote-production

# Только ошибки
docker logs quote-production 2>&1 | grep ERROR
```

---

## 🆘 Troubleshooting

### Проблема 1: SSL сертификаты не получены

**Симптомы:**
- `certbot-init` завершается с ошибкой
- "Failed to verify domain ownership"

**Решение:**
```bash
# Проверка 1: DNS работает?
dig crm.magellania.net +short
dig staging.magellania.net +short

# Проверка 2: Nginx отвечает на порту 80?
curl -I http://crm.magellania.net

# Проверка 3: Nginx логи
docker logs quote-nginx | grep error

# Проверка 4: Certbot логи
docker logs quote-certbot-init

# Если DNS не работает:
# - Подождать 15 минут для пропагации
# - Проверить настройки в Namecheap

# Если Nginx не отвечает:
docker compose -f docker-compose.vps.yml restart nginx

# Повторить попытку получения SSL
docker compose -f docker-compose.vps.yml run --rm certbot-init
```

### Проблема 2: 502 Bad Gateway

**Симптомы:**
- Браузер показывает "502 Bad Gateway"
- Nginx логи: "upstream timed out"

**Решение:**
```bash
# Проверить что backend контейнеры запущены
docker ps | grep quote-

# Если контейнер не запущен:
docker compose -f docker-compose.vps.yml up -d quote-production

# Проверить логи backend
docker logs quote-production

# Проверить health check
curl http://localhost:4000/health

# Если не отвечает, перезапустить контейнер
docker restart quote-production
```

### Проблема 3: Контейнер постоянно перезапускается

**Симптомы:**
- `docker ps` показывает "Restarting"
- Health check fails

**Решение:**
```bash
# Посмотреть логи
docker logs quote-production

# Часто это:
# - Отсутствие volumes
# - Ошибка в .env файлах
# - Порт уже занят

# Проверить volumes
docker volume ls | grep quote-

# Проверить порты
sudo lsof -i :4000
sudo lsof -i :4001

# Если порт занят, убить процесс
sudo kill -9 <PID>

# Пересоздать контейнер
docker compose -f docker-compose.vps.yml up -d --force-recreate quote-production
```

### Проблема 4: Бэкапы не создаются

**Симптомы:**
- Папка `/opt/backups` пустая
- Cron не выполняется

**Решение:**
```bash
# Проверить что cron настроен
crontab -l

# Запустить скрипт вручную для отладки
cd /opt/quote-calculator
./scripts/backup-vps.sh

# Проверить права
ls -la scripts/backup-vps.sh

# Если нет прав execute:
chmod +x scripts/backup-vps.sh

# Проверить что контейнеры запущены
docker ps | grep quote-

# Проверить лог бэкапов
cat /opt/quote-calculator/backup.log
```

---

## 📊 Мониторинг производительности

### Системные ресурсы

```bash
# CPU и память
htop

# Дисковое пространство
df -h

# Docker статистика
docker stats

# Размер volumes
docker system df -v | grep quote-
```

### Nginx метрики

```bash
# Access log - топ IP адресов
docker exec quote-nginx awk '{print $1}' /var/log/nginx/quotes-production-access.log | sort | uniq -c | sort -rn | head -10

# Access log - коды ответов
docker exec quote-nginx awk '{print $9}' /var/log/nginx/quotes-production-access.log | sort | uniq -c | sort -rn

# Error log - последние ошибки
docker exec quote-nginx tail -20 /var/log/nginx/quotes-production-error.log
```

---

## ✅ Чеклист готовности к продакшену

Перед тем как открыть доступ клиентам:

- [ ] Оба домена открываются по HTTPS без ошибок
- [ ] SSL сертификаты валидны (зеленый замочек)
- [ ] Health checks возвращают `{"status":"ok"}`
- [ ] Можно создать смету и сохранить её
- [ ] Бэкапы настроены и выполняются
- [ ] Мониторинг через Portainer работает (опционально)
- [ ] Firewall настроен (только 22, 80, 443 открыты)
- [ ] Логи не показывают критичных ошибок
- [ ] Docker containers имеют `restart: unless-stopped`
- [ ] Администратор знает как обновлять приложение

---

## 🔐 Безопасность

### Рекомендации

1. **Регулярные обновления**
```bash
# Каждую неделю
sudo apt update && sudo apt upgrade -y

# Docker images
docker compose -f docker-compose.vps.yml pull
docker compose -f docker-compose.vps.yml up -d
```

2. **Мониторинг логов**
```bash
# Подозрительная активность в Nginx
docker exec quote-nginx grep -i "POST" /var/log/nginx/quotes-production-access.log | tail -50

# Ошибки приложения
docker logs quote-production | grep -i error
```

3. **Firewall audit**
```bash
# Проверять каждый месяц
sudo ufw status verbose
```

4. **Backup verification**
```bash
# Раз в месяц проверять что бэкапы можно восстановить
sqlite3 /tmp/restore-test.db ".restore /opt/backups/prod_latest.db"
sqlite3 /tmp/restore-test.db "SELECT COUNT(*) FROM estimates;"
```

---

## 📚 Дополнительные ресурсы

- **Docker Compose документация:** https://docs.docker.com/compose/
- **Let's Encrypt troubleshooting:** https://letsencrypt.org/docs/
- **Nginx reverse proxy guide:** https://nginx.org/en/docs/
- **SQLite backup best practices:** https://www.sqlite.org/backup.html

---

## 🎉 Готово!

Приложение успешно развернуто на VPS!

**Production:** https://crm.magellania.net
**Staging:** https://staging.magellania.net

Следующие шаги:
1. Импортировать существующие каталоги и сметы
2. Настроить пользователей
3. Провести финальное тестирование
4. Открыть доступ клиентам

---

[← Назад к VPS Setup](vps-setup.md) | [SSL Configuration →](ssl.md) | [Мониторинг →](monitoring.md)
