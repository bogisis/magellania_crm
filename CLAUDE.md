# Quote Calculator v2.2.0 - Генератор коммерческих предложений

**Статус:** ✅ Production Ready (17 октября 2025)
**Последнее обновление:** 17 октября 2025

## О проекте

Quote Calculator v2.2.0 - это **Full-Stack приложение** для создания коммерческих предложений в туристическом бизнесе.

### Архитектура

**Frontend (index.html - 512KB, 9979 строк)**
- **Single Page Application** с монолитной архитектурой
- **Технологии**: Vanilla JavaScript ES6+, HTML5, CSS3 Custom Properties
- **Класс**: `ProfessionalQuoteCalculator`
- **API Client**: `APIClient` для взаимодействия с backend

**Backend (server.js - 308 строк)**
- **Express.js** REST API на порту 3000
- **File-based storage**: JSON файлы (estimate/, backup/, catalog/)
- **CORS enabled** для локальной разработки

**Утилиты**
- `utils.js` - transliterate(), generateId()
- `version.js` - единый источник версий (NEW в v2.2.0)

### ⚠️ Важно: Checklist интеграция
- Документация `CHECKLIST_INTEGRATION_COMPLETED.md` описывает планируемую интеграцию
- **В текущей версии файл `checklist.html` НЕ существует**
- Checklist функциональность планируется к интеграции в будущих версиях

## Версии

### Quote Calculator (единый источник: version.js)
```javascript
APP_VERSION = '2.2.0'           // Приложение
CATALOG_VERSION = '1.2.0'       // Формат каталога
QUOTE_VERSION = '1.1.0'         // Формат сметы
DATA_SCHEMA_VERSION = '1.0.0'   // localStorage schema
```

### Совместимость форматов
- **JSON v1.1.0** - основной формат сметы с metadata объектом
- **JSON v1.0.0** - legacy формат (поддерживается при импорте)
- **CSV legacy** - поддержка импорта каталогов

## Команды для запуска

### Development mode
```bash
# Установить зависимости
npm install

# Запустить backend сервер
npm start
# Сервер запустится на http://localhost:3000

# Открыть frontend
open index.html
# или открыть http://localhost:3000 если настроен static serving
```

### Testing
```bash
# Запустить все тесты (Jest + Supertest)
npm test

# Запустить тесты в watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Production
- ✅ Frontend: просто двойной клик на index.html
- ✅ Backend: `node server.js` на любом хостинге
- ✅ Тестовое покрытие: 20/20 тестов

### Поддержка браузеров
- Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

## 🔥 Критические изменения v2.2.0

### ✅ Исправленные баги (октябрь 2025)

#### 1. Services "sticking" между сметами (CRITICAL)
**Проблема:** При загрузке новой сметы услуги из предыдущей "прилипали" к новой
**Причина:** Autosave срабатывал во время loadQuote(), сохраняя старые services
**Решение:** Добавлен guard flag `isLoadingQuote` (index.html:9430, 9488, 9533)
```javascript
loadQuoteFromServer() {
    this.isLoadingQuote = true;  // Блокирует autosave
    // ... загрузка данных ...
    this.isLoadingQuote = false;
}
```

#### 2. Cyrillic filename errors при rename
**Проблема:** ENOENT ошибка при попытке переименовать файл с Cyrillic именем из localStorage
**Решение:** Graceful fallback - если rename fails, создаётся новый файл (index.html:9388-9396)

#### 3. Import compatibility v1.0.0 ↔ v1.1.0
**Проблема:** Внешние файлы с metadata объектом (v1.1.0) не импортировались
**Решение:** Dual-format parser в importQuoteFile() (index.html:9817-9897)

#### 4. transliterate is not a function
**Проблема:** Функция была вынесена в utils.js, но не добавлена обратно в класс
**Решение:** Дублирование метода в ProfessionalQuoteCalculator (index.html:2947-2957)

#### 5. apiClient is not defined
**Проблема:** QuoteCalc инициализировался до создания apiClient
**Решение:** Перенос инициализации после создания apiClient (index.html:9274-9275)

### ⚠️ Известные ограничения и риски

#### 1. Монолитная архитектура (512KB, 9979 строк)
- **Риск:** Сложность поддержки, медленная разработка
- **Митигация:** Планируется модуляризация (см. docs/ARCHITECTURE.md)
- **Приоритет:** P0 (критический)

#### 2. Dual storage без полной атомарности
```javascript
// Потенциальная проблема:
await apiClient.saveEstimate(data, filename);  // Может упасть
await apiClient.saveBackup(data, id);          // Может упасть
// Нет гарантии, что оба сохранятся успешно
```
- **Риск:** Рассинхронизация данных estimate/ и backup/
- **Митигация:** Планируется транзакционная обёртка
- **Приоритет:** P0 (критический)

#### 3. Autosave race conditions
- **Риск:** Несмотря на guard flags, архитектурно autosave слишком связан с UI
- **Митигация:** Guard flags (`isLoadingQuote`)
- **Приоритет:** P1 (высокий)

### 📊 Тестовое покрытие
- **Backend API:** 11/11 тестов ✅ (server.test.js)
- **Utils:** 10/10 тестов ✅ (utils.test.js)
- **Frontend:** Нет unit тестов ⚠️ (планируется после модуляризации)

### 🔄 Roadmap
1. **v2.3.0** - Транзакционное сохранение, error boundaries
2. **v2.4.0** - Начало модуляризации (извлечение CSS, разделение класса)
3. **v2.5.0** - State Manager с undo/redo
4. **v3.0.0** - Полная модуляризация, единое хранилище, checklist интеграция

## ⚠️ КРИТИЧЕСКИ ВАЖНО - НЕ ТРОГАТЬ

### Бизнес-логика расчётов (НЕЛЬЗЯ МЕНЯТЬ)

```javascript
// updateCalculations() - сердце системы
// Порядок расчётов СТРОГО фиксирован:

