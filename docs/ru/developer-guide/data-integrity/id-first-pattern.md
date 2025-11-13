# ID-First Pattern

> **UUID как первичный ключ - фундамент архитектуры данных**

---

## 📋 Суть паттерна

**ID-First Pattern** означает, что **UUID** является единственным и неизменным идентификатором сметы на протяжении всего её жизненного цикла.

### Ключевые принципы

1. **ID = Primary Key**
   - UUID генерируется при создании сметы
   - ID **НИКОГДА** не меняется
   - Все операции используют ID как ключ

2. **filename = Display Name**
   - Filename - это человекочитаемое имя
   - Filename **МОЖЕТ** меняться (rename)
   - Filename используется **ТОЛЬКО** для отображения в UI

3. **NO filename-based operations**
   - Нельзя использовать filename для load/save/delete
   - Filename не уникален (может дублироваться)
   - Filename не стабилен (может меняться)

---

## 🎯 Зачем нужен ID-First?

### Проблема filename как ключа

```javascript
// ❌ ПРОБЛЕМНЫЙ КОД - filename как ключ
async loadQuote(filename) {
    const data = await fs.readFile(`estimates/${filename}`);
    return JSON.parse(data);
}

async renameQuote(oldFilename, newFilename) {
    await fs.rename(`estimates/${oldFilename}`, `estimates/${newFilename}`);
    // ПРОБЛЕМА: После rename loadQuote(oldFilename) больше не работает!
}
```

**Последствия:**
- ❌ После rename пользователь не может открыть смету
- ❌ ENOENT ошибки при попытке загрузить файл
- ❌ Ссылки на смету ломаются
- ❌ История операций теряет связь с файлом

---

### Решение: ID-First Pattern

```javascript
// ✅ ПРАВИЛЬНЫЙ КОД - ID как ключ
async loadQuote(id) {
    const row = await db.get('SELECT * FROM estimates WHERE id = ?', id);
    return JSON.parse(row.data);
}

async renameQuote(id, newFilename) {
    await db.run('UPDATE estimates SET filename = ? WHERE id = ?', newFilename, id);
    // ✅ После rename loadQuote(id) продолжает работать!
}
```

**Преимущества:**
- ✅ Rename не ломает ссылки на смету
- ✅ ID стабилен - можно использовать везде
- ✅ Нет ENOENT ошибок
- ✅ История операций сохраняется

---

## 🏗️ Реализация

### Генерация UUID

```javascript
// utils.js - генератор UUID v4
function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Использование
const newEstimateId = generateId();  // "a3b2c1d4-..."
```

---

### Database Schema

```sql
CREATE TABLE estimates (
    id TEXT PRIMARY KEY,              -- UUID, неизменный
    filename TEXT NOT NULL,            -- display name, может меняться
    data TEXT NOT NULL,                -- JSON данные
    data_version INTEGER DEFAULT 1,    -- для optimistic locking
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    user_id TEXT,
    organization_id TEXT
);

-- Индексы для производительности
CREATE INDEX idx_estimates_filename ON estimates(filename);
CREATE INDEX idx_estimates_updated_at ON estimates(updated_at DESC);
```

---

### CREATE операция

```javascript
// index.html - создание новой сметы
async createNewQuote() {
    // 1. Генерируем UUID
    const id = this.generateId();

    // 2. Генерируем filename из данных клиента
    const clientName = this.transliterate(this.state.clientName || 'Unnamed');
    const date = new Date().toISOString().split('T')[0];
    const paxCount = this.state.paxCount;
    const filename = `${clientName}_${date}_${paxCount}pax.json`;

    // 3. Создаём начальные данные с ID
    const data = {
        id: id,                           // UUID
        filename: filename,                // display name
        clientName: this.state.clientName,
        services: [],
        // ... остальные поля
    };

    // 4. Сохраняем с ID как ключом
    await this.apiClient.saveEstimate(id, data);

    // 5. Запоминаем ID текущей сметы
    this.state.currentQuoteId = id;
    this.state.currentQuoteFile = filename;

    console.log(`Created estimate with ID: ${id}`);
}
```

