# API v1 Authentication Fix

## Проблема

При импорте данных в браузере возникают ошибки:

- `POST /api/v1/catalogs` → 500 Internal Server Error
- `GET /api/v1/estimates?limit=1000` → 500 Internal Server Error
- `GET /api/auth/me` → 401 Unauthorized

**Причина:** API v1 требует JWT authentication, но пользователь не залогинен.

## Решение

### Вариант 1: Залогиниться через UI (Рекомендуется)

1. Откройте в браузере http://localhost:4000/login
2. Введите credentials:
   - **Email:** `admin@localhost`
   - **Password:** `admin123`
3. После успешного логина вы будете перенаправлены на главную страницу
4. Повторите импорт данных

### Вариант 2: Залогиниться через API

**Получить JWT token:**

```bash
curl -X POST "http://localhost:4000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost","password":"admin123"}'
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "admin-user-id",
      "email": "admin@localhost",
      "role": "admin",
      "organization_id": "default-org"
    }
  }
}
```

**Использовать token в запросах:**

```bash
TOKEN="<ваш_токен>"

curl "http://localhost:4000/api/v1/estimates?limit=1000" \
  -H "Authorization: Bearer $TOKEN"
```

### Вариант 3: Использовать старый API без auth

Если вы хотите использовать API без авторизации, измените frontend код:

**Было (в apiClient.js):**
```javascript
const baseURL = 'http://localhost:4000/api/v1';
```

**Стало:**
```javascript
const baseURL = 'http://localhost:4000/api';
```

**Примечание:** Старый API (`/api/*`) использует session-based auth и более ограничен функционально.

## Проверка

После логина проверьте, что API работает:

```bash
# Через браузер
# Откройте Developer Console (F12) и выполните:
fetch('/api/v1/estimates?limit=10', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('jwt_token')
  }
}).then(r => r.json()).then(console.log)
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "data": {
    "estimates": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 0
    }
  }
}
```

## Технические детали

### Исправленные ошибки в коде

**1. `/routes/api-v1/estimates.js:84-86`**

**Было:**
```javascript
const countQuery = query.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM');
const { total } = storage.db.prepare(countQuery).get(...params);
```

**Проблема:** Regex `/SELECT .* FROM/` не работает с многострочными queries.

**Стало:**
```javascript
const countQuery = query.replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) as total FROM');
const countResult = storage.db.prepare(countQuery).get(...params);
const total = countResult ? countResult.total : 0;
```

### API Endpoints

| Endpoint | Method | Auth | Описание |
|----------|--------|------|----------|
| `/api/v1/auth/login` | POST | No | JWT login |
| `/api/v1/auth/register` | POST | No | Регистрация org + user |
| `/api/v1/auth/logout` | POST | Yes | Logout |
| `/api/v1/estimates` | GET | Yes | Список смет |
| `/api/v1/estimates/:id` | GET | Yes | Получить смету |
| `/api/v1/estimates` | POST | Yes | Создать смету |
| `/api/v1/catalogs` | GET | Yes | Список каталогов |
| `/api/v1/catalogs/:id` | GET | Yes | Получить каталог |
| `/api/v1/catalogs` | POST | Yes | Создать каталог |

### Production Credentials (Migration 010)

| Поле | Значение |
|------|----------|
| Email | `admin@magellania.com` |
| Password | `magellania2025` |
| Username | `superadmin` |
| User ID | `superadmin` |
| Role | `admin` |
| Organization ID | `magellania-org` |
| Organization | `Magellania` |

**⚠️ ВАЖНО:**
- Смените пароль после первого входа в продакшене!
- НЕ используйте guest/test/demo аккаунты
- Все данные сохраняются ТОЛЬКО в `magellania-org`
- См. миграцию `db/migrations/010_superadmin_setup.sql`

---

**Последнее обновление:** 2025-11-25
**Версия:** 2.3.0
