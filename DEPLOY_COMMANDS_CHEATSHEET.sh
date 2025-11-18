#!/bin/bash
# Quote Calculator v2.3.0 - Staging Deployment Cheatsheet
# ===========================================================

# ============================================================================
# 🔧 ЛОКАЛЬНАЯ ПРОВЕРКА (на вашем Mac)
# ============================================================================

echo "=== Локальная проверка Docker образа ==="

# Сборка
docker compose build quote-staging

# Запуск
docker compose up -d quote-staging

# Логи
docker compose logs -f quote-staging

# Health check
curl http://localhost:4001/health

# Остановка
docker compose down quote-staging


# ============================================================================
# 🌐 ДЕПЛОЙ НА VPS СЕРВЕР
# ============================================================================

echo "=== Подключение к VPS ==="

# Подключиться к VPS (ЗАМЕНИТЕ your-vps-ip на ваш IP)
ssh root@your-vps-ip

# ИЛИ если используется ключ
ssh -i ~/.ssh/your-key user@your-vps-ip

# --- НА VPS СЕРВЕРЕ ---

echo "=== Обновление кода ==="
cd /var/www/quote-calculator
git pull origin main

echo "=== Сборка Docker образа ==="
docker compose build quote-staging

echo "=== Запуск staging контейнера ==="
docker compose up -d quote-staging

echo "=== Проверка логов ==="
docker compose logs -f quote-staging


# ============================================================================
# 👤 СОЗДАНИЕ ADMIN ПОЛЬЗОВАТЕЛЯ (выполнить на VPS)
# ============================================================================

echo "=== Создание admin пользователя ==="

# Войти в контейнер
docker exec -it quote-staging sh

# Внутри контейнера выполнить (одной командой):
node -e "
const AuthService = require('./services/AuthService');
const SQLiteStorage = require('./storage/SQLiteStorage');
const storage = new SQLiteStorage();
storage.init().then(async () => {
    const auth = new AuthService(storage.db);
    await auth.createUser('admin', 'admin@localhost', 'CHANGE_THIS_PASSWORD', 'default-org');
    console.log('✅ Admin user created');
}).catch(console.error).finally(() => process.exit(0));
"

# Выйти из контейнера
exit


# ============================================================================
# ✅ ПРОВЕРКА ДЕПЛОЯ (на VPS)
# ============================================================================

echo "=== Health Check ==="
curl http://localhost:4001/health

echo "=== Проверка авторизации ==="
curl -c cookies.txt -X POST http://localhost:4001/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost","password":"YOUR_PASSWORD"}'

curl -b cookies.txt http://localhost:4001/api/estimates


# ============================================================================
# 🌍 NGINX + SSL (опционально, на VPS)
# ============================================================================

echo "=== Настройка Nginx ==="

# Создать конфиг
sudo nano /etc/nginx/sites-available/quote-staging

# Вставить конфигурацию:
cat > /tmp/nginx-staging.conf << 'EOF'
server {
    listen 80;
    server_name staging.magellania.net;

    location / {
        proxy_pass http://localhost:4001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

sudo cp /tmp/nginx-staging.conf /etc/nginx/sites-available/quote-staging

# Активировать
sudo ln -s /etc/nginx/sites-available/quote-staging /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL сертификат
sudo certbot --nginx -d staging.magellania.net


# ============================================================================
# 🔥 FIREWALL (на VPS)
# ============================================================================

echo "=== Настройка Firewall ==="

# С Nginx (рекомендуется)
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw enable

# БЕЗ Nginx (прямой доступ к порту)
sudo ufw allow 4001/tcp
sudo ufw allow ssh
sudo ufw enable

# Проверить статус
sudo ufw status


# ============================================================================
# 📊 МОНИТОРИНГ (на VPS)
# ============================================================================

echo "=== Мониторинг ==="

# Логи в реальном времени
docker compose logs -f quote-staging

# Последние 100 строк
docker compose logs --tail=100 quote-staging

# Статистика ресурсов
docker stats quote-staging

# Автоматический health check (каждые 30 секунд)
watch -n 30 'curl -s http://localhost:4001/health | jq'


# ============================================================================
# 🔄 ОБНОВЛЕНИЕ ПРИЛОЖЕНИЯ (на VPS)
# ============================================================================

echo "=== Обновление приложения ==="

cd /var/www/quote-calculator
git pull origin main
docker compose build quote-staging
docker compose up -d quote-staging
curl http://localhost:4001/health


# ============================================================================
# 🛑 ОСТАНОВКА И ОЧИСТКА (на VPS)
# ============================================================================

echo "=== Остановка ==="

# Остановить staging
docker compose stop quote-staging

# Остановить и удалить
docker compose down quote-staging

# Удалить с volumes
docker compose down -v quote-staging

# Полная очистка
docker system prune -a


# ============================================================================
# 🐛 TROUBLESHOOTING
# ============================================================================

echo "=== Проверка проблем ==="

# Проверить что контейнер запущен
docker ps | grep staging

# Проверить порт
sudo lsof -i :4001

# Проверить логи
docker compose logs quote-staging | tail -100

# Проверить переменные окружения
docker exec quote-staging env

# Проверить БД
docker exec quote-staging ls -la /usr/src/app/db/

# Проверить файлы авторизации
docker exec quote-staging ls -la /usr/src/app/config/
docker exec quote-staging ls -la /usr/src/app/routes/
docker exec quote-staging ls -la /usr/src/app/services/
docker exec quote-staging ls -la /usr/src/app/middleware/


# ============================================================================
# 🎯 PRODUCTION PROMOTION (когда staging протестирован)
# ============================================================================

echo "=== Promotion to Production ==="

# Остановить staging
docker compose stop quote-staging

# Запустить production
docker compose up -d quote-production

# Проверить
curl http://localhost:4000/health

# Обновить Nginx
sudo nano /etc/nginx/sites-available/quote-production
# Изменить:
#   server_name crm.magellania.net;
#   proxy_pass http://localhost:4000;

sudo nginx -t
sudo systemctl reload nginx

# SSL для production
sudo certbot --nginx -d crm.magellania.net


# ============================================================================
# ℹ️  ПОЛЕЗНАЯ ИНФОРМАЦИЯ
# ============================================================================

echo "==="
echo "📋 Порты:"
echo "  - Staging:    4001"
echo "  - Production: 4000"
echo ""
echo "🔐 Credentials:"
echo "  - Email:    admin@localhost"
echo "  - Password: [установите свой при создании пользователя]"
echo ""
echo "🌐 URLs (после настройки Nginx):"
echo "  - Staging:    https://staging.magellania.net"
echo "  - Production: https://crm.magellania.net"
echo ""
echo "📁 Важные пути на VPS:"
echo "  - Проект:  /var/www/quote-calculator"
echo "  - Логи:    docker compose logs -f quote-staging"
echo "  - БД:      внутри Docker volume (quote-staging-db)"
echo ""
echo "✅ Чеклист:"
echo "  [ ] Docker образ собран"
echo "  [ ] Staging контейнер запущен"
echo "  [ ] Health check проходит"
echo "  [ ] Admin пользователь создан"
echo "  [ ] Авторизация работает"
echo "  [ ] Nginx настроен (опционально)"
echo "  [ ] SSL получен (опционально)"
echo "==="
