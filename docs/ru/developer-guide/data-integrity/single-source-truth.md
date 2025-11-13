# Single Source of Truth

> **Одна таблица estimates - единственный источник данных**

---

## 📋 Суть паттерна

**Single Source of Truth (SSOT)** означает, что таблица `estimates` в SQLite является **единственным** источником истины для всех данных смет.

### Ключевые принципы

1. **Один источник данных**
   - ВСЕ read/write операции → `estimates` table
   - НЕТ дублирования данных в runtime
   - НЕТ параллельных хранилищ (backups, cache)

2. **NO Dual Storage**
   - НЕ сохраняем одновременно в estimate И backup
   - НЕ синхронизируем между несколькими источниками
   - Избегаем рассинхронизации данных

3. **Backups только для explicit actions**
   - Backups для disaster recovery
   - Backups по явному запросу пользователя
   - НЕ backups при каждом save

---

## 🎯 Зачем нужен SSOT?

### Проблема Dual Storage

```javascript
// ❌ АНТИПАТТЕРН - Dual Storage
async saveQuote(id, data) {
    // Сохраняем в estimates
    await storage.saveEstimate(id, data);  // ✅ Успех

    // Сохраняем в backups
    await storage.saveBackup(id, data);    // ❌ УПАЛ!

    // ПРОБЛЕМА: estimates обновлён, backup нет
    // → Рассинхронизация данных!
}
```

**Последствия:**
- ❌ `estimates` содержит версию N
- ❌ `backups` содержит версию N-1
- ❌ При reload из backup получаем старые данные
- ❌ Пользователь теряет изменения
- ❌ Невозможно определить "правильную" версию

---

### Решение: Single Source

```javascript
// ✅ ПРАВИЛЬНЫЙ ПАТТЕРН - SSOT
async saveQuote(id, data) {
    // Сохраняем ТОЛЬКО в estimates
    await storage.saveEstimate(id, data);

    // Всё! Нет второго источника данных
}

async loadQuote(id) {
    // Загружаем ТОЛЬКО из estimates
    const data = await storage.loadEstimate(id);
    return data;

    // Нет попыток загрузить из backup "на всякий случай"
}
```

**Преимущества:**
- ✅ Один источник истины - нет рассинхронизации
- ✅ Простота - меньше кода, меньше ошибок
- ✅ Предсказуемость - всегда знаем где данные
- ✅ Производительность - одна операция вместо двух

---

## 🏗️ Архитектура SSOT

### Database Schema

```sql
-- ✅ ЕДИНСТВЕННАЯ таблица для runtime данных
CREATE TABLE estimates (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    data TEXT NOT NULL,              -- JSON данные сметы
    data_version INTEGER DEFAULT 1,  -- optimistic locking
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    user_id TEXT,
    organization_id TEXT
);

-- ❌ НЕТ таблицы backups для runtime!
-- backups используются ТОЛЬКО для:
-- 1. Disaster recovery (физический backup всей БД)
-- 2. Explicit user action (создать версию вручную)
```

---

### Правильный Data Flow

```
User Action
    ↓
┌─────────────────────────┐
│   Frontend (index.html) │
│                         │
│  state.currentQuoteId   │
│  state.services         │
└─────────────────────────┘
    ↓ saveEstimate(id, data)
┌─────────────────────────┐
│   APIClient.js          │
│                         │
│  POST /api/estimates/:id│
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│   server-with-db.js     │
│                         │
│  app.post('/api/...')   │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│   SQLiteStorage.js      │
│                         │
│  saveEstimate(id, data) │
└─────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│   SQLite Database                   │
│                                     │
│   UPDATE estimates                  │
│   SET data=?, updated_at=?          │
│   WHERE id=? AND data_version=?     │
└─────────────────────────────────────┘

✅ ОДНА операция = ОДИН источник истины
```

---

### ❌ Антипаттерн: Dual Storage Flow

```
User Action
    ↓
saveEstimate(id, data)
    ↓
┌────────────────────┐     ┌────────────────────┐
│  estimates table   │     │  backups table     │
│                    │     │                    │
│  UPDATE            │     │  INSERT            │
└────────────────────┘     └────────────────────┘
         ✅ Успех                  ❌ Упал!

ПРОБЛЕМА:
- estimates содержит версию N
- backups содержит версию N-1
- Рассинхронизация!
```

---

## 💾 Реализация

### Storage Layer - saveEstimate()

