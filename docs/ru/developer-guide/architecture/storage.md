# Storage Architecture

> **SQLite Integration & Data Storage Strategy**

---

## 📋 Обзор

Quote Calculator v2.3.0+ использует SQLite как основное хранилище данных с поддержкой file-based legacy режима.

### Ключевые компоненты

- **SQLite Database** (`db/quotes.db`) - основное хранилище
- **SQLiteStorage** класс - абстракция для работы с БД
- **File-based fallback** - поддержка legacy режима
- **Migrations** - автоматические миграции схемы

---

## 🗄️ Database Schema

### Таблица: `estimates`

```sql
CREATE TABLE estimates (
    id TEXT PRIMARY KEY,              -- UUID (12 символов)
    filename TEXT NOT NULL UNIQUE,     -- Имя файла для display
    data TEXT NOT NULL,                -- JSON данные сметы
    client_name TEXT,                  -- Имя клиента (indexed)
    pax_count INTEGER,                 -- Количество человек
    tour_start DATE,                   -- Дата начала тура
    tour_end DATE,                     -- Дата окончания
    data_hash TEXT,                    -- MD5 хеш для deduplication
    data_version INTEGER DEFAULT 1,    -- Optimistic locking
    app_version TEXT,                  -- Версия приложения
    created_at TEXT NOT NULL,          -- ISO 8601 timestamp
    updated_at TEXT NOT NULL,          -- ISO 8601 timestamp
    deleted_at TEXT                    -- Soft delete timestamp
);

CREATE INDEX idx_estimates_client ON estimates(client_name);
CREATE INDEX idx_estimates_updated ON estimates(updated_at DESC);
CREATE INDEX idx_estimates_deleted ON estimates(deleted_at);
```

**ID-First Pattern:**
- **ID** - первичный ключ (UUID, генерируется на клиенте)
- **Filename** - только для display, может меняться
- **Immutable ID** - гарантирует целостность ссылок

**Optimistic Locking:**
- `data_version` инкрементируется при каждом UPDATE
- Предотвращает lost updates в concurrent scenarios

### Таблица: `backups`

```sql
CREATE TABLE backups (
    id TEXT PRIMARY KEY,               -- UUID бэкапа
    estimate_id TEXT NOT NULL,         -- Foreign key → estimates.id
    data TEXT NOT NULL,                -- JSON данные (snapshot)
    data_hash TEXT,                    -- MD5 хеш
    created_at TEXT NOT NULL,          -- Timestamp создания
    FOREIGN KEY (estimate_id) REFERENCES estimates(id)
);

CREATE INDEX idx_backups_estimate ON backups(estimate_id);
CREATE INDEX idx_backups_created ON backups(created_at DESC);
```

**Backup Strategy:**
- Автоматический backup при каждом сохранении
- Полный snapshot данных для recovery
- Ссылка на estimate через immutable ID

### Таблица: `catalogs`

```sql
CREATE TABLE catalogs (
    id TEXT PRIMARY KEY,               -- UUID каталога
    name TEXT NOT NULL,                -- Имя каталога
    region TEXT,                       -- Регион (для multi-region)
    data TEXT NOT NULL,                -- JSON данные (templates, categories)
    templates_count INTEGER DEFAULT 0, -- Количество шаблонов
    data_hash TEXT,                    -- MD5 хеш
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(name, region)               -- Уникальность по name+region
);

CREATE INDEX idx_catalogs_region ON catalogs(region);
CREATE INDEX idx_catalogs_updated ON catalogs(updated_at DESC);
```

**Multi-Region Support:**
- Каталоги разделены по регионам
- UNIQUE constraint на (name, region)
- Независимое управление каталогами разных регионов

---

## 🏗️ SQLiteStorage Class

### Основные методы

#### Estimates

