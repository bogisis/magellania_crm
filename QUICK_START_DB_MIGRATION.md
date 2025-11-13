# Quick Start - SQLite Migration

## 🚀 5-минутный старт

### 1. Установить зависимости

```bash
npm install
```

### 2. Тестовая миграция (dry-run)

```bash
npm run migrate:dry-run
```

**Ожидаемый результат:**
```
✓ Estimates: 6 migrated, 0 failed, 0 skipped
✓ Backups: 6 migrated, 0 failed, 0 skipped
✓ Catalogs: 1 migrated, 0 failed, 0 skipped
```

### 3. Реальная миграция

```bash
npm run migrate:run
```

**Создается:** `db/quotes.db` и `migration_report.json`

### 4. Настроить .env

```bash
cp .env.example .env
echo "STORAGE_TYPE=sqlite" >> .env
```

### 5. Обновить server.js

```bash
# Backup текущего сервера
cp server.js server-old-file-storage.js

# Использовать новый сервер
cp server-with-db.js server.js
```

### 6. Запустить сервер

```bash
npm start
```

**Ожидаемый вывод:**
```
Storage configuration:
  Type: sqlite
  Dual-write: false

✓ Primary storage initialized

==================================================
Quote Calculator Server v2.3.0
==================================================
Server running on port 3000
Storage: sqlite
==================================================
```

### 7. Проверить

```bash
# Health check
curl http://localhost:3000/health | jq .

# Список смет
curl http://localhost:3000/api/estimates | jq '.estimates[0]'

# Открыть в браузере
open http://localhost:3000
```

## ✅ Готово!

Теперь приложение использует SQLite вместо файлов.

---

## 🔄 Откат (если нужно)

```bash
# 1. Остановить сервер
pkill -f "node server.js"

# 2. Вернуть старый server.js
cp server-old-file-storage.js server.js

# 3. Удалить .env (использовать file storage по умолчанию)
rm .env

# 4. Запустить
npm start
```

---

## 📚 Подробная документация

- **Полная инструкция:** `docs/SQLITE_MIGRATION_GUIDE.md`
- **Обзор интеграции:** `docs/DB_INTEGRATION_README.md`
- **Архитектура:** `docs/ARCHITECTURE.md`

---

## ❓ Проблемы?

### better-sqlite3 не устанавливается

```bash
# macOS/Linux
npm install better-sqlite3 --build-from-source

# Windows
npm install --global windows-build-tools
npm install better-sqlite3
```

### БД не создается

```bash
# Проверить права
mkdir -p db
chmod 755 db

# Проверить что схема на месте
ls -la db/schema.sql
```

### Сервер не запускается

```bash
# Проверить логи
npm start 2>&1 | tee server.log

# Проверить порт
lsof -i :3000
```

---

## 🎯 Преимущества SQLite vs Files

| Проблема | Files | SQLite |
|----------|-------|--------|
| Рассинхронизация | ❌ | ✅ ACID |
| Race conditions | ⚠️ Guards | ✅ Locking |
| Concurrent edits | ❌ | ✅ Версии |
| Backup | 📁 Папки | 📦 1 файл |
| Поиск | 🐌 Линейный | ⚡ Индексы |

---

**Время миграции:** ~5 минут
**Риски:** Минимальные (есть rollback)
**Рекомендация:** ✅ Выполнить миграцию
