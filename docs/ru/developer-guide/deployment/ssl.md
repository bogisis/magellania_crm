# SSL/TLS сертификаты

Руководство по настройке HTTPS с автоматическими сертификатами Let's Encrypt.

---

## 🎯 Обзор

Quote Calculator поддерживает автоматическое получение и обновление SSL/TLS сертификатов через **Let's Encrypt** с помощью **Certbot**.

### Что вы получите

- ✅ **Бесплатные SSL сертификаты** от Let's Encrypt
- ✅ **Автоматическое обновление** каждые 12 часов
- ✅ **A+ рейтинг** на SSL Labs
- ✅ **HTTP/2 support**
- ✅ **HSTS security headers**
- ✅ **Поддержка нескольких доменов** (production + staging)

---

## 📋 Предварительные требования

### Обязательные

1. **Домен зарегистрирован** и направлен на ваш VPS
2. **DNS настроен** (A-записи)
3. **Порты 80 и 443 открыты** в firewall
4. **Nginx запущен** и доступен
5. **Docker Compose настроен** (docker-compose.vps.yml)

### Проверка готовности

```bash
# 1. Проверка DNS
dig yourdomain.com +short
dig staging.yourdomain.com +short
# Должны вернуть IP вашего VPS

# 2. Проверка портов
sudo netstat -tulpn | grep -E ':(80|443)'
# Должны быть LISTEN

# 3. Проверка Nginx
docker ps | grep nginx
# Должен быть running

# 4. Проверка HTTP доступа
curl -I http://yourdomain.com
# Должен вернуть 301 или 200
```

---

## 🚀 Быстрый старт

### Шаг 1: Настройка переменных окружения

```bash
# SSH в VPS
ssh deployer@your-vps-ip

# Установить переменные
export DOMAIN=yourdomain.com
export STAGING_DOMAIN=staging.yourdomain.com
export CERTBOT_EMAIL=admin@yourdomain.com

# Сохранить для постоянного использования
echo "export DOMAIN=yourdomain.com" >> ~/.bashrc
echo "export STAGING_DOMAIN=staging.yourdomain.com" >> ~/.bashrc
echo "export CERTBOT_EMAIL=admin@yourdomain.com" >> ~/.bashrc

source ~/.bashrc
```

### Шаг 2: Первичное получение сертификата

```bash
cd /opt/quote-calculator

# Получить сертификат для обоих доменов
docker-compose -f docker-compose.vps.yml --profile init run --rm certbot-init

# Процесс займет 1-2 минуты
```

### Шаг 3: Перезапуск Nginx

```bash
# Перезапустить Nginx для применения сертификатов
docker-compose -f docker-compose.vps.yml restart nginx

# Проверка
curl -I https://yourdomain.com
curl -I https://staging.yourdomain.com
```

---

## 📖 Подробная инструкция

### Процесс получения сертификата

#### 1. Подготовка Nginx

Убедитесь что в `nginx/conf.d/quotes.conf` есть раздел для ACME challenge:

```nginx
server {
    listen 80;
    server_name yourdomain.com staging.yourdomain.com;

    # ACME challenge для Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Остальное редиректим на HTTPS (после получения сертификата)
    location / {
        return 301 https://$server_name$request_uri;
    }
}
```

#### 2. Запуск Certbot

```bash
# Certbot-init service определен в docker-compose.vps.yml
# Он запускается только при --profile init

docker-compose -f docker-compose.vps.yml --profile init run --rm certbot-init
```

**Что происходит:**

1. Certbot запускается в контейнере
2. Подключается к Let's Encrypt API
3. Создает challenge файл в `/var/www/certbot`
4. Let's Encrypt проверяет файл через HTTP
5. Если проверка успешна - выдает сертификат
6. Сертификат сохраняется в volume `certbot-etc`

#### 3. Проверка сертификата

```bash
# Проверить что сертификат создан
docker-compose -f docker-compose.vps.yml exec nginx \
  ls -la /etc/letsencrypt/live/

# Должна быть директория с вашим доменом:
# /etc/letsencrypt/live/yourdomain.com/

# Проверить файлы сертификата
docker-compose -f docker-compose.vps.yml exec nginx \
  ls -la /etc/letsencrypt/live/yourdomain.com/

# Должны быть:
# cert.pem       - Сертификат
# chain.pem      - Цепочка сертификатов
# fullchain.pem  - Полная цепочка
# privkey.pem    - Приватный ключ
```

