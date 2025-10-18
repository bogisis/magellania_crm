# Quote Calculator v2.2.0 - Архитектура системы

**Дата создания:** 17 октября 2025
**Версия:** 2.2.0

---

## 📐 Обзор архитектуры

Quote Calculator - это Full-Stack приложение с **монолитным фронтендом** и **файловым хранилищем**.

### Высокоуровневая диаграмма

```
┌─────────────────────────────────────────────┐
│         Browser (Client)                    │
│                                             │
│  ┌────────────────────────────────────┐    │
│  │    index.html (512KB, 9979 строк)   │    │
│  │                                     │    │
│  │  ┌──────────────────────────────┐  │    │
│  │  │ ProfessionalQuoteCalculator  │  │    │
│  │  │  - State management          │  │    │
│  │  │  - Business logic            │  │    │
│  │  │  - UI rendering              │  │    │
│  │  │  - Event handlers            │  │    │
│  │  └──────────────────────────────┘  │    │
│  │                                     │    │
│  │  ┌──────────────────────────────┐  │    │
│  │  │      APIClient               │  │    │
│  │  │  - HTTP requests             │  │    │
│  │  │  - Autosave (8 sec)          │  │    │
│  │  │  - File operations           │  │    │
│  │  └──────────────────────────────┘  │    │
│  └────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
                     ↕ HTTP (REST API)
┌─────────────────────────────────────────────┐
│      Backend Server (Node.js)               │
│                                             │
│  ┌────────────────────────────────────┐    │
│  │     server.js (308 строк)           │    │
│  │                                     │    │
│  │  Express.js + CORS                  │    │
│  │  Port: 3000                         │    │
│  │                                     │    │
│  │  Endpoints:                         │    │
│  │  - GET  /api/estimates              │    │
│  │  - POST /api/estimates/:filename    │    │
│  │  - PUT  /api/estimates/:old/rename  │    │
│  │  - GET  /api/backups                │    │
│  │  - POST /api/backups/:id            │    │
│  │  - POST /api/backups/:id/restore    │    │
│  └────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
                     ↕ File I/O
┌─────────────────────────────────────────────┐
│      File System (JSON Storage)             │
│                                             │
│  /estimate/                                 │
│    └─ {name}_{date}_{pax}_{id}.json        │
│                                             │
│  /backup/                                   │
│    └─ {id}.json                             │
│                                             │
│  /catalog/                                  │
│    └─ {region}.json                         │
└─────────────────────────────────────────────┘
```

---

## 🔄 Потоки данных

### 1. Load Quote Flow

```
┌─────────┐
│  User   │
└────┬────┘
     │ Click "Открыть"
     ↓
┌─────────────────────────────────────┐
│  File Picker (Browser API)          │
└────┬────────────────────────────────┘
     │ Select file.json
     ↓
┌─────────────────────────────────────┐
│  importQuoteFile(file)              │
│                                     │
│  1. Read file content               │
│  2. Detect format:                  │
│     - v1.1.0 (metadata object) OR   │
│     - v1.0.0 (flat structure)       │
│  3. Generate filename               │
│     with transliteration            │
└────┬────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────┐
│  apiClient.saveEstimate()           │
│  POST /api/estimates/:filename      │
└────┬────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────┐
│  apiClient.saveBackup()             │
│  POST /api/backups/:id              │
└────┬────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────┐
│  loadQuoteFromServer(filename)      │
│                                     │
│  ⚠️ CRITICAL SECTION:               │
│  1. SET isLoadingQuote = true       │
│  2. apiClient.loadEstimate()        │
│  3. Update state:                   │
│     - this.state.services = [...] ← REPLACES array
│     - clientName, paxCount, etc.    │
│  4. Render UI                       │
│  5. updateCalculations()            │
│     → autosave BLOCKED by flag      │
│  6. SET isLoadingQuote = false      │
└────┬────────────────────────────────┘
     │
     ↓
┌─────────┐
│ UI ready│ with new quote loaded
└─────────┘
```

