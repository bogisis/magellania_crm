# Quote Calculator v3.0 - Catalogs API

**Статус:** ✅ Production Ready
**Версия:** 2.3.0
**Дата:** 5 ноября 2025

## Обзор

Catalogs API предоставляет функционал для управления каталогами услуг и шаблонов. Каталоги содержат готовые шаблоны услуг, которые можно добавлять в сметы одним кликом.

### Ключевые особенности

- **Централизованное хранение** - единое место для всех шаблонов услуг
- **Multi-region support** - поддержка каталогов разных регионов
- **JSON формат** - структурированное хранение данных
- **Templates count** - автоматический подсчёт количества шаблонов
- **Категоризация** - организация услуг по категориям

## Endpoints

### 1. Список всех каталогов

Получить список всех доступных каталогов.

**Endpoint:** `GET /api/catalog/list`

**Response:**
```json
{
  "success": true,
  "files": [
    "catalog.json",
    "catalog_moscow.json",
    "catalog_spb.json"
  ]
}
```

**Fields Description:**
- `files` - массив имён файлов каталогов

**Example:**
```bash
# Получить список каталогов
curl http://localhost:4000/api/catalog/list | jq

# Подсчитать количество каталогов
curl -s http://localhost:4000/api/catalog/list | jq '.files | length'
# 3

# Проверить существование каталога
curl -s http://localhost:4000/api/catalog/list | \
  jq '.files[] | select(. == "catalog.json")'
```

**Use Cases:**
- Отображение списка доступных каталогов в UI
- Проверка существования каталога перед загрузкой
- Управление несколькими региональными каталогами
- Синхронизация между средами

---

### 2. Получить каталог

Загрузить полные данные каталога по имени файла.

**Endpoint:** `GET /api/catalog/:filename`

**URL Parameters:**
- `filename` (required) - имя файла каталога (например, "catalog.json")

**Response:**
```json
{
  "success": true,
  "data": {
    "version": "1.2.0",
    "name": "Основной каталог",
    "region": "moscow",
    "templates": [
      {
        "id": "tpl_transfer_airport",
        "name": "Трансфер аэропорт-отель",
        "description": "Групповой трансфер на комфортабельном автобусе",
        "price": 5000,
        "unit": "шт",
        "category": "transfer",
        "markup": 10,
        "tags": ["трансфер", "аэропорт"]
      },
      {
        "id": "tpl_hotel_3star",
        "name": "Размещение 3* отель",
        "description": "Двухместный номер с завтраком",
        "price": 3500,
        "unit": "ночь",
        "category": "accommodation",
        "markup": 15,
        "tags": ["отель", "размещение"]
      }
    ],
    "categories": [
      {
        "id": "transfer",
        "name": "Трансферы",
        "icon": "🚗",
        "color": "#3B82F6"
      },
      {
        "id": "accommodation",
        "name": "Размещение",
        "icon": "🏨",
        "color": "#10B981"
      },
      {
        "id": "excursion",
        "name": "Экскурсии",
        "icon": "🏛️",
        "color": "#F59E0B"
      }
    ],
    "metadata": {
      "createdAt": "2024-11-01T10:00:00.000Z",
      "updatedAt": "2025-11-05T14:30:00.000Z",
      "templatesCount": 48
    }
  }
}
```

**Error Response (Not Found):**
```json
{
  "success": false,
  "error": "Catalog not found: catalog_invalid.json"
}
```

**Example:**
```bash
# Загрузить основной каталог
curl http://localhost:4000/api/catalog/catalog.json | jq

# Извлечь только шаблоны
curl -s http://localhost:4000/api/catalog/catalog.json | \
  jq '.data.templates'

# Фильтровать по категории
curl -s http://localhost:4000/api/catalog/catalog.json | \
  jq '.data.templates[] | select(.category == "transfer")'

# Подсчитать количество шаблонов
curl -s http://localhost:4000/api/catalog/catalog.json | \
  jq '.data.templates | length'
```

**Use Cases:**
- Загрузка каталога при старте приложения
- Отображение доступных услуг в UI
- Поиск услуг по категориям/тегам
- Импорт шаблонов в смету

---

### 3. Сохранить/обновить каталог

Создать новый каталог или обновить существующий.

**Endpoint:** `POST /api/catalog/:filename`

**URL Parameters:**
- `filename` (required) - имя файла каталога

