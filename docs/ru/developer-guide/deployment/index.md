# Развертывание

> **Deployment Guide - Quote Calculator v3.0**

---

## 📋 Обзор

Quote Calculator поддерживает несколько сценариев развертывания от локальной разработки до production с SSL.

---

## 🎯 Выбор сценария

### Сценарий 1: Development (Разработка)

**Когда использовать:**
- Локальная разработка
- Тестирование функционала
- Отладка

**Характеристики:**
- ✅ Быстрый запуск (30 секунд)
- ✅ Hot reload (с nodemon)
- ✅ Debug logging
- ❌ Не для production

**Время настройки:** 5 минут

[→ Инструкция по локальной разработке](../getting-started/setup.md)

---

### Сценарий 2: Docker Development

**Когда использовать:**
- Разработка в изолированной среде
- Тестирование Docker конфигурации
- Работа в команде (одинаковое окружение)

**Характеристики:**
- ✅ Изолированная среда
- ✅ Воспроизводимость
- ✅ Bind mounts для hot-reload
- ⚠️ Требует Docker

**Время настройки:** 10 минут

[→ Docker для разработки](docker.md#development-mode)

---

### Сценарий 3: Local Production (HTTP)

**Когда использовать:**
- Локальная сеть
- Внутренние приложения
- Тестирование production настроек

**Характеристики:**
- ✅ Nginx reverse proxy
- ✅ Rate limiting
- ✅ Gzip compression
- ✅ Security headers
- ❌ Нет SSL/TLS
- ⚠️ Только для внутренних сетей

**Время настройки:** 20 минут

[→ Локальный production](production.md#scenario-2-local-production-http)

---

### Сценарий 4: Cloud/VPS (HTTPS)

**Когда использовать:**
- Production deployment
- Публичный доступ через интернет
- Нужен SSL/TLS

**Характеристики:**
- ✅ Все production функции
- ✅ SSL/TLS (Let's Encrypt)
- ✅ Автообновление сертификатов
- ✅ HTTPS redirect
- ✅ A+ SSL Labs rating
- ⚠️ Требует домен

**Время настройки:** 40 минут

[→ Cloud deployment с SSL](production.md#scenario-3-cloudvps-https)

---

### Сценарий 5: Production + Staging

**Когда использовать:**
- Нужно тестовое окружение
- CI/CD pipeline
- Минимизация рисков при деплое

**Характеристики:**
- ✅ Два изолированных окружения
- ✅ Staging копирует production данные
- ✅ Zero-downtime deployment
- ✅ Автоматический rollback
- ⚠️ Требует больше ресурсов

**Время настройки:** 60 минут

[→ Production + Staging](docker.md#production--staging)

---

## 🚀 Quick Start

### За 30 секунд (Development)

```bash
# Клонировать и запустить
git clone <repository>
cd quote-calculator
npm install
STORAGE_TYPE=sqlite node server-with-db.js

# Открыть http://localhost:4000
```

### За 5 минут (Docker Production)

```bash
# Запустить production
docker-compose up -d

# Проверить
curl http://localhost:4000/api/health

# Открыть http://localhost:4000
```

### За 40 минут (Cloud с SSL)

```bash
# 1. Настроить DNS (A-record)
# 2. Подключиться к серверу
ssh root@your-server

# 3. Установить Docker
curl -fsSL https://get.docker.com | sh

# 4. Клонировать проект
git clone <repository> && cd quote-calculator

# 5. Получить SSL сертификат
export DOMAIN=quotes.example.com
export EMAIL=admin@example.com
docker-compose -f docker-compose.yml -f docker-compose.cloud.yml \
  run --rm certbot-init

# 6. Запустить
docker-compose -f docker-compose.yml -f docker-compose.cloud.yml up -d

# Открыть https://quotes.example.com
```

---

## 📚 Документация по разделам

### [Docker Deployment](docker.md)

Полное руководство по развертыванию в Docker:

- Quick start (5 минут)
- Docker architecture
- Multi-stage builds
- Persistent volumes
- Production + Staging setup
- CI/CD automation
- Backup strategies
- Troubleshooting

**Рекомендуется для:** Production deployment с Docker

---

### [Production Deployment](production.md)

Детальное руководство по production развертыванию:

- 3 сценария (Development, Local Production, Cloud/VPS)
- Nginx configuration
- SSL/TLS setup (Let's Encrypt)
- Security checklist
- Monitoring & health checks
- Backup & recovery
- Performance tuning

**Рекомендуется для:** Полный production deployment

---

## 🔄 CI/CD Automation

Поддерживается 4 варианта автодеплоя:

| Вариант | Сложность | Время настройки | Рекомендуется для |
|---------|-----------|-----------------|-------------------|
| **GitHub Actions** | Средняя | 30 мин | Проекты на GitHub |
| **GitLab CI** | Средняя | 30 мин | Проекты на GitLab |
| **Watchtower** | Низкая | 10 мин | Простые деплои |
| **Jenkins** | Высокая | 60 мин | Enterprise |

[→ Настройка CI/CD](docker.md#cicd-автодеплой)

---

## 💾 Гарантии сохранности данных

### Docker Volumes

**Контейнер ≠ Данные**

- ✅ Данные переживают пересоздание контейнеров
- ✅ Данные сохраняются при обновлениях
- ✅ Данные остаются после удаления контейнеров
- ❌ Данные теряются ТОЛЬКО при `docker-compose down -v`

### 3 уровня защиты

1. **Named Volumes** (минимум) - Данные переживают контейнеры
2. **Pre-deploy Backup** (рекомендуется) - Бэкап перед каждым деплоем
3. **Continuous Backup** (enterprise) - Автобэкап каждый час

[→ Детали о защите данных](docker.md#гарантии-сохранности-данных)

---

## ⚡ Zero-Downtime Deployment

Для production развертывания поддерживается обновление без остановки сервиса:

1. Запуск нового контейнера на временном порту
2. Health check нового контейнера
3. Переключение трафика (если health check OK)
4. Остановка старого контейнера
5. Cleanup

**Время простоя:** 0 секунд

[→ Zero-downtime процедура](docker.md#zero-downtime-deployment)

---

## 🛡️ Security Checklist

### Обязательно (Required)

- [x] HTTPS enabled (cloud deployments)
- [x] Security headers configured
- [x] Rate limiting enabled
- [x] File upload size limits
- [x] Regular backups
- [x] Firewall configured

### Рекомендуется (Recommended)

- [ ] Basic auth for admin endpoints
- [ ] SSH key-only access
- [ ] Fail2ban installed
- [ ] Log monitoring
- [ ] Intrusion detection

[→ Полный security checklist](production.md#security)

---

## 🏥 Health Checks

Все deployment сценарии включают health check endpoints:

```bash
# Проверка приложения
curl http://localhost:4000/api/health | jq

# Response:
{
  "status": "healthy",
  "version": "3.0.0",
  "storage": {
    "type": "sqlite",
    "health": { "healthy": true },
    "stats": {
      "estimatesCount": 10,
      "backupsCount": 15,
      "storageSize": 663552
    }
  },
  "uptime": 3600.5
}
```

[→ Мониторинг и health checks](production.md#monitoring)

---

## 📊 Системные требования

### Минимальные

- **CPU:** 1 core
- **RAM:** 512MB (1GB рекомендуется)
- **Disk:** 10GB
- **OS:** Ubuntu 22.04 LTS или аналогичный

### Рекомендуемые (Production)

- **CPU:** 2 cores
- **RAM:** 2GB
- **Disk:** 20GB SSD
- **OS:** Ubuntu 22.04 LTS

### Для Production + Staging

- **CPU:** 2 cores
- **RAM:** 4GB
- **Disk:** 30GB SSD

---

## 🐛 Troubleshooting

### Быстрая диагностика

```bash
# 1. Проверить контейнеры
docker ps

# 2. Проверить логи
docker logs quote-prod -f --tail 100

# 3. Health check
curl http://localhost:4000/api/health

# 4. Проверить volumes
docker volume ls | grep quote

# 5. Проверить порты
sudo lsof -i :4000
```

[→ Полное руководство по troubleshooting](docker.md#troubleshooting)

---

## 📞 Support

**Проблемы с развертыванием:**
1. Проверить logs: `docker-compose logs -f`
2. Проверить health: `curl http://localhost:4000/api/health`
3. Обратиться к troubleshooting секции
4. Создать GitHub issue с логами

**Полезные ссылки:**
- [Docker documentation](docker.md)
- [Production deployment](production.md)
- [Architecture overview](../architecture/overview.md)
- [API Reference](../api-reference/index.md)

---

## 🎯 Следующие шаги

1. **Выберите сценарий** развертывания из списка выше
2. **Следуйте инструкциям** в соответствующем разделе
3. **Настройте мониторинг** (health checks, logs)
4. **Настройте backup** strategy
5. **Тестируйте** deployment procedure

---

[← Назад к Developer Guide](../index.md) | [Docker Deployment →](docker.md) | [Production Deployment →](production.md)