### 2. Save Quote Flow (Manual)

```
┌─────────┐
│  User   │
└────┬────┘
     │ Ctrl+S или Click "Сохранить"
     ↓
┌─────────────────────────────────────┐
│  saveQuoteToServer(filename)        │
│                                     │
│  1. Sync DOM → state                │
│  2. Generate/reuse ID               │
│  3. Generate new filename           │
│     with transliteration            │
└────┬────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────┐
│  Check: filename changed?           │
└────┬──────────────┬─────────────────┘
     │ YES          │ NO
     ↓              ↓
┌──────────────┐   Skip rename
│ Try rename   │
│ OLD → NEW    │
└────┬─────────┘
     │
     ↓
┌─────────────────────────────────────┐
│  Rename success?                    │
└────┬──────────────┬─────────────────┘
     │ YES          │ NO (ENOENT)
     ↓              ↓
   Continue    ┌──────────────────┐
               │  Graceful        │
               │  fallback:       │
               │  Create new file │
               └────┬─────────────┘
                    │
                    ↓
┌─────────────────────────────────────┐
│  Dual Save (NO transaction!)        │
│                                     │
│  1. apiClient.saveEstimate()        │
│     POST /api/estimates/:filename   │
│                                     │
│  2. apiClient.saveBackup()          │
│     POST /api/backups/:id           │
│                                     │
│  ⚠️ RISK: Если #2 упадёт,           │
│     данные рассинхронизированы      │
└────┬────────────────────────────────┘
     │
     ↓
┌─────────┐
│ Success │
│ saved   │
└─────────┘
```

### 3. Autosave Flow (Every 8 seconds after change)

```
┌─────────┐
│  User   │
└────┬────┘
     │ Изменяет данные (input, добавляет услугу, и т.д.)
     ↓
┌─────────────────────────────────────┐
│  Event handler (onChange, onInput)  │
└────┬────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────┐
│  debouncedAutosave() (2 сек)        │
│  Calls: autoSaveQuote()             │
└────┬────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────┐
│  autoSaveQuote()                    │
│                                     │
│  GUARDS:                            │
│  1. Check: !currentQuoteId?         │
│     → return (не сохраняем новую)   │
│                                     │
│  2. Check: isLoadingQuote === true? │
│     → return ⚠️ CRITICAL GUARD       │
│                                     │
│  3. Check: filename changed?        │
│     → rename estimate file          │
└────┬────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────┐
│  apiClient.scheduleAutosave()       │
│  (8 second debounce)                │
└────┬────────────────────────────────┘
     │ After 8 seconds...
     ↓
┌─────────────────────────────────────┐
│  Dual Save (same as manual save)    │
│  - POST /api/estimates/:filename    │
│  - POST /api/backups/:id            │
└────┬────────────────────────────────┘
     │
     ↓
┌─────────┐
│Auto-saved│
└─────────┘
```

### 4. Calculation Flow (Business Logic)

