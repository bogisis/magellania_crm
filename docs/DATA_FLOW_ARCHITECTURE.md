# Data Flow Architecture - Quote Calculator v2.3.0

## Обзор

Система использует **ID-First** архитектуру с **Single Source of Truth** pattern на базе SQLite.

## ✅ Правильная архитектура (текущая реализация)

```
┌─────────────────────────────────────────────────┐
│        ESTIMATES TABLE (Single Source of Truth) │
│  id (PK) | filename | data | metadata | ...     │
└─────────────────────────────────────────────────┘
         ↑ ↓ ALL operations
    ┌────┴────────────────────────────┐
    │                                  │
  SAVE                              LOAD
    │                                  │
    ▼                                  ▼
ID → estimates                  ID → estimates
```

### Принципы

1. **ID = Primary Key**
   - UUID генерируется при создании
   - ID неизменен в течение жизни сметы
   - Используется для всех операций

2. **filename = Display Name**
   - Человекочитаемое имя с `.json`
   - Может меняться (rename)
   - Используется только для UI отображения

3. **Single Source**
   - Все read/write только в `estimates` table
   - NO dual storage
   - NO backups для runtime

## API Flow

### CREATE новой сметы

```
User → Click "New"
     → Generate UUID
     → saveEstimate(id, data)
         → INSERT INTO estimates (id, filename, data, ...)
     → currentQuoteId = id
     → currentQuoteFile = filename
```

### SAVE сметы (autosave каждые 8 сек)

```
User → Edit data
     → autoSaveQuote()
         → saveEstimate(currentQuoteId, data)
             → UPDATE estimates
                 SET data=?, filename=?, updated_at=?
                 WHERE id=? AND data_version=?  -- optimistic locking
             → data_version++
```

### LOAD сметы

```
User → Select estimate from list
     → loadQuoteFromServer(estimateId)
         → apiClient.loadEstimate(estimateId)
             → GET /api/estimates/:id
                 → SELECT * FROM estimates WHERE id=?
                     → return {id, filename, data, ...}
         → state.currentQuoteId = data.id
         → state.currentQuoteFile = data.filename  -- from DB!
         → updateQuoteStatusBar()
             → displayName = filename.replace('.json', '')  -- strip for UI
```

### RENAME сметы

```
User → Rename estimate
     → renameEstimate(id, newFilename)
         → apiClient.renameEstimate(id, newFilename)
             → PUT /api/estimates/:id/rename
                 → UPDATE estimates
                     SET filename=?
                     WHERE id=?
```

## UI Display Logic

### Status Bar (index.html:11352)

```javascript
updateQuoteStatusBar() {
    // currentQuoteFile содержит filename с .json
    let fileName = this.state.currentQuoteFile || 'Новая смета';

    // Strip .json для чистого отображения
    const displayName = fileName.replace(/\.json$/i, '');

    // Показываем пользователю
    fileNameSpan.textContent = displayName;  // "untitled_2025-11-03_27pax"
    fileNameSpan.title = displayName;
}
```

### Load Notification (index.html:12012)

```javascript
// Показываем уведомление БЕЗ .json
const displayName = (data.filename || estimateId).replace(/\.json$/i, '');
this.showNotification('Смета загружена: ' + displayName, false);
```

## Backend Storage (SQLiteStorage.js)

### loadEstimate(id) - строка 286

```javascript
async loadEstimate(id, organizationId = null) {
    const row = this.statements.getEstimateById.get(id, orgId);

    if (!row) {
        throw new Error(`Estimate not found: ${id}`);
    }

    // Возвращает данные с metadata
    const data = JSON.parse(row.data);
    data.dataVersion = row.data_version;  // optimistic locking
    data.filename = row.filename;         // правильный filename из БД
    data.id = row.id;

    return data;
}
```

### saveEstimate(id, data) - строка 331

```javascript
async saveEstimate(id, data, userId = null, organizationId = null) {
    // Извлекаем filename из данных или генерируем
    const filename = data.filename ||
                    metadata.filename ||
                    `estimate_${id}.json`;

    const existing = this.statements.getEstimateById.get(id, orgId);

    if (existing) {
        // UPDATE с optimistic locking
        this.statements.updateEstimate.run(
            filename,
            dataStr,
            // ... metadata fields
            id,                      // WHERE id = ?
            existing.data_version,   // AND data_version = ?
            orgId
        );
    } else {
        // INSERT новой сметы
        this.statements.insertEstimate.run(
            id,
            filename,
            // ... data and metadata
        );
    }
}
```