---

### LOAD операция

```javascript
// index.html - загрузка сметы
async loadQuoteFromServer(estimateId) {
    try {
        this.isLoadingQuote = true;  // Guard flag

        // Загружаем по ID
        const data = await this.apiClient.loadEstimate(estimateId);

        // ID и filename приходят из базы
        this.state.currentQuoteId = data.id;           // UUID из БД
        this.state.currentQuoteFile = data.filename;   // filename из БД

        // Загружаем данные в state
        this.state.services = data.services || [];
        this.state.clientName = data.clientName;
        // ... остальные поля

        this.updateQuoteStatusBar();  // Показываем filename в UI
        this.showNotification(`Смета загружена: ${data.filename}`, false);

        this.isLoadingQuote = false;
    } catch (error) {
        this.isLoadingQuote = false;
        this.showNotification(`Ошибка загрузки: ${error.message}`, true);
    }
}

// apiClient.js - API метод
async loadEstimate(id) {
    const response = await fetch(`${this.baseURL}/api/estimates/${id}`);
    const result = await response.json();

    if (!result.success) {
        throw new Error(result.error);
    }

    return result.data;  // { id, filename, services, ... }
}

// server-with-db.js - API endpoint
app.get('/api/estimates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await storage.loadEstimate(id);  // ID как ключ

        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            error: `Estimate not found: ${id}`
        });
    }
});

// SQLiteStorage.js - storage метод
async loadEstimate(id, organizationId = null) {
    const row = this.statements.getEstimateById.get(id, orgId);

    if (!row) {
        throw new Error(`Estimate not found: ${id}`);
    }

    const data = JSON.parse(row.data);
    data.id = row.id;               // UUID из БД
    data.filename = row.filename;    // filename из БД
    data.dataVersion = row.data_version;

    return data;
}
```

---

### SAVE операция

```javascript
// index.html - сохранение сметы
async saveQuoteToServer() {
    if (!this.state.currentQuoteId) {
        this.showNotification('Сначала создайте смету', true);
        return;
    }

    try {
        const data = {
            id: this.state.currentQuoteId,        // UUID
            filename: this.state.currentQuoteFile, // может обновиться
            clientName: this.state.clientName,
            services: this.state.services,
            // ... остальные поля
        };

        // Сохраняем по ID
        await this.apiClient.saveEstimate(this.state.currentQuoteId, data);

        this.showNotification('Смета сохранена', false);
    } catch (error) {
        this.showNotification(`Ошибка сохранения: ${error.message}`, true);
    }
}

// apiClient.js
async saveEstimate(id, data) {
    if (!id) {
        throw new Error('ID is required for saveEstimate');
    }

    // POST /api/estimates/:id - ID в URL
    const response = await fetch(`${this.baseURL}/api/estimates/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error);

    return { ...result, id };
}