```javascript
// SQLiteStorage.js - ПРАВИЛЬНАЯ реализация
class SQLiteStorage {
    async saveEstimate(id, data, userId = null, organizationId = null) {
        // Извлекаем metadata из данных
        const filename = data.filename || `estimate_${id}.json`;
        const metadata = this.extractMetadata(data);

        // Проверяем существование
        const existing = this.statements.getEstimateById.get(id, organizationId);

        if (existing) {
            // UPDATE с optimistic locking
            const result = this.statements.updateEstimate.run(
                filename,
                JSON.stringify(data),
                metadata.client_name,
                metadata.pax_count,
                // ... metadata fields
                Math.floor(Date.now() / 1000),  // updated_at
                id,                              // WHERE id = ?
                existing.data_version,           // AND data_version = ?
                organizationId
            );

            if (result.changes === 0) {
                throw new Error('Concurrent modification detected');
            }
        } else {
            // INSERT новой сметы
            this.statements.insertEstimate.run(
                id,
                filename,
                JSON.stringify(data),
                // ... metadata fields
                1,  // data_version = 1 для новой сметы
                Math.floor(Date.now() / 1000),  // created_at
                Math.floor(Date.now() / 1000),  // updated_at
                userId,
                organizationId
            );
        }

        // ✅ ВСЁ! Нет второго сохранения в backup
    }
}
```

---

### Storage Layer - loadEstimate()

```javascript
// SQLiteStorage.js
class SQLiteStorage {
    async loadEstimate(id, organizationId = null) {
        // Загружаем ТОЛЬКО из estimates table
        const row = this.statements.getEstimateById.get(id, organizationId);

        if (!row) {
            throw new Error(`Estimate not found: ${id}`);
        }

        // Парсим данные и добавляем metadata
        const data = JSON.parse(row.data);
        data.id = row.id;
        data.filename = row.filename;
        data.dataVersion = row.data_version;  // для optimistic locking

        return data;

        // ✅ НЕТ fallback на backup "если не найдено"
        // ✅ НЕТ проверки "более свежей версии" в backup
    }
}
```

---

## 🔄 Optimistic Locking

### Зачем нужен?

**Проблема concurrent modifications:**
```
User A загружает смету (version=1)
User B загружает смету (version=1)

User A редактирует и сохраняет → version=2 ✅
User B редактирует и сохраняет → перезаписывает изменения A ❌
```

**Решение: data_version field**

---

### Реализация

```sql
-- Prepared statement для UPDATE
UPDATE estimates
SET
    data = ?,
    filename = ?,
    updated_at = ?,
    data_version = data_version + 1  -- Increment версии
WHERE id = ?
  AND data_version = ?  -- Проверяем текущую версию

-- Если data_version изменился → changes = 0 → ошибка
```

```javascript
// SQLiteStorage.js
async saveEstimate(id, data, userId, organizationId) {
    const existing = this.statements.getEstimateById.get(id, organizationId);

    if (existing) {
        const result = this.statements.updateEstimate.run(
            // ... data fields
            id,
            existing.data_version,  // Проверяем версию
            organizationId
        );

        // Проверяем успех
        if (result.changes === 0) {
            throw new Error(
                'Concurrent modification detected. ' +
                'Please reload the estimate and try again.'
            );
        }

        console.log(`Estimate ${id} updated to version ${existing.data_version + 1}`);
    }
}
```

---

### Frontend handling

```javascript
// index.html - обработка ошибки concurrent modification
async saveQuoteToServer() {
    try {
        const data = {
            id: this.state.currentQuoteId,
            dataVersion: this.state.dataVersion,  // Текущая версия
            // ... остальные данные
        };

        await this.apiClient.saveEstimate(this.state.currentQuoteId, data);

        this.showNotification('Смета сохранена', false);
    } catch (error) {
        if (error.message.includes('Concurrent modification')) {
            // Конфликт версий - нужно перезагрузить
            this.showNotification(
                'Смета была изменена другим пользователем. Перезагрузите страницу.',
                true
            );

            // Можем автоматически перезагрузить
            const reload = confirm('Перезагрузить смету с сервера?');
            if (reload) {
                await this.loadQuoteFromServer(this.state.currentQuoteId);
            }
        } else {
            this.showNotification(`Ошибка сохранения: ${error.message}`, true);
        }
    }
}
```

---

## 🎯 Когда использовать Backups?

### ✅ Правильное использование backups

#### 1. Disaster Recovery

```javascript
// Физический backup всей БД (не runtime!)
const backup = db.backup('backup-2025-11-05.db');
backup
    .then(() => console.log('Database backed up successfully'))
    .catch(err => console.error('Backup failed:', err));
```

#### 2. Explicit User Action

```javascript
// Пользователь явно создаёт snapshot версии
app.post('/api/estimates/:id/create-snapshot', async (req, res) => {
    const { id } = req.params;

    // Загружаем текущую версию
    const estimate = await storage.loadEstimate(id);

    // Создаём snapshot в отдельной таблице
    await db.run(`
        INSERT INTO estimate_snapshots (id, estimate_id, data, created_at)
        VALUES (?, ?, ?, ?)
    `, [
        generateId(),
        id,
        JSON.stringify(estimate),
        Math.floor(Date.now() / 1000)
    ]);

    res.json({ success: true, message: 'Snapshot created' });
});
```

