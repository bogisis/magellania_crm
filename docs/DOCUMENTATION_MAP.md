# Quote Calculator v2.3.0 - Карта документации

**Обновлено:** 6 ноября 2025

Этот документ - **навигационная карта** всей документации Quote Calculator. Используйте его для быстрого поиска нужной информации.

---

## 🎯 Навигация по задачам

### Для пользователей

| Задача | Документ | Время |
|--------|----------|-------|
| **Установить систему** | [Installation Guide](ru/user-guide/installation/index.md) | 10 мин |
| **Создать первую смету** | [First Estimate](ru/user-guide/getting-started/first-estimate.md) | 15 мин |
| **Добавить услуги из каталога** | [Working with Catalogs](ru/user-guide/catalogs/index.md) | 5 мин |
| **Настроить наценки** | [Calculations](ru/user-guide/working-with-estimates/calculations.md) | 10 мин |
| **Распечатать смету** | [Printing](ru/user-guide/working-with-estimates/printing.md) | 5 мин |
| **Импортировать каталог** | [Import/Export](ru/user-guide/catalogs/import-export.md) | 10 мин |
| **Повысить цены на 10%** | [Bulk Operations](ru/user-guide/advanced-features/bulk-operations.md) | 5 мин |
| **Создать backup** | [Backup/Restore](ru/user-guide/advanced-features/backup-restore.md) | 5 мин |
| **Создать шаблон тура** | [Templates](ru/user-guide/advanced-features/templates.md) | 10 мин |
| **Решить проблему** | [Troubleshooting](ru/user-guide/troubleshooting/index.md) | - |

### Для разработчиков

| Задача | Документ | Время |
|--------|----------|-------|
| **Развернуть через Docker** | [Docker Deployment](ru/developer-guide/deployment/docker.md) | 15 мин |
| **Запустить тесты** | [Testing Guide](ru/developer-guide/development/testing.md) | 5 мин |
| **Использовать API сметы** | [Estimates API](ru/developer-guide/api-reference/estimates.md) | 10 мин |
| **Использовать API каталогов** | [Catalogs API](ru/developer-guide/api-reference/catalogs.md) | 10 мин |
| **Использовать API backups** | [Backups API](ru/developer-guide/api-reference/backups.md) | 10 мин |
| **Понять архитектуру** | [Architecture Overview](ru/developer-guide/architecture/overview.md) | 20 мин |
| **Понять расчёты** | [Business Logic](ru/developer-guide/architecture/business-logic.md) | 15 мин |

---

## 👥 Навигация по ролям

### Я - Новый пользователь

**Путь обучения (1 час):**
1. [Installation](ru/user-guide/installation/index.md) → Установка
2. [Getting Started](ru/user-guide/getting-started/index.md) → Основы интерфейса
3. [First Estimate](ru/user-guide/getting-started/first-estimate.md) → Первая смета
4. [Interface Guide](ru/user-guide/getting-started/interface.md) → Детали UI
5. [Printing](ru/user-guide/working-with-estimates/printing.md) → Как распечатать

**Часто нужно:**
- [Keyboard Shortcuts](ru/user-guide/tips-and-tricks/keyboard-shortcuts.md) - горячие клавиши
- [FAQ](ru/user-guide/troubleshooting/faq.md) - частые вопросы

### Я - Опытный пользователь

**Эффективность:**
- [Bulk Operations](ru/user-guide/advanced-features/bulk-operations.md) - массовое редактирование
- [Templates & Packages](ru/user-guide/advanced-features/templates.md) - готовые туры
- [Workflows](ru/user-guide/tips-and-tricks/workflows.md) - паттерны работы
- [Advanced Calculations](ru/user-guide/working-with-estimates/calculations.md) - детали расчётов

**Управление данными:**
- [Catalog Management](ru/user-guide/catalogs/managing.md) - управление каталогами
- [Import/Export](ru/user-guide/catalogs/import-export.md) - обмен данными
- [Backup/Restore](ru/user-guide/advanced-features/backup-restore.md) - резервное копирование

### Я - Разработчик (Frontend/Backend)

**Начало работы:**
- [Architecture Overview](ru/developer-guide/architecture/overview.md) - общая архитектура
- [Data Flow](ru/developer-guide/architecture/data-flow.md) - поток данных
- [Business Logic](ru/developer-guide/architecture/business-logic.md) - бизнес-логика

**API Reference:**
- [All Endpoints](ru/developer-guide/api-reference/index.md) - все эндпоинты
- [Estimates API](ru/developer-guide/api-reference/estimates.md) - CRUD смет
- [Catalogs API](ru/developer-guide/api-reference/catalogs.md) - каталоги
- [Backups API](ru/developer-guide/api-reference/backups.md) - backups
- [Export/Import API](ru/developer-guide/api-reference/export-import.md) - экспорт/импорт

**Development:**
- [Testing](ru/developer-guide/development/testing.md) - тестирование
- [Development Workflow](ru/developer-guide/development/workflow.md) - рабочий процесс (планируется)

### Я - DevOps/Администратор

