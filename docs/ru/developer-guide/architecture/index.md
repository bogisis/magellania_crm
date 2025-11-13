# Архитектура

> **Quote Calculator v2.3.0 - Architecture Documentation**

---

## 📋 Обзор

Документация архитектуры Quote Calculator от высокоуровневого overview до деталей хранения данных.

---

## 📚 Документы в этом разделе

### [Overview (Обзор архитектуры)](overview.md)
Высокоуровневый обзор архитектуры приложения:
- Компоненты системы (Frontend, Backend, Storage)
- Технологический стек
- Архитектурные паттерны
- Поток данных
- Ограничения и trade-offs

**Рекомендуется начать отсюда** для понимания общей картины.

### [Frontend (Клиентская часть)](frontend.md)
Архитектура клиентской части:
- ProfessionalQuoteCalculator класс
- State management
- UI components
- Event handling
- Performance optimizations

*Планируется в следующей версии документации*

### [Backend (Серверная часть)](backend.md)
Архитектура серверной части:
- Express.js REST API
- Middleware stack
- Route handlers
- Error handling
- Request/Response flow

*Планируется в следующей версии документации*

### [Storage (Хранилище данных)](storage.md)
Детальная документация системы хранения данных:
- SQLite database schema
- SQLiteStorage класс
- ID-First Pattern
- Optimistic Locking
- Миграция с file-based
- Performance optimizations
- Best practices

**Критически важно** для понимания data layer.

---

## 🎯 Быстрая навигация

### По компонентам

**Frontend:**
- Монолитный SPA (Single Page Application)
- Vanilla JavaScript ES6+
- 512KB, 9979 строк (index.html)
- ProfessionalQuoteCalculator класс

**Backend:**
- Express.js REST API
- 308 строк (server.js)
- SQLite storage layer
- CORS enabled для разработки

**Storage:**
- SQLite primary (v2.3.0+)
- File-based fallback (legacy)
- Автоматическая миграция

### По темам

**Data Flow:**
- [Data Flow Architecture](../data-integrity/data-flow.md) - поток данных
- [ID-First Pattern](../data-integrity/id-first-pattern.md) - immutable IDs
- [Single Source of Truth](../data-integrity/single-source-truth.md) - единое хранилище

