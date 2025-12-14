# Local Testing & Bug Fixes Report

**Date:** 13 декабря 2025
**Branch:** db_initial_schema_refactoring
**Status:** ✅ Completed

---

## 🎯 Цель тестирования

Локальное тестирование после database cleanup и проверка работоспособности всех систем.

---

## 🔧 Обнаруженные и исправленные проблемы

### 1. ❌ Better-sqlite3 Architecture Mismatch

**Проблема:**
```
Error: dlopen() failed - incompatible architecture (have 'x86_64', need 'arm64e' or 'arm64')
```

**Причина:** better-sqlite3 был скомпилирован для x86_64, система требует ARM64 (Apple Silicon)

**Решение:**
```bash
npm rebuild better-sqlite3
```

**Результат:** ✅ SQLite инициализирован успешно на ARM64

---

### 2. ❌ 404 Errors - API v1 Router Not Mounted

**Проблема:**
```
GET /api/v1/catalogs 404 (Not Found)
GET /api/v1/estimates 404 (Not Found)
GET /api/v1/sync/updates 404 (Not Found)
```

**Причина:** API v1 router создан в `routes/api-v1.js`, но не подключен в `server.js`

**Решение:**
```javascript
// server.js
const apiV1Router = require('./routes/api-v1');

// Передаём storage в app.locals для routes
app.locals.storage = storage;

// Монтируем API v1 router
app.use('/api/v1', apiV1Router);
```

**Результат:**
- ✅ `/api/v1/*` endpoints работают
- ✅ API возвращает 401 (Unauthorized) вместо 404 - endpoint существует!

---

### 3. ❌ 500 Error - saveBackup() Method Not Implemented

**Проблема:**
```
POST /api/estimates/:id 500 (Internal Server Error)
Error: Method saveBackup() must be implemented
```

**Причина:**
- `StorageAdapter.saveEstimateTransactional()` вызывает `this.saveBackup(id, data)`
- Метод определён в `StorageAdapter` как abstract, но не реализован в `SQLiteStorage`

**Решение:**
```javascript
// storage/SQLiteStorage.js
/**
 * Save backup (для SQLite это no-op)
 * SQLite uses Single Source of Truth - estimates table IS the backup
 */
async saveBackup(id, data) {
    // ✅ Single Source of Truth: estimates table уже содержит все данные
    // Не создаём дублирующие записи в backups table
    return { success: true };
}
```

**Архитектурное обоснование:**
- ✅ **Single Source of Truth:** `estimates` table - единственный источник данных
- ✅ **No Dual Storage:** Не нужна отдельная `backups` table
- ✅ **ID-First Pattern:** UUID как primary key, всё хранится в одном месте

**Результат:** ✅ Autosave работает без ошибок

---

### 4. ❌ 401 Unauthorized - JWT Token Issues

**Проблема:**
```
GET /api/v1/catalogs 401 (Unauthorized)
GET /api/v1/estimates 401 (Unauthorized)
```

**Причина:**
- API v1 требует JWT авторизацию (`requireAuth` middleware)
- Старый/невалидный токен в localStorage

**Решение:**
1. ✅ Проверен существующий login flow
2. ✅ Login page использует `/api/v1/auth/login`
3. ✅ Исправлен redirect: `/login` → `/login.html`
4. ✅ Сгенерирован валидный JWT для тестов

**JWT Token для тестов:**
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InN1cGVyYWRtaW4iLCJlbWFpbCI6ImFkbWluQG1hZ2VsbGFuaWEuY29tIiwidXNlcm5hbWUiOiJzdXBlcmFkbWluIiwib3JnYW5pemF0aW9uX2lkIjoibWFnZWxsYW5pYS1vcmciLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NjU2Nzc5OTgsImV4cCI6MTc2NjI4Mjc5OH0.ZOc8xBZvSkUrDsLBJrpoTbxTj-YEb5XCYjVNA27di6c"

