# 🔧 Исправление: Удаление .json расширения из filename в БД

**Дата:** 29 ноября 2025
**Приоритет:** P1 (High) - Предотвращает потенциальные ошибки
**Статус:** ✅ Исправлено и протестировано

---

## 📊 Обнаруженная проблема

### Симптомы
При проверке базы данных после фикса UUID collision обнаружено **несоответствие формата filename**:

```sql
-- ДО миграции:
800cf29617e8 | andrey_smirnov_aktualno_2025-12-01_5pax_800cf29617e8           | БЕЗ .json ✅
cc23fa15992a | tatyana_fedorova_2025-11-27_6pax_cc23fa15992a.json              | С .json   ❌
5ab54b8b35c5 | andrey_smirnov_2025-12-01_5pax_5ab54b8b35c5.json                | С .json   ❌
f8852964fcbc | dmitriy_saparov_2025-12-29_6pax_f8852964fcbc.json               | С .json   ❌
...
```

**Статистика:**
- ❌ **7 из 8 смет (87.5%)** имели `.json` в filename
- ✅ **1 из 8 смет (12.5%)** была в правильном формате

### Причина

**Timeline конфликтующих изменений:**

1. **Изначально (до commit d9af31d):**
   ```javascript
   // Старый код сохранял С расширением .json
   const filename = generateFilenameWithId({...});
   // Результат: "client_name_date_pax_id.json"
   await apiClient.saveEstimate(data, filename);
   ```

2. **После commit d9af31d (27 ноября 2025):**
   ```javascript
   // ✅ FIX: Autosave rename failing
   const newFilenameWithJson = this.generateFilenameWithId({...});
   const newFilename = newFilenameWithJson.replace(/\.json$/i, ''); // Remove .json

   await apiClient.renameEstimate(this.state.currentQuoteId, newFilename);
   ```

3. **Результат:**
   - Новые сметы сохраняются БЕЗ `.json`
   - Старые сметы всё ещё ИМЕЮТ `.json` в БД
   - **Несоответствие формата!**

---

## ⚠️ Риски и последствия

### Потенциальные проблемы БЕЗ миграции:

1. **ENOENT ошибки при переименовании:**
   ```javascript
   // Frontend отправляет (БЕЗ .json):
   PUT /api/estimates/f8852964fcbc/rename
   Body: { newFilename: "new_name_2025-11-29_6pax_f8852964fcbc" }

   // Но в БД filename:
   "dmitriy_saparov_2025-12-29_6pax_f8852964fcbc.json"

   // Потенциальный конфликт при проверке уникальности!
   ```

2. **Проблемы с фильтрацией и поиском:**
   - Поиск по filename будет работать некорректно
   - Дубликаты могут не определяться правильно

3. **Несоответствие ID-First Pattern:**
   - Документация требует: filename БЕЗ расширения
   - База данных: смесь форматов

---

## ✅ Решение - Migration 011

### Создана миграция:
**Файл:** `db/migrations/011_remove_json_extension_from_filenames.sql`

```sql
-- IDEMPOTENT: Safe to run multiple times
UPDATE estimates
SET
    filename = SUBSTR(filename, 1, LENGTH(filename) - 5),  -- Remove .json
    updated_at = strftime('%s', 'now')
WHERE filename LIKE '%.json'
  AND deleted_at IS NULL;
```

### Характеристики:
- ✅ **Idempotent** - безопасно запускать многократно
- ✅ **Обновляет updated_at** - отслеживание изменений
- ✅ **Только активные** - не трогает deleted_at IS NOT NULL
- ✅ **Селективная** - только filename с .json

---

## 🧪 Тестирование

### Локальное тестирование (PASSED ✅)

**ДО миграции:**
```sql
SELECT COUNT(*) FROM estimates WHERE filename LIKE '%.json';
-- Результат: 7
```

**Применение миграции:**
```bash
sqlite3 db/quotes.db < db/migrations/011_remove_json_extension_from_filenames.sql
```

**ПОСЛЕ миграции:**
```sql
SELECT COUNT(*) FROM estimates WHERE filename LIKE '%.json';
-- Результат: 0 ✅

-- Проверка всех filename:
SELECT id, filename FROM estimates ORDER BY created_at DESC LIMIT 8;
-- Все БЕЗ .json ✅
```

