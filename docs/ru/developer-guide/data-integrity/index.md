# Целостность данных

> **🔥 КРИТИЧЕСКИ ВАЖНО: Архитектурные паттерны, которые НЕЛЬЗЯ нарушать**

---

## ⚠️ Внимание!

**ОБЯЗАТЕЛЬНО ПРОЧИТАТЬ перед любыми изменениями в коде!**

Эта документация описывает **критичные архитектурные паттерны** Quote Calculator v2.3.0, нарушение которых приведет к:
- ❌ Потере данных
- ❌ Рассинхронизации estimate/backup
- ❌ Невозможности rename файлов
- ❌ Конфликтам конкурентных изменений
- ❌ Непредсказуемому поведению

**Приоритет:** P0 - КРИТИЧНО

---

## 📋 Обзор

Quote Calculator построен на трёх ключевых принципах целостности данных:

### 1. [ID-First Pattern](id-first-pattern.md)

**UUID как первичный ключ для всех операций**

```javascript
// ✅ ПРАВИЛЬНО
const id = generateId();  // UUID
await saveEstimate(id, data);
await loadEstimate(id);

// ❌ НЕПРАВИЛЬНО
await saveEstimate(filename, data);  // filename НЕ ключ!
```

**Почему критично:** Filename может меняться (rename), ID - никогда.

[Подробнее →](id-first-pattern.md)

---

### 2. [Single Source of Truth](single-source-truth.md)

**Одна таблица estimates - единственный источник данных**

```javascript
// ✅ ПРАВИЛЬНО
await saveEstimate(id, data);  // Одна операция

// ❌ НЕПРАВИЛЬНО - dual storage!
await saveEstimate(id, data);
await saveBackup(id, data);  // Рассинхронизация!
```

**Почему критично:** Два источника данных = гарантированная рассинхронизация.

[Подробнее →](single-source-truth.md)

---

### 3. [Data Flow Architecture](data-flow.md)

**Однонаправленный поток данных через estimates table**

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

**Почему критично:** Нарушение потока приводит к непредсказуемым багам.

[Подробнее →](data-flow.md)

---

## 🔥 Золотые правила

### Правило 1: ID - Primary Key

```javascript
// ✅ ВСЕ операции через ID
loadEstimate(id)
saveEstimate(id, data)
deleteEstimate(id)
renameEstimate(id, newFilename)

// ❌ НИКОГДА через filename
loadEstimate(filename)      // НЕТ!
saveEstimate(filename, data) // НЕТ!
```

---

### Правило 2: Filename - Display Name Only

```javascript
// ✅ ПРАВИЛЬНО
const displayName = filename.replace(/\\.json$/i, '');
fileNameSpan.textContent = displayName;  // Показать в UI

// ❌ НЕПРАВИЛЬНО
const estimate = await loadEstimate(filename);  // filename НЕ ключ!
```

---

### Правило 3: Single Storage Layer

```javascript
// ✅ ПРАВИЛЬНО - одна операция
async saveEstimate(id, data) {
    await db.run('UPDATE estimates SET data=? WHERE id=?', data, id);
}

// ❌ НЕПРАВИЛЬНО - dual storage
async saveEstimate(id, data) {
    await db.run('UPDATE estimates SET data=? WHERE id=?', data, id);
    await db.run('INSERT INTO backups (id, data) VALUES (?, ?)', id, data);
    // ^ Рассинхронизация гарантирована!
}
```

---

### Правило 4: Optimistic Locking

```javascript
// ✅ ПРАВИЛЬНО - с version check
UPDATE estimates
SET data=?, data_version=data_version+1, updated_at=?
WHERE id=? AND data_version=?

if (db.changes === 0) {
    throw new Error('Concurrent modification detected');
}

// ❌ НЕПРАВИЛЬНО - без version check
UPDATE estimates
SET data=?, updated_at=?
WHERE id=?
// ^ Конкурентные изменения перезапишут друг друга
```

---

## 📊 Архитектурная диаграмма

### Правильная архитектура (текущая)

