# Руководство по интеграции авторизации

## Что уже готово

✅ Таблицы БД (db/migrations/004_add_users_auth.sql)
✅ AuthService (services/AuthService.js)
✅ Passport config (config/passport.js)
✅ Auth middleware (middleware/auth.js)
✅ Auth routes (routes/auth.js)
✅ Login страница (login.html)
✅ Переменные окружения (.env.example)

## Шаги интеграции

### 1. Обновить .env

```bash
cp .env.example .env

# Сгенерировать SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Вставить в .env:
SESSION_SECRET=<generated_secret_here>
```

### 2. Применить миграцию БД

```bash
# Применить миграцию 004
sqlite3 db/quotes.db < db/migrations/004_add_users_auth.sql
```

### 3. Обновить server-with-db.js

Добавить в начало файла (после require('dotenv')):

```javascript
const passport = require('passport');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const AuthService = require('./services/AuthService');
const configurePassport = require('./config/passport');
const authRoutes = require('./routes/auth');
const { requireAuth } = require('./middleware/auth');
```

Добавить ПОСЛЕ инициализации storage (после `await storage.init();`):

```javascript
// ============================================================================
// Authentication Setup
// ============================================================================

// Initialize AuthService
const authService = new AuthService(storage.db);
app.locals.authService = authService;
app.locals.db = storage.db;

// Configure Passport
configurePassport(authService);

// Session configuration
const sessionStore = new SQLiteStore({
    db: process.env.SESSION_DB_PATH || 'sessions.db',
    dir: './db'
});

app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: process.env.SESSION_SECURE_COOKIE === 'true',  // true only for HTTPS
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
        sameSite: 'lax'
    }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

logger.info('Authentication configured', {
    sessionStore: 'sqlite',
    cookieSecure: process.env.SESSION_SECURE_COOKIE === 'true'
});
```

Добавить auth routes ПЕРЕД другими API routes:

```javascript
// ============================================================================
// Authentication API
// ============================================================================

app.use('/api/auth', authRoutes);

// Login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});
```

Добавить защиту к существующим API endpoints (опционально):

```javascript
// Например, защитить /api/estimates
app.get('/api/estimates', requireAuth, async (req, res) => {
    // Existing code...
});

// Или применить ко всем API кроме auth:
// app.use('/api', requireAuth);  // Перед определением routes
// app.use('/api/auth', authRoutes);  // Исключение
```

### 4. Обновить package.json

Зависимости уже установлены:
- passport
- passport-local
- express-session
- bcryptjs
- connect-sqlite3

### 5. Тестирование

```bash
# Запустить сервер
npm start

# Открыть браузер
open http://localhost:4000/login

# Дефолтный admin пользователь:
# Email: admin@localhost
# Password: admin123

# ВАЖНО: Сменить пароль после первого входа!
```

### 6. Проверить endpoints

```bash
# Register
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","fullName":"Test User"}'

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost","password":"admin123"}' \
  -c cookies.txt

# Get current user
curl http://localhost:4000/api/auth/me -b cookies.txt

# Logout
curl -X POST http://localhost:4000/api/auth/logout -b cookies.txt
```

## Security Checklist

- [ ] Сгенерирован уникальный SESSION_SECRET
- [ ] В production установлен SESSION_SECURE_COOKIE=true
- [ ] Изменён пароль дефолтного admin пользователя
- [ ] Настроен CORS для production домена
- [ ] Включён HTTPS в production
- [ ] Настроен rate limiting для /api/auth/login
- [ ] Проверены все API endpoints на защищённость

## Multi-tenancy

Для изоляции данных между организациями:

1. Используйте `req.user.organization_id` в queries
2. Добавьте WHERE clauses: `WHERE organization_id = ?`
3. Используйте middleware `attachOrganization` для автоматической фильтрации

## Google OAuth (Будущее)

Таблица users уже готова для Google OAuth:
- `google_id` - Google user ID
- `oauth_provider` - 'google' или 'local'
- `oauth_data` - JSON с дополнительными данными

## Troubleshooting

### Session не сохраняется
- Проверьте SESSION_SECRET в .env
- Проверьте что cookies разрешены в браузере
- Проверьте secure cookie settings (false для HTTP)

### Cannot connect to database
- Убедитесь что миграция 004 применена
- Проверьте что db/quotes.db существует
- Проверьте права доступа к файлу

### Password не совпадает
- Дефолтный пароль: admin123
- Hash bcrypt в миграции: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy

### Lockout после неудачных попыток
- Подождите 15 минут
- Или сбросьте в БД: `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = 'admin@localhost';`

## Миграция существующих данных

### Проблема: Legacy owner_id

После интеграции авторизации существующие данные могут иметь `owner_id = 'user_default'`,
который не существует в таблице `users`.

### ✅ Решение (применено)

**Стратегия:** Обновить owner_id существующих записей на `admin-user-001`

**Обоснование:**
- Упрощает структуру данных - один реальный admin пользователь
- Избегает "призрачных" пользователей в системе
- Соответствует архитектуре multi-tenancy
- В production пользователи создадут свои аккаунты через регистрацию

**Выполненная миграция:**
```sql
BEGIN TRANSACTION;

UPDATE estimates SET owner_id = 'admin-user-001' WHERE owner_id = 'user_default';
UPDATE catalogs SET owner_id = 'admin-user-001' WHERE owner_id = 'user_default';
UPDATE backups SET owner_id = 'admin-user-001' WHERE owner_id = 'user_default';

COMMIT;
```

**Результат:**
- ✅ 17 estimates мигрировано
- ✅ 4 catalogs мигрировано
- ✅ 52 backups мигрировано

**Важно:** В production при деплое на новый сервер:
1. Создайте admin пользователя через `/api/auth/register`
2. Примените ту же миграцию, заменив `admin-user-001` на ID нового пользователя
3. Или импортируйте данные уже с правильным owner_id
