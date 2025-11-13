# Импорт и экспорт каталогов

**Версия:** 2.3.0

## Форматы данных

### JSON (рекомендуется)

**Структура:**
```json
{
  "version": "1.2.0",
  "name": "Бали - Стандартные услуги",
  "region": "Indonesia",
  "description": "Готовые услуги для туров на Бали",
  "created": "2025-01-15T10:00:00Z",
  "updated": "2025-02-03T15:30:00Z",
  "templates": [
    {
      "id": "svc_001",
      "name": "Трансфер аэропорт-отель",
      "price": 25,
      "quantity": 1,
      "markup": 10,
      "category": "transport",
      "description": "Седан, до 3 чел",
      "notes": "Встреча с табличкой"
    },
    {
      "id": "svc_002",
      "name": "Отель 4* (DBL, 1 ночь)",
      "price": 80,
      "quantity": 6,
      "markup": 10,
      "category": "accommodation"
    }
  ]
}
```

**Преимущества:**
- ✅ Полная структура (метаданные, описания)
- ✅ Версионирование
- ✅ Поддержка Unicode
- ✅ Валидация схемы

### CSV (legacy)

**Структура:**
```csv
name,price,quantity,markup,category,description
"Трансфер аэропорт-отель",25,1,10,"transport","Седан, до 3 чел"
"Отель 4* (DBL, 1 ночь)",80,6,10,"accommodation",""
"Экскурсия обзорная",35,1,15,"excursion",""
```

**Ограничения:**
- ❌ Нет метаданных (version, region)
- ❌ Только основные поля
- ❌ Проблемы с запятыми и кавычками
- ❌ Нет поддержки многострочных описаний

**Когда использовать:**
- Импорт из Excel/Google Sheets
- Простые каталоги без метаданных
- Legacy системы

---

## Экспорт каталога

### JSON экспорт

**Процесс:**
```
1. Открыть каталог
2. Меню → Экспорт → JSON
3. Выбор опций:
   □ Включить ID услуг
   □ Включить статистику использования
   □ Минифицировать JSON
   □ Pretty print (для читаемости)
4. Кнопка "Экспорт"
5. Файл сохраняется: {name}_catalog.json
```

**Пример имени файла:**
```
bali-standartnye-uslugi_catalog_20250203.json
```

**Размер файла:**
```
Типичный каталог (30 услуг): ~15KB
Большой каталог (500 услуг): ~250KB
```

### CSV экспорт

**Процесс:**
```
1. Открыть каталог
2. Меню → Экспорт → CSV
3. Выбор полей:
   ☑ name
   ☑ price
   ☑ quantity
   ☑ markup
   ☑ category
   ☐ description (опционально)
   ☐ notes (опционально)
4. Разделитель:
   ○ Запятая (,)
   ○ Точка с запятой (;)
   ○ Табуляция (\t)
5. Кодировка:
   ○ UTF-8 (рекомендуется)
   ○ UTF-8 BOM (для Excel)
   ○ Windows-1251
6. Кнопка "Экспорт"
7. Файл: {name}_catalog.csv
```

**Открытие в Excel:**
```
Если кириллица отображается неправильно:
1. Выбрать "UTF-8 BOM" при экспорте
2. Или: Excel → Данные → Из текста → UTF-8
```

### Массовый экспорт

**Экспорт всех каталогов:**
```
1. Главное меню → Экспорт → Все каталоги
2. Формат: JSON или ZIP с JSON
3. Опции:
   □ Один файл (all_catalogs.json)
   □ Отдельные файлы в ZIP
   □ Включить backups
4. Экспорт
5. Файл: catalogs_backup_20250203.zip
```

**Структура ZIP:**
```
catalogs_backup_20250203.zip
├── bali-standartnye-uslugi.json
├── tbilisi-korporativnye.json
├── sochi-letniy-otdyh.json
├── backups/
│   ├── bali_backup_20250201.json
│   └── tbilisi_backup_20250125.json
└── manifest.json
```