// 1. Базовая стоимость = сумма(цена × количество)
const baseCost = services.reduce((sum, s) => sum + s.price * s.quantity, 0);

// 2. Индивидуальные наценки (на каждую услугу отдельно)
const serviceWithMarkup = baseCost * (1 + service.markup / 100);

// 3. Скрытая наценка = % от БАЗОВОЙ стоимости (НЕ показывается клиенту)
const hiddenMarkupAmount = baseCost * (this.state.hiddenMarkup / 100);

// 4. НДС = % от суммы БЕЗ скрытой наценки
const taxAmount = totalWithIndividualMarkup * (this.state.taxRate / 100);

// 5. Клиенту = базовая + индив.наценки + НДС (БЕЗ скрытой маржи)
const clientTotal = totalWithIndividualMarkup + taxAmount;

// 6. В print() скрытая наценка распределяется пропорционально
const proportion = baseCost > 0 ? serviceBaseCost / baseCost : 0;
```

**Почему нельзя менять**: это бизнес-требование, согласованное с клиентом.

## ✅ ОБЯЗАТЕЛЬНО ПРОВЕРЯТЬ

### 1. Безопасность

```javascript
// File size validation (ВЕЗДЕ где загрузка)
if (file.size > this.config.maxFileSize) { // 5MB
    this.showNotification('Файл слишком большой', true);
    return;
}

// XSS prevention (НИКОГДА innerHTML с user input)
element.textContent = userInput;  // ✅ Правильно
element.innerHTML = userInput;    // ❌ ОПАСНО

// Input validation
const errors = this.validateService(service);
if (errors.length > 0) { /* handle */ }

// Email validation
if (!this.isValidEmail(email)) { /* handle */ }
```

### 2. Memory Management

```javascript
// Cleanup timeouts
if (this.timeoutIds[key]) {
    clearTimeout(this.timeoutIds[key]);
}

// Cleanup event listeners
if (this.handleChange) {
    container.removeEventListener('change', this.handleChange);
}

// Cleanup Set при удалении
removeService(serviceId) {
    this.state.services = this.state.services.filter(s => s.id !== serviceId);
    this.state.selectedServices.delete(serviceId); // НЕ ЗАБЫТЬ!
}
```

### 3. Version Compatibility

```javascript
// При загрузке файлов
if (jsonData.version > this.CATALOG_VERSION) {
    this.showNotification('Несовместимая версия', true);
    return;
}