**Deployment:**
- [Deployment Overview](ru/developer-guide/deployment/index.md) - обзор развёртывания
- [Docker](ru/developer-guide/deployment/docker.md) - Docker Compose
- [Production](ru/developer-guide/deployment/production.md) - production setup
- [Monitoring](ru/developer-guide/deployment/monitoring.md) - мониторинг

**Maintenance:**
- [Database](ru/developer-guide/architecture/database.md) - SQLite схема
- [System API](ru/developer-guide/api-reference/system.md) - health checks

---

## 📚 Навигация по темам

### Estimates (Сметы)

**User Flow:**
- [Creating](ru/user-guide/working-with-estimates/creating.md) - создание
- [Editing](ru/user-guide/working-with-estimates/editing.md) - редактирование
- [Calculations](ru/user-guide/working-with-estimates/calculations.md) - расчёты
- [Printing](ru/user-guide/working-with-estimates/printing.md) - печать

**API:**
- [Estimates API](ru/developer-guide/api-reference/estimates.md) - CRUD операции
- [Export/Import API](ru/developer-guide/api-reference/export-import.md) - экспорт/импорт

**Architecture:**
- [Business Logic](ru/developer-guide/architecture/business-logic.md) - формулы расчётов
- [Data Flow](ru/developer-guide/architecture/data-flow.md) - поток данных

### Catalogs (Каталоги)

**User Flow:**
- [Overview](ru/user-guide/catalogs/index.md) - обзор каталогов
- [Managing](ru/user-guide/catalogs/managing.md) - управление
- [Import/Export](ru/user-guide/catalogs/import-export.md) - импорт/экспорт

**API:**
- [Catalogs API](ru/developer-guide/api-reference/catalogs.md) - CRUD, multi-region