**Результат:** 100% успех - все filename теперь без `.json`

---

## 📦 Deployment на VPS

### Команды для применения на сервере:

```bash
# 1. SSH на сервер
ssh root@YOUR_SERVER_IP

cd /opt/quote-calculator

# 2. Backup БД (обязательно!)
docker run --rm \
  -v quote-prod-db:/data \
  -v /opt/backups:/backup \
  alpine tar czf /backup/pre-migration-011_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# 3. Pull новый код
git fetch origin
git pull origin db_initial_schema_refactoring

# 4. Проверить миграцию
cat db/migrations/011_remove_json_extension_from_filenames.sql

# 5. Применить миграцию (production БД)
docker-compose -f docker-compose.vps.yml exec quote-production \
  sqlite3 /app/db/quotes.db < /app/db/migrations/011_remove_json_extension_from_filenames.sql

# 6. Verify результат
docker-compose -f docker-compose.vps.yml exec quote-production \
  sqlite3 /app/db/quotes.db "SELECT COUNT(*) FROM estimates WHERE filename LIKE '%.json'"
# Должно быть: 0

# 7. Перезапустить контейнеры (опционально, но рекомендуется)
docker-compose -f docker-compose.vps.yml restart quote-production

echo "✅ Migration 011 applied successfully!"
```

---

## 🔍 Verification Checklist

После применения миграции проверить:

- [ ] Все filename БЕЗ `.json` расширения
  ```sql
  SELECT COUNT(*) FROM estimates WHERE filename LIKE '%.json';
  -- Должно быть: 0
  ```

- [ ] updated_at обновился для всех измененных смет
  ```sql
  SELECT id, filename, datetime(updated_at, 'unixepoch') as last_update
  FROM estimates
  ORDER BY updated_at DESC LIMIT 5;
  ```

- [ ] Сметы загружаются без ошибок в UI
  - Открыть https://crm.magellania.net
  - Проверить список смет
  - Загрузить старую смету (с коротким ID)
  - Загрузить новую смету (с UUID v4)

- [ ] Autosave работает корректно
  - Изменить client name
  - Проверить что нет 500 ошибок
  - Проверить что filename обновился БЕЗ .json

- [ ] Rename работает корректно
  - Переименовать смету
  - Проверить что нет ENOENT ошибок
  - Проверить новый filename БЕЗ .json

---

## 📈 Результаты

### До миграции:
- ❌ 87.5% смет с `.json` в filename
- ❌ Несоответствие формата
- ❌ Риск ENOENT ошибок
- ❌ Нарушение ID-First Pattern

### После миграции:
- ✅ 100% смет БЕЗ `.json` в filename
- ✅ Единый формат
- ✅ Соответствие ID-First Pattern
- ✅ Предотвращение ошибок

---

## 🔗 Связанные документы

- **Commit d9af31d:** 🐛 Fix: Autosave rename failing with 500 error
- **Commit fb31f75:** 🔥 CRITICAL: Fix UUID collisions causing data loss
- **Документация:** `docs/ru/developer-guide/data-integrity/id-first-pattern.md`
- **Migration:** `db/migrations/011_remove_json_extension_from_filenames.sql`

---

## 🎯 Выводы

### Что было сделано:
1. ✅ Обнаружено несоответствие формата filename (.json vs без)
2. ✅ Создана идемпотентная миграция 011
3. ✅ Протестировано локально (7 → 0 смет с .json)
4. ✅ Задокументировано решение
5. ✅ Подготовлены команды для VPS deployment

### Почему это важно:
- **Целостность данных:** Единый формат предотвращает ошибки
- **ID-First Pattern:** Соответствие архитектурным требованиям
- **Предотвращение багов:** Убирает потенциальные ENOENT/rename ошибки
- **Maintenance:** Упрощает будущую поддержку

### Следующие шаги:
1. Commit миграции и документации
2. Push в ветку db_initial_schema_refactoring
3. Применить на VPS production сервере
4. Verify все чеклисты выполнены

---

**Статус:** ✅ Ready for deployment
**Risk Level:** Low (idempotent migration, tested locally)
**Rollback:** Database backup created before migration