---

## 🔄 Автоматическое обновление

### Certbot контейнер

В docker-compose.vps.yml определен сервис `certbot`, который:

- Запускается автоматически при старте
- Проверяет сертификаты каждые 12 часов
- Обновляет сертификаты за 30 дней до истечения
- Работает в фоновом режиме

```yaml
certbot:
  image: certbot/certbot:latest
  container_name: quote-certbot
  volumes:
    - certbot-etc:/etc/letsencrypt
    - certbot-var:/var/lib/letsencrypt
    - certbot-webroot:/var/www/certbot
  entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
  restart: unless-stopped
```

### Проверка автообновления

```bash
# Просмотр логов Certbot
docker-compose -f docker-compose.vps.yml logs certbot

# Ручная проверка обновления (dry-run)
docker-compose -f docker-compose.vps.yml exec certbot \
  certbot renew --dry-run

# Вывод должен быть:
# Congratulations, all simulated renewals succeeded
```

### Ручное обновление

```bash
# Если нужно обновить сертификат вручную
docker-compose -f docker-compose.vps.yml exec certbot \
  certbot renew --force-renewal

# Перезапустить Nginx после обновления
docker-compose -f docker-compose.vps.yml restart nginx
```

---

## 🔐 SSL конфигурация Nginx

### Рекомендуемые настройки

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com;

    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/yourdomain.com/chain.pem;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;

    # SSL Session
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # ... rest of config
}
```

### Объяснение параметров

| Параметр | Назначение |
|----------|------------|
| `ssl_protocols` | Разрешенные версии TLS (только 1.2 и 1.3) |
| `ssl_ciphers` | Безопасные шифры |
| `ssl_prefer_server_ciphers` | Приоритет шифров сервера |
| `ssl_session_cache` | Кэш SSL сессий для производительности |
| `ssl_stapling` | OCSP Stapling для быстрой проверки |
| `HSTS` | Форсировать HTTPS в браузере |

---

## ✅ Проверка SSL

### SSL Labs Test

Проверьте ваш SSL на [SSL Labs](https://www.ssllabs.com/ssltest/):

```
https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com
```

**Ожидаемый результат:** A или A+

### Команды проверки

```bash
# 1. Проверка сертификата
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com < /dev/null

# 2. Проверка срока действия
echo | openssl s_client -connect yourdomain.com:443 -servername yourdomain.com 2>/dev/null | \
  openssl x509 -noout -dates

# 3. Проверка цепочки сертификатов
curl --verbose https://yourdomain.com 2>&1 | grep "SSL certificate verify"

# 4. Проверка HSTS header
curl -I https://yourdomain.com | grep Strict-Transport-Security
```

### Онлайн инструменты

- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/)
- [Security Headers](https://securityheaders.com/)
- [SSL Checker](https://www.sslchecker.com/)

---

## 🐛 Troubleshooting

### Проблема: DNS не настроен

**Ошибка:**
```
Failed to connect to yourdomain.com:80
```

**Решение:**
```bash
# Проверить DNS
dig yourdomain.com +short

# Если пусто - настроить A-запись в DNS провайдере
# Подождать propagation (до 24 часов, обычно 1-2 часа)

# Проверка propagation
https://www.whatsmydns.net/#A/yourdomain.com
```

### Проблема: Порт 80 недоступен

**Ошибка:**
```
Connection refused on port 80
```

**Решение:**
```bash
# Проверить firewall
sudo ufw status | grep 80

# Открыть порт если закрыт
sudo ufw allow 80/tcp

# Проверить что Nginx слушает порт 80
docker exec quote-nginx netstat -tulpn | grep :80

# Проверить доступность снаружи
curl -I http://yourdomain.com
```

### Проблема: Nginx не запущен

**Ошибка:**
```
Cannot connect to the Docker daemon
```

**Решение:**
```bash
# Проверить статус контейнера
docker ps | grep nginx

# Если остановлен - запустить
docker-compose -f docker-compose.vps.yml up -d nginx

