# Quote Calculator v3.0 - Estimates API

**Status:** ✅ Production Ready
**Version:** 2.3.0
**Date:** November 5, 2025

## Overview

Estimates API предоставляет полный CRUD (Create, Read, Update, Delete) функционал для управления сметами (коммерческими предложениями).

### Ключевые особенности

- **ID-First Pattern** - UUID как immutable primary key
- **Optimistic Locking** - предотвращение конфликтов при concurrent updates
- **Transactional Saves** - атомарное сохранение estimate + backup
- **Soft Delete** - логическое удаление без физического удаления данных
- **Batch Operations** - массовое сохранение нескольких смет

## Endpoints

### 1. List All Estimates

Получить список всех смет с метаданными.

**Endpoint:** `GET /api/estimates`

**Response:**
```json
{
  "success": true,
  "estimates": [
    {
      "id": "abc123def456",
      "filename": "client_ivanov_2025-11-05_10pax_abc123.json",
      "client_name": "Иванов Иван",
      "client_email": "ivan@example.com",
      "client_phone": "+7 999 123 45 67",
      "pax_count": 10,
      "tour_start": "2025-11-15",
      "tour_end": "2025-11-22",
      "total_cost": 125000.50,
      "total_profit": 15000.00,
      "services_count": 12,
      "created_at": "2025-11-05T10:30:00.000Z",
      "updated_at": "2025-11-05T14:25:00.000Z"
    }
  ]
}
```

**Fields Description:**
- `id` - UUID сметы (12 символов, immutable)
- `filename` - имя файла для отображения (может меняться)
- `client_name` - имя клиента
- `client_email` - email клиента
- `client_phone` - телефон клиента
- `pax_count` - количество человек
- `tour_start` - дата начала тура (ISO 8601 date)
- `tour_end` - дата окончания тура (ISO 8601 date)
- `total_cost` - общая стоимость
- `total_profit` - общая прибыль
- `services_count` - количество услуг в смете
- `created_at` - дата создания (ISO 8601 timestamp)
- `updated_at` - дата последнего обновления (ISO 8601 timestamp)

**Example:**
```bash
# Получить список всех смет
curl http://localhost:4000/api/estimates | jq

# Фильтровать по клиенту
curl -s http://localhost:4000/api/estimates | \
  jq '.estimates[] | select(.client_name | contains("Иванов"))'

# Подсчитать количество смет
curl -s http://localhost:4000/api/estimates | jq '.estimates | length'
```

**Use Cases:**
- Отображение списка смет в UI
- Фильтрация по клиенту/дате/статусу
- Экспорт метаданных для отчётов
- Мониторинг активности

---

### 2. Get Estimate by ID

Получить полные данные сметы по ID.

**Endpoint:** `GET /api/estimates/:id`

**URL Parameters:**
- `id` (required) - UUID сметы

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc123def456",
    "version": "1.1.0",
    "filename": "client_ivanov_2025-11-05_10pax_abc123.json",
    "clientName": "Иванов Иван",
    "clientEmail": "ivan@example.com",
    "clientPhone": "+7 999 123 45 67",
    "paxCount": 10,
    "tourStart": "2025-11-15",
    "tourEnd": "2025-11-22",
    "services": [
      {
        "id": "svc1",
        "name": "Трансфер аэропорт-отель",
        "price": 5000,
        "quantity": 2,
        "markup": 10,
        "category": "transfer"
      }
    ],
    "hiddenMarkup": 5,
    "taxRate": 0,
    "metadata": {
      "createdAt": "2025-11-05T10:30:00.000Z",
      "updatedAt": "2025-11-05T14:25:00.000Z"
    }
  }
}
```

**Error Response (Not Found):**
```json
{
  "success": false,
  "error": "Estimate not found: abc123"
}
```

**Example:**
```bash
# Получить смету по ID
curl http://localhost:4000/api/estimates/abc123def456 | jq

# Извлечь только услуги
curl -s http://localhost:4000/api/estimates/abc123 | jq '.data.services'

