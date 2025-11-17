# 🚀 Быстрое развертывание на VPS

Краткая инструкция для развертывания Quote Calculator на VPS Hostinger с доменами `crm.magellania.net` и `staging.magellania.net`.

---

## ✅ Статус подготовки

- ✅ DNS настроен и пропагирован
  - `crm.magellania.net` → `69.62.104.218`
  - `staging.magellania.net` → `69.62.104.218`
- ✅ Конфигурационные файлы готовы
- ✅ Git репозиторий закоммичен

---

## 🎯 Быстрый старт (15 минут)

### 1. Подключение к VPS

```bash
ssh deployer@69.62.104.218
```

### 2. Установка Node.js 18+ (если не установлен)

```bash
# Проверить текущую версию
node --version

# Если версия < 18, установить nvm и Node.js 18
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
nvm alias default 18

# Проверить
node --version  # Должно быть v18.x.x
```

### 3. Клонирование репозитория

```bash
sudo mkdir -p /opt/quote-calculator
sudo chown deployer:deployer /opt/quote-calculator
cd /opt/quote-calculator
git clone https://github.com/bogisis/magellania_crm.git .
```

**Если репозиторий приватный:**
```bash
# Сгенерировать SSH ключ
ssh-keygen -t ed25519 -C "deployer@magellania-vps"

# Показать публичный ключ
cat ~/.ssh/id_ed25519.pub

# Добавить в GitHub: Settings → SSH and GPG keys → New SSH key
```

### 4. Установка зависимостей

```bash
# Установить npm зависимости
npm install

# Сделать скрипт бэкапа исполняемым
chmod +x scripts/backup-vps.sh
```

### 5. Проверка конфигурации

```bash
# Проверить .env
cat .env
# Должно быть:
# DOMAIN=crm.magellania.net
# STAGING_DOMAIN=staging.magellania.net
# CERTBOT_EMAIL=admin@magellania.net
```

### 6. Запуск всех контейнеров

```bash
# Запустить все сервисы (nginx будет работать только на HTTP)
docker compose -f docker-compose.vps.yml up -d

# Проверить что контейнеры запущены
docker ps
# Должно быть:
# - quote-production (healthy)
# - quote-staging (healthy)
# - quote-nginx (running)

# Проверить что приложения доступны
curl http://crm.magellania.net/health
curl http://staging.magellania.net/health
```

### 7. Получение SSL сертификатов

```bash
# Получить сертификаты для обоих доменов
docker compose -f docker-compose.vps.yml run --rm certbot-init

# ✅ Ожидается:
# Successfully received certificate for crm.magellania.net
# Successfully received certificate for staging.magellania.net
```

### 8. Включение HTTPS

```bash
# Раскомментировать HTTPS блок в nginx.conf
# Редактировать файл nginx/nginx.conf (строки 113-136)
# Или выполнить git pull если изменения уже в репозитории

# Перезапустить nginx для применения SSL
docker compose -f docker-compose.vps.yml restart nginx

# Проверить HTTPS
curl https://crm.magellania.net/health
curl https://staging.magellania.net/health
```

### 9. Проверка работоспособности

```bash
# Health checks
curl https://crm.magellania.net/health
curl https://staging.magellania.net/health

# Ожидается: {"status":"healthy","version":"2.3.0",...}
```

**Открыть в браузере:**
- Production: https://crm.magellania.net
- Staging: https://staging.magellania.net

### 10. Настройка автоматических бэкапов

```bash
# Создать директорию для бэкапов
sudo mkdir -p /opt/backups
sudo chown deployer:deployer /opt/backups

# Протестировать бэкап
./scripts/backup-vps.sh

# Проверить что бэкапы созданы
ls -lh /opt/backups/

# Настроить cron (3:00 AM каждый день)
crontab -e

# Добавить строку:
0 3 * * * /opt/quote-calculator/scripts/backup-vps.sh >> /opt/quote-calculator/backup.log 2>&1

# Проверить
crontab -l
```

---

## 🎉 Готово!

**Production:** https://crm.magellania.net
**Staging:** https://staging.magellania.net

---

## 🔧 Полезные команды

### Мониторинг

```bash
# Все контейнеры
docker ps

# Логи
docker compose -f docker-compose.vps.yml logs -f

# Ресурсы
docker stats

# Проверка SSL
curl -vI https://crm.magellania.net 2>&1 | grep "subject:"
```

### Управление

```bash
# Перезапуск
docker compose -f docker-compose.vps.yml restart

# Остановка
docker compose -f docker-compose.vps.yml stop

# Обновление (после git pull)
docker compose -f docker-compose.vps.yml build
docker compose -f docker-compose.vps.yml up -d
```

### Бэкапы