```javascript
// Сохранение сметы
async saveEstimate(id, data) {
    const existing = this.statements.getEstimateById.get(id);

    if (existing) {
        // UPDATE с optimistic locking
        this.statements.updateEstimate.run(
            filename, dataStr, ...,
            existing.id,              // WHERE id = ?
            existing.data_version     // AND data_version = ?
        );
    } else {
        // INSERT нового estimate
        this.statements.insertEstimate.run(...);
    }
}

// Загрузка сметы по ID
async loadEstimate(id) {
    return this.statements.getEstimateById.get(id);
}

// Список всех смет
async listEstimates() {
    return this.statements.listEstimates.all();
}

// Переименование (UPDATE filename)
async renameEstimate(id, newFilename) {
    this.statements.updateEstimateFilename.run(newFilename, id);
}

// Soft delete
async deleteEstimate(id) {
    this.statements.softDeleteEstimate.run(new Date().toISOString(), id);
}
```

#### Transactional Save

```javascript
async saveEstimateTransactional(id, data) {
    return this.db.transaction(() => {
        // 1. Save estimate
        const result = this.saveEstimate(id, data);

        // 2. Create backup
        this.createBackup(id, data);

        return result;
    })();
}
```

**Атомарность:**
- Обе операции (save + backup) выполняются в одной транзакции
- Либо обе успешны, либо обе откатываются
- Гарантия консистентности данных

#### Backups

```javascript
async createBackup(estimateId, data) {
    const backupId = generateId();
    this.statements.insertBackup.run(
        backupId,
        estimateId,
        JSON.stringify(data),
        md5(JSON.stringify(data)),
        new Date().toISOString()
    );
}

async listBackups(estimateId) {
    return this.statements.listBackupsForEstimate.all(estimateId);
}

async getBackup(backupId) {
    return this.statements.getBackupById.get(backupId);
}
```

#### Catalogs

```javascript
async saveCatalog(name, region, data) {
    const existing = this.statements.getCatalogByNameRegion.get(name, region);

    if (existing) {
        // UPDATE каталога
        this.statements.updateCatalog.run(...);
    } else {
        // INSERT нового каталога
        this.statements.insertCatalog.run(...);
    }
}

async loadCatalog(name, region) {
    return this.statements.getCatalogByNameRegion.get(name, region);
}

async listCatalogs() {
    return this.statements.listCatalogs.all();
}
```

---

## 🔄 Migration from File-Based

### Automatic Migration

При первом запуске с `STORAGE_TYPE=sqlite`, автоматически выполняется:

```javascript
async migrateFromFileSystem() {
    // 1. Сканирование estimate/ директории
    const estimateFiles = fs.readdirSync('./estimate');

    for (const file of estimateFiles) {
        const data = JSON.parse(fs.readFileSync(`./estimate/${file}`));

        // 2. Импорт в SQLite
        await this.saveEstimate(data.id || generateId(), data);
    }

    // 3. Миграция backups
    const backupFiles = fs.readdirSync('./backup');
    for (const file of backupFiles) {
        const data = JSON.parse(fs.readFileSync(`./backup/${file}`));
        await this.createBackup(data.estimateId, data);
    }

    // 4. Миграция catalogs
    const catalogFiles = fs.readdirSync('./catalog');
    for (const file of catalogFiles) {
        const data = JSON.parse(fs.readFileSync(`./catalog/${file}`));
        await this.saveCatalog(data.name, data.region, data);
    }
}
```

### Manual Migration

```bash
# 1. Backup file-based данных
tar -czf file_based_backup_$(date +%Y%m%d).tar.gz estimate/ backup/ catalog/

# 2. Запустить с SQLite
STORAGE_TYPE=sqlite node server-with-db.js

# 3. Проверить миграцию
curl http://localhost:4000/api/health | jq '.storage'

# Ожидаемый ответ:
# {
#   "type": "sqlite",
#   "estimatesCount": 15,
#   "backupsCount": 45,
#   "catalogsCount": 3
# }
```

