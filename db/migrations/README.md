# Database Migrations

Данная папка содержит SQL миграции для Quote Calculator v3.0.0

## Миграции для v3.0 (Multi-Tenancy)

### Migration 006: Add Multi-Tenancy Fields
**Файл:** `006_add_multi_tenancy_fields.sql`
**Описание:** Добавляет поля для multi-tenancy во все таблицы, создаёт новые таблицы (organizations, users, settings, backups, audit_logs)

**Изменения:**
- Добавляет `organization_id`, `owner_id`, `visibility`, `shared_with` в `estimates`
- Добавляет `organization_id`, `owner_id`, `visibility` в `catalogs`
- Создаёт таблицу `organizations`
- Создаёт таблицу `users`
- Создаёт таблицу `settings`
- Создаёт таблицу `backups`
- Создаёт таблицу `audit_logs`
- Создаёт базовые индексы

**Статус:** Nullable fields (NOT NULL будет установлен в migration 008)

---

### Migration 007: Migrate Existing Data
**Файл:** `007_migrate_existing_data.sql`
**Описание:** Создаёт дефолтную организацию и админа, мигрирует существующие данные

**Изменения:**
- Создаёт организацию `default-org` с планом Pro
- Создаёт пользователя `admin@localhost` с паролем `admin123`
- Обновляет все существующие estimates: устанавливает `organization_id = 'default-org'`, `owner_id = 'admin-user-id'`
- Обновляет все существующие catalogs аналогично
- Создаёт дефолтные settings для app, organization и user
- Обновляет счётчики в organizations
- Создаёт audit log запись о миграции

**ВАЖНО:** Пароль admin123 ДОЛЖЕН быть изменён после первого входа!

---

### Migration 008: Make Fields NOT NULL
**Файл:** `008_make_fields_not_null.sql`
**Описание:** Устанавливает NOT NULL constraint на multi-tenancy поля, создаёт triggers

**Изменения:**
- Пересоздаёт таблицу `estimates` с `organization_id NOT NULL`, `owner_id NOT NULL`
- Пересоздаёт таблицу `catalogs` с `organization_id NOT NULL`, `owner_id NOT NULL`
- Воссоздаёт все индексы
- Создаёт triggers для auto-update `updated_at` полей
- Добавляет дополнительные индексы для производительности

**ВАЖНО:** Эта миграция ДОЛЖНА запускаться ПОСЛЕ 006 и 007!

---

## Применение миграций

### Автоматический способ (рекомендуется)

```bash
# Применить все новые миграции
node db/migrations/runner.js up

# Применить конкретную миграцию
node db/migrations/runner.js up 006

# Откатить последнюю миграцию
node db/migrations/runner.js down

# Откатить до конкретной версии
node db/migrations/runner.js down 005
```

### Ручной способ (для отладки)

```bash
# Применить миграцию вручную
sqlite3 db/quotes.db < db/migrations/006_add_multi_tenancy_fields.sql
sqlite3 db/quotes.db < db/migrations/007_migrate_existing_data.sql
sqlite3 db/quotes.db < db/migrations/008_make_fields_not_null.sql
```

---

## Проверка миграций

### После Migration 006

```sql
-- Проверить что таблицы созданы
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;

-- Проверить структуру estimates
PRAGMA table_info(estimates);

-- Проверить индексы
SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';
```

### После Migration 007

```sql
-- Проверить организацию
SELECT * FROM organizations WHERE id = 'default-org';

-- Проверить админа
SELECT id, email, username, role FROM users WHERE id = 'admin-user-id';

-- Проверить что все estimates мигрированы
SELECT COUNT(*) FROM estimates WHERE organization_id IS NULL;  -- Должно быть 0

-- Проверить счётчики
SELECT current_users_count, current_estimates_count, current_catalogs_count
FROM organizations WHERE id = 'default-org';
```

### После Migration 008

```sql
-- Проверить NOT NULL constraints
PRAGMA table_info(estimates);  -- organization_id и owner_id должны быть NOT NULL

-- Проверить triggers
SELECT name FROM sqlite_master WHERE type='trigger';

-- Проверить foreign keys
PRAGMA foreign_keys;  -- Должно быть 1 (ON)

-- Проверить количество записей (не должно измениться)
SELECT COUNT(*) FROM estimates;
```

---

## Rollback Plan

### Откат Migration 008