**Request Body:**
```json
{
  "version": "1.2.0",
  "name": "Основной каталог",
  "region": "moscow",
  "templates": [
    {
      "id": "tpl_transfer_airport",
      "name": "Трансфер аэропорт-отель",
      "description": "Групповой трансфер",
      "price": 5000,
      "unit": "шт",
      "category": "transfer",
      "markup": 10,
      "tags": ["трансфер"]
    }
  ],
  "categories": [
    {
      "id": "transfer",
      "name": "Трансферы",
      "icon": "🚗",
      "color": "#3B82F6"
    }
  ]
}
```

**Response (Success):**
```json
{
  "success": true
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Invalid catalog data"
}
```

**HTTP Status Codes:**
- `200` - Успешное сохранение
- `400` - Invalid data
- `500` - Internal server error
- `507` - Insufficient disk space

**Example:**
```bash
# Создать новый каталог
curl -X POST http://localhost:4000/api/catalog/catalog_new.json \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.2.0",
    "name": "Новый каталог",
    "templates": [],
    "categories": []
  }'

# Обновить существующий каталог
curl -X POST http://localhost:4000/api/catalog/catalog.json \
  -H "Content-Type: application/json" \
  -d @catalog.json

# Обработка ошибки
curl -X POST http://localhost:4000/api/catalog/catalog.json \
  -H "Content-Type: application/json" \
  -d '{}' | jq
# {"success": false, "error": "Invalid catalog data"}
```

**Middleware:**
- `checkDiskSpace` - проверяет наличие свободного места перед сохранением

**Behavior:**
- Создаёт новый каталог, если файл не существует
- Полностью перезаписывает существующий каталог
- Автоматически обновляет metadata (updatedAt, templatesCount)
- Валидирует структуру данных перед сохранением

**Use Cases:**
- Создание нового регионального каталога
- Обновление цен в каталоге
- Добавление новых шаблонов услуг
- Импорт каталога из внешнего источника

---

## Data Model

### Catalog Object (Complete Schema)

```json
{
  "version": "1.2.0",
  "name": "Основной каталог",
  "region": "moscow",

  "templates": [
    {
      "id": "tpl_transfer_airport",
      "name": "Трансфер аэропорт-отель",
      "description": "Групповой трансфер на автобусе",
      "price": 5000,
      "unit": "шт",
      "category": "transfer",
      "markup": 10,
      "tags": ["трансфер", "аэропорт"],
      "notes": "Комментарии для внутреннего использования",
      "active": true
    }
  ],

  "categories": [
    {
      "id": "transfer",
      "name": "Трансферы",
      "icon": "🚗",
      "color": "#3B82F6",
      "order": 1
    },
    {
      "id": "accommodation",
      "name": "Размещение",
      "icon": "🏨",
      "color": "#10B981",
      "order": 2
    },
    {
      "id": "excursion",
      "name": "Экскурсии",
      "icon": "🏛️",
      "color": "#F59E0B",
      "order": 3
    },
    {
      "id": "guide",
      "name": "Гиды",
      "icon": "👨‍🏫",
      "color": "#8B5CF6",
      "order": 4
    },
    {
      "id": "activity",
      "name": "Активности",
      "icon": "🎯",
      "color": "#EF4444",
      "order": 5
    }
  ],

  "metadata": {
    "createdAt": "2024-11-01T10:00:00.000Z",
    "updatedAt": "2025-11-05T14:30:00.000Z",
    "templatesCount": 48,
    "author": "Admin",
    "description": "Каталог услуг для Москвы и МО"
  }
}
```

### Field Validation

**Required fields:**
- `version` - версия формата каталога (например, "1.2.0")
- `templates` - массив шаблонов (может быть пустым [])
- `categories` - массив категорий (может быть пустым [])

**Optional fields:**
- `name` - название каталога
- `region` - регион (для multi-region support)
- `metadata` - дополнительные метаданные

**Template object validation:**
- `id` - уникальный идентификатор шаблона
- `name` - название услуги (max 100 символов)
- `price` - цена (number, min: 0)
- `unit` - единица измерения ("шт", "ночь", "час", "день")
- `category` - ID категории
- `markup` - наценка в процентах (default: 0)
- `tags` - массив тегов для поиска

**Category object validation:**
- `id` - уникальный идентификатор категории
- `name` - название категории
- `icon` - эмодзи иконка
- `color` - цвет в HEX формате
- `order` - порядок отображения

---

## Storage Implementation

### SQLite Schema