# Проверить существование
curl -s http://localhost:4000/api/estimates/abc123 > /dev/null && \
  echo "Exists" || echo "Not found"
```

**Use Cases:**
- Загрузка сметы для редактирования
- Просмотр деталей сметы
- Проверка существования перед операциями
- Получение данных для печати

---

### 3. Create/Update Estimate

Создать новую смету или обновить существующую.

**Endpoint:** `POST /api/estimates/:id`

**URL Parameters:**
- `id` (required) - UUID сметы

**Request Body:**
```json
{
  "version": "1.1.0",
  "filename": "client_ivanov_2025-11-05_10pax_abc123.json",
  "clientName": "Иванов Иван",
  "clientEmail": "ivan@example.com",
  "clientPhone": "+7 999 123 45 67",
  "paxCount": 10,
  "tourStart": "2025-11-15",
  "tourEnd": "2025-11-22",
  "services": [
    {
      "id": "svc1",
      "name": "Трансфер аэропорт-отель",
      "price": 5000,
      "quantity": 2,
      "markup": 10,
      "category": "transfer"
    }
  ],
  "hiddenMarkup": 5,
  "taxRate": 0
}
```

**Response (Success):**
```json
{
  "success": true
}
```

**Response (Optimistic Lock Conflict):**
```json
{
  "success": false,
  "error": "Concurrent modification detected",
  "code": "CONFLICT"
}
```

**HTTP Status Codes:**
- `200` - Успешное создание/обновление
- `409` - Optimistic lock conflict (data_version mismatch)
- `500` - Internal server error
- `507` - Insufficient disk space

**Example:**
```bash
# Создать новую смету
curl -X POST http://localhost:4000/api/estimates/abc123def456 \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.1.0",
    "clientName": "Иванов Иван",
    "paxCount": 10,
    "services": []
  }'

# Обновить существующую
curl -X POST http://localhost:4000/api/estimates/abc123def456 \
  -H "Content-Type: application/json" \
  -d @estimate.json

# Обработка optimistic lock conflict
curl -X POST http://localhost:4000/api/estimates/abc123 \
  -H "Content-Type: application/json" \
  -d @estimate.json | jq '.code'
# "CONFLICT" → reload, merge, retry
```

**Implementation Details:**

**Transactional Save (SQLite):**
```javascript
// server-with-db.js:276-294
// Атомарное сохранение estimate + backup
await storage.saveEstimate(id, data);
```

**Optimistic Locking:**
```sql
-- storage/SQLiteStorage.js
UPDATE estimates
SET data = ?, data_version = data_version + 1, updated_at = ?
WHERE id = ? AND data_version = ?;

-- If changes = 0 → conflict detected
```

**Automatic Backup:**
- При каждом сохранении автоматически создаётся backup
- Backup и estimate сохраняются в одной транзакции (SQLite)
- Гарантия консистентности данных

**Use Cases:**
- Autosave каждые 8 секунд
- Ручное сохранение (Ctrl+S)
- Импорт смет из файлов
- Batch updates через API

---

### 4. Batch Save Estimates

Массовое сохранение нескольких смет в одной транзакции.

**Endpoint:** `POST /api/estimates/batch`

**Request Body:**
```json
{
  "items": [
    {
      "id": "abc123",
      "data": {
        "version": "1.1.0",
        "clientName": "Client 1",
        "services": []
      }
    },
    {
      "id": "def456",
      "data": {
        "version": "1.1.0",
        "clientName": "Client 2",
        "services": []
      }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "succeeded": ["abc123", "def456"],
  "failed": []
}
```

**Response (Partial Failure):**
```json
{
  "success": true,
  "succeeded": ["abc123"],
  "failed": [
    {
      "id": "def456",
      "error": "Missing estimate id"
    }
  ]
}
```

**Validation:**
- `items` must be a non-empty array
- Each item must have `id` and `data` fields
- Invalid items are skipped, не прерывая весь batch

**Example:**
```bash
# Batch save 10 estimates
curl -X POST http://localhost:4000/api/estimates/batch \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"id": "id1", "data": {...}},
      {"id": "id2", "data": {...}},
      ...
    ]
  }'