```sql
-- Migration 008 является реструктуризацией таблиц
-- Откат возможен через создание таблиц со старой структурой

BEGIN TRANSACTION;

-- Пересоздать таблицу без NOT NULL
CREATE TABLE estimates_old AS SELECT * FROM estimates;
DROP TABLE estimates;
CREATE TABLE estimates (...);  -- Старая структура
INSERT INTO estimates SELECT * FROM estimates_old;
DROP TABLE estimates_old;

COMMIT;
```

### Откат Migration 007

```sql
-- Удалить мигрированные данные
DELETE FROM organizations WHERE id = 'default-org';
DELETE FROM users WHERE id = 'admin-user-id';
DELETE FROM settings;

-- Очистить multi-tenancy поля в estimates
UPDATE estimates SET organization_id = NULL, owner_id = NULL, visibility = NULL;
UPDATE catalogs SET organization_id = NULL, owner_id = NULL, visibility = NULL;
```

### Откат Migration 006

```sql
-- Удалить созданные таблицы
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS backups;
DROP TABLE IF EXISTS audit_logs;

-- Удалить добавленные колонки (SQLite не поддерживает ALTER TABLE DROP COLUMN)
-- Требуется пересоздание таблиц
```

---

## Безопасность при миграции

### Backup ПЕРЕД миграцией

```bash
# Создать backup БД
cp db/quotes.db db/quotes.db.backup-$(date +%s)

# Экспортировать в SQL dump
sqlite3 db/quotes.db .dump > db/quotes_backup.sql

# Проверить размер backup
ls -lh db/quotes.db.backup-*
```

### Восстановление из backup

```bash
# Если миграция провалилась, восстановить из backup
cp db/quotes.db.backup-TIMESTAMP db/quotes.db

# Или из SQL dump
sqlite3 db/quotes.db < db/quotes_backup.sql
```

---

## Порядок применения для Production

### День миграции

**09:00 - Подготовка**
- [ ] Уведомить пользователей о downtime
- [ ] Создать backup БД
- [ ] Экспортировать данные в JSON
- [ ] Проверить версии приложения

**09:30 - Остановка приложения**
```bash
docker compose down
```

**09:35 - Применение миграций**
```bash
# Migration 006
node db/migrations/runner.js up 006

# Migration 007
node db/migrations/runner.js up 007

# Migration 008
node db/migrations/runner.js up 008
```

**10:00 - Проверка**
```bash
# Запустить verification queries из каждой миграции
sqlite3 db/quotes.db < db/migrations/verify.sql
```

**10:15 - Запуск приложения**
```bash
docker compose up -d
```

**10:30 - Финальная проверка**
- [ ] Войти как admin@localhost
- [ ] Проверить список смет
- [ ] Создать тестовую смету
- [ ] Проверить autosave

---

## Известные проблемы

### SQLite limitations

1. **ALTER TABLE DROP COLUMN не поддерживается**
   - Решение: Создать новую таблицу, скопировать данные, удалить старую

2. **ALTER COLUMN для добавления NOT NULL не поддерживается**
   - Решение: Migration 008 пересоздаёт таблицы с правильными constraints

3. **Foreign keys по умолчанию отключены**
   - Решение: `PRAGMA foreign_keys=ON` в начале каждой сессии

### Password hash в Migration 007

Placeholder password hash в миграции 007 НЕ валиден. Перед применением:

1. Сгенерировать реальный bcrypt hash:
```javascript
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash('admin123', 10);
console.log(hash);
```

2. Заменить placeholder в `007_migrate_existing_data.sql`

---

## Контрольный список

### Перед миграцией
- [ ] Создан backup БД
- [ ] Экспортированы данные в JSON
- [ ] Проверена версия SQLite (>= 3.35.0)
- [ ] Уведомлены пользователи
- [ ] Password hash сгенерирован и вставлен в migration 007

### После миграции
- [ ] Все миграции применены успешно
- [ ] Verification queries выполнены
- [ ] Foreign keys включены
- [ ] Triggers работают
- [ ] Приложение запускается
- [ ] Логин работает
- [ ] Сметы отображаются
- [ ] Autosave работает

---

## Помощь

При проблемах с миграциями:

1. Проверить логи: `db/migrations/migration.log`
2. Проверить integrity: `sqlite3 db/quotes.db "PRAGMA integrity_check;"`
3. Откатить к backup: `cp db/quotes.db.backup-TIMESTAMP db/quotes.db`
4. Связаться с Architecture Team

---

**Последнее обновление:** 19 ноября 2025
**Версия:** 3.0.0