```sql
CREATE TABLE catalogs (
    id TEXT PRIMARY KEY,               -- UUID каталога
    name TEXT NOT NULL,                -- Имя каталога
    region TEXT,                       -- Регион (для multi-region)
    data TEXT NOT NULL,                -- JSON данные (templates, categories)
    templates_count INTEGER DEFAULT 0, -- Количество шаблонов
    data_hash TEXT,                    -- MD5 хеш для deduplication
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

**Example:**
```sql
-- Москва
INSERT INTO catalogs (id, name, region, data, templates_count)
VALUES ('cat1', 'catalog.json', 'moscow', '...', 48);

-- Санкт-Петербург
INSERT INTO catalogs (id, name, region, data, templates_count)
VALUES ('cat2', 'catalog.json', 'spb', '...', 35);

-- Оба каталога могут называться "catalog.json", но в разных регионах
```

---

## Performance

### Response Times (Average)

| Endpoint | Response Time | Notes |
|----------|---------------|-------|
| GET /api/catalog/list | <10ms | List filenames only |
| GET /api/catalog/:filename | <25ms | Full catalog with 50 templates |
| POST /api/catalog/:filename | <30ms | Save with hash calculation |

### Optimization Tips

**1. Кэширование каталогов**
```javascript
// Cache catalog for 1 hour
const cachedCatalog = await cacheManager.get('catalog.json', async () => {
  return await fetch('/api/catalog/catalog.json').then(r => r.json());
}, { ttl: 3600 });
```

**2. Ленивая загрузка**
```javascript
// Загружать каталог только когда пользователь открыл окно добавления услуги
async function openAddServiceDialog() {
  if (!this.catalogLoaded) {
    this.catalog = await loadCatalog('catalog.json');
    this.catalogLoaded = true;
  }
  showDialog();
}
```

**3. Incremental updates**
```javascript
// Вместо полной перезаписи, обновлять только изменённые шаблоны
async function updateTemplate(templateId, updates) {
  const catalog = await loadCatalog('catalog.json');
  const template = catalog.templates.find(t => t.id === templateId);
  Object.assign(template, updates);
  await saveCatalog('catalog.json', catalog);
}
```

---

## Common Use Cases

### 1. Загрузка каталога при старте приложения

```javascript
async function initializeCatalog() {
  try {
    // Загрузить список каталогов
    const response = await fetch('/api/catalog/list');
    const { files } = await response.json();

    // Загрузить основной каталог
    const catalogFile = files.find(f => f === 'catalog.json') || files[0];

    if (catalogFile) {
      const catalog = await loadCatalog(catalogFile);
      this.templates = catalog.templates;
      this.categories = catalog.categories;

      console.log(`Loaded ${this.templates.length} templates`);
    } else {
      console.warn('No catalogs found');
    }
  } catch (err) {
    console.error('Failed to load catalog:', err);
    showNotification('Не удалось загрузить каталог', true);
  }
}