**manifest.json:**
```json
{
  "export_date": "2025-02-03T15:30:00Z",
  "app_version": "2.3.0",
  "catalogs_count": 3,
  "backups_count": 2,
  "total_services": 87
}
```

---

## Импорт каталога

### JSON импорт

**Процесс:**
```
1. Кнопка "Импорт"
2. Выбрать JSON файл
3. Система валидирует:
   ✓ Формат JSON
   ✓ Версия совместима
   ✓ Обязательные поля
   ✓ Типы данных
   ✓ UNIQUE(name, region) constraint
4. Если конфликт → Диалог разрешения
5. Импорт выполняется
6. Уведомление: "Импортировано N услуг"
```

**Валидация:**
```javascript
// Проверка версии
if (jsonData.version > CATALOG_VERSION) {
    error: "Несовместимая версия каталога"
    solution: "Обновите приложение до v{required}"
}

// Проверка структуры
required: ["name", "templates"]
templates.required: ["name", "price", "quantity"]

// Проверка типов
price: number >= 0
quantity: integer >= 1
markup: number >= 0
category: string (enum)
```

### CSV импорт

**Процесс:**
```
1. Кнопка "Импорт"
2. Выбрать CSV файл
3. Настройки парсинга:
   Разделитель: Автоопределение или выбор
   Кодировка: UTF-8 / UTF-8 BOM / Windows-1251
   Первая строка: ☑ Заголовки
4. Маппинг колонок:
   CSV колонка → Поле в системе
   "Название" → name
   "Цена" → price
   "Кол-во" → quantity
5. Предпросмотр (первые 5 строк)
6. Импорт
```

**Автоопределение разделителя:**
```javascript
Анализ первых 10 строк:
  Запятая (,) - 150 вхождений → выбрано
  Точка с запятой (;) - 5 вхождений
  Табуляция (\t) - 0 вхождений
```

**Обработка проблем:**
```
Проблема: Кавычки внутри значений
"Отель "Hilton" Garden Inn",80,1

Решение: Экранирование
"Отель ""Hilton"" Garden Inn",80,1

Система автоматически обрабатывает
```

### Конфликты при импорте

**UNIQUE constraint нарушен:**
```
Импортируемый каталог:
  name: "Бали - Стандартные услуги"
  region: "Indonesia"

Существующий в БД:
  name: "Бали - Стандартные услуги"
  region: "Indonesia"

Диалог:
┌─────────────────────────────────────────┐
│ Конфликт при импорте                    │
├─────────────────────────────────────────┤
│ Каталог уже существует:                 │
│ "Бали - Стандартные услуги" (Indonesia) │
│                                         │
│ Действие:                               │
│ ○ Перезаписать (заменить все услуги)   │
│ ○ Объединить (добавить новые услуги)   │
│ ○ Переименовать импортируемый          │
│ ○ Отмена                                │
│                                         │
│ [Продолжить] [Отмена]                   │
└─────────────────────────────────────────┘
```

**Перезапись:**
```
1. Backup текущей версии создаётся
2. Все услуги удаляются
3. Импортируются новые услуги
4. Метаданные обновляются
5. Версия: импортированная или +0.1.0
```

**Объединение:**
```
1. Существующие услуги сохраняются
2. Новые услуги добавляются
3. Дубликаты (по name) → Диалог:
   - Оставить существующую
   - Заменить на импортированную
   - Переименовать импортированную
   - Пропустить
```

**Переименование:**
```
Исходное: "Бали - Стандартные услуги"
Новое: "Бали - Стандартные услуги (импорт 2025-02-03)"

Импорт создаёт новый каталог
Существующий не изменяется
```

---

## Миграция данных

### Из старой версии (v1.x → v2.x)

**Автоматическая миграция:**
```
При импорте старого формата:
1. Система определяет версию
2. Применяет migration scripts:
   - v1.0.0 → v1.1.0: добавить metadata
   - v1.1.0 → v1.2.0: добавить region
3. Данные преобразуются
4. Импорт завершается
```

