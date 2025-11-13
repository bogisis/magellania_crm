# Quote Calculator v2.3.0 - Быстрый справочник

**Версия:** 2.3.0 | **Обновлено:** 6 ноября 2025

Самая важная информация на одной странице.

---

## ⚡ Частые задачи (одна строка)

| Задача | Решение | Документация |
|--------|---------|--------------|
| Создать смету | `Ctrl+N` → Заполнить клиента → Добавить услуги → `Ctrl+S` | [Guide](ru/user-guide/working-with-estimates/creating.md) |
| Добавить услуги | `Ctrl+K` → Выбрать каталог → Выбрать услуги → Добавить | [Guide](ru/user-guide/catalogs/index.md) |
| Повысить цены на 10% | `Ctrl+A` → Цена → Умножить на 1.10 → Применить | [Guide](ru/user-guide/advanced-features/bulk-operations.md) |
| Распечатать | `Ctrl+P` → Настроить → Печать/PDF | [Guide](ru/user-guide/working-with-estimates/printing.md) |
| Создать backup | `Ctrl+Shift+B` или Меню → Backup | [Guide](ru/user-guide/advanced-features/backup-restore.md) |
| Импортировать каталог | Меню → Импорт → JSON/CSV | [Guide](ru/user-guide/catalogs/import-export.md) |
| Восстановить из backup | Меню → Backups → Выбрать → Восстановить | [Guide](ru/user-guide/advanced-features/backup-restore.md) |

---

## 🎹 Горячие клавиши

| Клавиша | Действие |
|---------|----------|
| **Ctrl+N** | Новая смета |
| **Ctrl+O** | Открыть смету |
| **Ctrl+S** | Сохранить |
| **Ctrl+P** | Печать |
| **Ctrl+K** | Открыть каталог |
| **Ctrl+A** | Выбрать все услуги |
| **Ctrl+D** | Дублировать смету |
| **Ctrl+Shift+B** | Создать backup |
| **Delete** | Удалить выбранные |
| **Escape** | Снять выбор / Закрыть |

[Полный список →](ru/user-guide/tips-and-tricks/keyboard-shortcuts.md)

---

## 📊 API Endpoints (быстрый доступ)

### Estimates
```bash
POST   /api/estimates              # Создать смету
GET    /api/estimates              # Список смет
GET    /api/estimates/:id          # Получить смету
PUT    /api/estimates/:id          # Обновить смету
DELETE /api/estimates/:id          # Удалить смету
```
[Подробнее →](ru/developer-guide/api-reference/estimates.md)

### Catalogs
```bash
POST   /api/catalogs               # Создать каталог
GET    /api/catalogs               # Список каталогов
GET    /api/catalogs/:id           # Получить каталог
PUT    /api/catalogs/:id           # Обновить каталог
DELETE /api/catalogs/:id           # Удалить каталог
```
[Подробнее →](ru/developer-guide/api-reference/catalogs.md)

### Backups
```bash
POST   /api/backups                # Создать backup
GET    /api/estimates/:id/backups  # Список backups
POST   /api/backups/:id/restore    # Восстановить
```
[Подробнее →](ru/developer-guide/api-reference/backups.md)

### Export/Import
```bash
GET    /api/export/all             # Экспорт всех данных
POST   /api/import                 # Импорт данных
```
[Подробнее →](ru/developer-guide/api-reference/export-import.md)

### System
```bash
GET    /health                     # Health check
GET    /api/stats                  # Статистика
```
[Подробнее →](ru/developer-guide/api-reference/system.md)

---

## 💡 Ключевые концепции

### PAX
**Определение:** Количество туристов в группе
**Где используется:** Расчёт общей стоимости, планирование тура
**Формат:** Целое число ≥ 1
**Пример:** PAX = 10 → группа из 10 человек

### Hidden Markup (Скрытая наценка)
**Определение:** Наценка, которая НЕ показывается клиенту в печати
**Расчёт:** `baseCost × (hiddenMarkup / 100)`
**Где:** [calculations.md:41-53](ru/user-guide/working-with-estimates/calculations.md)
**Важно:** Используется для внутренней маржи, не влияет на итого клиенту в печати

### Individual Markup (Индивидуальная наценка)
**Определение:** Наценка на каждую услугу отдельно
**Расчёт:** `price × quantity × (1 + markup / 100)`
**Где:** [calculations.md:24-38](ru/user-guide/working-with-estimates/calculations.md)
**Видна клиенту:** Да, включена в итоговую цену услуги

### Point-in-time Recovery
**Определение:** Восстановление данных на конкретный момент времени
**Реализация:** Автоматический backup при каждом сохранении
**Где:** [backup-restore.md:150+](ru/user-guide/advanced-features/backup-restore.md)
**Хранение:** 90 дней (по умолчанию)

### Catalog Region
**Определение:** Географическая привязка каталога
**UNIQUE constraint:** `UNIQUE(name, region)` - один каталог с именем на регион
**Где:** [catalogs/index.md](ru/user-guide/catalogs/index.md)
**Пример:** "Стандартные услуги" для Indonesia и для Georgia - разные каталоги

### Package (Пакет услуг)
**Определение:** Готовый набор услуг для типового тура
**Где:** [templates.md](ru/user-guide/advanced-features/templates.md)
**Использование:** Добавление всех услуг в смету одним кликом
**Пример:** "Бали 7 дней стандарт" = трансферы + отель + экскурсии + гид

---

## 🧮 Формулы расчётов