```
┌─────────────────────────────────────────────────┐
│              Single Source of Truth              │
│                                                  │
│            ESTIMATES TABLE (SQLite)              │
│  ┌────────────────────────────────────────────┐ │
│  │ id (PK UUID)      | PRIMARY KEY            │ │
│  │ filename          | DISPLAY NAME           │ │
│  │ data (JSON)       | СМЕТА                  │ │
│  │ data_version      | OPTIMISTIC LOCK        │ │
│  │ updated_at        | TIMESTAMP              │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
         ↑ ↓ ALL operations use ID
    ┌────┴─────────────────────────────┐
    │                                   │
  CREATE                             LOAD
  SAVE                               UPDATE
  DELETE                             RENAME
    │                                   │
    ▼                                   ▼
   API endpoints              API endpoints
  (POST/PUT/DELETE)           (GET)
```

---

### ❌ Антипаттерн (НЕ делать!)

```
┌─────────────────────┐     ┌─────────────────────┐
│   ESTIMATES TABLE   │     │   BACKUPS TABLE     │
│                     │     │                     │
│  id | filename |... │     │  id | data | ...   │
└─────────────────────┘     └─────────────────────┘
         ↑                           ↑
         │                           │
         └────────┬──────────────────┘
                  │
              SAVE operation
         (может упасть на одной!)

❌ ПРОБЛЕМА: Рассинхронизация данных гарантирована
```

---

## 🐛 Типичные ошибки и их последствия

### Ошибка 1: Использование filename как ключа

```javascript
// ❌ КОД С БАГОМ
async loadQuote(filename) {
    const data = await apiClient.loadEstimate(filename);
    // ...
}

async renameQuote(oldFilename, newFilename) {
    // ПРОБЛЕМА: После rename loadQuote(oldFilename) не найдёт смету!
}
```

**Последствия:**
- После rename пользователь не может загрузить смету
- ENOENT ошибки при попытке открыть файл
- Потеря данных при конфликте имён

**Правильное решение:**
```javascript
// ✅ ИСПРАВЛЕНО
async loadQuote(id) {
    const data = await apiClient.loadEstimate(id);
    // ID неизменен, rename не влияет
}
```

---

### Ошибка 2: Dual storage без транзакций

```javascript
// ❌ КОД С БАГОМ
async saveQuote(data, filename) {
    await apiClient.saveEstimate(data, filename);  // ✅ Успех
    await apiClient.saveBackup(data, data.id);     // ❌ УПАЛ!
    // ПРОБЛЕМА: estimate сохранён, backup нет = рассинхронизация
}
```

**Последствия:**
- estimate и backup содержат разные данные
- При reload из backup получаем старую версию
- Пользователь теряет изменения

**Правильное решение:**
```javascript
// ✅ ИСПРАВЛЕНО - Single Source
async saveQuote(id, data) {
    await apiClient.saveEstimate(id, data);  // Только одна операция
    // Нет backup в runtime - только estimates table
}
```

---

### Ошибка 3: Race condition в autosave

```javascript
// ❌ КОД С БАГОМ
async loadQuote(id) {
    const data = await apiClient.loadEstimate(id);
    this.state.services = data.services;
    // ПРОБЛЕМА: autosave может сработать ДО завершения load!
}

// Autosave срабатывает каждые 8 сек
setInterval(() => {
    await this.saveQuote(this.state.currentQuoteId, this.state);
    // ^ Может сохранить смешанные данные старой/новой сметы
}, 8000);
```

**Последствия:**
- Services из старой сметы "прилипают" к новой
- Непредсказуемое содержимое смет
- Потеря данных пользователя

**Правильное решение:**
```javascript
// ✅ ИСПРАВЛЕНО - Guard flag
async loadQuote(id) {
    this.isLoadingQuote = true;  // Блокируем autosave
    const data = await apiClient.loadEstimate(id);
    this.state.services = data.services;
    this.isLoadingQuote = false;
}

// Autosave с проверкой
setInterval(() => {
    if (!this.isLoadingQuote) {  // Проверяем flag
        await this.saveQuote(this.state.currentQuoteId, this.state);
    }
}, 8000);
```