**Storage:**
- [Storage Overview](storage.md) - обзор хранения
- [Storage Schema](storage.md#database-schema) - схема БД
- [Migration Guide](storage.md#migration-guide) - миграция

**API:**
- [API Reference](../api-reference/index.md) - все endpoints
- [Estimates API](../api-reference/estimates.md) - CRUD смет
- [Backups API](../api-reference/backups.md) - бэкапы

---

## 🏗️ Архитектурные принципы

### 1. ID-First Pattern
**Принцип:** UUID как immutable primary key

```javascript
// ✅ ПРАВИЛЬНО
const estimate = await storage.loadEstimate(id);
await storage.saveEstimate(id, updatedData);

// ❌ НЕПРАВИЛЬНО
const estimate = await storage.loadEstimateByFilename(filename);
```

**Преимущества:**
- Immutable references
- Safe renaming
- No conflicts

[Подробнее →](../data-integrity/id-first-pattern.md)

### 2. Single Source of Truth
**Принцип:** Одно хранилище для каждого типа данных

```
estimates table → единственный источник смет
backups table → автоматические snapshots
catalogs table → независимые каталоги
```

**Преимущества:**
- Нет рассинхронизации
- Простая миграция
- Понятная ownership

[Подробнее →](../data-integrity/single-source-truth.md)

### 3. Optimistic Locking
**Принцип:** data_version для concurrent updates

```sql
UPDATE estimates
SET data = ?, data_version = data_version + 1
WHERE id = ? AND data_version = ?;
```

**Преимущества:**
- Обнаружение конфликтов
- No pessimistic locks
- Better performance

[Подробнее →](storage.md#data-integrity-features)

### 4. Transactional Saves
**Принцип:** Атомарность связанных операций

```javascript
db.transaction(() => {
    saveEstimate(id, data);    // 1. Save
    createBackup(id, data);     // 2. Backup
})();  // Либо обе успешны, либо обе откатываются
```

**Преимущества:**
- Гарантия консистентности
- No partial updates
- Automatic rollback

[Подробнее →](storage.md#transactional-save)

---

## 📊 Technology Stack

### Frontend
- **Language:** Vanilla JavaScript ES6+
- **UI:** HTML5, CSS3 Custom Properties
- **Storage:** localStorage (для templates)
- **Build:** Нет build step (intentional)

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** better-sqlite3
- **Utilities:** crypto, fs/promises

### Storage
- **Primary:** SQLite (v2.3.0+)
- **Legacy:** File-based JSON
- **Migrations:** Automatic on startup

### Testing
- **Framework:** Jest
- **API Testing:** Supertest
- **Coverage:** 70/70 тестов (100%)

---

## 🔄 Data Flow

```
┌─────────────┐
│   Browser   │
│  (Frontend) │
└──────┬──────┘
       │ HTTP/JSON
       ▼
┌─────────────┐
│ Express API │
│  (Backend)  │
└──────┬──────┘
       │ SQL
       ▼
┌─────────────┐
│   SQLite    │
│  (Storage)  │
└─────────────┘
```

**Типичный flow:**

1. **Create Estimate:**
   ```
   Frontend → POST /api/estimates/:id
   Backend → SQLiteStorage.saveEstimate()
   SQLite → INSERT + CREATE BACKUP (transactional)
   ```

2. **Load Estimate:**
   ```
   Frontend → GET /api/estimates/:id
   Backend → SQLiteStorage.loadEstimate()
   SQLite → SELECT WHERE id = ?
   ```

3. **Update Estimate:**
   ```
   Frontend → POST /api/estimates/:id
   Backend → SQLiteStorage.saveEstimate()
   SQLite → UPDATE WHERE id = ? AND data_version = ?
   ```

[Подробный Data Flow →](../data-integrity/data-flow.md)

---

## ⚠️ Известные ограничения

### 1. Монолитный Frontend
**Проблема:** 512KB, 9979 строк в одном файле

**Impact:**
- Сложность поддержки
- Медленная разработка
- Large bundle size

**Митигация:**
- Планируется модуляризация в v3.0
- Хорошая структуризация класса
- Подробная документация

**Приоритет:** P1 (высокий)

### 2. No Real-time Collaboration
**Проблема:** Optimistic locking только при save

**Impact:**
- Конфликты обнаруживаются поздно
- Нет live updates

**Митигация:**
- Автосохранение каждые 8 секунд
- Clear conflict messages
- Manual merge при конфликтах

**Приоритет:** P2 (средний)

### 3. Single Database File
**Проблема:** Один SQLite файл для всех данных

**Impact:**
- Потенциальный lock contention
- Нет horizontal scaling

**Митигация:**
- WAL mode для concurrent reads
- Prepared statements для performance
- Connection pooling (если нужно)

**Приоритет:** P3 (низкий, для small-medium loads OK)

[Полный список →](overview.md#limitations)

---

## 🚀 Evolution Timeline

### v1.0 - v1.2 (Август - Октябрь 2024)
**MVP архитектура:**
- Базовый SPA
- localStorage только
- CSV импорт/экспорт

### v2.0 - v2.2 (Ноябрь 2024 - Январь 2025)
**Production архитектура:**
- Монолитный класс
- JSON формат
- File-based backend
- Version management

### v2.3.0 (Октябрь 2025) - **Current**
**Stabilization архитектура:**
- SQLite integration
- Transactional saves
- ID-First Pattern
- Optimistic Locking
- ErrorBoundary

### v3.0.0 (Планируется Q1 2025)
**Modular архитектура:**
- Модуляризация frontend
- State Manager
- Conflict Resolution
- Real-time collaboration (опционально)

---

## 📖 Рекомендуемый порядок изучения

### Для новых разработчиков:
1. **[Overview](overview.md)** - Начните здесь!
2. **[Data Integrity Index](../data-integrity/index.md)** - Критические паттерны
3. **[ID-First Pattern](../data-integrity/id-first-pattern.md)** - Ключевой concept
4. **[Storage](storage.md)** - Детали хранения
5. **[API Reference](../api-reference/index.md)** - Практическое использование

### Для code review:
1. **[ID-First Pattern](../data-integrity/id-first-pattern.md)** - Проверка правильности
2. **[Storage Best Practices](storage.md#best-practices)** - Паттерны
3. **[Changelog](../history/changelog.md)** - История изменений

### Для troubleshooting:
1. **[Storage Troubleshooting](storage.md#troubleshooting)** - Частые проблемы
2. **[Common Errors](../troubleshooting/common-errors.md)** - Типичные ошибки
3. **[Deployment Troubleshooting](../deployment/docker.md#troubleshooting)** - Деплой

---

## 🔗 Связанная документация

- [Data Integrity](../data-integrity/index.md) - целостность данных
- [API Reference](../api-reference/index.md) - API endpoints
- [Deployment](../deployment/index.md) - развертывание
- [History](../history/index.md) - история изменений

---

[← Назад к Developer Guide](../index.md) | [Overview →](overview.md) | [Storage →](storage.md)