// Backup warning
if (this.templates.length > 0) {
    if (!confirm('Загрузка заменит существующие данные. Продолжить?')) {
        return;
    }
}
```

## Архитектура

### Configuration Object
```javascript
this.config = {
    currency: '$',
    maxFileSize: 5 * 1024 * 1024,        // 5MB
    debounceDelays: {
        search: 300,
        calculations: 150,
        detailRender: 100,
        bulkControls: 50
    },
    validation: {
        maxServices: 1000,
        maxServiceNameLength: 100,
        minPrice: 0
    }
}
```

### State Object
```javascript
this.state = {
    services: [],                    // Услуги в смете
    paxCount: 27,                    // Кол-во человек
    hiddenMarkup: 0,                 // Скрытая наценка %
    taxRate: 0,                      // НДС %
    selectedServices: new Set(),     // Для bulk operations
    // + поля клиента (name, phone, email)
}
```

### Timeout Management
```javascript
this.timeoutIds = {
    update: null,
    search: null,
    detailRender: null,
    bulkUpdate: null
}
```

## Ключевые функции

### Управление данными
```javascript
// JSON (основной формат)
saveCatalogJSON()      // Сохранить каталог
saveQuoteJSON()        // Сохранить смету
loadCatalogJSON()      // Загрузить каталог
loadQuoteJSON()        // Загрузить смету

// CSV (legacy support)
saveCatalogCSV()       // Legacy формат
loadCatalogCSV()       // Legacy формат

// Universal loaders
loadCatalogFile()      // Автоопределение JSON/CSV
loadQuoteFile()        // Автоопределение JSON/CSV
```

### Расчёты (КРИТИЧНО)
```javascript
updateCalculations()           // Главный расчёт (НЕ ТРОГАТЬ логику)
calculateServiceTotal(service) // Стоимость услуги с наценкой
calculateBaseCost()            // Базовая стоимость
calculateTotalProfit()         // Общая прибыль
calculateClientTotal()         // Итого для клиента
```

### Bulk Operations (v2.1.0)
```javascript
toggleServiceSelection(id)  // Выбрать/отменить
toggleSelectAll()           // Выбрать все
deleteSelected()            // Удалить выбранные
updateBulkControls()        // Обновить UI
```

### Performance
```javascript
debounce(func, wait, key)   // Enhanced debouncing
scheduleUpdate()            // RequestAnimationFrame
bindServiceEvents()         // Event delegation
```

## Известные проблемы

### ✅ Решены в v2.1.0
- File size validation
- Memory leaks в bulk operations
- Race conditions в debounced функциях
- XSS уязвимости
- Event listener cleanup
- Unicode в CSV

### ⚠️ Текущие
- **JSON vs CSV confusion** - пользователи могут запутаться
- **Скрытая наценка логика** - источник путаницы (но это бизнес-требование)
- **Нет undo/redo** - частично решено bulk operations

### 🔄 Архитектурные ограничения
- Монолитный класс (но хорошо структурирован)
- Нет backend - всё localStorage
- Нет multi-user
- Нет real-time sync

## Типичные задачи

### Добавить функцию
1. Проверить VERSION - нужен ли bump?
2. Добавить настройки в `this.config`
3. Добавить валидацию
4. Использовать debounced паттерны
5. Поддержать JSON и CSV
6. Обновить документацию

### Исправить баг
1. Проверить version-specific
2. Проверить memory cleanup
3. Добавить валидацию если нужна
4. Тестировать в браузерах
5. Обновить docs/Статус исправлений

### Оптимизировать
1. Использовать debounced функции
2. Event delegation
3. Conditional rendering
4. RequestAnimationFrame
5. File size validation

## Стиль кода

```javascript
// Naming
camelCase       // переменные, методы
PascalCase      // классы
4 spaces        // отступы
'single quotes' // JS strings
"double quotes" // HTML attributes

// Patterns
this.config.setting    // не hard-code
try-catch              // всегда для risky operations
this.showNotification  // feedback для пользователя
confirm()              // для деструктивных действий
```

## Безопасность

```javascript
// ВСЕГДА
✅ file.size < maxFileSize
✅ element.textContent = userInput
✅ validateService(service)
✅ isValidEmail(email)
✅ try-catch для file operations

