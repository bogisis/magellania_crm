# Documentation Consolidation Plan

> **Created:** 5 ноября 2025
> **Status:** 📋 Planning Phase

---

## 📊 Inventory

**Found:** 42 документа требующих организации
- Корневая директория: 24 MD файла
- docs/ папка: 18 MD файлов

---

## 🗂️ Mapping: Старые файлы → Новая структура

### 1. Getting Started (Developer Guide)

**Назначение:** docs/ru/developer-guide/getting-started/

| Старый файл | Новый файл | Действие |
|-------------|-----------|----------|
| SETUP_INSTRUCTIONS.md | setup.md | Переместить + переименовать |
| QUICK_START_DB_MIGRATION.md | Включить в setup.md | Объединить |
| docs/README.md | Удалить | Устарел (заменён новым index.md) |

---

### 2. Architecture (Developer Guide)

**Назначение:** docs/ru/developer-guide/architecture/

| Старый файл | Новый файл | Действие |
|-------------|-----------|----------|
| docs/ARCHITECTURE.md | overview.md | Переместить + переименовать |
| docs/DATA_FLOW_ARCHITECTURE.md | data-flow.md | ✅ УЖЕ скопирован |
| SQLITE_INTEGRATION_SUMMARY.md | storage.md | Переместить в architecture/ |
| docs/DB_INTEGRATION_README.md | Включить в storage.md | Объединить |
| docs/SQLITE_MIGRATION_GUIDE.md | Включить в storage.md | Объединить |

---

### 3. Deployment (Developer Guide)

**Назначение:** docs/ru/developer-guide/deployment/

| Старый файл | Новый файл | Действие |
|-------------|-----------|----------|
| DEPLOYMENT.md | production.md | Переместить |
| DOCKER.md | docker.md | Переместить |
| README_DOCKER.md | Включить в docker.md | Объединить |
| DOCKER_IMPLEMENTATION_SUMMARY.md | Включить в docker.md | Объединить |
| docs/DOCKER_DEPLOYMENT.md | Включить в docker.md | Объединить |
| docs/DEPLOYMENT_WORKFLOW.md | Включить в production.md | Объединить |
| DAY4_DEPLOYMENT_SUMMARY.md | Архивировать | История |
| PRODUCTION_READY_DAY5_FINAL.md | Архивировать | История |
| PRODUCTION_READINESS_FINAL_DAY5.md | Архивировать | История |

**Итого:** 3 файла (production.md, docker.md, migration.md)

---

### 4. API Reference (Developer Guide)

**Назначение:** docs/ru/developer-guide/api-reference/

| Старый файл | Новый файл | Действие |
|-------------|-----------|----------|
| API_EXPORT_IMPORT.md | backups.md | Переместить + переименовать |

**TODO:** Создать недостающие:
- estimates.md (GET, POST, PUT, DELETE endpoints)
- catalogs.md (каталоги API)

---

### 5. Development (Developer Guide)

**Назначение:** docs/ru/developer-guide/development/

| Старый файл | Новый файл | Действие |
|-------------|-----------|----------|
| REFACTORING_SUMMARY.md | Включить в workflow.md | Объединить |

**TODO:** Создать недостающие:
- workflow.md (git flow, code review, CI/CD)
- testing.md (как писать тесты)
- debugging.md (отладка приложения)

---

### 6. Testing Documentation

**Назначение:** docs/ru/developer-guide/development/testing.md (консолидировано)

| Старый файл | Новый файл | Действие |
|-------------|-----------|----------|
| TEST_RESULTS_ANALYSIS.md | Включить в testing.md | Объединить |
| TEST_RESULTS_P0_P1_FIXED.md | Архивировать | История |
| FINAL_TEST_RESULTS.md | Включить в testing.md | Объединить |
| TEST_RESULTS_DAY3.md | Архивировать | История |
| TEST_RESULTS_DAY5.md | Архивировать | История |
| playwright-http-test-report.md | Архивировать | История |
| FINAL_TEST_REPORT.md | Включить в testing.md | Объединить |

**Результат:** Один файл testing.md с примерами тестирования + архив отчётов

---