```
┌─────────┐
│ User    │
└────┬────┘
     │ Changes: price, quantity, markup, paxCount, etc.
     ↓
┌─────────────────────────────────────┐
│  Event handler                      │
└────┬────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────┐
│  debouncedUpdate() (150ms)          │
│  Calls: updateCalculations()        │
└────┬────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────────────────┐
│  updateCalculations()                           │
│  ⚠️ CRITICAL: Порядок НЕЛЬЗЯ менять!            │
│                                                 │
│  FOR EACH service:                              │
│    serviceCost = price × quantity               │
│    serviceWithMarkup = calculateServiceTotal()  │
│                                                 │
│    IF fullProfit:                               │
│      fullProfitAmount += serviceWithMarkup      │
│      baseCost += serviceWithMarkup              │
│    ELSE:                                        │
│      baseCost += serviceCost                    │
│      individualMarkupAmount += markup           │
│      IF !excludeFromMarkup:                     │
│        baseCostForHiddenMarkup += serviceCost   │
│                                                 │
│  hiddenMarkupAmount =                           │
│    baseCostForHiddenMarkup × (hiddenMarkup/100) │
│                                                 │
│  partnerCommissionAmount =                      │
│    baseCost × (partnerCommission/100)           │
│                                                 │
│  totalWithHiddenMarkup =                        │
│    totalWithIndividualMarkup +                  │
│    hiddenMarkupAmount +                         │
│    partnerCommissionAmount                      │
│                                                 │
│  clientTotal = totalWithHiddenMarkup            │
│                                                 │
│  totalProfit =                                  │
│    individualMarkupAmount +                     │
│    hiddenMarkupAmount +                         │
│    fullProfitAmount                             │
└────┬────────────────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────┐
│  Update DOM elements                │
│  - Total cost                       │
│  - Profit                           │
│  - Service totals                   │
└─────────────────────────────────────┘
```

---

## 🗂️ Структура файлов

```
/Users/bogisis/Desktop/сметы/for_deploy/
│
├── index.html (512KB, 9979 строк) ← МОНОЛИТ
│   ├── HTML structure (1-2565)
│   ├── CSS styles (11-2564)
│   └── JavaScript (2566-9979)
│       ├── ProfessionalQuoteCalculator class (2567-9200)
│       ├── Server integration (9201-9600)
│       └── Global functions (9601-9979)
│
├── server.js (308 строк) ← Backend API
├── apiClient.js (179 строк) ← API wrapper
├── utils.js (34 строк) ← Utilities
├── version.js (32 строк) ← Version control
│
├── package.json
├── jest.config.js
├── test-setup.js
│
├── __tests__/
│   ├── server.test.js (11 тестов)
│   └── utils.test.js (10 тестов)
│
├── estimate/ ← Сметы по filename
│   ├── staryh_viktorovy_2025-10-17_8pax_fa5dacfeb2c7.json
│   ├── dinar_hakimov_2025-11-04_15pax_d32c1b87d6d6.json
│   └── ...
│
├── backup/ ← Сметы по ID (UUID)
│   ├── fa5dacfeb2c7.json
│   ├── d32c1b87d6d6.json
│   └── ...
│
├── catalog/ ← Каталоги услуг по регионам
│   └── {region}.json
│
└── docs/
    ├── ARCHITECTURE.md ← Этот файл
    ├── CLAUDE.md ← Главная документация
    ├── CHANGELOG.md
    ├── CRITICAL_ISSUES.md
    ├── RELEASE_NOTES_v2.1.0.md
    ├── TECHNICAL_DOCS_v2.1.0.md
    ├── USER_GUIDE_v2.1.0.md
    └── ...
```

---

## 📦 Структура данных

### Estimate File (v1.1.0)

```json
{
  "version": "1.1.0",
  "appVersion": "2.2.0",
  "id": "fa5dacfeb2c7",
  "timestamp": "2025-10-17T14:12:12.211Z",

  "clientName": "Старых_викторовы",
  "clientPhone": "+7 123 456 7890",
  "clientEmail": "client@example.com",

  "paxCount": 8,
  "tourStart": "2025-11-04",
  "tourEnd": "2025-11-14",

  "services": [ /* Service objects */ ],

  "hiddenMarkup": 0,
  "partnerCommission": 0,
  "taxRate": 0,

  "programDescription": "...",
  "quoteComments": "..."
}
```

### Service Object

```javascript
{
  // Основные поля
  id: "1760376984252",
  name: "Встреча группы в аэропорту",
  description: "Работа русскоговорящего гида",
  day: 1,
  price: 100,
  quantity: 1,

  // Расчёты
  markup: 0,                    // Индивидуальная наценка %
  excludeFromMarkup: false,     // Исключить из скрытой наценки
  fullProfit: true,             // Вся сумма = прибыль

  // Метаданные
  contractor: "Magellania travel",
  region: "Ushuaia",

  // Чеклист (планируется)
  done: true,                   // Забронировано
  paid: false,                  // Оплачено
  comment: ""                   // Комментарий менеджера
}
```