```bash
# Ручной бэкап
cd /opt/quote-calculator
./scripts/backup-vps.sh

# Список бэкапов
ls -lh /opt/backups/

# Лог бэкапов
tail -f /opt/quote-calculator/backup.log
```

---

## 🆘 Troubleshooting

### Проблема: package-lock.json not found при Docker build

**Симптомы:**
```
ERROR: "/package-lock.json": not found
```

**Причина:** Файл `package-lock.json` был в `.gitignore`

**Решение:**
```bash
# На локальной машине
git pull origin main  # package-lock.json уже добавлен в репозиторий

# На VPS если файла всё ещё нет
npm install  # Создаст package-lock.json
git add package-lock.json
git commit -m "Add package-lock.json"
git push
```

### Проблема: Node.js версия < 18

**Симптомы:**
```
npm WARN engine quote-calculator@2.3.0: wanted: {"node":">=18.0.0"} (current: {"node":"v12.22.9"})
```

**Решение:**
```bash
# Установить nvm и Node.js 18
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
nvm alias default 18
node --version  # Должно показать v18.x.x
```

### Проблема: Nginx ошибка "host not found in upstream"

**Симптомы:**
```
nginx: [emerg] host not found in upstream "quote-prod:4000"
```

**Причина:** Неправильное имя контейнера в nginx.conf

**Решение:**
```bash
# Проверить имена контейнеров
docker ps

# Должны быть: quote-production и quote-staging (не quote-prod)
# Исправление уже в репозитории
git pull origin main
docker compose -f docker-compose.vps.yml restart nginx
```

### Проблема: SSL сертификаты - 403 Forbidden

**Симптомы:**
```
Certbot failed to authenticate some domains
Detail: Invalid response from http://crm.magellania.net/.well-known/acme-challenge/: 403
```

**Причина:** Nginx блокировал доступ к `.well-known/acme-challenge/`

**Решение:**
```bash
# Исправление уже в репозитории (common-config.conf)
git pull origin main
docker compose -f docker-compose.vps.yml restart nginx

# Повторить попытку получения сертификатов
docker compose -f docker-compose.vps.yml run --rm certbot-init
```

### Проблема: SSL сертификаты - cannot load certificate

**Симптомы:**
```
nginx: [emerg] cannot load certificate "/etc/nginx/ssl/cert.pem": no such file
```

**Причина:** HTTPS блок в nginx.conf пытается загрузить несуществующие сертификаты

**Решение:**
```bash
# HTTPS блок должен быть закомментирован до получения сертификатов
# После получения сертификатов раскомментировать блок

# Проверить что HTTPS блок закомментирован
grep -A 5 "HTTPS Server" nginx/nginx.conf

# Если не закомментирован - исправление в репозитории
git pull origin main
docker compose -f docker-compose.vps.yml restart nginx
```

### SSL сертификаты не получены (общие проблемы)

```bash
# Проверить DNS
dig crm.magellania.net +short
dig staging.magellania.net +short

# Проверить Nginx
docker logs quote-nginx

# Проверить Certbot
docker logs quote-certbot-init

# Повторить попытку
docker compose -f docker-compose.vps.yml run --rm certbot-init
```

### 502 Bad Gateway

```bash
# Проверить backend
docker ps | grep quote-
docker logs quote-production
docker logs quote-staging

# Перезапустить
docker restart quote-production
docker restart quote-staging
```

### Контейнер постоянно перезапускается

```bash
# Посмотреть логи
docker logs quote-production

# Проверить volumes
docker volume ls | grep quote-

# Проверить порты
sudo lsof -i :4000
sudo lsof -i :4001

# Пересоздать контейнер
docker compose -f docker-compose.vps.yml up -d --force-recreate
```

---

## 📚 Подробная документация

- [Полное руководство по развертыванию](developer-guide/deployment/vps-deployment-guide.md)
- [Настройка VPS с нуля](developer-guide/deployment/vps-setup.md)
- [SSL конфигурация](developer-guide/deployment/ssl.md)
- [Мониторинг и алерты](developer-guide/deployment/monitoring.md)

---

## 📝 История изменений

### 17 ноября 2025 - Успешное развертывание
- ✅ Исправлены проблемы с развертыванием
- ✅ Коммиты с исправлениями:
  - `511e56c` - Добавлен package-lock.json для Docker builds
  - `a254fcf` - Исправлено имя upstream: quote-prod → quote-production
  - `e93c868` - HTTPS блок временно отключен до получения SSL
  - `837aec4` - Исправлен доступ к Let's Encrypt ACME challenge
- ✅ SSL сертификаты успешно получены
- ✅ Приложения развернуты и работают

---

**Дата создания:** 17 января 2025
**Последнее обновление:** 17 ноября 2025
**VPS IP:** 69.62.104.218
**Production:** crm.magellania.net
**Staging:** staging.magellania.net
