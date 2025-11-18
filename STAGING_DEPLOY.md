# 🚀 Quote Calculator v2.3.0 - Staging Deployment Guide

**Дата:** 18 ноября 2025
**Версия:** v2.3.0 - Production Ready
**Статус:** ✅ Готово к деплою

---

## 📋 Quick Start - Команды для копирования

### 🔧 Локальная проверка Docker образа

```bash
# 1. Собрать образ локально
cd "/Users/bogisis/Desktop/сметы/for_deploy copy"
docker compose build quote-staging

# 2. Запустить staging контейнер локально
docker compose up -d quote-staging

# 3. Проверить логи
docker compose logs -f quote-staging

# 4. Health check
curl http://localhost:4001/health

# 5. Остановить
docker compose down quote-staging
```

---

## 🌐 Деплой на VPS сервер

### Подключение к серверу

```bash
# Подключиться к VPS (замените на ваш адрес)
ssh root@your-vps-ip

# ИЛИ если используется ключ
ssh -i ~/.ssh/your-key user@your-vps-ip
```

### Подготовка на VPS

```bash
# 1. Перейти в директорию проекта (или клонировать если первый раз)
cd /var/www/quote-calculator

# ИЛИ если первый раз:
git clone https://github.com/bogisis/magellania_crm.git /var/www/quote-calculator
cd /var/www/quote-calculator

# 2. Обновить код
git pull origin main

# 3. Создать .env файл для staging (если нет)
cp .env.staging .env

# 4. Отредактировать переменные окружения
nano .env
# Установить SESSION_SECRET в надёжный пароль!
```

### Сборка и запуск

```bash
# 1. Собрать Docker образ
docker compose build quote-staging

# 2. Запустить staging контейнер (порт 4001)
docker compose up -d quote-staging

# 3. Проверить что контейнер запустился
docker ps | grep staging

# 4. Посмотреть логи
docker compose logs -f quote-staging
# Нажать Ctrl+C для выхода из логов
```

---

## 👤 Создание Admin пользователя

### Вариант 1: Создать пользователя вручную

```bash
# Войти в контейнер
docker exec -it quote-staging sh

# Внутри контейнера выполнить
node -e "
const AuthService = require('./services/AuthService');
const SQLiteStorage = require('./storage/SQLiteStorage');

const storage = new SQLiteStorage();
storage.init().then(async () => {
    const auth = new AuthService(storage.db);

    // Создать admin пользователя
    await auth.createUser(
        'admin',
        'admin@localhost',
        'your-secure-password',
        'default-org'
    );

    console.log('✅ Admin user created successfully');
}).catch(err => {
    console.error('❌ Error:', err.message);
}).finally(() => {
    process.exit(0);
});
"

# Выйти из контейнера
exit
```

### Вариант 2: Скопировать БД из production (если нужно)

```bash
# Экспортировать из production
docker exec quote-prod sqlite3 /usr/src/app/db/quotes.db ".backup /tmp/backup.db"
docker cp quote-prod:/tmp/backup.db ./staging-quotes.db

# Импортировать в staging
docker cp ./staging-quotes.db quote-staging:/usr/src/app/db/quotes.db
docker restart quote-staging

# Удалить временный файл
rm ./staging-quotes.db
```

---

## ✅ Проверка деплоя

### Health Check

```bash
# На VPS сервере
curl http://localhost:4001/health

# Должен вернуть:
# {"status":"ok","version":"2.3.0","storage":"sqlite"}
```

### Проверка авторизации

```bash
# 1. Получить login страницу
curl -c cookies.txt http://localhost:4001/login

# 2. Залогиниться
curl -b cookies.txt -c cookies.txt -X POST http://localhost:4001/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost","password":"your-password"}'

# 3. Проверить доступ к API
curl -b cookies.txt http://localhost:4001/api/estimates

# Должен вернуть список смет (может быть пустой)
# {"success":true,"estimates":[]}
```

### Проверка в браузере

```bash
# Если VPS имеет публичный IP
open http://your-vps-ip:4001

# Вы увидите redirect на /login
# Введите: admin@localhost / your-password
```

---

## 🌍 Настройка Nginx + SSL (опционально)

### Создать конфиг Nginx

```bash
# Создать файл конфигурации
sudo nano /etc/nginx/sites-available/quote-staging

# Вставить:
server {
    listen 80;
    server_name staging.magellania.net;

    location / {
        proxy_pass http://localhost:4001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (если нужно)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# Сохранить: Ctrl+O, Enter, Ctrl+X
```

### Активировать конфиг

```bash
# Создать symlink
sudo ln -s /etc/nginx/sites-available/quote-staging /etc/nginx/sites-enabled/

# Проверить конфигурацию
sudo nginx -t

# Перезапустить Nginx
sudo systemctl reload nginx
```

### SSL сертификат (Let's Encrypt)

```bash
# Установить Certbot (если не установлен)
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Получить SSL сертификат
sudo certbot --nginx -d staging.magellania.net

# Certbot автоматически настроит HTTPS redirect

# Проверить авто-renewal
sudo certbot renew --dry-run
```

---

## 🔥 Firewall настройка (UFW)

