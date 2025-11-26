# 🔴 Исправление циклического редиректа после авторизации

**Дата:** 25 ноября 2025
**Версия:** 2.3.1
**Приоритет:** 🔴 CRITICAL

---

## 🚨 Проблема

### Ошибка:
```
[Auth Guard] No JWT token found, redirecting to login...
Ошибка сохранения при закрытии: ReferenceError: QuoteCalc is not defined
```

### Симптомы:
1. После успешного логина происходит **циклический редирект** между `/login` и `/`
2. Калькулятор не инициализируется
3. Ошибка "QuoteCalc is not defined" в beforeunload handler

---

## 🔍 Причины (Root Cause Analysis)

### Проблема #1: login.html использует старый session-based API

**Файл:** `login.html:273`

**Было:**
```javascript
const response = await fetch('/api/auth/login', {  // ❌ Старый session-based endpoint
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
});

if (data.success) {
    // ❌ НЕ сохраняет JWT токен в localStorage!
    window.location.href = '/';
}
```

**Проблема:**
- `/api/auth/login` - это старый session-based endpoint (Passport.js)
- Он создаёт session cookie, но НЕ возвращает JWT токен
- JWT токен НЕ сохраняется в localStorage
- Auth guard в index.html НЕ находит токен → редирект на /login
- Бесконечный цикл: /login → / → /login → / ...

---

### Проблема #2: beforeunload handler пытается использовать неинициализированный QuoteCalc

**Файл:** `index.html:11690`

**Было:**
```javascript
window.addEventListener('beforeunload', function() {
    try {
        if (QuoteCalc.currentRegion) {  // ❌ QuoteCalc не существует если auth guard блокирует
            QuoteCalc.saveCatalogToRegion(QuoteCalc.currentRegion);
        }
    } catch (error) {
        console.error('Ошибка сохранения при закрытии:', error);
    }
});
```

**Проблема:**
- beforeunload handler регистрируется ДО auth guard
- Если auth guard блокирует инициализацию (нет токена), QuoteCalc НЕ создаётся
- При редиректе браузер вызывает beforeunload
- `QuoteCalc` undefined → ReferenceError

---

### Проблема #3: login.html проверяет авторизацию через session-based /api/auth/me

**Файл:** `login.html:361`

**Было:**
```javascript
window.addEventListener('load', async () => {
    try {
        const response = await fetch('/api/auth/me');  // ❌ Session-based endpoint
        const data = await response.json();

        if (data.success && data.user) {
            window.location.href = '/';
        }
    } catch (error) {
        // Stay on login page
    }
});
```

**Проблема:**
- `/api/auth/me` проверяет Passport session, НЕ JWT токен
- Для JWT auth нужно проверять localStorage, НЕ делать API запрос

---

## ✅ Решение

### Fix #1: login.html - Использовать API v1 и сохранять JWT токен

**Файл:** `login.html:273-310`

**Код:**
```javascript
async function handleLogin(event) {
    event.preventDefault();
    clearMessage();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    setLoading('loginBtn', true);

    try {
        // ✅ FIX: Используем API v1 для JWT авторизации (Migration 010)
        const response = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            // ✅ CRITICAL: Сохраняем JWT токен в localStorage
            // Auth guard в index.html проверяет наличие этого токена
            const token = data.data?.token || data.token;
            if (token) {
                localStorage.setItem('jwt_token', token);
                console.log('[Login] JWT token saved to localStorage');
            } else {
                console.error('[Login] No token in response!', data);
                showMessage('Ошибка: токен не получен');
                return;
            }

            showMessage('Вход выполнен успешно! Перенаправление...', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            showMessage(data.error || 'Ошибка входа');
        }
    } catch (error) {
        console.error('[Login] Error:', error);
        showMessage('Ошибка сети. Попробуйте позже.');
    } finally {
        setLoading('loginBtn', false);
    }
}
```

**Результат:**
- ✅ Использует `/api/v1/auth/login` (JWT endpoint)
- ✅ Сохраняет token в `localStorage.jwt_token`
- ✅ Auth guard в index.html находит токен
- ✅ БЕЗ циклического редиректа

---

### Fix #2: index.html - Проверять существование QuoteCalc в beforeunload

**Файл:** `index.html:11690-11700`

**Код:**
```javascript
// Автоматическое сохранение каталога при закрытии страницы
window.addEventListener('beforeunload', function() {
    try {
        // ✅ FIX: Проверяем существование QuoteCalc (может не быть если auth guard заблокировал)
        if (window.QuoteCalc && window.QuoteCalc.currentRegion) {
            window.QuoteCalc.saveCatalogToRegion(window.QuoteCalc.currentRegion);
            console.log('Каталог сохранён перед закрытием страницы');
        }
    } catch (error) {
        console.error('Ошибка сохранения при закрытии:', error);
    }
});
```

**Результат:**
- ✅ Проверяет `window.QuoteCalc` существует
- ✅ НЕ вызывает ошибку если QuoteCalc не инициализирован
- ✅ Graceful degradation

---

### Fix #3: login.html - Проверять JWT токен в localStorage

**Файл:** `login.html:359-371`

