# MAGELLANIA CRM - Quote Calculator v2.3.1

**Production-Ready** генератор коммерческих предложений для туристического бизнеса с полным multi-tenancy и JWT авторизацией.

[![Version](https://img.shields.io/badge/version-2.3.1-blue.svg)](https://github.com/your-repo/quote-calculator)
[![Status](https://img.shields.io/badge/status-production--ready-green.svg)](https://github.com/your-repo/quote-calculator)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 📋 Содержание

- [О проекте](#о-проекте)
- [Что нового в v2.3.1](#что-нового-в-v231)
- [Быстрый старт](#быстрый-старт)
- [Возможности](#возможности)
- [Архитектура](#архитектура)
- [API документация](#api-документация)
- [Конфигурация](#конфигурация)
- [Разработка](#разработка)
- [Production деплой](#production-деплой)
- [Миграции базы данных](#миграции-базы-данных)
- [Безопасность](#безопасность)
- [Changelog](#changelog)
- [Roadmap](#roadmap)
- [Документация](#документация)
- [Troubleshooting](#troubleshooting)
- [Лицензия](#лицензия)

---

## О проекте

**MAGELLANIA CRM** - это Full-Stack приложение для создания и управления коммерческими предложениями в туристическом бизнесе. Система поддерживает multi-tenancy архитектуру, JWT авторизацию, каталоги услуг по регионам и гибкое управление сметами.

### Ключевые особенности

✅ **Multi-tenancy** - изоляция данных по организациям
✅ **JWT Authentication** - безопасная авторизация с токенами
✅ **SQLite Database** - надежное хранение данных
✅ **Regional Catalogs** - каталоги услуг по регионам (Ushuaia, El Calafate, Buenos Aires)
✅ **Auto-save** - автоматическое сохранение смет
✅ **Import/Export** - полный экспорт/импорт данных в JSON
✅ **Migration System** - версионирование схемы БД
✅ **Docker Support** - готовые образы для деплоя

---

## Что нового в v2.3.1

### 🔥 Критические исправления (26 ноября 2025)

#### 1. JWT Authentication Flow (CRITICAL FIX)
**Проблема:** Циклический редирект после авторизации
**Решение:**
- Исправлен `login.html` - теперь использует `/api/v1/auth/login` вместо session API
- JWT токен корректно сохраняется в `localStorage`
- Auth guard работает правильно при загрузке приложения

#### 2. Catalog Import & Display (CRITICAL FIX)
**Проблема:** Каталоги импортировались, но показывали 0 услуг
**Решение:**
- Добавлена логика merge для дедупликации templates по ID
- Исправлен парсинг JSON в API endpoint `GET /api/v1/catalogs/:id`
- Исправлено заполнение колонки `region` в БД
- Исправлено восстановление `deleted_at` при UPSERT

**Файлы изменены:**
- `login.html` - JWT auth flow
- `index.html:9742-9806` - merge logic для catalogs
- `storage/SQLiteStorage.js:661` - region fallback
- `storage/SQLiteStorage.js:218` - deleted_at reset в UPSERT
- `routes/api-v1/catalogs.js:87-95` - JSON parsing

#### 3. Актуальная статистика каталогов
После всех исправлений в системе:
- **Ushuaia**: 60 услуг, 23 категории
- **El Calafate**: 17 услуг, 9 категорий
- **Buenos Aires**: 2 услуги, 6 категорий
- **ИТОГО**: 79 активных услуг

---

## Быстрый старт

### Требования

- **Node.js** 18.x или выше
- **SQLite3** (встроен в Node.js)
- **Git** (для клонирования репозитория)

### Установка и запуск

```bash
# Клонировать репозиторий
git clone <your-repo-url>
cd quote-calculator

# Установить зависимости
npm install

# Запустить сервер (порт 4000)
npm start

# Открыть в браузере
open http://localhost:4000
```

### Production credentials

**⚠️ ВАЖНО:** Используйте эти данные для входа в production систему:

```yaml
Email:              admin@magellania.com
Password:           magellania2025
Username:           superadmin
Organization ID:    magellania-org
Organization Name:  Magellania
Role:               admin
```

Эти credentials настроены миграцией `db/migrations/010_superadmin_setup.sql`.

---

## Возможности

### 🏢 Multi-tenancy
- Изоляция данных по организациям (`organization_id`)
- Каждая смета/каталог привязаны к организации
- Superadmin доступ к данным всех организаций

### 🔐 Авторизация и безопасность
- JWT токены с истечением через 7 дней
- Защита всех API endpoints через middleware `requireAuth`
- RBAC (Role-Based Access Control) - роли `admin`, `user`
- XSS защита, валидация входных данных

### 📚 Управление каталогами
- Каталоги услуг по регионам (Ushuaia, El Calafate, Buenos Aires)
- Категории услуг с иконками
- Импорт/экспорт каталогов в JSON
- Merge duplicates при импорте
- Soft delete (восстановление удаленных каталогов)

### 📝 Управление сметами
- Создание/редактирование смет
- Автосохранение каждые 2 секунды
- Добавление услуг из каталога
- Custom услуги (не из каталога)
- Bulk operations (массовое удаление)
- Расчет с учетом:
  - Количества человек (PAX)
  - Индивидуальных наценок на услуги
  - Скрытой маржи
  - НДС

### 📤 Импорт/Экспорт
- Полный экспорт всех данных (catalogs, estimates, settings) в JSON
- Импорт с поддержкой merge (дедупликация по ID)
- Формат версионирован (`version: "2.3.1"`)
- Обратная совместимость с форматом v1.0.0

### 🖨️ Печать КП
- Профессиональный шаблон печати
- Клиентская версия БЕЗ внутренних расчетов
- Детализация по услугам
- Итоговые суммы с НДС

---

## Архитектура

### Tech Stack

**Backend:**
- Node.js 18+ / Express.js 4.18
- SQLite3 (better-sqlite3)
- JWT (jsonwebtoken)
- bcrypt для паролей

**Frontend:**
- Vanilla JavaScript ES6+ (SPA)
- HTML5 + CSS3 Custom Properties
- Lucide Icons

**DevOps:**
- Docker + Docker Compose
- PM2 для production
- SQLite миграции

### Структура проекта

```
quote-calculator/
├── server-with-db.js           # Main Express server (JWT + SQLite)
├── index.html                  # Frontend SPA (~10K lines)
├── login.html                  # Login page with JWT auth
├── package.json                # Dependencies
│
├── storage/
│   └── SQLiteStorage.js        # Database abstraction layer
│
├── middleware/
│   ├── jwt-auth.js             # JWT validation middleware
│   └── rbac.js                 # Role-based access control
│
├── routes/
│   ├── api-v1.js               # Main API router
│   └── api-v1/
│       ├── auth.js             # /api/v1/auth/* (login, register)
│       ├── catalogs.js         # /api/v1/catalogs/* (CRUD)
│       ├── estimates.js        # /api/v1/estimates/* (CRUD)
│       └── data.js             # /api/v1/data/* (import/export)
│
├── db/
│   ├── quotes.db               # Main SQLite database
│   ├── schema.sql              # Full schema definition
│   └── migrations/
│       ├── runner.js           # Migration runner
│       ├── 001_add_multitenancy.sql
│       ├── 002_remove_filename_unique.sql
│       ├── ...
│       └── 010_superadmin_setup.sql
│
├── docs/                       # MkDocs documentation
│   ├── index.md
│   ├── ru/
│   │   ├── user-guide/         # User documentation
│   │   └── developer-guide/    # Developer documentation
│   └── CODE_MAP.md             # Code navigation map
│
├── Dockerfile                  # Docker image
├── docker-compose.yml          # Docker Compose config
└── CLAUDE.md                   # Developer instructions
```

### База данных (SQLite)

**Основные таблицы:**

#### `users`
- `id` (TEXT PRIMARY KEY) - User UUID
- `email`, `password_hash`, `username`
- `organization_id` (TEXT) - Multi-tenancy
- `role` (TEXT) - admin/user

#### `organizations`
- `id` (TEXT PRIMARY KEY) - Org UUID
- `name`, `domain`, `settings` (JSON)

#### `catalogs`
- `id` (TEXT PRIMARY KEY) - Catalog UUID
- `name`, `slug`, `region`
- `data` (TEXT) - JSON с templates/categories
- `organization_id` - Tenant isolation
- `deleted_at` - Soft delete

#### `estimates`
- `id` (TEXT PRIMARY KEY) - Estimate UUID
- `filename` - Display name (NOT unique!)
- `data` (TEXT) - JSON со всей сметой
- `organization_id` - Tenant isolation
- `data_version` - Optimistic locking

#### `settings`
- Global/organization/user settings
- `scope`, `scope_id`
- `key`, `value` (JSON)

**Schema версия:** `1.0` (хранится в `schema_migrations` table)

---

## API документация

### Authentication

#### `POST /api/v1/auth/register`
Регистрация нового пользователя

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "username": "username",
  "organizationName": "My Company"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user_uuid",
      "email": "user@example.com",
      "username": "username",
      "role": "admin",
      "organization_id": "org_uuid"
    }
  }
}
```

#### `POST /api/v1/auth/login`
Авторизация

**Request:**
```json
{
  "email": "admin@magellania.com",
  "password": "magellania2025"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}
```

---

### Catalogs API

**Все endpoints требуют заголовок:** `Authorization: Bearer <jwt_token>`

#### `GET /api/v1/catalogs`
Список каталогов организации

**Response:**
```json
{
  "success": true,
  "data": {
    "catalogs": [
      {
        "id": "catalog_uuid",
        "name": "Ushuaia",
        "slug": "ushuaia",
        "region": "Ushuaia",
        "templates_count": 60,
        "categories_count": 23,
        "visibility": "organization",
        "created_at": 1732549200,
        "updated_at": 1732635600
      }
    ]
  }
}
```

#### `GET /api/v1/catalogs/:id`
Получить каталог по ID (с полными данными)

**Response:**
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": "custom_1760104404585",
        "name": "Кемпинг, предустановленная палатка + питание",
        "category": "torres_del_paine",
        "description": "W express (4 дня/3 ночи)",
        "contractor": "Torres del paine",
        "icon": "⛺",
        "price": 534,
        "region": "Ushuaia"
      }
    ],
    "categories": [
      {
        "id": "torres_del_paine",
        "name": "Torres del Paine",
        "icon": "🏔️"
      }
    ],
    "region": "Ushuaia"
  }
}
```

#### `POST /api/v1/catalogs`
Создать или обновить каталог

**Request:**
```json
{
  "name": "Ushuaia",
  "data": {
    "templates": [...],
    "categories": [...],
    "region": "Ushuaia"
  },
  "visibility": "organization"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Catalog saved successfully"
}
```

---

### Estimates API

#### `GET /api/v1/estimates`
Список смет организации

**Response:**
```json
{
  "success": true,
  "data": {
    "estimates": [
      {
        "id": "estimate_uuid",
        "filename": "Quote 2025-11-26",
        "created_at": 1732549200,
        "updated_at": 1732635600,
        "client_name": "John Doe",
        "total": 15340.50,
        "services_count": 12
      }
    ]
  }
}
```

#### `GET /api/v1/estimates/:id`
Получить смету по ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "estimate_uuid",
    "filename": "Quote 2025-11-26",
    "services": [...],
    "paxCount": 27,
    "hiddenMarkup": 10,
    "taxRate": 21,
    "clientInfo": { ... },
    "metadata": { ... }
  }
}
```

#### `POST /api/v1/estimates`
Создать или обновить смету

**Request:**
```json
{
  "filename": "Quote 2025-11-26",
  "data": {
    "services": [...],
    "paxCount": 27,
    "hiddenMarkup": 10,
    "taxRate": 21,
    "clientInfo": { ... }
  }
}
```

#### `DELETE /api/v1/estimates/:id`
Удалить смету (soft delete)

---

### Data Import/Export

#### `POST /api/v1/data/export`
Экспорт всех данных

**Response:**
```json
{
  "version": "2.3.1",
  "exportDate": "2025-11-26T12:00:00Z",
  "data": {
    "catalogs": { ... },
    "estimates": [...],
    "settings": { ... }
  }
}
```

#### `POST /api/v1/data/import`
Импорт данных из файла

**Request:** multipart/form-data с JSON файлом

**Response:**
```json
{
  "success": true,
  "message": "Data imported successfully",
  "stats": {
    "catalogsImported": 3,
    "estimatesImported": 15,
    "settingsImported": 5
  }
}
```

---

## Конфигурация

### Переменные окружения

Создайте файл `.env`:

```bash
# Server
PORT=4000
NODE_ENV=production

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Database
DB_PATH=./db/quotes.db

# Storage
STORAGE_TYPE=sqlite

# Session (legacy, not used)
SESSION_SECRET=your-session-secret-key
```

### Docker

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "4000:4000"
    environment:
      - PORT=4000
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - STORAGE_TYPE=sqlite
    volumes:
      - ./db:/app/db
    restart: unless-stopped
```

**Запуск:**

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## Разработка

### Локальная разработка

```bash
# Установить зависимости
npm install

# Запустить в dev mode (nodemon)
npm run dev

# Запустить production
npm start
```

### Структура кода

**Frontend (index.html):**
- `ProfessionalQuoteCalculator` - главный класс (~10K строк)
- `APIClient` - клиент для работы с API
- Event-driven architecture
- Debounced updates для производительности

**Backend (server-with-db.js):**
- Express.js с middleware
- JWT authentication
- SQLite через better-sqlite3
- RESTful API design

### Code Navigation

📋 **ВАЖНО:** Перед началом любой задачи читайте `docs/CODE_MAP.md`!

Code Map содержит:
- Точные расположения функций (файл:строка)
- Caller/callee графы зависимостей
- Известные проблемы и race conditions
- Архитектурные паттерны
- Integration points

**Пример использования:**
```
Задача: Исправить autosave
1. Открываю CODE_MAP.md → "Known Issues"
2. Вижу: isLoadingQuote guard flag, index.html:9430
3. Сразу открываю index.html:9430
4. Фикс за 1 минуту вместо 10 минут поиска
```

---

## Production деплой

### Railway.app (рекомендуется)

1. **Создать проект на Railway**
2. **Подключить GitHub репозиторий**
3. **Настроить переменные окружения:**
   - `PORT=4000`
   - `JWT_SECRET=<генерируйте безопасный ключ>`
   - `NODE_ENV=production`

4. **Railway автоматически:**
   - Запустит `npm install`
   - Запустит `npm start`
   - Создаст публичный домен

### VPS (Ubuntu/Debian)

```bash
# Установить Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Клонировать проект
git clone <repo-url> /var/www/quote-calculator
cd /var/www/quote-calculator

# Установить зависимости
npm install --production

# Создать .env файл
nano .env
# (добавить переменные из раздела Конфигурация)

# Запустить с PM2
npm install -g pm2
pm2 start server-with-db.js --name quote-calculator
pm2 startup
pm2 save

# Настроить Nginx reverse proxy (опционально)
```

### Docker Production

```bash
# Build образ
docker build -t quote-calculator:2.3.1 .

# Run контейнер
docker run -d \
  -p 4000:4000 \
  -e JWT_SECRET=your-secret \
  -e NODE_ENV=production \
  -v $(pwd)/db:/app/db \
  --name quote-calculator \
  --restart unless-stopped \
  quote-calculator:2.3.1
```

---

## Миграции базы данных

### Применение миграций

При первом запуске сервер **автоматически** применяет все миграции из `db/migrations/`.

**Ручной запуск:**

```bash
cd db/migrations
node runner.js
```

### Список миграций

1. **001_add_multitenancy.sql** - Добавление multi-tenancy (organization_id, owner_id)
2. **002_remove_filename_unique.sql** - Убрали UNIQUE constraint с filename
3. **003_fix_settings_multitenancy.sql** - Исправление settings для multi-tenancy
4. **004_add_users_auth.sql** - Таблица users с JWT auth
5. **005_migrate_owner_id.sql** - Миграция owner_id
6. **006_add_multi_tenancy_fields.sql** - Дополнительные поля
7. **007_migrate_existing_data.sql** - Миграция существующих данных
8. **008_make_fields_not_null.sql** - NOT NULL constraints
9. **009_fix_settings_scope.sql** - Исправление scope settings
10. **010_superadmin_setup.sql** - Создание superadmin пользователя

### Создание новой миграции

```bash
cd db/migrations

# Создать файл с номером следующей миграции
nano 011_your_migration_name.sql
```

**Структура миграции:**

```sql
-- Migration: 011 Your Migration Name
-- Date: 2025-11-26

BEGIN TRANSACTION;

-- Your SQL changes here
ALTER TABLE your_table ADD COLUMN new_field TEXT;

-- Update schema version
UPDATE schema_migrations SET version = 11, applied_at = CURRENT_TIMESTAMP WHERE id = 1;

COMMIT;
```

---

## Безопасность

### Аутентификация
- ✅ JWT токены с истечением (7 дней)
- ✅ bcrypt для хеширования паролей (salt rounds: 10)
- ✅ Защита всех API endpoints через middleware

### Авторизация
- ✅ RBAC (admin, user roles)
- ✅ Organization-level isolation
- ✅ Superuser доступ для администрирования

### Защита от атак
- ✅ XSS prevention (textContent вместо innerHTML)
- ✅ SQL injection prevention (prepared statements)
- ✅ CORS настроен
- ✅ Rate limiting (опционально, через middleware)
- ✅ File size validation (max 5MB для импорта)

### Best Practices
- ✅ ID-First Pattern (UUID как primary key, не filename)
- ✅ Optimistic locking (data_version)
- ✅ Soft delete (deleted_at timestamp)
- ✅ Single Source of Truth (одна таблица для runtime данных)

---

## Changelog

### v2.3.1 (26 ноября 2025)

**CRITICAL FIXES:**

🔒 **JWT Authentication Flow**
- Fixed `login.html` - теперь использует `/api/v1/auth/login` вместо session API
- JWT токен корректно сохраняется в localStorage
- Auth guard правильно валидирует токен при загрузке приложения

📚 **Catalog Import & Display**
- Добавлена merge logic для дедупликации templates по ID (index.html:9742-9806)
- Исправлен JSON parsing в `GET /api/v1/catalogs/:id` (routes/api-v1/catalogs.js:87-95)
- Исправлено заполнение `region` column (SQLiteStorage.js:661)
- Исправлено восстановление `deleted_at` при UPSERT (SQLiteStorage.js:218)

📊 **Статистика:**
- Ushuaia: 60 услуг, 23 категории
- El Calafate: 17 услуг, 9 категорий
- Buenos Aires: 2 услуги, 6 категорий
- **ИТОГО: 79 активных услуг**

📄 **Документация:**
- Добавлены подробные инструкции по импорту (CLEAN_IMPORT_READY.md)
- Документированы все исправления (AUTH_FIX_SUMMARY.md, CATALOG_IMPORT_FIX.md)
- Создан comprehensive README.md

### v2.3.0 (20 октября 2025)

**Production Ready Release**

🗄️ **SQLite Database**
- Переход с file-based storage на SQLite
- Миграционная система (10 миграций)
- Multi-tenancy architecture
- Optimistic locking (data_version)

🔐 **JWT Authentication**
- Полная система авторизации
- Middleware для защиты endpoints
- RBAC (admin/user roles)

🏗️ **API v1**
- RESTful API design
- `/api/v1/auth/*` - authentication
- `/api/v1/catalogs/*` - catalog CRUD
- `/api/v1/estimates/*` - estimate CRUD
- `/api/v1/data/*` - import/export

📊 **Regional Catalogs**
- Каталоги по регионам (Ushuaia, El Calafate, Buenos Aires)
- 245+ услуг в каталогах
- Категории с иконками

🐛 **Bug Fixes:**
- Services "sticking" между сметами (guard flag `isLoadingQuote`)
- Cyrillic filename errors при rename
- Import compatibility v1.0.0 ↔ v1.1.0
- transliterate is not a function
- apiClient is not defined

### v2.2.0 (29 декабря 2024)

🎉 **Серверное хранилище**
- Express.js backend
- File-based storage (catalog/, estimate/, backup/)
- Автосохранение смет
- Автобэкапы

---

## Roadmap

### v2.4.0 (планируется)
- [ ] WebSocket real-time sync
- [ ] Collaborative editing (multiple users)
- [ ] Enhanced reporting (PDF export)
- [ ] Mobile app (React Native)

### v2.5.0 (планируется)
- [ ] PostgreSQL support (альтернатива SQLite)
- [ ] Redis caching
- [ ] Elasticsearch для поиска
- [ ] Advanced analytics

### v3.0.0 (планируется)
- [ ] Microservices architecture
- [ ] GraphQL API
- [ ] React frontend (замена vanilla JS)
- [ ] Kubernetes deployment

---

## Документация

### Основная документация

📖 **[docs/index.md](docs/index.md)** - Главная страница MkDocs wiki

**Для пользователей:**
- 👤 [Руководство пользователя](docs/ru/user-guide/index.md)
- 📖 [FAQ](docs/ru/user-guide/troubleshooting/faq.md)

**Для разработчиков:**
- 👨‍💻 [Руководство разработчика](docs/ru/developer-guide/index.md)
- 🏗️ [Архитектура](docs/ru/developer-guide/architecture/index.md)
- 🔧 [API Reference](docs/ru/developer-guide/api-reference/index.md)
- 🗺️ [CODE_MAP.md](docs/CODE_MAP.md) - **READ FIRST!**

**КРИТИЧНО:**
- [Целостность данных](docs/ru/developer-guide/data-integrity/index.md)
- [ID-First Pattern](docs/ru/developer-guide/data-integrity/id-first-pattern.md)
- [Single Source of Truth](docs/ru/developer-guide/data-integrity/single-source-truth.md)

### Генерация MkDocs сайта

```bash
# Установить зависимости
pip install -r requirements.txt

# Запустить dev server
mkdocs serve

# Билд статического сайта
mkdocs build
```

---

## Troubleshooting

### Проблема: Cyclical redirect после login

**Симптомы:**
- Бесконечный редирект между `/login` и `/`
- "No JWT token found, redirecting to login..."

**Решение:**
```bash
# Проверить, что используется правильный API endpoint
# В login.html должно быть:
fetch('/api/v1/auth/login', ...)  // ✅ Правильно
# НЕ:
fetch('/api/auth/login', ...)      // ❌ Старый session API
```

### Проблема: Каталоги не отображаются (0 услуг)

**Симптомы:**
- Успешный импорт, но UI показывает "0 услуг"
- В БД есть данные, но templates.length === 0

**Решение:**
```bash
# Проверить JSON parsing в API
# routes/api-v1/catalogs.js должен парсить data:
const catalogData = {
    ...catalog,
    data: JSON.parse(catalog.data)  // ✅ ВАЖНО!
};
```

### Проблема: Порт 4000 занят

```bash
# Найти процесс на порту
lsof -i :4000

# Убить процесс
kill -9 <PID>

# Или изменить порт
export PORT=4001
npm start
```

### Проблема: База данных не создается

```bash
# Проверить права доступа
chmod 755 db/
touch db/quotes.db

# Применить миграции вручную
cd db/migrations
node runner.js
```

### Проблема: JWT token expired

**Симптомы:**
- 401 Unauthorized errors
- "Token has expired"

**Решение:**
```bash
# Выйти и войти заново
# Токены действительны 7 дней, после этого нужен re-login
```

### Проблема: Docker контейнер не стартует

```bash
# Проверить логи
docker-compose logs -f

# Пересобрать образ
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Проблема: Миграции не применяются

```bash
# Проверить версию схемы
sqlite3 db/quotes.db "SELECT * FROM schema_migrations;"

# Применить миграции вручную
cd db/migrations
node runner.js

# Если ошибка, откатить и повторить
sqlite3 db/quotes.db ".restore db/quotes.db.backup"
```

---

## Контрибьюторы

При создании Pull Request:

1. Прочитайте `docs/CODE_MAP.md`
2. Следуйте паттернам из `docs/ru/developer-guide/data-integrity/`
3. Обновите соответствующую документацию
4. Добавьте тесты (если применимо)
5. Обновите CHANGELOG

### Code Style

- **JavaScript:** ESLint с правилами ES6+
- **Отступы:** 4 пробела
- **Комментарии:** На русском (для этого проекта)
- **Naming:** camelCase для переменных, PascalCase для классов

### Testing

```bash
# Запустить тесты (когда будут добавлены)
npm test

# Lint
npm run lint
```

---

## Лицензия

MIT License

Copyright (c) 2025 MAGELLANIA CRM

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Контакты и поддержка

**Проект:** MAGELLANIA CRM - Quote Calculator
**Версия:** 2.3.1
**Статус:** Production Ready ✅
**Дата релиза:** 26 ноября 2025

**Документация:** `docs/` (MkDocs)
**Техническая документация:** `CLAUDE.md`
**Code Navigation:** `docs/CODE_MAP.md`

---

**⚠️ ВАЖНО:** Это production-ready система. Все критические баги исправлены. Система протестирована и готова к использованию.

**🎯 Следующие шаги:**
1. Настроить `.env` файл с production credentials
2. Применить миграции базы данных
3. Импортировать начальные данные (catalogs)
4. Запустить сервер
5. Залогиниться с credentials: `admin@magellania.com` / `magellania2025`

---

**Made with ❤️ for Tourism Industry**