```javascript
// 1. Базовая стоимость
baseCost = Σ (price × quantity)

// 2. Стоимость с индивидуальными наценками
serviceTotal = price × quantity × (1 + markup / 100)

// 3. Скрытая наценка (НЕ показывается клиенту)
hiddenMarkupAmount = baseCost × (hiddenMarkup / 100)

// 4. НДС
taxAmount = totalWithMarkups × (taxRate / 100)

// 5. Итого клиенту (БЕЗ скрытой наценки)
clientTotal = totalWithIndividualMarkup + taxAmount

// 6. Ваша прибыль
totalProfit = individualMarkups + hiddenMarkupAmount
```

[Подробнее →](ru/user-guide/working-with-estimates/calculations.md)

---

## 📂 Расположение файлов

### Frontend
```
index.html                          # Монолитное SPA (9979 строк)
  ↳ ProfessionalQuoteCalculator    # Главный класс
    ↳ updateCalculations()          # Формулы расчётов (КРИТИЧНО)
    ↳ loadQuoteFromServer()         # Загрузка сметы
    ↳ saveToServer()                # Сохранение
```

### Backend
```
server-with-db.js                   # Express.js сервер (600+ строк)
  ↳ /api/estimates/*                # CRUD смет (lines 100-300)
  ↳ /api/catalogs/*                 # CRUD каталогов (lines 300-500)
  ↳ /api/backups/*                  # Backups API (lines 500-650)
  ↳ /health                         # Health check (lines 777-806)
```

### Database
```
db/quotes.db                        # SQLite база
  ↳ estimates                       # Таблица смет
  ↳ catalogs                        # Таблица каталогов
  ↳ backups                         # Таблица backups
db/migrations/*.sql                 # SQL миграции
```

### Utils
```
utils.js                            # Утилиты (transliterate, generateId)
version.js                          # Версии (APP_VERSION, CATALOG_VERSION, etc.)
```

---

## 🗄️ Database Schema (кратко)

### estimates
```sql
CREATE TABLE estimates (
    id TEXT PRIMARY KEY,              -- est_001, est_002, ...
    data TEXT NOT NULL,               -- Полный JSON сметы
    client_name TEXT,                 -- Для поиска
    created_at TEXT,                  -- ISO 8601
    updated_at TEXT
);
```

### catalogs
```sql
CREATE TABLE catalogs (
    id TEXT PRIMARY KEY,              -- cat_001, cat_002, ...
    name TEXT NOT NULL,               -- Название
    region TEXT,                      -- Indonesia, Georgia, ...
    data TEXT NOT NULL,               -- JSON с templates
    UNIQUE(name, region)              -- Один каталог на (name, region)
);
```

### backups
```sql
CREATE TABLE backups (
    id TEXT PRIMARY KEY,              -- backup_001, backup_002, ...
    estimate_id TEXT NOT NULL,        -- Какая смета
    data TEXT NOT NULL,               -- Snapshot сметы
    data_hash TEXT,                   -- Дедупликация
    created_at TEXT,                  -- Timestamp
    FOREIGN KEY (estimate_id) REFERENCES estimates(id)
);
```

[Подробнее →](ru/developer-guide/architecture/database.md)

---

## 🚨 Типичные проблемы (Quick Fix)

| Проблема | Решение |
|----------|---------|
| Кириллица в CSV как `??????` | Экспорт: выбрать "UTF-8 BOM" вместо "UTF-8" |
| Backup не восстанавливается | Проверить: `sqlite3 quotes.db "SELECT id FROM backups WHERE id='...';"` |
| Слишком много backups (БД большая) | `DELETE FROM backups WHERE created_at < date('now', '-30 days');` |
| UNIQUE constraint failed | Каталог с таким (name, region) уже есть - переименовать или изменить регион |
| Services "прилипают" между сметами | Баг исправлен в v2.3.0 - обновить систему |

[Полный список →](ru/user-guide/troubleshooting/common-issues.md)

---

## 📚 Частые вопросы (FAQ Quick)

**Q:** Можно ли использовать без интернета?
**A:** Да, полностью оффлайн система. [FAQ](ru/user-guide/troubleshooting/faq.md#offline)

**Q:** Как перенести данные на новый компьютер?
**A:** Экспорт → full backup → Импорт на новом ПК. [Guide](ru/user-guide/advanced-features/backup-restore.md#migration)

**Q:** Скрытая наценка показывается клиенту?
**A:** Нет, только в панели расчётов для вас. [Calculations](ru/user-guide/working-with-estimates/calculations.md#hidden-markup)

**Q:** Как повысить все цены на 15%?
**A:** `Ctrl+A` → Цена → Умножить на 1.15. [Bulk Ops](ru/user-guide/advanced-features/bulk-operations.md#price-changes)

**Q:** Сколько хранятся backups?
**A:** 90 дней (настраивается). [Backups](ru/user-guide/advanced-features/backup-restore.md#storage)

[Полный FAQ →](ru/user-guide/troubleshooting/faq.md)

---

## 🔗 Быстрые ссылки

- **Documentation Map:** [DOCUMENTATION_MAP.md](DOCUMENTATION_MAP.md) - полная навигация
- **User Guide:** [ru/user-guide/index.md](ru/user-guide/index.md)
- **Developer Guide:** [ru/developer-guide/index.md](ru/developer-guide/index.md)
- **API Reference:** [ru/developer-guide/api-reference/index.md](ru/developer-guide/api-reference/index.md)
- **Changelog:** [ru/developer-guide/history/changelog.md](ru/developer-guide/history/changelog.md)

---

**Создано:** 6 ноября 2025
**Для версии:** Quote Calculator v2.3.0
