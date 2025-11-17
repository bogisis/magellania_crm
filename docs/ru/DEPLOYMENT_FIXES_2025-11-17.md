# 🔧 Исправления при развертывании на VPS - 17 ноября 2025

## Обзор

Документ описывает проблемы, с которыми столкнулись при развертывании Quote Calculator на VPS Hostinger (IP: 69.62.104.218), и способы их решения.

---

## ✅ Успешное развертывание

**Домены:**
- Production: https://crm.magellania.net
- Staging: https://staging.magellania.net

**Время развертывания:** ~15 минут (после исправлений)

---

## 🐛 Проблемы и решения

### 1. Package-lock.json отсутствует в репозитории

**Проблема:**
```
ERROR: "/package-lock.json": not found
```

**Причина:**
Файл был в `.gitignore`, Docker build не мог найти его

**Решение:**
```bash
# Коммит: 511e56c
- Убрали package-lock.json из .gitignore
- Добавили файл в репозиторий
```

**Файлы:**
- `.gitignore` (строка 4)

---

### 2. Node.js версия < 18

**Проблема:**
```
npm WARN engine quote-calculator@2.3.0: wanted: {"node":">=18.0.0"} (current: {"node":"v12.22.9"})
```

**Причина:**
На VPS была установлена устаревшая версия Node.js

**Решение:**
```bash
# Установка nvm и Node.js 18
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
nvm alias default 18
```

**Документация обновлена:**
- `docs/ru/QUICK_DEPLOY.md` - добавлен шаг 2

---

### 3. Nginx: "host not found in upstream"

**Проблема:**
```
nginx: [emerg] host not found in upstream "quote-prod:4000" in /etc/nginx/nginx.conf:88
```

**Причина:**
В `nginx.conf` было указано неправильное имя контейнера

**Решение:**
```bash
# Коммит: a254fcf
# nginx/nginx.conf строка 88
- БЫЛО: server quote-prod:4000
- СТАЛО: server quote-production:4000
```

**Файлы:**
- `nginx/nginx.conf` (строка 88)

---

### 4. SSL сертификаты: cannot load certificate

**Проблема:**
```
nginx: [emerg] cannot load certificate "/etc/nginx/ssl/cert.pem": no such file
```

**Причина:**
HTTPS server block пытался загрузить сертификаты, которых еще не было

**Решение:**
```bash
# Коммит: e93c868
# Временно закомментировали HTTPS блок в nginx.conf
# Строки 113-136 закомментированы до получения SSL сертификатов
```

**Файлы:**
- `nginx/nginx.conf` (строки 113-136)

**Примечание:**
После получения сертификатов блок нужно раскомментировать

---

### 5. SSL сертификаты: 403 Forbidden при ACME challenge

**Проблема:**
```
Certbot failed to authenticate some domains
Detail: Invalid response from http://crm.magellania.net/.well-known/acme-challenge/: 403
```

**Причина:**
Nginx блокировал доступ к `.well-known/acme-challenge/` из-за правила блокировки скрытых файлов

**Решение:**
```bash
# Коммит: 837aec4
# nginx/conf.d/common-config.conf

# ДОБАВЛЕНО (строки 159-165):
location ~ ^/.well-known/acme-challenge/ {
    allow all;
    root /var/www/certbot;
    default_type "text/plain";
    try_files $uri =404;
}

# ИЗМЕНЕНО (строка 172):
- БЫЛО: location ~ /\.
- СТАЛО: location ~ /\.(?!well-known)
```

**Файлы:**
- `nginx/conf.d/common-config.conf` (строки 159-176)

---

## 📋 Все коммиты

```bash
f520340 - Fix deployment paths: use /opt/ instead of ~/ for production
511e56c - Add package-lock.json for Docker builds
a254fcf - Fix nginx upstream: change quote-prod to quote-production
e93c868 - Temporarily disable HTTPS server block until SSL certs are obtained
837aec4 - Fix Let's Encrypt ACME challenge access
79a26cb - Update deployment documentation with troubleshooting
```

---

## 📚 Обновленная документация

### docs/ru/QUICK_DEPLOY.md

**Изменения:**
1. ✅ Добавлен шаг установки Node.js 18+
2. ✅ Добавлен шаг `npm install`
3. ✅ Обновлена последовательность шагов (теперь 10 вместо 8)
4. ✅ Добавлен раздел Troubleshooting с 5 распространенными проблемами
5. ✅ Добавлена история изменений с указанием коммитов
6. ✅ Обновлено время развертывания: 10 → 15 минут

---

## 🔑 Ключевые уроки

### 1. Управление зависимостями
- ✅ `package-lock.json` критичен для Docker builds
- ✅ Не добавлять его в `.gitignore` для production проектов

### 2. Именование в Docker Compose
- ✅ Использовать полные, понятные имена контейнеров
- ✅ Сверять имена в `docker-compose.yml` и `nginx.conf`

### 3. SSL и Let's Encrypt
- ✅ HTTPS блок в nginx должен быть отключен до получения сертификатов
- ✅ `.well-known/acme-challenge/` должен быть доступен публично
- ✅ Правило блокировки скрытых файлов не должно затрагивать `.well-known`

### 4. Порядок развертывания
```
1. Установить зависимости (Node.js 18+, npm install)
2. Запустить контейнеры (с HTTP-only nginx)
3. Получить SSL сертификаты (certbot-init)
4. Включить HTTPS (раскомментировать блок)
5. Перезапустить nginx
```

---

## 🚀 Итоговая последовательность (успешная)

```bash
# 1. Подготовка
ssh deployer@69.62.104.218
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18 && nvm use 18 && nvm alias default 18

# 2. Клонирование
sudo mkdir -p /opt/quote-calculator
sudo chown deployer:deployer /opt/quote-calculator
cd /opt/quote-calculator
git clone https://github.com/bogisis/magellania_crm.git .

# 3. Установка зависимостей
npm install
chmod +x scripts/backup-vps.sh

# 4. Запуск (HTTP only)
docker compose -f docker-compose.vps.yml up -d

# 5. Проверка
curl http://crm.magellania.net/health
curl http://staging.magellania.net/health

# 6. SSL сертификаты
docker compose -f docker-compose.vps.yml run --rm certbot-init
# ✅ Successfully received certificate for crm.magellania.net
# ✅ Successfully received certificate for staging.magellania.net

# 7. Включить HTTPS (раскомментировать блок в nginx.conf)
# 8. Перезапустить nginx
docker compose -f docker-compose.vps.yml restart nginx

# 9. Проверка HTTPS
curl https://crm.magellania.net/health
curl https://staging.magellania.net/health
```

---

## 📊 Статистика

- **Всего проблем:** 5
- **Все решены:** ✅
- **Коммитов:** 6
- **Измененных файлов:** 5
- **Время на исправления:** ~2 часа
- **Финальный результат:** Успешное развертывание

---

**Дата:** 17 ноября 2025
**Автор:** Deployment Team
**Статус:** ✅ Развернуто и работает