**Пример:**
```json
// Старый формат (v1.0.0)
{
  "name": "Бали",
  "services": [...]
}

// Новый формат (v1.2.0)
{
  "version": "1.2.0",
  "name": "Бали",
  "region": null,  // добавлено
  "created": "2025-02-03T15:30:00Z",  // добавлено
  "updated": "2025-02-03T15:30:00Z",  // добавлено
  "templates": [...]  // переименовано из services
}
```

### Из Excel/Google Sheets

**Подготовка данных:**
```
1. Открыть Excel/Sheets
2. Создать заголовки:
   A1: name
   B1: price
   C1: quantity
   D1: markup
   E1: category

3. Заполнить данные:
   A2: Трансфер аэропорт-отель
   B2: 25
   C2: 1
   D2: 10
   E2: transport

4. Сохранить как CSV (UTF-8)
5. Импортировать в систему
```

**Проверка перед импортом:**
```
✓ Нет пустых обязательных полей
✓ Цены - числа (не текст "$25")
✓ Количества - целые числа
✓ Наценки - проценты (10, не 0.10)
✓ Категории - из списка стандартных
```

### Из других систем

**TourBuilder Pro:**
```
1. TourBuilder → Экспорт → XML
2. Использовать конвертер:
   npm run convert -- tourbuilder-export.xml
3. Получается JSON для импорта
4. Импорт в Quote Calculator
```

**Custom формат:**
```
Написать конвертер (Node.js):

const fs = require('fs');
const customData = require('./custom-format.json');

const converted = {
  version: "1.2.0",
  name: customData.catalogName,
  region: customData.country,
  templates: customData.items.map(item => ({
    name: item.title,
    price: parseFloat(item.cost),
    quantity: 1,
    markup: 10,
    category: mapCategory(item.type)
  }))
};

fs.writeFileSync('converted.json', JSON.stringify(converted, null, 2));
```

---

## API для импорта/экспорта

### Экспорт через API

**Получить JSON каталога:**
```bash
GET /api/catalogs/:id

curl http://localhost:4000/api/catalogs/cat_001

Response:
{
  "id": "cat_001",
  "name": "Бали - Стандартные услуги",
  "region": "Indonesia",
  "data": {
    "version": "1.2.0",
    "templates": [...]
  }
}
```

**Экспорт всех каталогов:**
```bash
GET /api/catalogs

curl http://localhost:4000/api/catalogs

Response:
{
  "catalogs": [
    { "id": "cat_001", "name": "...", ... },
    { "id": "cat_002", "name": "...", ... }
  ]
}
```

### Импорт через API

**Создать каталог:**
```bash
POST /api/catalogs
Content-Type: application/json

curl -X POST http://localhost:4000/api/catalogs \
  -H "Content-Type: application/json" \
  -d @catalog.json

Request body (catalog.json):
{
  "name": "Новый каталог",
  "region": "Indonesia",
  "templates": [...]
}

Response:
{
  "id": "cat_003",
  "message": "Catalog created",
  "templates_count": 25
}
```

**Обновить каталог:**
```bash
PUT /api/catalogs/:id

curl -X PUT http://localhost:4000/api/catalogs/cat_001 \
  -H "Content-Type: application/json" \
  -d @updated-catalog.json
```

### Массовый импорт (batch)

**Импорт множества каталогов:**
```bash
POST /api/catalogs/batch
Content-Type: application/json

curl -X POST http://localhost:4000/api/catalogs/batch \
  -H "Content-Type: application/json" \
  -d @catalogs-batch.json

Request body:
{
  "catalogs": [
    {
      "name": "Каталог 1",
      "region": "Indonesia",
      "templates": [...]
    },
    {
      "name": "Каталог 2",
      "region": "Georgia",
      "templates": [...]
    }
  ],
  "options": {
    "on_conflict": "rename",  // или "overwrite", "merge", "skip"
    "validate": true,
    "create_backup": true
  }
}

Response:
{
  "imported": 2,
  "failed": 0,
  "conflicts": 0,
  "results": [
    {
      "name": "Каталог 1",
      "id": "cat_004",
      "status": "created",
      "templates_count": 30
    },
    {
      "name": "Каталог 2",
      "id": "cat_005",
      "status": "created",
      "templates_count": 25
    }
  ]
}
```

