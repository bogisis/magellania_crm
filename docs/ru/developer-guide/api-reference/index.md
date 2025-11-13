# API Reference

> **Quote Calculator v2.3.0 REST API Documentation**

---

## 📋 Обзор

Quote Calculator предоставляет полнофункциональный REST API для управления сметами, каталогами, backups и экспорта/импорта данных.

### Base URL

```
http://localhost:4000/api
```

**Production:** Замените на ваш домен

---

## 🗂️ API Endpoints Overview

### Estimates (Сметы)

Управление коммерческими предложениями.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/estimates` | Список всех смет |
| GET | `/api/estimates/:id` | Получить смету по ID |
| POST | `/api/estimates/:id` | Создать/обновить смету |
| POST | `/api/estimates/batch` | Массовое сохранение смет |
| PUT | `/api/estimates/:oldFilename/rename` | Переименовать смету |
| DELETE | `/api/estimates/:id` | Удалить смету (soft delete) |

[Подробная документация →](estimates.md)

---

### Catalogs (Каталоги)

Управление каталогами услуг и шаблонов.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/catalog/list` | Список всех каталогов |
| GET | `/api/catalog/:filename` | Получить каталог |
| POST | `/api/catalog/:filename` | Сохранить каталог |

[Подробная документация →](catalogs.md)

---

### Backups (Резервные копии)

Управление резервными копиями смет.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/backups` | Список всех backups |
| GET | `/api/backups/:id` | Получить backup по ID |
| POST | `/api/backups/:id` | Создать backup |
| POST | `/api/backups/:id/restore` | Восстановить из backup |

[Подробная документация →](backups.md)

---

### Export/Import (Экспорт/Импорт)

Массовый экспорт и импорт данных для резервного копирования и миграции.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/export/all` | Экспорт всех данных (JSON) |
| GET | `/api/export/database` | Экспорт SQLite БД (binary) |
| POST | `/api/import/all` | Импорт данных из JSON |

[Подробная документация →](export-import.md)

---

### System (Системные)

Информация о состоянии системы и здоровье сервиса.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check endpoint |
| GET | `/api/stats` | Статистика использования |

[Подробная документация →](system.md)

---

## 🔐 Authentication

**Текущая версия:** API НЕ защищен аутентификацией

⚠️ **Production Warning:** Перед публикацией в интернет добавьте аутентификацию:
- Basic Auth через nginx
- API Keys в заголовках
- JWT tokens

---

## 📦 Request/Response Format

### Standard Success Response

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

### Standard Error Response

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE" // опционально
}
```

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Успешный запрос |
| 201 | Created | Ресурс создан |
| 400 | Bad Request | Невалидные данные |
| 404 | Not Found | Ресурс не найден |
| 500 | Internal Server Error | Ошибка сервера |
| 507 | Insufficient Storage | Недостаточно места на диске |

---

## 🎯 Quick Start Examples

### Создать новую смету

```bash
curl -X POST http://localhost:4000/api/estimates/abc123 \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.1.0",
    "clientName": "Test Client",
    "services": [],
    "paxCount": 10
  }'
```

### Получить список всех смет

```bash
curl http://localhost:4000/api/estimates
```

### Экспорт всех данных

```bash
curl http://localhost:4000/api/export/all > backup.json
```

### Импорт данных

```bash
curl -X POST http://localhost:4000/api/import/all \
  -H "Content-Type: application/json" \
  -d @backup.json
```

---

## 🔧 Configuration

### Environment Variables

```bash
# Server port
PORT=4000

# Storage type
STORAGE_TYPE=sqlite  # или 'file'

# JSON payload limit
JSON_LIMIT=50mb