---

### ❌ Неправильное использование backups

#### 1. Runtime Backup при каждом save

```javascript
// ❌ АНТИПАТТЕРН - НЕ ДЕЛАТЬ ТАК!
async saveQuote(id, data) {
    await storage.saveEstimate(id, data);  // estimates table
    await storage.saveBackup(id, data);    // backups table - ИЗБЫТОЧНО!
}
```

**Почему плохо:**
- Двойные операции → медленнее
- Риск рассинхронизации
- Избыточное хранение данных

---

#### 2. Fallback на backup при load

```javascript
// ❌ АНТИПАТТЕРН - НЕ ДЕЛАТЬ ТАК!
async loadQuote(id) {
    try {
        return await storage.loadEstimate(id);
    } catch (error) {
        // "На всякий случай" грузим из backup
        return await storage.loadBackup(id);  // НЕПРАВИЛЬНО!
    }
}
```

**Почему плохо:**
- Скрывает настоящие ошибки
- Непредсказуемость - какая версия загрузится?
- Может загрузить устаревшие данные

---

## ✅ Checklist для разработчиков

### При добавлении нового функционала

- [ ] **ТОЛЬКО `estimates` table для runtime данных**
  - Все read/write через `estimates`
  - НЕТ параллельных сохранений

- [ ] **NO dual storage**
  - Нет одновременного `saveEstimate()` + `saveBackup()`
  - Нет синхронизации между таблицами

- [ ] **Optimistic locking работает**
  - UPDATE проверяет `data_version`
  - Increment `data_version` при успехе
  - Throw error при conflict

- [ ] **Backups только для explicit actions**
  - Disaster recovery (backup всей БД)
  - User snapshots (явный запрос)
  - НЕ при каждом autosave

---

## 🐛 Типичные ошибки

### Ошибка 1: Автоматический backup при save

```javascript
// ❌ НЕПРАВИЛЬНО
scheduleAutosave(data, filename) {
    setTimeout(async () => {
        await this.saveEstimate(data, filename);
        await this.saveBackup(data, data.id);  // Излишне!
    }, 8000);
}

// ✅ ПРАВИЛЬНО
scheduleAutosave(data, filename) {
    setTimeout(async () => {
        await this.saveEstimate(id, data);  // Только estimates
    }, 8000);
}
```

---

### Ошибка 2: Загрузка из backup при ошибке

```javascript
// ❌ НЕПРАВИЛЬНО
async loadQuote(id) {
    let data = await apiClient.loadEstimate(id);
    if (!data) {
        data = await apiClient.loadBackup(id);  // Fallback - плохо!
    }
    return data;
}

// ✅ ПРАВИЛЬНО
async loadQuote(id) {
    const data = await apiClient.loadEstimate(id);
    // Если ошибка - пусть выбросится наверх
    return data;
}
```

---

### Ошибка 3: Проверка "более свежей" версии

```javascript
// ❌ НЕПРАВИЛЬНО
async loadQuote(id) {
    const estimateData = await storage.loadEstimate(id);
    const backupData = await storage.loadBackup(id);

    // "Выбираем более свежую версию"
    return estimateData.updated_at > backupData.updated_at
        ? estimateData
        : backupData;  // ПЛОХАЯ ИДЕЯ!
}

// ✅ ПРАВИЛЬНО
async loadQuote(id) {
    return await storage.loadEstimate(id);  // Один источник!
}
```

---

## 🧪 Тестирование SSOT

### Тест 1: Нет рассинхронизации

```javascript
test('SSOT: Save и Load используют одну таблицу', async () => {
    const id = generateId();
    const data = { services: ['A', 'B'], version: 1 };

    await storage.saveEstimate(id, data);

    const loaded = await storage.loadEstimate(id);

    expect(loaded.services).toEqual(['A', 'B']);
    expect(loaded.version).toBe(1);
});
```

---

### Тест 2: Optimistic locking работает

```javascript
test('SSOT: Concurrent modification detection', async () => {
    const id = generateId();

    // User A: загружает версию 1
    await storage.saveEstimate(id, { data: 'v1', dataVersion: 1 });

    // User B: обновляет до версии 2
    await storage.saveEstimate(id, { data: 'v2', dataVersion: 2 });

    // User A: пытается сохранить с устаревшей версией 1
    await expect(
        storage.saveEstimate(id, { data: 'v3', dataVersion: 1 })
    ).rejects.toThrow('Concurrent modification');
});
```

---

## 📖 Связанные документы

- [ID-First Pattern](id-first-pattern.md) - UUID как первичный ключ
- [Data Flow Architecture](data-flow.md) - полная спецификация потоков
- [Целостность данных](index.md) - обзор всех паттернов

---

[← Назад к Целостности данных](index.md)