**Architecture:**
- [Database Schema](ru/developer-guide/architecture/database.md#catalogs-table) - таблица catalogs

### Backups (Резервное копирование)

**User Flow:**
- [Backup/Restore](ru/user-guide/advanced-features/backup-restore.md) - создание/восстановление

**API:**
- [Backups API](ru/developer-guide/api-reference/backups.md) - point-in-time recovery

**Architecture:**
- [Database Schema](ru/developer-guide/architecture/database.md#backups-table) - таблица backups
- [Data Flow](ru/developer-guide/architecture/data-flow.md#autosave-flow) - автосохранение

### Bulk Operations (Массовые операции)

**User Flow:**
- [Bulk Operations](ru/user-guide/advanced-features/bulk-operations.md) - выбор, изменение, удаление

**API:**
- [Batch API](ru/developer-guide/api-reference/catalogs.md#batch-update) - batch update (планируется)

### Templates & Packages (Шаблоны и пакеты)

**User Flow:**
- [Templates](ru/user-guide/advanced-features/templates.md) - создание и использование

**Architecture:**
- [Data Structure](ru/developer-guide/architecture/data-flow.md#packages) - структура пакетов

---

## 🔍 Cross-References (Перекрёстные ссылки)

### Estimates → API
| User Action | API Endpoint | Documentation |
|-------------|--------------|---------------|
| Create estimate | `POST /api/estimates` | [Estimates API](ru/developer-guide/api-reference/estimates.md#create-estimate) |
| Load estimate | `GET /api/estimates/:id` | [Estimates API](ru/developer-guide/api-reference/estimates.md#get-estimate) |
| Update estimate | `PUT /api/estimates/:id` | [Estimates API](ru/developer-guide/api-reference/estimates.md#update-estimate) |
| Delete estimate | `DELETE /api/estimates/:id` | [Estimates API](ru/developer-guide/api-reference/estimates.md#delete-estimate) |
| Export estimate | `GET /api/estimates/:id` → JSON | [Export API](ru/developer-guide/api-reference/export-import.md#export-estimate) |

### Catalogs → API
| User Action | API Endpoint | Documentation |
|-------------|--------------|---------------|
| Import catalog | `POST /api/catalogs` | [Catalogs API](ru/developer-guide/api-reference/catalogs.md#create-catalog) |
| Load catalog | `GET /api/catalogs/:id` | [Catalogs API](ru/developer-guide/api-reference/catalogs.md#get-catalog) |
| Update services | `PUT /api/catalogs/:id` | [Catalogs API](ru/developer-guide/api-reference/catalogs.md#update-catalog) |
| Export catalog | `GET /api/catalogs/:id` → JSON | [Import/Export](ru/user-guide/catalogs/import-export.md#export-catalog) |

### Backups → API
| User Action | API Endpoint | Documentation |
|-------------|--------------|---------------|
| Create backup | `POST /api/backups` | [Backups API](ru/developer-guide/api-reference/backups.md#create-backup) |
| List backups | `GET /api/estimates/:id/backups` | [Backups API](ru/developer-guide/api-reference/backups.md#list-backups) |
| Restore backup | `POST /api/backups/:id/restore` | [Backups API](ru/developer-guide/api-reference/backups.md#restore-backup) |

### Bulk Operations → Implementation
| Operation | Frontend | Backend | Documentation |
|-----------|----------|---------|---------------|
| Select services | `selectedServices Set` | N/A | [Bulk Ops](ru/user-guide/advanced-features/bulk-operations.md#selection) |
| Change prices | `updatePrices()` | `PUT /api/catalogs/:id` | [Bulk Ops](ru/user-guide/advanced-features/bulk-operations.md#price-changes) |
| Delete services | `deleteSelected()` | `PUT /api/catalogs/:id` | [Bulk Ops](ru/user-guide/advanced-features/bulk-operations.md#deletion) |

---

## 📖 Структура документации

### User Guide (Руководство пользователя)

```
ru/user-guide/
├── installation/          # Установка
│   ├── index.md          # Обзор
│   ├── local.md          # Локальная установка
│   ├── docker.md         # Docker установка
│   └── requirements.md   # Требования
├── getting-started/       # Начало работы
│   ├── index.md          # Обзор
│   ├── first-estimate.md # Первая смета
│   └── interface.md      # Интерфейс
├── working-with-estimates/ # Работа со сметами
│   ├── index.md          # Обзор
│   ├── creating.md       # Создание
│   ├── editing.md        # Редактирование
│   ├── calculations.md   # Расчёты
│   └── printing.md       # Печать
├── catalogs/             # Каталоги
│   ├── index.md          # Обзор
│   ├── managing.md       # Управление
│   └── import-export.md  # Импорт/экспорт
├── advanced-features/    # Продвинутые функции
│   ├── index.md          # Обзор
│   ├── bulk-operations.md # Массовые операции
│   ├── templates.md      # Шаблоны
│   └── backup-restore.md # Backup/Restore
├── tips-and-tricks/      # Советы и трюки
│   ├── index.md          # Обзор
│   ├── keyboard-shortcuts.md # Горячие клавиши
│   └── workflows.md      # Паттерны работы
└── troubleshooting/      # Решение проблем
    ├── index.md          # Обзор
    ├── faq.md            # FAQ
    └── common-issues.md  # Типичные проблемы
```

### Developer Guide (Руководство разработчика)

```
ru/developer-guide/
├── api-reference/        # API Reference
│   ├── index.md          # Обзор всех API
│   ├── estimates.md      # Estimates API
│   ├── catalogs.md       # Catalogs API
│   ├── backups.md        # Backups API
│   ├── export-import.md  # Export/Import API
│   └── system.md         # System/Health API
├── architecture/         # Архитектура
│   ├── index.md          # Обзор
│   ├── overview.md       # Общая архитектура
│   ├── database.md       # SQLite схема
│   ├── data-flow.md      # Поток данных
│   └── business-logic.md # Бизнес-логика
├── deployment/           # Развёртывание
│   ├── index.md          # Обзор
│   ├── docker.md         # Docker Compose
│   ├── production.md     # Production setup
│   └── monitoring.md     # Мониторинг
├── development/          # Разработка
│   └── testing.md        # Тестирование
└── history/              # История
    ├── index.md          # Обзор
    └── changelog.md      # Changelog
```

---

## 🚀 Quick Start Paths

### Путь 1: "Хочу попробовать за 30 минут"
1. [Local Installation](ru/user-guide/installation/local.md) - 10 мин
2. [First Estimate](ru/user-guide/getting-started/first-estimate.md) - 15 мин
3. [Print](ru/user-guide/working-with-estimates/printing.md) - 5 мин

### Путь 2: "Хочу развернуть в production"
1. [Docker Deployment](ru/developer-guide/deployment/docker.md) - 15 мин
2. [Production Setup](ru/developer-guide/deployment/production.md) - 30 мин
3. [Monitoring](ru/developer-guide/deployment/monitoring.md) - 15 мин

### Путь 3: "Хочу интегрировать API"
1. [API Overview](ru/developer-guide/api-reference/index.md) - 10 мин
2. [Estimates API](ru/developer-guide/api-reference/estimates.md) - 20 мин
3. [Catalogs API](ru/developer-guide/api-reference/catalogs.md) - 20 мин

---

## 🔗 Внешние ресурсы

- **GitHub:** https://github.com/your-repo/quote-calculator
- **Issue Tracker:** https://github.com/your-repo/quote-calculator/issues
- **Changelog:** [History](ru/developer-guide/history/changelog.md)
- **Quick Reference:** [QUICK_REFERENCE.md](QUICK_REFERENCE.md)

---

## 📝 Соглашения в документации

### Форматирование кода

**JavaScript:**
```javascript
const estimate = await api.getEstimate('est_001');
```

**Bash:**
```bash
curl http://localhost:4000/api/estimates/est_001
```

**SQL:**
```sql
SELECT * FROM estimates WHERE id = 'est_001';
```

### Метки

- ✅ - Функция реализована
- ❌ - Функция не реализована
- ⚠️ - Предупреждение
- 📝 - Примечание
- 🔧 - В разработке

### Приоритеты

- **P0** - Критично
- **P1** - Высокий
- **P2** - Средний
- **P3** - Низкий

---

**Назад:** [Documentation Home](index.md)
**Quick Reference:** [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
