# Руководство разработчика

> **Техническая документация Quote Calculator v2.3.0**

---

## 👨‍💻 Для кого это руководство

**Это руководство предназначено для:**
- Backend и Frontend разработчиков
- DevOps инженеров
- Технических специалистов
- Contributors и maintainers проекта

**НЕ для пользователей:** Если вы ищете инструкции по работе с программой, см. [Руководство пользователя](../user-guide/index.md)

---

## 📖 Содержание руководства

### 1. [Начало работы](getting-started/index.md)

Настройка окружения разработки:
- [Setup инструкции](getting-started/setup.md) - установка зависимостей
- [Структура проекта](getting-started/project-structure.md) - обзор файлов

**Время освоения:** 30-60 минут

---

### 2. [Архитектура](architecture/index.md)

Дизайн системы:
- [Обзор архитектуры](architecture/overview.md) - высокоуровневый дизайн
- [Frontend архитектура](architecture/frontend.md) - 512KB монолит
- [Backend архитектура](architecture/backend.md) - Express.js REST API
- [Storage слой](architecture/storage.md) - SQLite + better-sqlite3

**Время освоения:** 2-3 часа

---

### 3. [Справочник API](api-reference/index.md)

REST API документация:
- [Estimates API](api-reference/estimates.md) - CRUD операции для смет
- [Catalogs API](api-reference/catalogs.md) - управление каталогами
- [Backups API](api-reference/backups.md) - резервное копирование

**Время освоения:** 1-2 часа

---

### 4. [Разработка](development/index.md)

Процесс разработки:
- [Development Workflow](development/workflow.md) - как вносить изменения
- [Testing](development/testing.md) - Jest + Supertest стратегия
- [Debugging](development/debugging.md) - инструменты отладки

**Время освоения:** 2-3 часа

---

### 5. [Функционал](features/index.md)

Ключевые фичи системы:
- [Расчеты](features/calculations.md) - бизнес-логика расчетов
- [Автосохранение](features/autosave.md) - debounced autosave
- [Bulk операции](features/bulk-operations.md) - массовые действия

**Время освоения:** 1-2 часа

---

### 6. [Развертывание](deployment/index.md)

Production deployment:
- [Production готовность](deployment/production.md) - чек-лист
- [Docker развертывание](deployment/docker.md) - контейнеризация
- [Миграция данных](deployment/migration.md) - переход на SQLite

**Время освоения:** 2-4 часа

---

### 7. 🔥 [Целостность данных](data-integrity/index.md) **КРИТИЧНО**

**⚠️ ОБЯЗАТЕЛЬНО К ПРОЧТЕНИЮ ПЕРЕД ЛЮБЫМИ ИЗМЕНЕНИЯМИ**

Критичные паттерны архитектуры:
- [ID-First Pattern](data-integrity/id-first-pattern.md) - UUID как первичный ключ
- [Single Source of Truth](data-integrity/single-source-truth.md) - одна таблица
- [Data Flow Architecture](data-integrity/data-flow.md) - потоки данных

**Время освоения:** 1-2 часа
**Важность:** P0 - КРИТИЧНО

---

### 8. [Решение проблем](troubleshooting/index.md)

Отладка и диагностика:
- [Debugging Guide](troubleshooting/debugging.md) - как найти проблему
- [Частые ошибки](troubleshooting/common-errors.md) - и как их исправить

**Время освоения:** 30-60 минут

---

### 9. [История изменений](history/index.md)

Эволюция проекта:
- [Changelog](history/changelog.md) - полная история версий
- [Миграции](history/migrations.md) - breaking changes

**Справочная секция**

---

## 🚀 Quick Start для разработчиков

### Минимальный путь "от клона до первого коммита"

```bash
# 1. Клонировать репозиторий (2 мин)
git clone https://github.com/yourorg/quote-calculator.git
cd quote-calculator

# 2. Установить зависимости (3 мин)
npm install

# 3. Запустить тесты (1 мин)
npm test

# 4. Запустить dev сервер (1 мин)
npm start

# 5. Открыть приложение
open index.html

# 6. Внести изменения → commit
git checkout -b feature/my-feature
# ... edit code ...
npm test  # Убедиться что тесты проходят
git commit -m "Add feature X"
git push origin feature/my-feature
```

**Полное освоение кодовой базы:** 10-15 часов работы

[Подробная инструкция →](getting-started/setup.md)

---

## 🏗️ Архитектурный обзор

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  FRONTEND (index.html)                   │
│   - ProfessionalQuoteCalculator class (9979 lines)      │
│   - Vanilla JS ES6+ (no frameworks)                     │
│   - Material Design UI                                   │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP REST API
                     ↓
┌─────────────────────────────────────────────────────────┐
│              BACKEND (server-with-db.js)                 │
│   - Express.js REST API (port 3000)                      │
│   - APIClient.js для взаимодействия                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│           STORAGE (SQLiteStorage.js)                     │
│   - better-sqlite3 (synchronous)                         │
│   - Single Source of Truth pattern                       │
│   - ID-First architecture                                │
└─────────────────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              DATABASE (estimates.db)                     │
│   - Table: estimates (id PK, filename, data, ...)       │
│   - Optimistic locking (data_version)                    │
│   - Metadata fields                                      │
└─────────────────────────────────────────────────────────┘
```

[Подробнее об архитектуре →](architecture/overview.md)

---

## 🔥 Критически важно - ID-First Pattern

### ⚠️ НЕЛЬЗЯ НАРУШАТЬ

Система построена на **ID-First архитектуре** с **Single Source of Truth**:

```javascript
// ✅ ПРАВИЛЬНО
const id = generateId();  // UUID
await saveEstimate(id, data);
await loadEstimate(id);
await deleteEstimate(id);