```bash
# Если используете Nginx (порт 4001 не нужен снаружи)
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw enable

# Если БЕЗ Nginx (нужен прямой доступ к 4001)
sudo ufw allow 4001/tcp
sudo ufw allow ssh
sudo ufw enable
```

---

## 🐛 Troubleshooting

### Проблема: Docker образ не собирается

**Симптом:**
```
ERROR [internal] load metadata for docker.io/library/node:18-alpine
```

**Решение:**
```bash
# Очистить Docker cache
docker builder prune -a

# Попробовать снова
docker compose build quote-staging
```

---

### Проблема: Контейнер не запускается

**Проверка:**
```bash
# Посмотреть логи
docker compose logs quote-staging

# Посмотреть статус
docker compose ps
```

**Возможные причины:**
1. **Порт 4001 занят:**
   ```bash
   sudo lsof -i :4001
   # Остановить процесс или изменить PORT в .env
   ```

2. **Нет прав на директории:**
   ```bash
   # Создать директории с правильными правами
   mkdir -p db logs catalogs
   sudo chown -R 1001:1001 db logs catalogs
   ```

---

### Проблема: Авторизация не работает

**Симптом:** Redirect loop на /login

**Решение 1:** Проверить что SESSION_SECRET установлен
```bash
docker exec quote-staging env | grep SESSION_SECRET
```

**Решение 2:** Создать admin пользователя (см. раздел выше)

**Решение 3:** Проверить что БД доступна для записи
```bash
docker exec quote-staging ls -la /usr/src/app/db/
```

---

### Проблема: "Локальный запуск без авторизации"

**Диагностика:**
Локальный запуск **РАБОТАЕТ ПРАВИЛЬНО** с авторизацией!

Логи показывают:
```
✅ Passport configured successfully
✅ User logged in successfully
✅ userId: admin-user-001
✅ Unauthorized access attempt → redirect to /login
```

**Это нормально!**
- Если вы видите /login страницу - это защита работает
- Нужно залогиниться: admin@localhost / ваш пароль
- После логина будет redirect на главную страницу
- Session хранится в cookies

---

## 📊 Мониторинг

### Логи в реальном времени

```bash
# Все логи
docker compose logs -f quote-staging

# Только последние 100 строк
docker compose logs --tail=100 quote-staging

# Логи с timestamp
docker compose logs -f -t quote-staging
```

### Статистика ресурсов

```bash
# CPU, Memory, Network
docker stats quote-staging

# Детальная информация
docker inspect quote-staging
```

### Health check

```bash
# Автоматический мониторинг (каждые 30 сек)
watch -n 30 'curl -s http://localhost:4001/health | jq'
```

---

## 🔄 Обновление приложения

```bash
# 1. Обновить код
git pull origin main

# 2. Пересобрать образ
docker compose build quote-staging

# 3. Перезапустить контейнер
docker compose up -d quote-staging

# 4. Проверить что всё работает
curl http://localhost:4001/health
```

---

## 🛑 Остановка и очистка

### Остановка

```bash
# Остановить staging
docker compose stop quote-staging

# Остановить и удалить контейнер
docker compose down quote-staging
```

### Полная очистка

```bash
# Удалить контейнер и volumes
docker compose down -v quote-staging

# Удалить образ
docker rmi quote-calculator:staging

# Очистить неиспользуемые ресурсы
docker system prune -a
```

---

## 📝 Чеклист деплоя

### Pre-deploy
- [ ] Код закоммичен и запушен в GitHub
- [ ] Локальная сборка успешна
- [ ] Тесты пройдены (`npm test`)
- [ ] .env.staging настроен с правильными значениями

### Деплой
- [ ] Код обновлён на VPS (`git pull`)
- [ ] Docker образ собран
- [ ] Контейнер запущен
- [ ] Health check проходит
- [ ] Логи не показывают критических ошибок

### Post-deploy
- [ ] Admin пользователь создан
- [ ] Авторизация работает
- [ ] Можно создать/загрузить смету
- [ ] Каталоги загружаются
- [ ] Nginx настроен (если используется)
- [ ] SSL сертификат получен (если нужен)
- [ ] Firewall настроен

---

## 🎯 Production Promotion

Когда staging протестирован и всё работает:

```bash
# 1. На VPS: остановить staging
docker compose stop quote-staging

# 2. Запустить production
docker compose up -d quote-production

# 3. Проверить production
curl http://localhost:4000/health

# 4. Обновить Nginx на production домен
sudo nano /etc/nginx/sites-available/quote-production
# server_name crm.magellania.net;
# proxy_pass http://localhost:4000;

sudo nginx -t
sudo systemctl reload nginx

# 5. Получить SSL для production
sudo certbot --nginx -d crm.magellania.net
```

---

## 📞 Контакты и поддержка

**GitHub:** https://github.com/bogisis/magellania_crm
**Версия:** v2.3.0
**Дата релиза:** 18 ноября 2025

**Документация:**
- Главная: `docs/index.md`
- Deployment: `docs/DEPLOYMENT_WORKFLOW.md`
- API: `docs/ru/developer-guide/api-reference/`

---

**🎉 Готово! Quote Calculator v2.3.0 развёрнут в staging!**