---

## Автоматизация

### Скрипт для экспорта

**Bash скрипт:**
```bash
#!/bin/bash
# export-catalogs.sh

API_URL="http://localhost:4000/api"
EXPORT_DIR="./exports/$(date +%Y%m%d)"

mkdir -p "$EXPORT_DIR"

# Получить список каталогов
catalog_ids=$(curl -s "$API_URL/catalogs" | jq -r '.catalogs[].id')

# Экспортировать каждый
for id in $catalog_ids; do
  echo "Exporting $id..."
  curl -s "$API_URL/catalogs/$id" > "$EXPORT_DIR/${id}.json"
done

echo "Exported to $EXPORT_DIR"
```

**Использование:**
```bash
chmod +x export-catalogs.sh
./export-catalogs.sh

# Результат:
# exports/20250203/
#   cat_001.json
#   cat_002.json
#   cat_003.json
```

### Скрипт для импорта

**Node.js скрипт:**
```javascript
// import-catalogs.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_URL = 'http://localhost:4000/api';
const IMPORT_DIR = './imports';

async function importCatalogs() {
  const files = fs.readdirSync(IMPORT_DIR)
    .filter(f => f.endsWith('.json'));

  for (const file of files) {
    const filepath = path.join(IMPORT_DIR, file);
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));

    console.log(`Importing ${file}...`);

    try {
      const response = await axios.post(`${API_URL}/catalogs`, data);
      console.log(`✓ ${file}: ${response.data.message}`);
    } catch (err) {
      console.error(`✗ ${file}: ${err.response?.data?.error || err.message}`);
    }
  }
}

importCatalogs();
```

**Использование:**
```bash
node import-catalogs.js

# Результат:
# Importing catalog1.json...
# ✓ catalog1.json: Catalog created
# Importing catalog2.json...
# ✓ catalog2.json: Catalog created
```

### Scheduled backups (cron)

**Автоматический backup каждый день:**
```bash
# Добавить в crontab
crontab -e

# Backup в 3:00 каждую ночь
0 3 * * * /path/to/export-catalogs.sh

# Backup в конце каждой недели
0 3 * * 0 /path/to/export-catalogs.sh && \
  zip -r /backups/weekly/catalogs_$(date +\%Y\%m\%d).zip /exports/latest
```

**Ротация backups:**
```bash
# Удалить backups старше 90 дней
find /backups -name "catalogs_*.zip" -mtime +90 -delete
```

---

## Обмен с коллегами

### Email/Slack

**Отправка:**
```
1. Экспорт каталога → JSON файл
2. Email → Прикрепить файл
3. Тема: "[Quote Calculator] Каталог: Бали - Стандартные услуги"
4. Текст:
   "Обновлённый каталог с зимними ценами 2025.
    31 услуга, версия 1.3.0.
    Импортировать через: Импорт → Выбрать файл"
5. Отправить
```

**Получение:**
```
1. Скачать файл из email
2. Quote Calculator → Импорт
3. Выбрать скачанный файл
4. Разрешить конфликты если есть
5. Каталог импортирован
```

### Cloud storage (Dropbox, Google Drive)

**Shared folder:**
```
/Shared/QuoteCalculator/Catalogs/
  bali-standartnye-uslugi.json
  tbilisi-korporativnye.json
  sochi-letniy-otdyh.json
  _backups/
    bali_20250201.json
    tbilisi_20250125.json
```

**Workflow:**
```
Сотрудник 1:
  1. Обновил каталог
  2. Экспорт → JSON
  3. Загрузить в shared folder
  4. Уведомить коллег (Slack/Email)

Сотрудник 2:
  1. Скачать обновлённый файл
  2. Импорт в свою систему
  3. Продолжить работу с актуальными данными
```