# Check results
curl -X POST http://localhost:4000/api/estimates/batch \
  -H "Content-Type: application/json" \
  -d @batch.json | jq '.succeeded | length'
```

**Performance:**
- SQLite: все операции в одной транзакции (10x faster)
- FileStorage: последовательное сохранение (legacy)

**Timing:**
- 1 estimate: ~5ms
- 100 estimates without transaction: ~500ms
- 100 estimates in transaction: ~50ms ✅

**Use Cases:**
- Импорт данных из backup
- Миграция между environments
- Bulk data updates
- Sync operations (SyncManager)

---

### 5. Delete Estimate

Удалить смету (soft delete).

**Endpoint:** `DELETE /api/estimates/:id`

**URL Parameters:**
- `id` (required) - UUID сметы

**Response:**
```json
{
  "success": true
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Estimate not found"
}
```

**Implementation (Soft Delete):**
```sql
-- Не удаляет физически, устанавливает deleted_at
UPDATE estimates
SET deleted_at = ?
WHERE id = ?;
```

**Example:**
```bash
# Удалить смету
curl -X DELETE http://localhost:4000/api/estimates/abc123

# Verify deletion (должен вернуть 404)
curl http://localhost:4000/api/estimates/abc123
```

**Behavior:**
- Soft delete - данные остаются в БД, но с `deleted_at` timestamp
- Удалённые сметы НЕ возвращаются в `GET /api/estimates`
- Можно восстановить через прямой SQL (если нужно)
- Backups НЕ удаляются (для истории)

**Hard Delete (Manual Cleanup):**
```sql
-- Физическое удаление old deleted estimates
DELETE FROM estimates
WHERE deleted_at IS NOT NULL
  AND deleted_at < datetime('now', '-90 days');
```

**Use Cases:**
- Удаление черновиков
- Архивация старых смет
- Cleanup при ошибках
- Соблюдение retention policies

---

### 6. Rename Estimate

Переименовать смету (изменить filename, ID остаётся неизменным).

**Endpoint:** `PUT /api/estimates/:id/rename`

**URL Parameters:**
- `id` (required) - UUID сметы

**Request Body:**
```json
{
  "newFilename": "client_petrov_2025-11-05_15pax_abc123.json"
}
```

**Response:**
```json
{
  "success": true,
  "newFilename": "client_petrov_2025-11-05_15pax_abc123.json"
}
```

**Error Response (Not Found):**
```json
{
  "success": false,
  "error": "Estimate not found: abc123"
}
```

**Error Response (Missing newFilename):**
```json
{
  "success": false,
  "error": "newFilename is required"
}
```

**Example:**
```bash
# Переименовать смету
curl -X PUT http://localhost:4000/api/estimates/abc123/rename \
  -H "Content-Type: application/json" \
  -d '{"newFilename": "new_client_name.json"}'

# Verify rename
curl -s http://localhost:4000/api/estimates/abc123 | jq '.data.filename'
```

**Implementation:**
```javascript
// server-with-db.js:309-334
// 1. Load current estimate
const estimate = await storage.loadEstimate(id);

// 2. Update filename in metadata
estimate.filename = newFilename;