// server-with-db.js
app.post('/api/estimates/:id', async (req, res) => {
    try {
        const { id } = req.params;  // ID из URL
        const data = req.body;

        await storage.saveEstimate(id, data);

        res.json({ success: true, id: id });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
```

---

### RENAME операция

```javascript
// index.html - переименование сметы
async renameEstimate(estimateId, newFilename) {
    try {
        // Вызываем API rename с ID
        await this.apiClient.renameEstimate(estimateId, newFilename);

        // Обновляем локальный state
        if (this.state.currentQuoteId === estimateId) {
            this.state.currentQuoteFile = newFilename;
            this.updateQuoteStatusBar();
        }

        this.showNotification(`Смета переименована в: ${newFilename}`, false);
    } catch (error) {
        this.showNotification(`Ошибка переименования: ${error.message}`, true);
    }
}

// apiClient.js
async renameEstimate(id, newFilename) {
    // PUT /api/estimates/:id/rename - ID в URL
    const response = await fetch(`${this.baseURL}/api/estimates/${id}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newFilename })
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error);

    return result;
}

// server-with-db.js
app.put('/api/estimates/:id/rename', async (req, res) => {
    try {
        const { id } = req.params;
        const { newFilename } = req.body;

        // Просто обновляем filename, ID остаётся прежним
        await storage.run(`
            UPDATE estimates
            SET filename = ?, updated_at = ?
            WHERE id = ?
        `, [newFilename, Math.floor(Date.now() / 1000), id]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
```

---

### DELETE операция

```javascript
// apiClient.js
async deleteEstimate(id) {
    // DELETE /api/estimates/:id
    const response = await fetch(`${this.baseURL}/api/estimates/${id}`, {
        method: 'DELETE'
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error);

    if (this.currentEstimateId === id) {
        this.currentEstimateId = null;
    }

    return result;
}

// server-with-db.js
app.delete('/api/estimates/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await storage.run('DELETE FROM estimates WHERE id = ?', [id]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
```

---

## 📊 UI Display Logic

### Отображение filename без `.json`

```javascript
// index.html - обновление status bar
updateQuoteStatusBar() {
    const fileNameSpan = document.querySelector('#current-file-name');

    if (!this.state.currentQuoteFile) {
        fileNameSpan.textContent = 'Новая смета';
        return;
    }

    // currentQuoteFile содержит filename С расширением .json
    const fileName = this.state.currentQuoteFile;

    // Strip .json для чистого отображения в UI
    const displayName = fileName.replace(/\\.json$/i, '');

    // Показываем пользователю БЕЗ расширения
    fileNameSpan.textContent = displayName;   // "client_2025-11-05_27pax"
    fileNameSpan.title = displayName;
}
```

---

## ✅ Checklist для разработчиков

При добавлении любой новой функциональности, связанной с сметами:

### 1. API Endpoints

- [ ] URL содержит `/:id` (не `/:filename`)
- [ ] ID извлекается из `req.params.id`
- [ ] Все операции БД используют `WHERE id = ?`

### 2. Frontend Code

- [ ] State хранит `currentQuoteId` (UUID)
- [ ] State хранит `currentQuoteFile` (filename для UI)
- [ ] Все API calls передают ID, не filename
- [ ] UI показывает filename БЕЗ `.json`

### 3. Storage Layer

- [ ] Prepared statements используют ID в WHERE
- [ ] PRIMARY KEY = id (UUID)
- [ ] filename - обычное поле, не ключ

### 4. Testing

- [ ] Тест создания → ID генерируется
- [ ] Тест rename → ID не меняется
- [ ] Тест load после rename → работает по ID

---

## 🐛 Типичные ошибки

### Ошибка 1: Передача filename вместо ID

```javascript
// ❌ НЕПРАВИЛЬНО
await apiClient.loadEstimate(this.state.currentQuoteFile);

// ✅ ПРАВИЛЬНО
await apiClient.loadEstimate(this.state.currentQuoteId);
```

---

### Ошибка 2: Использование filename в URL

```javascript
// ❌ НЕПРАВИЛЬНО
fetch(`/api/estimates/${filename}`)

// ✅ ПРАВИЛЬНО
fetch(`/api/estimates/${id}`)
```

---

### Ошибка 3: Filename в WHERE clause

```sql
-- ❌ НЕПРАВИЛЬНО
SELECT * FROM estimates WHERE filename = ?

-- ✅ ПРАВИЛЬНО
SELECT * FROM estimates WHERE id = ?
```

---

## 📖 Связанные документы

- [Single Source of Truth](single-source-truth.md) - одна таблица estimates
- [Data Flow Architecture](data-flow.md) - полная спецификация потоков
- [Целостность данных](index.md) - обзор всех паттернов

---

[← Назад к Целостности данных](index.md)