### 7. Troubleshooting (Developer Guide)

**Назначение:** docs/ru/developer-guide/troubleshooting/

| Старый файл | Новый файл | Действие |
|-------------|-----------|----------|
| ERROR_CATEGORIZATION.md | common-errors.md | Переместить |
| docs/CRITICAL_ISSUES.md | Включить в common-errors.md | Объединить |

**TODO:** Создать:
- debugging.md (как дебажить)

---

### 8. History (Developer Guide)

**Назначение:** docs/ru/developer-guide/history/

| Старый файл | Новый файл | Действие |
|-------------|-----------|----------|
| docs/CHANGELOG.md | changelog.md | Переместить |
| WORKFLOW_FIX_SUMMARY.md | Включить в changelog.md | Объединить |
| CRITICAL_FIXES_SUMMARY.md | Включить в changelog.md | Объединить |
| FIXES_SUMMARY_2025-11-03.md | Включить в changelog.md | Объединить |
| docs/НОВЫЕ_ФУНКЦИИ_v2.2.0.md | Включить в changelog.md | Объединить |
| docs/CLEANUP_REPORT.md | migrations.md | Переместить |
| docs/TASK_1_REPORT.md | Архивировать | Устарело |
| docs/TASK_2_REPORT.md | Архивировать | Устарело |
| docs/TASK_3_REPORT.md | Архивировать | Устарело |
| docs/PHASE_1_PLAN.md | Архивировать | Устарело |
| docs/PHASE_1_RESULTS.md | Архивировать | Устарело |

**Результат:**
- changelog.md (полная история изменений)
- migrations.md (руководства по миграции)

---

### 9. User Guide

**Назначение:** docs/ru/user-guide/

| Старый файл | Новый файл | Действие |
|-------------|-----------|----------|
| README.md | installation/local.md | Извлечь секцию установки |
| SETUP_INSTRUCTIONS.md | installation/local.md | Упрощённая версия для пользователей |

