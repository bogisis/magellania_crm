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

## 🎯 Быстрый старт (10 минут)

### 1. Подключение к VPS

```bash
ssh deployer@69.62.104.218
```

### 2. Клонирование репозитория

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

### 3. Проверка конфигурации

```bash
# Проверить .env
cat .env
# Должно быть:
# DOMAIN=crm.magellania.net
# STAGING_DOMAIN=staging.magellania.net
# CERTBOT_EMAIL=admin@magellania.net

# Сделать скрипт бэкапа исполняемым
chmod +x scripts/backup-vps.sh
```

### 4. Запуск Nginx (для Let's Encrypt)

```bash
# Запустить Nginx
docker compose -f docker-compose.vps.yml up -d nginx

# Проверить
docker ps | grep nginx
curl -I http://crm.magellania.net
```

### 5. Получение SSL сертификатов

```bash
# Получить сертификаты для обоих доменов
docker compose -f docker-compose.vps.yml run --rm certbot-init

# ✅ Ожидается:
# Successfully received certificate for crm.magellania.net
# Successfully received certificate for staging.magellania.net
```

### 6. Запуск полного стека

```bash
# Перезапустить Nginx с SSL
docker compose -f docker-compose.vps.yml restart nginx

# Запустить все контейнеры
docker compose -f docker-compose.vps.yml up -d

# Проверить
docker ps
```

### 7. Проверка работоспособности

```bash
# Health checks
curl https://crm.magellania.net/health
curl https://staging.magellania.net/health

# Ожидается: {"status":"ok","timestamp":"..."}
```

**Открыть в браузере:**
- Production: https://crm.magellania.net
- Staging: https://staging.magellania.net

### 8. Настройка автоматических бэкапов

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

### SSL сертификаты не получены

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

**Дата создания:** 17 января 2025
**VPS IP:** 69.62.104.218
**Production:** crm.magellania.net
**Staging:** staging.magellania.net