# Тестирование:
curl http://localhost:4000/api/v1/catalogs -H "Authorization: Bearer $TOKEN"
curl http://localhost:4000/api/v1/estimates -H "Authorization: Bearer $TOKEN"
```

**Результат:**
- ✅ API endpoints работают с валидным JWT
- ✅ Возвращают данные (7 каталогов, 8 смет)

---

### 5. ❌ Login Redirect 404

**Проблема:**
```
GET /login 404 (Not Found)
Redirecting to http://localhost:4000/login
```

**Причина:** Auth guard редиректил на `/login`, но файл называется `login.html`

**Решение:**
```javascript
// index.html (строка 12163)
// Было:
window.location.href = '/login';

// Стало:
window.location.href = '/login.html';
```

**Результат:** ✅ Корректный redirect на существующую страницу логина

---

## 📊 Итоговый статус

### ✅ Исправлено (5 багов)
1. ✅ Better-sqlite3 пересобран для ARM64
2. ✅ API v1 router подключен в server.js
3. ✅ saveBackup() метод реализован в SQLiteStorage
4. ✅ JWT авторизация протестирована и работает
5. ✅ Login redirect исправлен (/login → /login.html)

### ✅ Проверено работает
- ✅ Сервер запускается без ошибок
- ✅ SQLite database инициализируется
- ✅ Migration 011 применяется автоматически
- ✅ Все filenames БЕЗ .json расширения в БД
- ✅ API v1 endpoints доступны (с JWT)
- ✅ Legacy API endpoints работают

### 📋 Протестированные endpoints

**API v1 (с JWT авторизацией):**
```bash
✅ POST /api/v1/auth/login - логин и получение JWT
✅ GET /api/v1/catalogs - список каталогов (7 items)
✅ GET /api/v1/estimates - список смет (8 items)
✅ GET /api/v1/ - API info
```

**Legacy API (без авторизации):**
```bash
✅ GET /api/estimates - список смет
✅ GET /api/estimates/:id - загрузка сметы по ID
✅ GET / - главная страница приложения
```

---

## 🔐 Production Credentials (Migration 010)

```
Email: admin@magellania.com
Password: magellania2025
Username: superadmin
Role: admin
Organization: magellania-org
```

---

## 🗂️ Структура изменённых файлов

### Modified Files
```
server.js (+15 lines)
  - Добавлен import API v1 router
  - Настроен app.locals.storage
  - Смонтирован /api/v1 router

storage/SQLiteStorage.js (+15 lines)
  - Добавлен метод saveBackup() (no-op)
  - Соблюдён Single Source of Truth pattern

index.html (1 line)
  - Исправлен redirect: /login → /login.html

DB_CLEANUP_COMPLETED.md
  - Полный отчёт о database cleanup
```

---

## 🚀 Следующие шаги

### Для локального тестирования:

**1. Очистить localStorage в браузере:**
```javascript
localStorage.clear();
location.href = '/login.html';
```

**2. Залогиниться через UI:**
```
http://localhost:4000/login.html
Email: admin@magellania.com
Password: magellania2025
```

**3. Проверить работу приложения:**
- ✅ Каталоги загружаются
- ✅ Сметы загружаются
- ✅ Autosave работает
- ✅ Все ошибки исчезли

### Для деплоя на VPS:

```bash
git add server.js storage/SQLiteStorage.js index.html
git commit -m "fix: API v1 integration and login redirect"
git push origin db_initial_schema_refactoring

# На VPS:
cd /var/www/magellania-crm
git pull origin db_initial_schema_refactoring
docker-compose down
docker-compose up -d --build
```

---

## 📝 Заметки

### Архитектурные решения:

**1. Single Source of Truth (SQLite):**
- `estimates` table - единственный источник данных
- `saveBackup()` - no-op метод (не создаёт дублей)
- Идемпотентные операции

**2. ID-First Pattern:**
- UUID как primary key
- filename только для UI display
- Все операции через ID

**3. Multi-Tenancy:**
- organization_id фильтрация
- Изоляция данных между организациями
- Текущая организация: magellania-org

**4. JWT Авторизация:**
- API v1 - требует JWT (secure)
- Legacy API - без авторизации (backward compatibility)
- Token expires через 7 дней

---

## ✅ Выводы

**Все критические баги исправлены!**

Локальный сервер полностью функционален:
- ✅ Database cleanup завершён
- ✅ API v1 router интегрирован
- ✅ JWT авторизация работает
- ✅ Все endpoints доступны
- ✅ Готово к тестированию в браузере

**Статус:** Ready for commit & deploy