## Best Practices from better-sqlite3

### Transactions

```javascript
// Для batch операций используем транзакции
const saveBatch = db.transaction((items) => {
    for (const item of items) {
        statements.saveEstimate.run(item);
    }
});

// Атомарное выполнение
saveBatch([item1, item2, item3]);
```

### Optimistic Locking

```sql
UPDATE estimates
SET data=?, data_version=data_version+1, updated_at=?
WHERE id=? AND data_version=?
```

Если `changes === 0` → конфликт конкурентной модификации

### Database Backup (НЕ для runtime!)

```javascript
// Для disaster recovery - физическая копия всей БД
db.backup(`backup-${Date.now()}.db`)
    .then(() => console.log('Database backed up'))
    .catch(err => console.error('Backup failed:', err));
```

## ❌ Что НЕ нужно делать

### 1. Dual Storage (антипаттерн)

```javascript
// ❌ НЕПРАВИЛЬНО
await saveEstimate(id, data);
await saveBackup(id, data);  // Рассинхронизация!

// ✅ ПРАВИЛЬНО
await saveEstimate(id, data);  // Один источник истины
```

### 2. Backups для runtime

```javascript
// ❌ НЕПРАВИЛЬНО - backups в каждом save
scheduleAutosave(data, filename) {
    await saveEstimate(data, filename);
    await saveBackup(data, data.id);  // Излишне!
}

// ✅ ПРАВИЛЬНО - только estimates
scheduleAutosave(data, filename) {
    await saveEstimate(id, data);
}
```

### 3. Filename как Primary Key

```javascript
// ❌ НЕПРАВИЛЬНО
loadEstimate(filename);  // Filename может меняться!

// ✅ ПРАВИЛЬНО
loadEstimate(id);  // ID неизменен
```

## Версионирование / История изменений (опционально)

Если нужна история изменений, используйте отдельную таблицу:

```sql
CREATE TABLE estimate_history (
    id TEXT PRIMARY KEY,
    estimate_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (estimate_id) REFERENCES estimates(id)
);
```

```javascript
// При явном создании backup
async createBackup(estimateId) {
    const estimate = await loadEstimate(estimateId);

    await db.prepare(`
        INSERT INTO estimate_history (id, estimate_id, data, created_at)
        VALUES (?, ?, ?, ?)
    `).run(
        generateId(),
        estimateId,
        JSON.stringify(estimate),
        Math.floor(Date.now() / 1000)
    );
}
```

## Troubleshooting

### Проблема: "При reload загружается старая версия"

**Причина:** Скорее всего используется `loadBackup()` вместо `loadEstimate()`

**Решение:** Убедитесь что используется только `loadEstimate(id)`:

```javascript
// Проверьте что нет вызовов:
apiClient.loadBackup(id)  // ❌
await storage.loadBackup(id)  // ❌

// Должно быть:
apiClient.loadEstimate(id)  // ✅
await storage.loadEstimate(id)  // ✅
```

### Проблема: ".json в отображении"

**Причина:** `currentQuoteFile` содержит filename с расширением

**Решение:** Strip `.json` при отображении (уже исправлено в index.html:11362):

```javascript
const displayName = fileName.replace(/\.json$/i, '');
```

### Проблема: "Concurrent modification"

**Причина:** Optimistic locking конфликт

**Решение:** Reload и повторите операцию:

```javascript
catch (err) {
    if (err.message.includes('Concurrent modification')) {
        // Перезагрузить данные и попробовать снова
        await reloadEstimate(id);
        await saveEstimate(id, updatedData);
    }
}
```

## Заключение

**ПРОСТАЯ И ПРЕДСКАЗУЕМАЯ логика:**

1. ✅ ID = первичный ключ (UUID)
2. ✅ filename = отображаемое имя (с `.json` в БД, БЕЗ `.json` в UI)
3. ✅ estimates table = единственный источник истины
4. ✅ Optimistic locking для конкурентных изменений
5. ✅ Backups только для explicit user actions или disaster recovery
6. ✅ Transactions для batch операций

**Никаких:**
- ❌ Dual storage
- ❌ Shadow copies
- ❌ Filename as primary key
- ❌ Runtime backups

Эта архитектура соответствует best practices для SQLite + Web App и обеспечивает простоту, надежность и предсказуемость.