---

## 📖 Подробная документация

### Обязательное чтение

1. **[ID-First Pattern](id-first-pattern.md)** (15 минут)
   - UUID как первичный ключ
   - Почему filename НЕ может быть ключом
   - Примеры правильного использования

2. **[Single Source of Truth](single-source-truth.md)** (10 минут)
   - Одна таблица estimates
   - Почему backups НЕ для runtime
   - Optimistic locking

3. **[Data Flow Architecture](data-flow.md)** (20 минут)
   - Полная спецификация потоков данных
   - API flow для всех операций
   - Troubleshooting guide

---

## ✅ Checklist перед изменениями

Перед любыми изменениями в коде, связанными с данными:

### Проверка 1: ID-First соблюдён?
- [ ] Все операции используют `id` (UUID) как ключ
- [ ] Нет операций по `filename`
- [ ] `filename` используется только для UI display

### Проверка 2: Single Source соблюдён?
- [ ] Данные сохраняются ТОЛЬКО в `estimates` table
- [ ] НЕТ дублирующих операций в `backups` для runtime
- [ ] Backups только для explicit user actions

### Проверка 3: Data Flow соблюдён?
- [ ] Операции идут через storage layer
- [ ] НЕТ прямого доступа к файлам
- [ ] НЕТ обхода API

### Проверка 4: Race Conditions предотвращены?
- [ ] Autosave не срабатывает во время load
- [ ] Используются guard flags если нужно
- [ ] Нет конкурентных операций без синхронизации

### Проверка 5: Optimistic Locking работает?
- [ ] UPDATE проверяет `data_version`
- [ ] Increment `data_version` при успехе
- [ ] Обработка ошибки concurrent modification

---

## 🧪 Тестирование целостности данных

### Тест 1: Create → Save → Load

```javascript
test('ID-First: Create и Load используют ID', async () => {
    const id = generateId();
    const data = { services: [] };

    await storage.saveEstimate(id, data);
    const loaded = await storage.loadEstimate(id);

    expect(loaded.id).toBe(id);
});
```

### Тест 2: Rename не ломает Load

```javascript
test('ID-First: Rename не влияет на loadEstimate', async () => {
    const id = generateId();
    await storage.saveEstimate(id, { filename: 'old.json' });

    await storage.renameEstimate(id, 'new.json');

    const loaded = await storage.loadEstimate(id);  // Должен работать!
    expect(loaded.filename).toBe('new.json');
});
```

### Тест 3: Concurrent Modification Detection

```javascript
test('Optimistic Locking: Detect concurrent modification', async () => {
    const id = generateId();
    await storage.saveEstimate(id, { data: 'v1', data_version: 1 });

    // Симулируем конкурентное изменение
    await storage.saveEstimate(id, { data: 'v2', data_version: 2 });

    // Попытка сохранить с устаревшим version
    await expect(
        storage.saveEstimate(id, { data: 'v3', data_version: 1 })
    ).rejects.toThrow('Concurrent modification');
});
```

---

## 📞 Когда обращаться к этой документации

**Всегда, когда вы:**
- Добавляете новый API endpoint для смет
- Меняете логику save/load
- Работаете с filename
- Реализуете новый storage backend
- Исправляете баг, связанный с данными
- Добавляете caching или backup функциональность

**Особенно важно:**
- При рефакторинге storage layer
- При миграции на новую БД
- При добавлении multi-user support
- При реализации sync между клиентами

---

## 🗺️ Навигация

**Читать далее:**
- [ID-First Pattern →](id-first-pattern.md)
- [Single Source of Truth →](single-source-truth.md)
- [Data Flow Architecture →](data-flow.md)

**См. также:**
- [Architecture Overview](../architecture/overview.md)
- [Storage Layer](../architecture/storage.md)
- [API Reference](../api-reference/index.md)

**Вернуться:**
- [← Developer Guide](../index.md)
- [← Главная](../../../index.md)