---

## 🔐 Data Integrity Features

### 1. ID-First Pattern

**Принцип:** ID - первичный ключ, filename - только display

```javascript
// ПРАВИЛЬНО ✅
const estimate = await storage.loadEstimate(id);
await storage.saveEstimate(id, updatedData);
await storage.deleteEstimate(id);

// НЕПРАВИЛЬНО ❌
const estimate = await storage.loadEstimateByFilename(filename);
```

**Преимущества:**
- Immutable references - ID никогда не меняется
- Safe renaming - filename может меняться без breaking references
- No filename conflicts - несколько смет могут иметь одинаковые имена (разные ID)

### 2. Optimistic Locking

**Принцип:** `data_version` инкрементируется при UPDATE

```sql
UPDATE estimates
SET data = ?, data_version = data_version + 1, updated_at = ?
WHERE id = ? AND data_version = ?;
```

**Обработка конфликтов:**
```javascript
try {
    const result = await storage.saveEstimate(id, data);
    if (result.changes === 0) {
        // Data version mismatch - конфликт!
        throw new Error('Optimistic lock conflict: data was modified by another user');
    }
} catch (err) {
    // Reload, merge, retry
}
```

### 3. Data Hash Deduplication

**Принцип:** MD5 хеш данных для обнаружения дубликатов

```javascript
const dataHash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');

// Проверка на дубликаты
const duplicate = this.statements.getEstimateByHash.get(dataHash);
if (duplicate) {
    console.warn(`Duplicate data detected: ${duplicate.id}`);
}
```

### 4. Soft Delete

**Принцип:** Логическое удаление через `deleted_at`

```sql
-- Soft delete
UPDATE estimates SET deleted_at = ? WHERE id = ?;

-- Exclude deleted в queries
SELECT * FROM estimates WHERE deleted_at IS NULL;

-- Hard delete (cleanup)
DELETE FROM estimates WHERE deleted_at < ?;
```

---

## 📊 Performance Optimizations

### Prepared Statements

```javascript
this.statements = {
    getEstimateById: db.prepare('SELECT * FROM estimates WHERE id = ? AND deleted_at IS NULL'),
    listEstimates: db.prepare('SELECT * FROM estimates WHERE deleted_at IS NULL ORDER BY updated_at DESC'),
    insertEstimate: db.prepare('INSERT INTO estimates (...) VALUES (...)'),
    updateEstimate: db.prepare('UPDATE estimates SET ... WHERE id = ? AND data_version = ?'),
    // ... другие statements
};
```

**Преимущества:**
- Query compilation кэшируется
- SQL injection protection
- Значительное ускорение repeated queries

### Indexes

```sql
-- Поиск по клиенту
CREATE INDEX idx_estimates_client ON estimates(client_name);

-- Сортировка по дате
CREATE INDEX idx_estimates_updated ON estimates(updated_at DESC);

-- Backups для estimate
CREATE INDEX idx_backups_estimate ON backups(estimate_id);
```

### Batch Operations

```javascript
async batchInsertEstimates(estimates) {
    return this.db.transaction(() => {
        for (const est of estimates) {
            this.saveEstimate(est.id, est.data);
        }
    })();
}
```

**Ускорение:**
- 1 estimate: ~5ms
- 100 estimates without transaction: ~500ms
- 100 estimates in transaction: ~50ms (10x faster)

---

## 🧪 Testing

### Unit Tests

```javascript
describe('SQLiteStorage', () => {
    test('saveEstimate creates new record', async () => {
        const id = generateId();
        await storage.saveEstimate(id, mockData);

        const loaded = await storage.loadEstimate(id);
        expect(loaded.data).toEqual(mockData);
    });

    test('optimistic locking detects conflicts', async () => {
        const id = generateId();
        await storage.saveEstimate(id, mockData);

        // Simulate concurrent modification
        const stmt = storage.db.prepare('UPDATE estimates SET data_version = data_version + 1 WHERE id = ?');
        stmt.run(id);

        // This should fail
        await expect(storage.saveEstimate(id, updatedData)).rejects.toThrow('Optimistic lock');
    });
});
```