### Git repository

**Версионирование каталогов:**
```bash
# Инициализация
mkdir quote-calculator-catalogs
cd quote-calculator-catalogs
git init

# Экспорт и commit
./export-all.sh
git add catalogs/*.json
git commit -m "Update Bali catalog - winter 2025 prices"
git push origin main

# Коллега получает обновления
git pull origin main
./import-all.sh
```

**Преимущества:**
- ✅ История изменений
- ✅ Откат к любой версии
- ✅ Merge conflicts видны
- ✅ Code review для цен

---

## Безопасность

### Валидация при импорте

**Проверки:**
```javascript
// Размер файла
if (fileSize > 10MB) {
    throw new Error('Файл слишком большой');
}

// JSON парсинг
try {
    data = JSON.parse(content);
} catch (e) {
    throw new Error('Некорректный JSON');
}

// XSS защита
sanitize(data.name);
sanitize(data.templates.forEach(t => t.name));

// SQL injection защита (подготовленные запросы)
db.prepare('INSERT INTO catalogs (name, region) VALUES (?, ?)');

// Типы данных
validateNumber(template.price);
validateInteger(template.quantity);
```

### Логирование

**Audit log:**
```
[2025-02-03 15:30:22] IMPORT catalog "Бали" by user_001
[2025-02-03 15:30:24] VALIDATE 31 templates
[2025-02-03 15:30:25] CONFLICT "Бали" exists, action: rename
[2025-02-03 15:30:26] CREATE catalog "Бали (импорт)" id=cat_004
[2025-02-03 15:30:27] SUCCESS imported 31 services
```

**Хранение:**
```sql
CREATE TABLE import_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,  -- 'import', 'export'
    catalog_name TEXT,
    file_name TEXT,
    user_id TEXT,
    status TEXT,  -- 'success', 'failed', 'partial'
    details TEXT,  -- JSON с подробностями
    created_at TEXT NOT NULL
);
```

---

## Troubleshooting

### Проблема: "Несовместимая версия"

**Ошибка:**
```
Import failed: Incompatible catalog version 2.0.0
Current version: 1.2.0
```

**Решение:**
```
1. Обновить Quote Calculator до последней версии
2. Или: Запросить у коллеги экспорт в старом формате
3. Или: Использовать конвертер версий (если есть)
```

### Проблема: "Кириллица отображается как ??????"

**Причина:** Неправильная кодировка CSV

**Решение:**
```
При экспорте:
  Выбрать "UTF-8 BOM" вместо "UTF-8"

При импорте:
  Кодировка → UTF-8
  Или: Windows-1251 для старых систем
```

### Проблема: "Конфликт имён при импорте"

**Ошибка:**
```
UNIQUE constraint failed: catalogs.name, catalogs.region
```

**Решение:**
```
В диалоге конфликта:
1. Переименовать импортируемый
   "Бали" → "Бали (2025)"
2. Или: Перезаписать существующий
   (Backup создастся автоматически)
3. Или: Объединить каталоги
   (Дубликаты услуг → спросит)
```

---

## Лучшие практики

### Регулярные backups

```
Рекомендуется:
  - Ежедневный автоэкспорт (cron)
  - Недельные архивы (ZIP)
  - Месячные офлайн backups (external drive)
  - Перед критическими изменениями (ручной backup)
```

### Версионирование экспортов

**Имена файлов:**
```
✅ Хорошо:
bali-standartnye-uslugi_v1.3.0_20250203.json
tbilisi-korporativnye_v2.1.0_20250201.json

❌ Плохо:
catalog.json
export.json
новый_каталог.json
```

### Валидация после импорта

```
Checklist:
□ Количество услуг совпадает
□ Цены корректны
□ Категории на месте
□ Кириллица читается
□ Тестовая смета создаётся
□ Расчёты работают
```

---

**Назад:** [← Управление каталогами](managing.md)
**Следующий раздел:** [Advanced Features →](../advanced-features/index.md)