// 3. Save back (triggers backup)
await storage.saveEstimate(id, estimate);
```

**ID-First Pattern:**
- ID **никогда** не меняется
- Filename - только для display и user convenience
- Все references используют ID, не filename
- Безопасное переименование без breaking references

**Use Cases:**
- Исправление опечаток в filename
- Обновление client name в filename
- Изменение naming convention
- Standardization после импорта

---

## Data Model

### Estimate Object (Complete Schema)

```json
{
  "id": "abc123def456",
  "version": "1.1.0",
  "filename": "client_ivanov_2025-11-05_10pax_abc123.json",

  "clientName": "Иванов Иван",
  "clientEmail": "ivan@example.com",
  "clientPhone": "+7 999 123 45 67",

  "paxCount": 10,
  "tourStart": "2025-11-15",
  "tourEnd": "2025-11-22",

  "services": [
    {
      "id": "svc1",
      "name": "Трансфер аэропорт-отель",
      "description": "Mercedes Vito",
      "price": 5000,
      "quantity": 2,
      "markup": 10,
      "category": "transfer",
      "unit": "шт",
      "notes": "Комментарий"
    }
  ],

  "hiddenMarkup": 5,
  "taxRate": 0,

  "metadata": {
    "createdAt": "2025-11-05T10:30:00.000Z",
    "updatedAt": "2025-11-05T14:25:00.000Z",
    "totalCost": 125000.50,
    "totalProfit": 15000.00,
    "servicesCount": 12
  }
}
```

### Field Validation

**Required fields:**
- `version` - format version (e.g., "1.1.0")
- `services` - array of services (can be empty [])
- `paxCount` - number (min: 1)

**Optional fields:**
- `id` - generated on client if not provided
- `filename` - auto-generated if not provided
- `clientName`, `clientEmail`, `clientPhone`
- `tourStart`, `tourEnd` - ISO 8601 dates
- `hiddenMarkup` - percentage (default: 0)
- `taxRate` - percentage (default: 0)

**Service object validation:**
- `id` - unique within estimate
- `name` - string (max 100 chars)
- `price` - number (min: 0)
- `quantity` - number (min: 0)
- `markup` - percentage (default: 0)

---

## Error Handling

### Common Errors

**1. Estimate Not Found**
```json
{
  "success": false,
  "error": "Estimate not found: abc123"
}
```
**Причина:** ID не существует или смета удалена (soft delete)

**2. Optimistic Lock Conflict**
```json
{
  "success": false,
  "error": "Concurrent modification detected",
  "code": "CONFLICT"
}
```
**Причина:** data_version изменилась между load и save
**Решение:** Reload → Merge changes → Retry save

**3. Insufficient Disk Space**
```json
{
  "success": false,
  "error": "Insufficient disk space"
}
```
**HTTP Status:** 507 Insufficient Storage
**Причина:** Middleware `checkDiskSpace` обнаружил нехватку места

**4. Invalid JSON**
```json
{
  "success": false,
  "error": "Unexpected token in JSON at position 0"
}
```
**Причина:** Malformed JSON в request body
**Решение:** Validate JSON перед отправкой

**5. Missing Required Fields**
```json
{
  "success": false,
  "error": "Missing required field: newFilename"
}
```
**Причина:** Required parameter отсутствует

---

## Performance

### Response Times (Average)

| Endpoint | Response Time | Notes |
|----------|---------------|-------|
| GET /api/estimates | <50ms | List all (up to 1000 estimates) |
| GET /api/estimates/:id | <20ms | Single item (indexed by ID) |
| POST /api/estimates/:id | <30ms | Create/update with backup |
| POST /api/estimates/batch | <100ms | 10 items in transaction |
| DELETE /api/estimates/:id | <15ms | Soft delete (UPDATE) |
| PUT /api/estimates/:id/rename | <25ms | Load + update + save |

### Optimization Tips

**1. Use Batch Operations**
```bash
# ❌ SLOW: 100 individual POSTs
for id in {1..100}; do
  curl -X POST http://localhost:4000/api/estimates/$id ...
done
# Total: ~3000ms

# ✅ FAST: Single batch request
curl -X POST http://localhost:4000/api/estimates/batch ...
# Total: ~50ms (60x faster!)
```

**2. Minimize Payload Size**
```bash
# ❌ SLOW: Fetch full estimate when you only need metadata
curl http://localhost:4000/api/estimates/abc123

# ✅ FAST: Use list endpoint for metadata only
curl http://localhost:4000/api/estimates | \
  jq '.estimates[] | select(.id == "abc123")'