---

## 🔧 Configuration

### Environment Variables

```bash
# SQLite mode (рекомендуется для production)
STORAGE_TYPE=sqlite node server-with-db.js

# File-based mode (legacy)
STORAGE_TYPE=file node server-with-db.js

# или просто
node server.js  # по умолчанию file-based
```

### Database Location

```javascript
const DB_PATH = process.env.DB_PATH || './db/quotes.db';
```

По умолчанию: `./db/quotes.db`

---

## 🚀 Migration Guide

### v2.2.0 (File-based) → v2.3.0 (SQLite)

**Шаг 1: Backup данных**
```bash
tar -czf backup_$(date +%Y%m%d).tar.gz estimate/ backup/ catalog/
```

**Шаг 2: Запустить с SQLite**
```bash
STORAGE_TYPE=sqlite node server-with-db.js
```

**Шаг 3: Verify миграция**
```bash
curl http://localhost:4000/api/health | jq
```

**Шаг 4: Clean up files (опционально)**
```bash
# После проверки, что SQLite работает
rm -rf estimate/ backup/ catalog/
```

### Rollback

```bash
# 1. Stop server
pkill -f "node server"

# 2. Restore from backup
tar -xzf backup_YYYYMMDD.tar.gz

# 3. Run file-based mode
node server.js
```

---

## 📚 Best Practices

### 1. Всегда используйте ID

```javascript
// ✅ ПРАВИЛЬНО
await storage.loadEstimate(id);

// ❌ НЕПРАВИЛЬНО
await storage.loadEstimateByFilename(filename);
```

### 2. Обрабатывайте optimistic lock conflicts

```javascript
try {
    await storage.saveEstimate(id, data);
} catch (err) {
    if (err.message.includes('Optimistic lock')) {
        // Reload, merge, retry
    }
}
```

### 3. Используйте транзакции для связанных операций

```javascript
// ✅ ПРАВИЛЬНО - атомарно
await storage.saveEstimateTransactional(id, data);

// ❌ НЕПРАВИЛЬНО - не атомарно
await storage.saveEstimate(id, data);
await storage.createBackup(id, data);
```

### 4. Регулярные backups БД

```bash
# Daily backup
0 2 * * * tar -czf /backups/quotes_$(date +\%Y\%m\%d).tar.gz ./db/quotes.db
```

---

## 🔍 Troubleshooting

### Database locked

**Проблема:**
```
Error: SQLITE_BUSY: database is locked
```

**Решение:**
```javascript
// Увеличить timeout
const db = new Database('quotes.db', { timeout: 5000 });

// Или использовать WAL mode
db.pragma('journal_mode = WAL');
```

### Migration failed

**Проблема:** Миграция не завершилась

**Решение:**
```bash
# 1. Проверить логи
cat logs/app.log | grep "migration"

# 2. Повторная миграция
rm db/quotes.db
STORAGE_TYPE=sqlite node server-with-db.js
```

### Data loss

**Проблема:** Данные потеряны после обновления

**Решение:**
```bash
# Restore from backup
tar -xzf backup_YYYYMMDD.tar.gz

# Check backups table
sqlite3 db/quotes.db "SELECT * FROM backups ORDER BY created_at DESC LIMIT 10;"
```

---

## 📖 Related Documentation

- [Architecture Overview](overview.md) - общая архитектура
- [Data Integrity](../data-integrity/index.md) - паттерны целостности данных
- [ID-First Pattern](../data-integrity/id-first-pattern.md) - детали ID-First
- [Deployment](../deployment/index.md) - развертывание с SQLite

---

[← Назад к Architecture](index.md)