// ❌ НЕПРАВИЛЬНО
await saveEstimate(filename, data);     // filename НЕ первичный ключ!
await loadEstimate(filename);            // filename может меняться!
await saveEstimate(id, data);            // Двойное сохранение -
await saveBackup(id, data);              // источник рассинхронизации!
```

**Ключевые принципы:**
1. **ID = Primary Key** - UUID неизменен всю жизнь сметы
2. **filename = Display Name** - может меняться (rename)
3. **Single Source** - ТОЛЬКО таблица `estimates`, НЕТ backups для runtime
4. **Optimistic Locking** - `data_version` для конкурентных изменений

[🔥 ОБЯЗАТЕЛЬНО ПРОЧИТАТЬ →](data-integrity/index.md)

---

## 📊 Технический стек

### Frontend
```yaml
Language: Vanilla JavaScript ES6+
Size: 512KB, 9979 lines (монолит)
Class: ProfessionalQuoteCalculator
Pattern: MVC-like с state management
Libs: Нет (чистый JS)
```

### Backend
```yaml
Runtime: Node.js 18+
Framework: Express.js 4.x
API: REST (JSON)
Port: 3000
```

### Storage
```yaml
Database: SQLite 3.x
Driver: better-sqlite3 (sync)
Pattern: Single Source of Truth
Key: UUID (ID-First)
```

### Testing
```yaml
Unit tests: Jest
API tests: Supertest
Coverage: 20/20 tests passing
```

### Documentation
```yaml
Tool: MkDocs Material
Format: Markdown
i18n: ru/en готовность
```

---

## 🔄 Development Workflow

### Типичный workflow для feature

```bash
# 1. Создать ветку от main
git checkout main
git pull origin main
git checkout -b feature/my-awesome-feature

# 2. Внести изменения
# ... edit code in your editor ...

# 3. Запустить тесты
npm test

# 4. Если тесты падают - исправить
# ... fix issues ...
npm test  # повторить до success

# 5. Commit с конвенциональным сообщением
git add .
git commit -m "feat: add awesome feature X

- Implement functionality Y
- Add tests for Z
- Update documentation

Fixes #123"

# 6. Push и создать PR
git push origin feature/my-awesome-feature
# Создать Pull Request на GitHub

# 7. Code Review → Merge
# После одобрения → merge в main
```

[Подробнее о workflow →](development/workflow.md)

---

## ⚠️ Известные ограничения

### Архитектурные

**1. Монолитный Frontend (P0 - критично)**
- **Проблема:** 512KB, 9979 строк в одном файле
- **Риск:** Сложность поддержки, медленная разработка
- **Митигация:** Планируется модуляризация в v3.0
- **Приоритет:** P0

**2. Отсутствие транзакций между estimate/backup (P0 - критично)**
```javascript
// ПРОБЛЕМА: нет атомарности
await saveEstimate(id, data);  // Может упасть
await saveBackup(id, data);    // Может упасть
// → рассинхронизация данных
```
- **Митигация:** Транзакционная обёртка в разработке
- **Приоритет:** P0

**3. Autosave race conditions (P1 - высокий)**
- **Проблема:** Autosave может срабатывать во время load
- **Митигация:** Guard flags (`isLoadingQuote`)
- **Приоритет:** P1

[Полный список ограничений →](architecture/overview.md#limitations)

---

## 📈 Roadmap

### Ближайшие версии

**v2.4.0** (Q1 2026)
- Транзакционное сохранение
- Error boundaries
- Улучшенный error handling

**v2.5.0** (Q2 2026)
- Начало модуляризации
- Извлечение CSS в отдельные файлы
- Разделение класса на модули

**v3.0.0** (Q3 2026)
- Полная модуляризация
- State Manager с undo/redo
- Единое хранилище (Vuex/Redux-like)

[Полный roadmap →](history/changelog.md)

---

## 🧪 Тестирование

### Текущее покрытие

✅ **Backend API:** 11/11 тестов
- server.test.js
- Estimates CRUD
- Catalogs API
- Backups API

✅ **Utils:** 10/10 тестов
- utils.test.js
- transliterate()
- generateId()

⚠️ **Frontend:** Нет unit тестов
- Планируется после модуляризации
- Сейчас только manual testing

```bash
# Запустить все тесты
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

[Подробнее о тестировании →](development/testing.md)

---

## 📞 Для contributors

### Хотите внести вклад?

1. **Прочитайте [Development Workflow](development/workflow.md)**
2. **ОБЯЗАТЕЛЬНО изучите [Data Integrity](data-integrity/index.md)**
3. Найдите issue или создайте новую
4. Создайте feature branch
5. Напишите тесты
6. Создайте Pull Request

### Code Review Process

- Минимум 1 approver для merge
- Все тесты должны проходить
- Code style: ESLint + Prettier
- Commit messages: Conventional Commits

---

## 🗺️ Навигация

**Быстрые ссылки:**
- [← Назад на главную](../../index.md)
- [Setup инструкции →](getting-started/setup.md)
- [Архитектура →](architecture/index.md)
- [🔥 Целостность данных (КРИТИЧНО) →](data-integrity/index.md)
- [Руководство пользователя →](../user-guide/index.md)

**Критичные разделы (читать обязательно):**
- [ID-First Pattern](data-integrity/id-first-pattern.md)
- [Single Source of Truth](data-integrity/single-source-truth.md)
- [Data Flow Architecture](data-integrity/data-flow.md)