```

**3. Cache List Results**
```javascript
// Cache /api/estimates list for 5 minutes
const cachedList = await cacheManager.get('estimates-list', async () => {
  return await fetch('/api/estimates').then(r => r.json());
}, { ttl: 300 });
```

---

## Common Use Cases

### 1. Auto-save Implementation

```javascript
// Auto-save every 8 seconds
let autoSaveTimeout;

function scheduleAutoSave(estimateId, data) {
  clearTimeout(autoSaveTimeout);

  autoSaveTimeout = setTimeout(async () => {
    try {
      const response = await fetch(`/api/estimates/${estimateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.code === 'CONFLICT') {
        // Optimistic lock conflict → reload and merge
        await handleConflict(estimateId);
      }
    } catch (err) {
      console.error('Auto-save failed:', err);
    }
  }, 8000);
}
```

### 2. Load Estimate with Error Handling

```javascript
async function loadEstimate(estimateId) {
  try {
    const response = await fetch(`/api/estimates/${estimateId}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Estimate not found');
      }
      throw new Error('Failed to load estimate');
    }

    const result = await response.json();
    return result.data;
  } catch (err) {
    console.error('Load failed:', err);
    showNotification('Не удалось загрузить смету', true);
    return null;
  }
}
```

### 3. Optimistic Lock Conflict Resolution

```javascript
async function saveWithConflictResolution(estimateId, localData) {
  try {
    const response = await fetch(`/api/estimates/${estimateId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localData)
    });

    const result = await response.json();

    if (result.code === 'CONFLICT') {
      // Reload server version
      const serverData = await loadEstimate(estimateId);

      // Merge changes (application-specific logic)
      const mergedData = mergeEstimates(localData, serverData);

      // Show conflict dialog to user
      const userChoice = await showConflictDialog(localData, serverData, mergedData);

      // Retry with chosen version
      if (userChoice === 'retry') {
        return await saveWithConflictResolution(estimateId, mergedData);
      }
    }

    return result;
  } catch (err) {
    console.error('Save failed:', err);
    throw err;
  }
}
```

### 4. Batch Import from Backup

```javascript
async function importFromBackup(backupData) {
  const items = backupData.data.estimates.map(est => ({
    id: est.id,
    data: est.data
  }));

  const response = await fetch('/api/estimates/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  });

  const result = await response.json();

  console.log(`Imported: ${result.succeeded.length}`);
  console.log(`Failed: ${result.failed.length}`);

  if (result.failed.length > 0) {
    console.warn('Failed items:', result.failed);
  }

  return result;
}
```

### 5. Safe Delete with Confirmation

```javascript
async function deleteEstimate(estimateId, estimateName) {
  const confirmed = confirm(
    `Удалить смету "${estimateName}"?\n\nЭто действие нельзя отменить.`
  );

  if (!confirmed) return false;

  try {
    const response = await fetch(`/api/estimates/${estimateId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Delete failed');
    }

    showNotification('Смета удалена');

    // Reload list
    await loadEstimatesList();

    return true;
  } catch (err) {
    console.error('Delete failed:', err);
    showNotification('Не удалось удалить смету', true);
    return false;
  }
}
```

---

## Security Considerations

### 1. No Authentication (Current)

⚠️ **ВАЖНО:** API НЕ защищён аутентификацией

**Production checklist:**
- [ ] Добавить authentication (Basic Auth, JWT, API Keys)
- [ ] Включить HTTPS
- [ ] Ограничить CORS origins
- [ ] Настроить rate limiting
- [ ] Логировать все API requests

### 2. Input Validation

```javascript
// Always validate input before sending
function validateEstimate(data) {
  const errors = [];

  if (!data.version) errors.push('version is required');
  if (!Array.isArray(data.services)) errors.push('services must be array');
  if (typeof data.paxCount !== 'number' || data.paxCount < 1) {
    errors.push('paxCount must be >= 1');
  }

  return errors;
}
```

### 3. XSS Prevention

```javascript
// ✅ SAFE: Use textContent
element.textContent = estimate.clientName;

// ❌ DANGEROUS: innerHTML with user input
element.innerHTML = estimate.clientName;
```

### 4. File Size Limits

```javascript
// Server: JSON_LIMIT = 50MB (environment variable)
app.use(express.json({ limit: process.env.JSON_LIMIT || '50mb' }));

// Client: Check before upload
if (JSON.stringify(data).length > 50 * 1024 * 1024) {
  throw new Error('Estimate too large');
}
```

---

## Testing

### Manual Testing

```bash
# 1. Create estimate
curl -X POST http://localhost:4000/api/estimates/test-001 \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.1.0",
    "clientName": "Test Client",
    "paxCount": 5,
    "services": []
  }'

# 2. Verify creation
curl http://localhost:4000/api/estimates/test-001 | jq '.data.clientName'
# "Test Client"

# 3. Update estimate
curl -X POST http://localhost:4000/api/estimates/test-001 \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.1.0",
    "clientName": "Updated Client",
    "paxCount": 10,
    "services": []
  }'