---

## 🔐 State Management

### State Object

```javascript
this.state = {
  // Услуги
  services: [],                   // Массив Service объектов
  optionalServices: [],           // Опциональные (не в смету)
  selectedServices: new Set(),    // Для bulk operations

  // Клиент
  clientName: '',
  clientPhone: '',
  clientEmail: '',

  // Тур
  tourStart: '',
  tourEnd: '',
  paxCount: 27,

  // Расчёты
  hiddenMarkup: 0,               // Скрытая наценка %
  partnerCommission: 0,          // Комиссия партнера %
  taxRate: 0,                    // НДС %

  // Описания
  programDescription: '',         // Для печати
  quoteComments: '',             // Комментарии к смете

  // UI
  activeCategory: 'all',
  servicesViewMode: 'cards',     // 'cards' | 'table'
  servicesSortBy: 'order',       // 'order' | 'day' | 'contractor'
  servicesSortDirection: 'asc',

  // Файлы
  currentQuoteFile: '',          // Имя открытого файла
  currentQuoteId: null,          // UUID сметы
  isQuoteSaved: true,            // Флаг сохранения

  // Чеклист (планируется)
  currentMode: 'quote',          // 'quote' | 'checklist'
  checklistViewMode: 'day',      // 'day' | 'supplier'
  checklistFilter: 'all'         // 'all' | 'booked' | 'paid'
}
```

### Critical Flags

```javascript
// Race condition prevention
this.isLoadingQuote = false;   // Блокирует autosave во время загрузки

// Timeout tracking
this.timeoutIds = {
  update: null,
  search: null,
  detailRender: null,
  bulkUpdate: null,
  autosave: null
};
```

---

## 🔧 Ключевые компоненты

### ProfessionalQuoteCalculator (index.html:2567-9200)

**Конструктор (2567-2720)**
- Инициализация версий, config, state
- Создание debounced функций
- Вызов init()

**Configuration (2576-2597)**
```javascript
this.config = {
  currency: '$',
  maxFileSize: 5 * 1024 * 1024,  // 5MB
  debounceDelays: {
    search: 300,
    calculations: 150,
    detailRender: 100,
    bulkControls: 50,
    autosave: 2000
  },
  validation: {
    maxServices: 1000,
    maxServiceNameLength: 100,
    minPrice: 0
  }
}
```

**Ключевые методы:**

| Метод | Строки | Описание |
|-------|--------|----------|
| `init()` | 2721-2800 | Инициализация, event listeners |
| `updateCalculations()` | 4995-5094 | ⚠️ Бизнес-логика расчётов |
| `renderServices()` | 6000-6500 | Рендеринг списка услуг |
| `addService()` | 3400-3550 | Добавление услуги в смету |
| `autoSaveQuote()` | 9423-9480 | Автосохранение с guard flags |
| `loadQuoteFromServer()` | 9483-9533 | Загрузка сметы с сервера |
| `saveQuoteToServer()` | 9346-9420 | Сохранение сметы на сервер |

### APIClient (apiClient.js:1-179)

**Методы:**

| Метод | Строки | Описание |
|-------|--------|----------|
| `saveEstimate()` | 20-35 | POST /api/estimates/:filename |
| `loadEstimate()` | 37-52 | GET /api/estimates/:filename |
| `renameEstimate()` | 85-100 | PUT /api/estimates/:old/rename |
| `saveBackup()` | 120-135 | POST /api/backups/:id |
| `scheduleAutosave()` | 141-162 | Debounced save (8 sec) |