// НИКОГДА
❌ innerHTML = userInput
❌ eval() или new Function()
❌ Загрузка без size check
❌ Операции без validation
❌ setTimeout без cleanup
```

## Тестирование

### Manual checklist
- [ ] Создание/редактирование сметы
- [ ] Bulk operations
- [ ] JSON и CSV load/save
- [ ] Keyboard shortcuts (Ctrl+S, Ctrl+O, Ctrl+P, Escape, Delete)
- [ ] Печать с правильным распределением
- [ ] Мобильная версия (44px touch targets)
- [ ] Chrome, Firefox, Safari, Edge

### Performance
- [ ] 1000+ шаблонов в каталоге
- [ ] 100+ услуг в смете
- [ ] Multiple bulk operations
- [ ] Загрузка файлов до 5MB

## Debugging

```javascript
// Performance
console.log('Active timeouts:', this.timeoutIds);
console.log('Selected:', this.state.selectedServices.size);

// Versions
const saved = JSON.parse(localStorage.getItem('quoteCalc_templates'));
console.log('Version:', saved.version);

// Memory
console.log('Services:', this.state.services.length);
console.log('Templates:', this.templates.length);
```

## Предметная область

**Туристические услуги**:
- 🚗 Трансферы - аэропорт-отель, групповые/индивидуальные
- 🏨 Размещение - отели, ранчо, гостевые дома
- 👨‍🏫 Гиды - групповые, индивидуальные
- 🏛️ Экскурсии - городские, природные, морские
- 🎯 Активности - треккинг, дайвинг, каякинг

**Workflow**:
1. Настройка группы (PAX, даты, клиент)
2. Добавление услуг (из каталога или custom)
3. Bulk editing при необходимости
4. Расчёт с наценками и НДС
5. Печать КП (БЕЗ внутренних расчётов для клиента)

## Документация

### 📁 Расположение: `/docs`

**Основная документация:**
- `docs/README.md` - Обзор проекта и быстрый старт
- `docs/CLAUDE.md` - Техническая документация Quote Calculator v2.1.0 (копия этого файла)
- `docs/new_integration.md` - План интеграции систем для версии 3.0

**Релизная документация v2.1.0:**
- `docs/CHANGELOG.md` - Полная история изменений всех версий
- `docs/RELEASE_NOTES_v2.1.0.md` - Заметки о релизе v2.1.0
- `docs/TECHNICAL_DOCS_v2.1.0.md` - Техническая документация для разработчиков
- `docs/USER_GUIDE_v2.1.0.md` - Подробное руководство пользователя

**Статус:** ✅ Версия 2.1.0 готова к продакшену (29 декабря 2024)

## Контрольные вопросы перед изменениями

1. **Версии**: Нужен ли version bump?
2. **Расчёты**: Трогаешь updateCalculations()? → СТОП, проверь дважды
3. **Безопасность**: Есть file size validation? XSS проверен?
4. **Memory**: Есть cleanup для timeout/listeners/Set?
5. **Validation**: Есть проверка входных данных?
6. **Compatibility**: Работает с файлами старых версий?
7. **Testing**: Протестировано в браузерах?

## Примечания для AI

### Общие правила
- Это **production-ready** система v2.1.0 - обе системы готовы к использованию
- **Комментарии на русском** - норма для этого проекта
- **localStorage** - для оффлайн работы обеих систем
- Всегда проверяй VERSION перед изменениями
- Memory cleanup критичен для обеих систем
- File size validation обязателен
- XSS prevention - приоритет

### Quote Calculator специфика
- **Скрытая наценка** - не баг, это бизнес-требование
- **Монолитность** - сознательный выбор для простоты деплоя
- **updateCalculations()** - КРИТИЧНО, нельзя менять бизнес-логику

### Booking Checklist специфика
- **Функциональная архитектура** - не переводить в классы без необходимости
- **Undo/Redo система** - при изменениях учитывать history management
- **Автосохранение** - при модификации проверять совместимость

### Интеграция v3.0
- Обе системы **независимы** в текущей версии
- План интеграции: `docs/new_integration.md`
- При изменениях учитывать будущую интеграцию
- Сохранять обратную совместимость форматов данных

### Документация
- Полная документация в папке `/docs`
- При изменениях обновлять соответствующие файлы
- Changelog обязателен для всех значимых изменений