# 4. Verify update
curl http://localhost:4000/api/estimates/test-001 | jq '.data.paxCount'
# 10

# 5. Rename
curl -X PUT http://localhost:4000/api/estimates/test-001/rename \
  -H "Content-Type: application/json" \
  -d '{"newFilename": "renamed.json"}'

# 6. Delete
curl -X DELETE http://localhost:4000/api/estimates/test-001

# 7. Verify deletion (should return 404)
curl http://localhost:4000/api/estimates/test-001
```

### Automated Testing

```bash
# Run all estimates tests
npm test -- __tests__/estimates.test.js

# Test specific endpoint
npm test -- __tests__/estimates.test.js -t "POST /api/estimates/:id"

# Test optimistic locking
npm test -- __tests__/estimates.test.js -t "optimistic lock"
```

**Test Coverage:**
- ✅ CRUD operations
- ✅ Batch operations
- ✅ Optimistic locking
- ✅ Soft delete
- ✅ Rename functionality
- ✅ Error handling

---

## Troubleshooting

### Issue: "Concurrent modification detected"

**Причина:** Optimistic lock conflict - data_version mismatch

**Решение:**
```javascript
// 1. Reload server version
const serverData = await loadEstimate(id);

// 2. Merge your changes with server version
const merged = mergeChanges(localData, serverData);

// 3. Retry save
await saveEstimate(id, merged);
```

### Issue: "507 Insufficient Storage"

**Причина:** Disk space < threshold (checkDiskSpace middleware)

**Решение:**
```bash
# Check disk space
df -h

# Clean up old backups
find backup/ -mtime +30 -delete

# Clean up deleted estimates (if using SQLite)
sqlite3 db/quotes.db "DELETE FROM estimates WHERE deleted_at < datetime('now', '-90 days')"
```

### Issue: Slow batch operations

**Причина:** FileStorage mode (no transactions)

**Решение:**
```bash
# Switch to SQLite mode
STORAGE_TYPE=sqlite node server-with-db.js

# Verify
curl http://localhost:4000/health | jq '.storage.type'
# "sqlite"
```

### Issue: Lost data after server restart

**Причина:** Using in-memory storage or wrong DB path

**Решение:**
```bash
# Check DB_PATH environment variable
echo $DB_PATH
# Should be: ./db/quotes.db

# Verify DB file exists
ls -lh db/quotes.db

# Check storage type
curl http://localhost:4000/health | jq '.storage.type'
```

---

## Related Documentation

- [API Reference Index](index.md) - Обзор всех API endpoints
- [Backups API](backups.md) - Управление backups
- [Export/Import API](export-import.md) - Массовый экспорт/импорт
- [Architecture: Storage](../architecture/storage.md) - SQLite integration details
- [Data Integrity: ID-First Pattern](../data-integrity/id-first-pattern.md) - UUID architecture

---

[← Назад к API Reference](index.md) | [Backups API →](backups.md)

**Version:** 3.0.0
**Last Updated:** November 5, 2025