**Autosave механизм:**
```javascript
scheduleAutosave(data, filename) {
  if (!filename || !data.id) return;

  if (this.autosaveTimeout) {
    clearTimeout(this.autosaveTimeout);
  }

  this.autosaveTimeout = setTimeout(async () => {
    await this.saveEstimate(data, filename);
    await this.saveBackup(data, data.id);
  }, 8000); // 8 seconds
}
```

---

## 🧪 Testing Architecture

### Backend Tests (server.test.js)
- **11 тестов** для API endpoints
- Использует Supertest + Jest
- Test environment: порт 3001, отдельные директории

### Utils Tests (utils.test.js)
- **10 тестов** для утилит
- transliterate(): 6 тестов
- generateId(): 4 теста

### Frontend Tests
- ❌ Отсутствуют
- Планируется после модуляризации

---

## 🚨 Критические проблемы архитектуры

### 1. Монолитный фронтенд (P0)
**Проблема:** 9979 строк в одном HTML файле
**Влияние:**
- Невозможно эффективное code review
- Сложность поддержки
- Нет hot module replacement
- Невозможно unit-тестировать

**Решение (планируется v2.4.0):**
```
/src
  /core
    ProfessionalQuoteCalculator.js
  /modules
    calculations.js
    rendering.js
    state.js
  /ui
    components/
  /styles
    main.css
```

### 2. Dual storage без транзакций (P0)
**Проблема:**
```javascript
await apiClient.saveEstimate(data, filename);  // Может упасть
await apiClient.saveBackup(data, id);          // Может упасть
```

**Сценарий сбоя:**
1. saveEstimate() успешен → estimate/ обновлён
2. saveBackup() падает → backup/ не обновлён
3. **Данные рассинхронизированы**

**Решение (планируется v2.3.0):**
```javascript
async saveQuoteTransactional(data, filename) {
  const tempBackupPath = `${data.id}.temp`;

  try {
    await apiClient.saveBackup(data, tempBackupPath);
    await apiClient.saveEstimate(data, filename);
    await apiClient.renameBackup(tempBackupPath, data.id);
    return { success: true };
  } catch (err) {
    await apiClient.deleteBackup(tempBackupPath);
    throw err;
  }
}
```

### 3. Race conditions в autosave (P1)
**Проблема:** Autosave может перезаписать свежезагруженные данные

**Текущая митигация:**
```javascript
// Guard flag
loadQuoteFromServer() {
  this.isLoadingQuote = true;  // Блокирует autosave
  // ... load ...
  this.isLoadingQuote = false;
}

autoSaveQuote() {
  if (this.isLoadingQuote) return;  // Guard
  // ... save ...
}
```

**Архитектурная проблема:** Autosave слишком интегрирован с UI events

---

## 📋 Roadmap

### v2.3.0 (ближайшие 1-2 недели)
- ✅ Транзакционное сохранение
- ✅ Error boundaries для async операций
- ✅ Улучшенная transliteration (библиотека)

### v2.4.0 (2-4 недели)
- ✅ Извлечение CSS в отдельный файл
- ✅ Разделение класса на модули
- ✅ Настройка сборки (Vite)

### v2.5.0 (1-2 месяца)
- ✅ State Manager с undo/redo
- ✅ Event system (pub/sub)
- ✅ Frontend unit тесты

### v3.0.0 (3-4 месяца)
- ✅ Полная модульная архитектура
- ✅ Единое хранилище (вместо dual)
- ✅ Checklist интеграция
- ✅ E2E тестирование

---

## 📚 Дополнительные ресурсы

- **CLAUDE.md** - Главная документация для разработчиков
- **CRITICAL_ISSUES.md** - Подробное описание проблем и решений
- **CHANGELOG.md** - История изменений
- **USER_GUIDE_v2.1.0.md** - Руководство пользователя

---

**Последнее обновление:** 17 октября 2025
**Автор:** Code Review Team
**Версия документа:** 1.0.0