# Node environment
NODE_ENV=production
```

### CORS Configuration

По умолчанию разрешены все origins для локальной разработки:

```javascript
app.use(cors());
```

Для production рекомендуется ограничить:

```javascript
app.use(cors({
  origin: ['https://yourdomain.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
```

---

## 📊 API Versioning

**Current Version:** v2.3.0

API версионируется через query parameter или header:

```bash
# Query parameter (recommended)
curl "http://localhost:4000/api/estimates?v=2.3.0"

# Header
curl -H "X-API-Version: 2.3.0" http://localhost:4000/api/estimates
```

**Breaking Changes:**
- Мажорные изменения (2.x → 3.x) требуют миграции
- Минорные изменения (2.2 → 2.3) обратно совместимы
- Патч-версии (2.3.0 → 2.3.1) всегда совместимы

---

## 🧪 Testing the API

### Manual Testing

```bash
# Health check
curl http://localhost:4000/api/health

# Create test estimate
curl -X POST http://localhost:4000/api/estimates/test-001 \
  -H "Content-Type: application/json" \
  -d '{"version":"1.1.0","services":[],"paxCount":5}'

# List estimates
curl http://localhost:4000/api/estimates | jq

# Export all
curl http://localhost:4000/api/export/all > test-backup.json

# Check backup
jq '.data.estimates | length' test-backup.json
```

### Automated Testing

```bash
# Run API tests
npm test -- __tests__/server.test.js

# Specific endpoint test
npm test -- __tests__/server.test.js -t "GET /api/estimates"
```

---

## 📈 Performance

### Response Times (Average)

| Endpoint | Response Time | Notes |
|----------|---------------|-------|
| GET /api/estimates | <50ms | List all |
| GET /api/estimates/:id | <20ms | Single item |
| POST /api/estimates/:id | <30ms | Create/Update |
| POST /api/estimates/batch | <100ms | 10 items |
| GET /api/export/all | <150ms | Full export |

**SQLite vs File Storage:**
- SQLite: faster reads (indexed queries)
- File: comparable writes
- SQLite: better for >100 estimates

---

## 🔍 Common Use Cases

### Daily Backup Script

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d)
curl -s http://localhost:4000/api/export/all > "backups/backup-$DATE.json"
```

### Staging → Production Migration

```bash
# Export from staging
curl http://staging:4000/api/export/all > staging-data.json

# Import to production
curl -X POST http://production:4000/api/import/all \
  -H "Content-Type: application/json" \
  -d @staging-data.json
```

### Batch Create Estimates

```bash
curl -X POST http://localhost:4000/api/estimates/batch \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"id": "id1", "data": {...}},
      {"id": "id2", "data": {...}}
    ]
  }'
```

---

## 🛡️ Security Best Practices

### Production Checklist

- [ ] Добавить authentication (Basic Auth, JWT, API Keys)
- [ ] Включить HTTPS
- [ ] Ограничить CORS origins
- [ ] Настроить rate limiting
- [ ] Логировать все API requests
- [ ] Валидировать все входные данные
- [ ] Использовать environment variables для secrets
- [ ] Регулярные backups через `/api/export/all`

### Rate Limiting Example

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100 // макс 100 запросов с одного IP
});

app.use('/api/', limiter);
```

---

## 📚 Additional Resources

### Documentation Links

- [Estimates API](estimates.md) - CRUD операции для смет
- [Catalogs API](catalogs.md) - Управление каталогами
- [Backups API](backups.md) - Резервное копирование
- [Export/Import API](export-import.md) - Массовый экспорт/импорт
- [System API](system.md) - Health check и статистика

### Internal Links

- [Architecture Overview](../architecture/overview.md) - Архитектура системы
- [Storage Documentation](../architecture/storage.md) - SQLite интеграция
- [Testing Guide](../development/testing.md) - Тестирование API
- [Deployment Guide](../deployment/index.md) - Развертывание

---

## 🔄 Changelog

### v2.3.0 (October 2025)
- ✅ Added `/api/estimates/batch` для массового сохранения
- ✅ Added `/api/export/all` для полного экспорта
- ✅ Added `/api/export/database` для SQLite backups
- ✅ Added `/api/import/all` для импорта данных
- ✅ Soft delete для estimates
- ✅ Disk space validation middleware

### v2.2.0 (January 2025)
- Added `/api/backups` endpoints
- Added `/api/estimates/:id/rename`
- Improved error handling

### v2.0.0 (November 2024)
- Initial REST API release
- Basic CRUD for estimates and catalogs

[Полная история →](../history/changelog.md)

---

## 💡 Tips & Tricks

### Using jq for JSON parsing

```bash
# Count estimates
curl -s http://localhost:4000/api/estimates | jq '.estimates | length'

# Filter by client
curl -s http://localhost:4000/api/estimates | \
  jq '.estimates[] | select(.clientName | contains("Test"))'

# Pretty print export
curl -s http://localhost:4000/api/export/all | jq . > formatted-backup.json
```

### Batch operations optimization

```bash
# Instead of multiple POSTs:
for id in id1 id2 id3; do
  curl -X POST http://localhost:4000/api/estimates/$id ...
done

# Use batch endpoint (10x faster):
curl -X POST http://localhost:4000/api/estimates/batch \
  -d '{"items": [...]}'
```

### Health monitoring

```bash
# Check every minute
watch -n 60 'curl -s http://localhost:4000/api/health | jq'

# Alert if unhealthy
while true; do
  STATUS=$(curl -s http://localhost:4000/api/health | jq -r '.status')
  if [ "$STATUS" != "healthy" ]; then
    echo "ALERT: Service unhealthy!" | mail -s "API Alert" admin@example.com
  fi
  sleep 300
done
```

---

## 🐛 Troubleshooting

### Common Issues

**Issue:** `ECONNREFUSED`
```bash
# Solution: Проверить что сервер запущен
ps aux | grep node
node server-with-db.js &
```

**Issue:** `507 Insufficient Storage`
```bash
# Solution: Очистить место на диске
df -h
rm -rf old_backups/
```

**Issue:** `Invalid JSON`
```bash
# Solution: Валидировать JSON перед отправкой
cat data.json | jq .
curl -X POST ... -d @data.json
```

**Issue:** `CORS error`
```bash
# Solution: Проверить CORS настройки
# Добавить origin в cors() middleware
```

[Больше troubleshooting →](../troubleshooting/common-errors.md)

---

[← Назад к Developer Guide](../index.md) | [Estimates API →](estimates.md)