# Проверить логи
docker-compose -f docker-compose.vps.yml logs nginx
```

### Проблема: Rate limit от Let's Encrypt

**Ошибка:**
```
too many certificates already issued
```

**Решение:**

Let's Encrypt имеет лимиты:
- 50 сертификатов в неделю на домен
- 5 неудачных попыток в час

```bash
# Используйте staging сервер для тестирования
docker-compose -f docker-compose.vps.yml exec certbot \
  certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --server https://acme-staging-v02.api.letsencrypt.org/directory \
  -d yourdomain.com

# После успешного теста - получите production сертификат
```

### Проблема: Сертификат не обновляется

**Ошибка:**
```
Certificate will not be renewed
```

**Решение:**
```bash
# Проверить что certbot контейнер запущен
docker ps | grep certbot

# Если остановлен
docker-compose -f docker-compose.vps.yml up -d certbot

# Принудительное обновление
docker exec quote-certbot certbot renew --force-renewal

# Проверка cron/schedule
docker logs quote-certbot --tail 50
```

### Проблема: Mixed content (HTTP/HTTPS)

**Ошибка в браузере:**
```
Mixed Content: The page was loaded over HTTPS, but requested an insecure resource
```

**Решение:**

Убедитесь что все ресурсы загружаются через HTTPS:

```nginx
# В Nginx добавить header
add_header Content-Security-Policy "upgrade-insecure-requests" always;
```

---

## 🔄 Обновление сертификата

### Расписание обновления

Let's Encrypt сертификаты действительны **90 дней**. Certbot обновляет их автоматически за **30 дней до истечения**.

```
Issued: Jan 1, 2025
Valid until: Apr 1, 2025 (90 days)
Auto-renew: Mar 2, 2025 (30 days before expiry)
```

### Мониторинг срока действия

```bash
# Проверить когда истекает сертификат
echo | openssl s_client -connect yourdomain.com:443 2>/dev/null | \
  openssl x509 -noout -enddate

# Output:
# notAfter=Apr  1 10:30:45 2025 GMT

# Проверить сколько дней осталось
docker exec quote-certbot certbot certificates
```

### Ручное обновление при необходимости

```bash
# Обновить сертификат
docker exec quote-certbot certbot renew

# Перезагрузить Nginx
docker-compose -f docker-compose.vps.yml restart nginx

# Проверка
curl -I https://yourdomain.com
```

---

## 📊 Best Practices

### 1. Мониторинг истечения сертификата

Настройте уведомления за 7 дней до истечения:

```bash
# Создать скрипт проверки
cat > /opt/scripts/check-ssl-expiry.sh << 'EOF'
#!/bin/bash
DOMAIN="yourdomain.com"
DAYS_BEFORE_EXPIRY=7

EXPIRY_DATE=$(echo | openssl s_client -connect $DOMAIN:443 -servername $DOMAIN 2>/dev/null | \
  openssl x509 -noout -enddate | cut -d= -f2)

EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))

if [ $DAYS_LEFT -lt $DAYS_BEFORE_EXPIRY ]; then
    echo "WARNING: SSL certificate expires in $DAYS_LEFT days!"
fi
EOF

chmod +x /opt/scripts/check-ssl-expiry.sh

# Добавить в cron (ежедневно)
echo "0 9 * * * /opt/scripts/check-ssl-expiry.sh" | crontab -
```

### 2. Backup сертификатов

```bash
# Создать backup volume certbot-etc
docker run --rm \
  -v certbot-etc:/source:ro \
  -v /opt/backups:/backup \
  alpine tar czf /backup/ssl-certs-$(date +%Y%m%d).tar.gz -C /source .

# Хранить минимум 2 последних бэкапа
```

### 3. Тестирование конфигурации

```bash
# Перед применением изменений
docker exec quote-nginx nginx -t

# Если OK - перезагрузить
docker exec quote-nginx nginx -s reload
```

---

## 📚 Дополнительные ресурсы

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Certbot Documentation](https://certbot.eff.org/docs/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [SSL Labs Best Practices](https://github.com/ssllabs/research/wiki/SSL-and-TLS-Deployment-Best-Practices)

---

[← Configuration](configuration.md) | [Workflow →](workflow.md)