async function loadCatalog(filename) {
  const response = await fetch(`/api/catalog/${filename}`);
  const result = await response.json();
  return result.data;
}
```

### 2. Создание нового каталога

```javascript
async function createNewCatalog(name, region) {
  const catalog = {
    version: '1.2.0',
    name: name,
    region: region,
    templates: [],
    categories: [
      { id: 'transfer', name: 'Трансферы', icon: '🚗', color: '#3B82F6', order: 1 },
      { id: 'accommodation', name: 'Размещение', icon: '🏨', color: '#10B981', order: 2 },
      { id: 'excursion', name: 'Экскурсии', icon: '🏛️', color: '#F59E0B', order: 3 }
    ],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      templatesCount: 0
    }
  };

  const filename = `catalog_${region}.json`;

  try {
    const response = await fetch(`/api/catalog/${filename}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(catalog)
    });

    const result = await response.json();

    if (result.success) {
      showNotification(`Каталог "${name}" создан`);
      return filename;
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    console.error('Failed to create catalog:', err);
    showNotification('Не удалось создать каталог', true);
    return null;
  }
}
```

### 3. Добавление шаблона в каталог

```javascript
async function addTemplateToC catalog(filename, template) {
  try {
    // 1. Загрузить текущий каталог
    const catalog = await loadCatalog(filename);

    // 2. Проверить уникальность ID
    if (catalog.templates.some(t => t.id === template.id)) {
      throw new Error(`Template with id "${template.id}" already exists`);
    }

    // 3. Добавить новый шаблон
    catalog.templates.push({
      id: template.id || generateId(),
      name: template.name,
      description: template.description || '',
      price: template.price,
      unit: template.unit || 'шт',
      category: template.category,
      markup: template.markup || 0,
      tags: template.tags || [],
      active: true
    });

    // 4. Обновить metadata
    catalog.metadata.updatedAt = new Date().toISOString();
    catalog.metadata.templatesCount = catalog.templates.length;

    // 5. Сохранить обратно
    const response = await fetch(`/api/catalog/${filename}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(catalog)
    });

    const result = await response.json();

    if (result.success) {
      showNotification('Шаблон добавлен в каталог');
      return true;
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    console.error('Failed to add template:', err);
    showNotification(err.message, true);
    return false;
  }
}
```

### 4. Поиск шаблонов по тегам и категориям

```javascript
function searchTemplates(catalog, query) {
  const lowerQuery = query.toLowerCase();

  return catalog.templates.filter(template => {
    // Поиск по имени
    if (template.name.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Поиск по описанию
    if (template.description.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Поиск по тегам
    if (template.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) {
      return true;
    }

    return false;
  });
}

function filterByCategory(catalog, categoryId) {
  return catalog.templates.filter(t => t.category === categoryId);
}

function filterByPriceRange(catalog, minPrice, maxPrice) {
  return catalog.templates.filter(t => {
    return t.price >= minPrice && t.price <= maxPrice;
  });
}

// Пример использования
const catalog = await loadCatalog('catalog.json');
const transfers = filterByCategory(catalog, 'transfer');
const searchResults = searchTemplates(catalog, 'аэропорт');
const affordable = filterByPriceRange(catalog, 0, 10000);
```

### 5. Экспорт/импорт каталога

```javascript
// Экспорт каталога в файл
async function exportCatalog(filename) {
  try {
    const response = await fetch(`/api/catalog/${filename}`);
    const result = await response.json();

    // Создать Blob для скачивания
    const blob = new Blob([JSON.stringify(result.data, null, 2)], {
      type: 'application/json'
    });

    // Скачать файл
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    showNotification('Каталог экспортирован');
  } catch (err) {
    console.error('Export failed:', err);
    showNotification('Не удалось экспортировать каталог', true);
  }
}

// Импорт каталога из файла
async function importCatalog(file) {
  try {
    // Проверка размера файла (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Файл слишком большой (max 5MB)');
    }

    // Прочитать файл
    const text = await file.text();
    const catalog = JSON.parse(text);

    // Валидация структуры
    if (!catalog.version || !Array.isArray(catalog.templates)) {
      throw new Error('Неверная структура каталога');
    }

    // Сохранить каталог
    const filename = file.name;
    const response = await fetch(`/api/catalog/${filename}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(catalog)
    });

    const result = await response.json();

    if (result.success) {
      showNotification(`Каталог "${filename}" импортирован`);
      return true;
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    console.error('Import failed:', err);
    showNotification(`Ошибка импорта: ${err.message}`, true);
    return false;
  }
}
```

---

## Security Considerations

### 1. Input Validation

```javascript
function validateCatalog(catalog) {
  const errors = [];

  // Проверка версии
  if (!catalog.version || typeof catalog.version !== 'string') {
    errors.push('version is required');
  }

  // Проверка templates
  if (!Array.isArray(catalog.templates)) {
    errors.push('templates must be an array');
  } else {
    catalog.templates.forEach((template, index) => {
      if (!template.id) errors.push(`template[${index}].id is required`);
      if (!template.name) errors.push(`template[${index}].name is required`);
      if (typeof template.price !== 'number') {
        errors.push(`template[${index}].price must be a number`);
      }
      if (template.price < 0) {
        errors.push(`template[${index}].price must be >= 0`);
      }
    });
  }

  // Проверка categories
  if (!Array.isArray(catalog.categories)) {
    errors.push('categories must be an array');
  }

  return errors;
}
```

### 2. File Size Limits

```javascript
// Server: JSON_LIMIT = 50MB
app.use(express.json({ limit: process.env.JSON_LIMIT || '50mb' }));

// Client: проверка перед загрузкой
if (file.size > 5 * 1024 * 1024) {
  throw new Error('Файл каталога слишком большой (max 5MB)');
}
```

### 3. XSS Prevention

```javascript
// ✅ SAFE: Use textContent
templateNameElement.textContent = template.name;

// ❌ DANGEROUS: innerHTML with user input
templateNameElement.innerHTML = template.name; // Может содержать <script>
```

---

## Error Handling

### Common Errors

**1. Catalog Not Found**
```json
{
  "success": false,
  "error": "Catalog not found: catalog_invalid.json"
}
```
**Причина:** Файл каталога не существует
**Решение:** Проверить список доступных каталогов через `/api/catalog/list`

**2. Invalid Catalog Data**
```json
{
  "success": false,
  "error": "Invalid catalog data: templates must be an array"
}
```
**Причина:** Структура каталога не соответствует схеме
**Решение:** Валидировать данные перед отправкой

**3. Insufficient Disk Space**
```json
{
  "success": false,
  "error": "Insufficient disk space"
}
```
**HTTP Status:** 507
**Причина:** Middleware `checkDiskSpace` обнаружил нехватку места

**4. Duplicate Template ID**
```json
{
  "success": false,
  "error": "Template with id 'tpl_transfer' already exists"
}
```
**Причина:** Попытка добавить шаблон с существующим ID
**Решение:** Использовать уникальный ID или обновить существующий шаблон

---

## Testing

### Manual Testing

```bash
# 1. Получить список каталогов
curl http://localhost:4000/api/catalog/list | jq

# 2. Загрузить каталог
curl http://localhost:4000/api/catalog/catalog.json | jq '.data.templates | length'

# 3. Создать новый каталог
curl -X POST http://localhost:4000/api/catalog/test_catalog.json \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.2.0",
    "name": "Test Catalog",
    "templates": [
      {
        "id": "test1",
        "name": "Test Service",
        "price": 1000,
        "unit": "шт",
        "category": "transfer"
      }
    ],
    "categories": []
  }'

# 4. Проверить создание
curl http://localhost:4000/api/catalog/test_catalog.json | \
  jq '.data.templates[0].name'
# "Test Service"

# 5. Обновить каталог
curl -X POST http://localhost:4000/api/catalog/test_catalog.json \
  -H "Content-Type: application/json" \
  -d @updated_catalog.json
```

### Automated Testing

```bash
# Run catalog tests
npm test -- __tests__/catalogs.test.js

# Test specific operation
npm test -- __tests__/catalogs.test.js -t "POST /api/catalog/:filename"
```

---

## Troubleshooting

### Issue: "Catalog not found"

**Решение:**
```bash
# Проверить список доступных каталогов
curl http://localhost:4000/api/catalog/list | jq '.files'

# Если каталог пуст, создать новый
curl -X POST http://localhost:4000/api/catalog/catalog.json \
  -H "Content-Type: application/json" \
  -d '{"version":"1.2.0","templates":[],"categories":[]}'
```

### Issue: Медленная загрузка большого каталога

**Решение:**
```javascript
// 1. Использовать lazy loading
async function loadCatalogLazy(filename) {
  // Загружать только при необходимости
  if (!this.catalogCache[filename]) {
    this.catalogCache[filename] = await loadCatalog(filename);
  }
  return this.catalogCache[filename];
}

// 2. Пагинация шаблонов
function paginateTemplates(templates, page, pageSize = 50) {
  const start = page * pageSize;
  return templates.slice(start, start + pageSize);
}

// 3. Виртуализация списка (react-window, vue-virtual-scroller)
```

### Issue: Потеря данных при одновременном обновлении

**Проблема:** Два пользователя обновляют каталог одновременно

**Решение (временное):**
```javascript
// Lock mechanism (если нужно)
let catalogLocked = false;

async function saveCatalogSafe(filename, data) {
  if (catalogLocked) {
    throw new Error('Catalog is being updated by another user');
  }

  catalogLocked = true;
  try {
    await saveCatalog(filename, data);
  } finally {
    catalogLocked = false;
  }
}
```

**Решение (долгосрочное):**
- Добавить optimistic locking как в estimates (data_version)
- Реализовать merge conflicts UI
- Использовать WebSockets для real-time updates

---

## Related Documentation

- [API Reference Index](index.md) - Обзор всех API endpoints
- [Estimates API](estimates.md) - Управление сметами
- [Backups API](backups.md) - Резервное копирование
- [Export/Import API](export-import.md) - Массовый экспорт/импорт

---

[← Назад к API Reference](index.md) | [Backups API →](backups.md)

**Версия:** 3.0.0
**Последнее обновление:** 5 ноября 2025