**TODO (ВЫСОКИЙ ПРИОРИТЕТ):** Создать недостающие user guide:
- installation/index.md
- installation/docker.md
- installation/requirements.md
- getting-started/index.md
- getting-started/first-estimate.md
- getting-started/interface.md
- working-with-estimates/*.md
- catalogs/*.md
- advanced-features/*.md
- tips-and-tricks/*.md
- troubleshooting/*.md

---

## 📦 Архивация

**Создать:** `docs/_archive/` папка для устаревших документов

### Файлы для архивации (не удалять, но скрыть)

```
docs/_archive/
├── test-reports/
│   ├── TEST_RESULTS_P0_P1_FIXED.md
│   ├── TEST_RESULTS_DAY3.md
│   ├── TEST_RESULTS_DAY5.md
│   ├── playwright-http-test-report.md
│   └── FINAL_TEST_REPORT.md
├── deployment-history/
│   ├── DAY4_DEPLOYMENT_SUMMARY.md
│   ├── PRODUCTION_READY_DAY5_FINAL.md
│   └── PRODUCTION_READINESS_FINAL_DAY5.md
├── phase-reports/
│   ├── TASK_1_REPORT.md
│   ├── TASK_2_REPORT.md
│   ├── TASK_3_REPORT.md
│   ├── PHASE_1_PLAN.md
│   └── PHASE_1_RESULTS.md
└── old-readme/
    └── docs-README.md
```

---

## ✅ Приоритеты выполнения

### P0 (Критический - Сейчас)

1. ✅ **Data Integrity** - УЖЕ ВЫПОЛНЕНО
2. 🔄 **Deployment docs** - Консолидировать Docker/Production
3. 🔄 **History/Changelog** - Объединить все фиксы

### P1 (Высокий - Следующий)

4. **Architecture** - Консолидировать архитектурные документы
5. **Testing** - Создать единый testing.md
6. **Getting Started** - Setup для разработчиков

### P2 (Средний)

7. **API Reference** - Документировать все endpoints
8. **Troubleshooting** - Консолидировать ошибки

### P3 (Низкий - Позже)

9. **User Guide** - Создать полную пользовательскую документацию
10. **English translation** - Перевести на английский

---

## 📊 Статистика

### До консолидации

- Всего файлов: 42
- Duplicate content: ~40%
- Неструктурированные: 100%

### После консолидации (план)

- Основные файлы: ~25
- Архивные файлы: ~17
- Duplicate content: 0%
- Структурированные: 100%
- Searchable в MkDocs: ✅

---

## 🎯 Execution Plan

### Этап 1: Deployment (P0)

```bash
# 1. Создать docker.md
cat DOCKER.md README_DOCKER.md DOCKER_IMPLEMENTATION_SUMMARY.md docs/DOCKER_DEPLOYMENT.md \
    > docs/ru/developer-guide/deployment/docker.md

# 2. Создать production.md
cat DEPLOYMENT.md docs/DEPLOYMENT_WORKFLOW.md \
    > docs/ru/developer-guide/deployment/production.md

# 3. Архивировать временные отчёты
mkdir -p docs/_archive/deployment-history
mv PRODUCTION_READY_DAY5_FINAL.md docs/_archive/deployment-history/
mv PRODUCTION_READINESS_FINAL_DAY5.md docs/_archive/deployment-history/
mv DAY4_DEPLOYMENT_SUMMARY.md docs/_archive/deployment-history/
```

### Этап 2: History/Changelog (P0)

```bash
# 1. Консолидировать changelog
cat docs/CHANGELOG.md WORKFLOW_FIX_SUMMARY.md CRITICAL_FIXES_SUMMARY.md \
    FIXES_SUMMARY_2025-11-03.md docs/НОВЫЕ_ФУНКЦИИ_v2.2.0.md \
    > docs/ru/developer-guide/history/changelog.md

# 2. Создать migrations.md
mv docs/CLEANUP_REPORT.md docs/ru/developer-guide/history/migrations.md

# 3. Архивировать phase reports
mkdir -p docs/_archive/phase-reports
mv docs/TASK_*.md docs/_archive/phase-reports/
mv docs/PHASE_*.md docs/_archive/phase-reports/
```

### Этап 3: Testing (P1)

```bash
# 1. Создать testing.md
cat TEST_RESULTS_ANALYSIS.md FINAL_TEST_RESULTS.md FINAL_TEST_REPORT.md \
    > docs/ru/developer-guide/development/testing.md

# 2. Архивировать test reports
mkdir -p docs/_archive/test-reports
mv TEST_RESULTS_P0_P1_FIXED.md docs/_archive/test-reports/
mv TEST_RESULTS_DAY3.md docs/_archive/test-reports/
mv TEST_RESULTS_DAY5.md docs/_archive/test-reports/
mv playwright-http-test-report.md docs/_archive/test-reports/
```

### Этап 4: Architecture (P1)

```bash
# 1. Создать overview.md
mv docs/ARCHITECTURE.md docs/ru/developer-guide/architecture/overview.md

# 2. Создать storage.md
cat SQLITE_INTEGRATION_SUMMARY.md docs/DB_INTEGRATION_README.md \
    docs/SQLITE_MIGRATION_GUIDE.md \
    > docs/ru/developer-guide/architecture/storage.md
```

---

## 🔄 Validation Checklist

После каждого этапа:

- [ ] Все ссылки работают (mkdocs build без warnings)
- [ ] Нет дубликатов контента
- [ ] Форматирование Markdown корректное
- [ ] Навигация в mkdocs.yml обновлена
- [ ] Старые файлы перенесены в _archive/
- [ ] Site regenerated: `mkdocs build`

---

## 📝 Notes

### Важные решения

1. **Не удаляем старые файлы** - архивируем в `docs/_archive/`
2. **Сохраняем историю** - test reports и deployment summaries остаются
3. **Консолидируем похожие** - несколько Docker docs → один docker.md
4. **Приоритет P0** - Deployment и History первыми (нужны прямо сейчас)

### Будущие улучшения

- Автоматизировать консолидацию (скрипт на Python)
- Добавить link checker в CI/CD
- Генерировать TOC автоматически
- Добавить version tags для каждого документа

---

[← Назад к организации документации](DOCUMENTATION_REORGANIZATION_SUMMARY.md)