**Код:**
```javascript
// Check if already logged in
window.addEventListener('load', () => {
    // ✅ FIX: Проверяем JWT токен в localStorage (Migration 010)
    // Не используем session-based /api/auth/me
    const jwtToken = localStorage.getItem('jwt_token') || localStorage.getItem('authToken');

    if (jwtToken) {
        console.log('[Login] JWT token found, redirecting to app...');
        // Already logged in, redirect to app
        window.location.href = '/';
    } else {
        console.log('[Login] No JWT token, showing login form');
    }
});
```

**Результат:**
- ✅ Проверяет localStorage, НЕ делает API запрос
- ✅ Быстрая проверка (синхронная)
- ✅ Consistent с auth guard в index.html

---

## 🧪 Тестирование

### Сценарий 1: Первый запуск (нет токена)

**Шаги:**
1. Открыть DevTools (F12)
2. Application → Local Storage → Удалить `jwt_token`
3. Перейти на `http://localhost:4000/`

**Ожидаемый результат:**
```
[Auth Guard] No JWT token found, redirecting to login...
→ Редирект на /login
→ [Login] No JWT token, showing login form
→ Показывается форма логина
→ БЕЗ циклического редиректа
→ БЕЗ ошибки "QuoteCalc is not defined"
```

---

### Сценарий 2: Логин

**Шаги:**
1. На `/login` ввести:
   - Email: `admin@magellania.com`
   - Password: `magellania2025`
2. Нажать "Войти"

**Ожидаемый результат:**
```
POST /api/v1/auth/login → 200 OK
→ Response: { success: true, data: { token: "eyJ..." } }
→ [Login] JWT token saved to localStorage
→ Вход выполнен успешно! Перенаправление...
→ Редирект на /
→ [Auth Guard] JWT token found, initializing calculator...
→ Калькулятор инициализируется
→ Сметы загружаются
→ БЕЗ ошибок
```

**Проверка в DevTools:**
```javascript
localStorage.getItem('jwt_token')
// Должен вернуть JWT токен: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### Сценарий 3: Повторная загрузка (токен есть)

**Шаги:**
1. Находясь на калькуляторе, нажать F5

**Ожидаемый результат:**
```
[Auth Guard] JWT token found, initializing calculator...
→ Калькулятор инициализируется
→ Данные загружаются
→ БЕЗ редиректа на /login
→ БЕЗ ошибок
```

---

### Сценарий 4: Открыть /login когда уже залогинен

**Шаги:**
1. Будучи авторизованным, перейти на `http://localhost:4000/login`

**Ожидаемый результат:**
```
[Login] JWT token found, redirecting to app...
→ Автоматический редирект на /
→ Калькулятор показывается
→ БЕЗ показа формы логина
```

---

## 📊 Изменённые файлы

1. **login.html**
   - Lines 273-310: handleLogin() - использует `/api/v1/auth/login`, сохраняет JWT токен
   - Lines 359-371: load event - проверяет JWT токен в localStorage

2. **index.html**
   - Lines 11690-11700: beforeunload - проверяет `window.QuoteCalc` существует

3. **ЦИКЛИЧЕСКИЙ_РЕДИРЕКТ_FIX.md** (NEW)
   - Эта документация

---

## ✅ Checklist

- [x] Исправлен login.html - использует API v1
- [x] JWT токен сохраняется в localStorage
- [x] beforeunload проверяет существование QuoteCalc
- [x] login.html проверяет localStorage вместо /api/auth/me
- [x] Создана документация
- [ ] **TODO: Ручное тестирование всех сценариев**

---

## 🚀 Инструкция по тестированию

### Подготовка:
```bash
# 1. Перезапустить сервер
cd "/Users/bogisis/Desktop/сметы/for_deploy copy"
npm start

# 2. Открыть браузер
open http://localhost:4000
```

### Тест:
1. **Очистить localStorage**:
   - F12 → Application → Local Storage → `http://localhost:4000`
   - Удалить `jwt_token` и `authToken`
   - Закрыть DevTools

2. **Перезагрузить страницу** (F5)
   - Должен редиректить на `/login`
   - БЕЗ ошибок в консоли

3. **Залогиниться**:
   - Email: `admin@magellania.com`
   - Password: `magellania2025`
   - Нажать "Войти"

4. **Проверить успех**:
   - Должен редиректить на `/`
   - Калькулятор должен показаться
   - В DevTools → Application → Local Storage:
     ```
     jwt_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
     ```

5. **Перезагрузить страницу** (F5)
   - Калькулятор должен загрузиться БЕЗ редиректа
   - БЕЗ ошибок в консоли

✅ **Если все шаги прошли успешно - проблема решена!**

---

## 📌 Связанные документы

- `AUTH_SECURITY_FIX.md` - Основные исправления авторизации
- `API_V1_LOGIN_FIX.md` - Документация API v1 auth endpoints
- `CLAUDE.md` - Production credentials (superadmin/magellania-org)
- `db/migrations/010_superadmin_setup.sql` - Миграция credentials

---

**Важно:** Эти исправления критичны для работы авторизации. Без них невозможно залогиниться в приложение.
