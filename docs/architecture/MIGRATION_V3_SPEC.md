# АРХИТЕКТУРНАЯ СПЕЦИФИКАЦИЯ МИГРАЦИИ v3.0
## Quote Calculator - Серверное хранение + Multi-Tenancy

**Версия:** 3.0.0
**Дата:** 19 ноября 2025
**Статус:** Утверждено к разработке
**Автор:** Architecture Team

---

## EXECUTIVE SUMMARY

### Цель миграции
Перевод Quote Calculator на полностью серверную архитектуру с multi-tenancy, сохранив принципы ID-First и Single Source of Truth.

### Ключевые изменения
- ✅ Все данные хранятся на сервере (SQLite/PostgreSQL)
- ✅ localStorage используется только как временный кэш
- ✅ Периодическая синхронизация каждые 5 минут
- ✅ Server-first conflict resolution
- ✅ 3 роли пользователей: superuser/admin/user
- ✅ Username format: `prefix.organization_slug`
- ✅ Multi-tenant row-level security

### Метрики
- **API endpoints:** 28
- **Database tables:** 7
- **Migration time:** ~4 часа
- **Downtime:** ~30 минут
- **Data loss:** ZERO (гарантировано)

---

## 1. СТРУКТУРА БАЗЫ ДАННЫХ

### 1.1 Таблица `estimates` (основная таблица смет)

```sql
CREATE TABLE estimates (
    -- Primary Key (ID-First Pattern)
    id TEXT PRIMARY KEY NOT NULL,              -- UUID, НЕИЗМЕННЫЙ ключ
    filename TEXT NOT NULL,                    -- Display name, может меняться

    -- Multi-Tenancy (ОБЯЗАТЕЛЬНЫЕ поля)
    organization_id TEXT NOT NULL,             -- FK на organizations.id
    owner_id TEXT NOT NULL,                    -- FK на users.id

    -- Visibility & Sharing
    visibility TEXT DEFAULT 'private' NOT NULL,  -- private|team|organization
    shared_with TEXT,                          -- JSON array: ["user-id-1", "user-id-2"]

    -- Single Source of Truth
    data TEXT NOT NULL,                        -- JSON объект - ЕДИНСТВЕННЫЙ источник истины

    -- Версионирование
    version TEXT DEFAULT '1.1.0',              -- Формат данных сметы
    app_version TEXT DEFAULT '2.3.0',          -- Версия приложения

    -- Optimistic Locking (защита от race conditions)
    data_version INTEGER DEFAULT 1 NOT NULL,   -- Инкрементируется при каждом UPDATE
    data_hash TEXT,                            -- SHA256 для детекции изменений

    -- Метаданные (извлекаются из JSON для быстрых запросов)
    client_name TEXT,
    client_email TEXT,
    client_phone TEXT,
    pax_count INTEGER DEFAULT 0,
    tour_start TEXT,                           -- ISO date
    tour_end TEXT,                             -- ISO date

    -- Расчёты (кэш для производительности)
    total_cost REAL DEFAULT 0,
    total_profit REAL DEFAULT 0,
    services_count INTEGER DEFAULT 0,

    -- Временные метки
    created_at INTEGER NOT NULL,               -- Unix timestamp
    updated_at INTEGER NOT NULL,
    last_accessed_at INTEGER,                  -- Для LRU cache
    deleted_at INTEGER DEFAULT NULL,           -- Soft delete

    -- Шаблонность
    is_template BOOLEAN DEFAULT 0,             -- Шаблон или реальная смета
    template_name TEXT,

    -- Foreign Keys
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Индексы для производительности
CREATE INDEX idx_estimates_org_updated ON estimates(organization_id, updated_at DESC);
CREATE INDEX idx_estimates_owner ON estimates(owner_id, created_at DESC);
CREATE INDEX idx_estimates_visibility ON estimates(organization_id, visibility);
CREATE INDEX idx_estimates_client ON estimates(organization_id, client_name);
CREATE INDEX idx_estimates_tour_dates ON estimates(organization_id, tour_start, tour_end);
CREATE INDEX idx_estimates_accessed ON estimates(last_accessed_at DESC);
CREATE INDEX idx_estimates_templates ON estimates(organization_id, is_template);
```

### 1.2 Таблица `catalogs` (каталоги услуг)

```sql
CREATE TABLE catalogs (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,

    -- Naming
    name TEXT NOT NULL,
    slug TEXT NOT NULL,                        -- URL-friendly name

    -- Multi-Tenancy
    organization_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,

    -- Visibility & Sharing
    visibility TEXT DEFAULT 'private' NOT NULL,  -- private|team|organization|public
    shared_with_orgs TEXT,                     -- JSON array для cross-org sharing

    -- Data (Single Source of Truth)
    data TEXT NOT NULL,                        -- JSON: {templates: [...], categories: [...]}

    -- Версионирование
    version TEXT DEFAULT '1.2.0',              -- Формат каталога
    app_version TEXT DEFAULT '2.3.0',

    -- Optimistic Locking
    data_version INTEGER DEFAULT 1 NOT NULL,
    data_hash TEXT,

    -- Метаданные (извлекаются из JSON)
    region TEXT,                               -- Регион каталога
    templates_count INTEGER DEFAULT 0,
    categories_count INTEGER DEFAULT 0,

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_accessed_at INTEGER,
    deleted_at INTEGER DEFAULT NULL,

    -- Foreign Keys
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,

    -- Constraints
    UNIQUE(organization_id, slug)
);

-- Индексы
CREATE INDEX idx_catalogs_org ON catalogs(organization_id, updated_at DESC);
CREATE INDEX idx_catalogs_visibility ON catalogs(visibility, organization_id);
CREATE INDEX idx_catalogs_region ON catalogs(organization_id, region);
CREATE INDEX idx_catalogs_slug ON catalogs(slug);
CREATE INDEX idx_catalogs_accessed ON catalogs(last_accessed_at DESC);
```

### 1.3 Таблица `settings` (настройки на 3 уровнях)

```sql
CREATE TABLE settings (
    -- Composite Primary Key
    scope TEXT NOT NULL,                       -- 'app' | 'organization' | 'user'
    scope_id TEXT NOT NULL,                    -- app_id | org_id | user_id
    key TEXT NOT NULL,

    -- Value (JSON для гибкости)
    value TEXT NOT NULL,                       -- JSON value
    value_type TEXT DEFAULT 'string',          -- string|number|boolean|object|array

    -- Метаданные
    description TEXT,
    is_public BOOLEAN DEFAULT 0,               -- Видно ли другим юзерам
    is_encrypted BOOLEAN DEFAULT 0,            -- Для sensitive данных

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    PRIMARY KEY (scope, scope_id, key)
);

-- Индексы
CREATE INDEX idx_settings_scope ON settings(scope, scope_id);
CREATE INDEX idx_settings_key ON settings(key);
```

**Примеры использования:**

```javascript
// App-level (scope='app', scope_id='global')
{
  "storage_type": "sqlite",
  "db_version": "1.0.0",
  "maintenance_mode": false
}

// Organization-level (scope='organization', scope_id=org_id)
{
  "currency": "$",
  "default_tax_rate": 0,
  "default_hidden_markup": 10,
  "booking_terms": "Предоплата 30%..."
}

// User-level (scope='user', scope_id=user_id)
{
  "theme": "dark",
  "language": "ru",
  "default_pax_count": 27,
  "autosave_interval_sec": 8
}
```

### 1.4 Таблица `users` (пользователи)

```sql
CREATE TABLE users (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,

    -- Authentication
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,             -- Формат: username.organization_slug
    password_hash TEXT NOT NULL,               -- bcrypt (10 rounds)

    -- Profile
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    job_title TEXT,

    -- Multi-Tenancy & Role
    organization_id TEXT NOT NULL,
    role TEXT DEFAULT 'user' NOT NULL,         -- superuser|admin|user
    permissions TEXT,                          -- JSON для fine-grained permissions

    -- OAuth (для будущего)
    google_id TEXT UNIQUE,
    oauth_provider TEXT,
    oauth_data TEXT,

    -- Email Verification
    email_verified INTEGER DEFAULT 0,
    email_verification_token TEXT,
    email_verification_expires INTEGER,

    -- Password Reset
    password_reset_token TEXT,
    password_reset_expires INTEGER,

    -- Security
    last_login_at INTEGER,
    last_login_ip TEXT,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until INTEGER,
    two_factor_enabled INTEGER DEFAULT 0,
    two_factor_secret TEXT,

    -- Status
    is_active INTEGER DEFAULT 1,
    deactivated_at INTEGER,
    deactivation_reason TEXT,

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL,

    -- Foreign Keys
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Индексы
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_org ON users(organization_id, role);
CREATE INDEX idx_users_active ON users(is_active, organization_id);
```

**Определения ролей:**

```javascript
const ROLES = {
  SUPERUSER: {
    name: 'superuser',
    level: 100,
    permissions: ['*'],              // Все права
    canAccessAllOrgs: true,
    canManageOrgs: true,
    canExportAll: true
  },
  ADMIN: {
    name: 'admin',
    level: 50,
    permissions: [
      'estimates:*',
      'catalogs:*',
      'users:read', 'users:create', 'users:update',
      'settings:*',
      'export:organization'
    ],
    canAccessAllOrgs: false,
    canManageOrgs: false
  },
  USER: {
    name: 'user',
    level: 10,
    permissions: [
      'estimates:read', 'estimates:create', 'estimates:update',
      'catalogs:read',
      'settings:read'
    ],
    canAccessAllOrgs: false,
    canManageOrgs: false
  }
};
```

### 1.5 Таблица `organizations` (организации)

```sql
CREATE TABLE organizations (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,

    -- Naming
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,                 -- URL-friendly, для username.slug

    -- Branding
    logo_url TEXT,
    primary_color TEXT,                        -- Hex color для UI

    -- Contact
    email TEXT,
    phone TEXT,
    website TEXT,
    address TEXT,                              -- JSON для structured address

    -- Settings (JSON для гибкости)
    settings TEXT,                             -- JSON organization-wide настройки

    -- Subscription & Billing
    plan TEXT DEFAULT 'free' NOT NULL,         -- free|pro|enterprise|custom
    subscription_status TEXT DEFAULT 'active', -- active|trial|suspended|canceled
    trial_ends_at INTEGER,
    subscription_starts_at INTEGER,
    subscription_ends_at INTEGER,
    billing_email TEXT,

    -- Limits (зависят от плана)
    max_users INTEGER DEFAULT 5,
    max_estimates INTEGER DEFAULT 100,
    max_catalogs INTEGER DEFAULT 10,
    storage_limit_mb INTEGER DEFAULT 100,
    api_rate_limit INTEGER DEFAULT 1000,       -- requests/hour

    -- Current Usage (для контроля лимитов)
    current_users_count INTEGER DEFAULT 0,
    current_estimates_count INTEGER DEFAULT 0,
    current_catalogs_count INTEGER DEFAULT 0,
    current_storage_mb REAL DEFAULT 0,

    -- Owner
    owner_id TEXT NOT NULL,

    -- Status
    is_active INTEGER DEFAULT 1,
    suspended_at INTEGER,
    suspension_reason TEXT,

    -- Временные метки
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL,

    -- Foreign Keys
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Индексы
CREATE INDEX idx_orgs_slug ON organizations(slug);
CREATE INDEX idx_orgs_plan ON organizations(plan, subscription_status);
CREATE INDEX idx_orgs_active ON organizations(is_active, created_at DESC);
```

**Subscription Plans:**

| Plan | Price | Max Users | Max Estimates | Max Catalogs | Storage | API Rate |
|------|-------|-----------|---------------|--------------|---------|----------|
| FREE | $0 | 3 | 50 | 5 | 50MB | 500/h |
| PRO | $29/mo | 10 | 500 | 20 | 500MB | 5000/h |
| ENTERPRISE | Custom | Unlimited | Unlimited | Unlimited | Unlimited | 50000/h |

### 1.6 Таблица `backups` (disaster recovery ONLY)

```sql
CREATE TABLE backups (
    -- Primary Key
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Target Reference
    entity_type TEXT NOT NULL,                 -- estimate|catalog|settings
    entity_id TEXT NOT NULL,

    -- Backup Data
    data TEXT NOT NULL,                        -- JSON snapshot
    data_version INTEGER NOT NULL,             -- Версия на момент backup
    data_hash TEXT NOT NULL,                   -- SHA256

    -- Metadata
    backup_type TEXT DEFAULT 'auto',           -- auto|manual|before_delete|before_update
    trigger_event TEXT,                        -- Что вызвало backup

    -- Multi-Tenancy
    organization_id TEXT NOT NULL,
    created_by TEXT,

    -- Retention
    expires_at INTEGER,                        -- Автоудаление старых backups
    is_permanent BOOLEAN DEFAULT 0,            -- Не удалять никогда

    -- Временные метки
    created_at INTEGER NOT NULL,

    -- Foreign Keys
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Индексы
CREATE INDEX idx_backups_entity ON backups(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_backups_org ON backups(organization_id, created_at DESC);
CREATE INDEX idx_backups_expires ON backups(expires_at);
```

**Backup Policies:**

```javascript
const BACKUP_POLICIES = {
  AUTO: {
    trigger: 'periodic',
    interval: 6 * 60 * 60,          // Каждые 6 часов
    retention: 7 * 24 * 60 * 60,    // 7 дней
    maxCount: 28                    // 28 backups max
  },
  BEFORE_DELETE: {
    trigger: 'before_delete',
    retention: 30 * 24 * 60 * 60,   // 30 дней
    isPermanent: false
  },
  MANUAL: {
    trigger: 'user_action',
    retention: null,                // Пока пользователь не удалит
    isPermanent: true
  }
};
```

### 1.7 Таблица `audit_logs` (для версионирования и истории)

```sql
CREATE TABLE audit_logs (
    -- Primary Key
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Target Entity
    entity_type TEXT NOT NULL,                 -- estimate|catalog|user|setting
    entity_id TEXT NOT NULL,

    -- Action
    action TEXT NOT NULL,                      -- create|update|delete|restore

    -- Changes (для update действий)
    changes TEXT,                              -- JSON diff: {field: {old, new}}
    snapshot_before TEXT,                      -- Full state before (optional)
    snapshot_after TEXT,                       -- Full state after (optional)

    -- Actor
    user_id TEXT NOT NULL,
    user_ip TEXT,
    user_agent TEXT,

    -- Multi-Tenancy
    organization_id TEXT NOT NULL,

    -- Metadata
    metadata TEXT,                             -- Дополнительная информация

    -- Временные метки
    created_at INTEGER NOT NULL,

    -- Foreign Keys
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Индексы
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_org ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, entity_type);
```

---

## 2. ЛОКАЛЬНОЕ ХРАНИЛИЩЕ (localStorage кэш)

### 2.1 Концепция

**Принцип:** Server-First Logic
- Сервер = источник истины (Single Source of Truth)
- localStorage = временный кэш для offline работы и производительности
- При конфликте ВСЕГДА выигрывает сервер

### 2.2 Структура кэша

```javascript
{
  // Метаданные кэша
  "cache_metadata": {
    "version": "1.0.0",
    "last_sync": 1732012345678,      // Timestamp последней синхронизации
    "user_id": "user-123",
    "organization_id": "org-456"
  },

  // Списки (для быстрого отображения, ВСЕГДА в кэше)
  "estimates_list": [
    {
      id: "uuid-1",
      filename: "client_2025.json",
      client_name: "Иванов",
      updated_at: 1732012345678,
      data_version: 5,
      cached_at: 1732012345678
    }
  ],

  // Полные данные (последние N открытых смет, LRU policy)
  "estimates_full": {
    "uuid-1": {
      id: "uuid-1",
      data: {...full estimate...},
      data_version: 5,
      cached_at: 1732012345678,
      last_accessed: 1732012345678
    }
  },

  // Каталоги (все регионы)
  "catalogs": {
    "ushuaia": {
      id: "cat-123",
      data: {templates: [...], categories: [...]},
      data_version: 3,
      cached_at: 1732012345678
    }
  },

  // User settings (быстрый доступ)
  "user_settings": {
    theme: "dark",
    language: "ru",
    default_pax_count: 27
  },

  // Organization settings
  "org_settings": {
    currency: "$",
    default_tax_rate: 0
  }
}
```

### 2.3 LRU Cache Policy

```javascript
const CACHE_CONFIG = {
  MAX_FULL_ESTIMATES: 10,           // Максимум 10 полных смет в кэше
  MAX_CATALOGS: 5,                  // Максимум 5 каталогов
  MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,  // 7 дней
  SYNC_INTERVAL_MS: 5 * 60 * 1000,      // Синхронизация каждые 5 минут
};
```

**Eviction Strategy:**
1. Сортировка по `last_accessed` (LRU - Least Recently Used)
2. Удаление самых старых items при превышении лимита
3. Удаление items старше 7 дней автоматически

### 2.4 Cache Invalidation Rules

Кэш очищается/обновляется при:

1. **User logout** - clearAllCache()
2. **Organization change** - clearCacheExcept(['user_settings'])
3. **Server version mismatch** - invalidateCatalogCache()
4. **Manual refresh** - invalidateEstimatesList() + reloadFromServer()
5. **Stale data** (> 7 days) - deleteCachedItem(id)

---

## 3. МЕХАНИЗМ СИНХРОНИЗАЦИИ

### 3.1 SyncManager (Frontend компонент)

```javascript
class SyncManager {
  constructor(apiClient, cacheManager) {
    this.apiClient = apiClient;
    this.cache = cacheManager;
    this.syncInterval = 5 * 60 * 1000;  // 5 минут
    this.syncTimer = null;
    this.isSyncing = false;
    this.pendingChanges = [];           // Очередь изменений для отправки
  }

  start() {
    this.syncTimer = setInterval(() => {
      this.performSync();
    }, this.syncInterval);

    // Немедленная синхронизация при старте
    this.performSync();
  }

  async performSync() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      // PHASE 1: Push local changes
      await this.pushLocalChanges();

      // PHASE 2: Pull server updates
      await this.pullServerUpdates();

      // PHASE 3: Cleanup stale cache
      await this.cleanupCache();

      this.cache.updateSyncMetadata({
        last_sync: Date.now(),
        status: 'success'
      });
    } catch (error) {
      console.error('Sync failed:', error);
      this.cache.updateSyncMetadata({
        last_sync: Date.now(),
        status: 'error',
        error: error.message
      });
    } finally {
      this.isSyncing = false;
    }
  }
}
```

### 3.2 Push Strategy (локальные изменения → сервер)

```javascript
async pushLocalChanges() {
  if (this.pendingChanges.length === 0) return;

  const batch = this.pendingChanges.splice(0, 50);  // Батчами по 50

  try {
    const response = await this.apiClient.syncBatch({
      changes: batch.map(change => ({
        entity_type: change.entityType,
        entity_id: change.entityId,
        action: change.action,
        data: change.data,
        client_version: change.dataVersion,
        timestamp: change.timestamp
      }))
    });

    // Обработка результатов
    response.results.forEach((result, index) => {
      if (result.status === 'conflict') {
        this.handleConflict(batch[index], result.serverData);
      } else if (result.status === 'success') {
        this.cache.updateCachedItem(
          result.entity_type,
          result.entity_id,
          result.serverData
        );
      }
    });
  } catch (error) {
    // Возвращаем в очередь при ошибке
    this.pendingChanges.unshift(...batch);
    throw error;
  }
}
```

### 3.3 Pull Strategy (сервер → локальный кэш)

```javascript
async pullServerUpdates() {
  const lastSync = this.cache.getLastSyncTimestamp();

  const updates = await this.apiClient.getUpdatesSince({
    timestamp: lastSync,
    entity_types: ['estimate', 'catalog', 'setting']
  });

  for (const update of updates.changes) {
    const cachedItem = this.cache.getCachedItem(
      update.entity_type,
      update.entity_id
    );

    if (!cachedItem) {
      this.cache.addToCacheIfSpace(update.entity_type, update);
    } else if (update.data_version > cachedItem.data_version) {
      this.cache.updateCachedItem(
        update.entity_type,
        update.entity_id,
        update
      );
    } else if (update.deleted_at) {
      this.cache.removeCachedItem(
        update.entity_type,
        update.entity_id
      );
    }
  }
}
```

### 3.4 Conflict Resolution Strategy

**Server-First Policy** (сервер всегда приоритет):

1. **Version Conflict** - попытка 3-way merge автоматически
2. **Если merge не удался** - показать UI для ручного разрешения
3. **Delete Conflict** - спросить пользователя: restore или accept deletion
4. **Permission Conflict** - показать ошибку доступа

```javascript
async handleConflict(localChange, serverData) {
  const conflictType = this.detectConflictType(localChange, serverData);

  switch (conflictType) {
    case 'VERSION_CONFLICT':
      return await this.resolveVersionConflict(localChange, serverData);

    case 'DELETE_CONFLICT':
      return await this.resolveDeleteConflict(localChange, serverData);

    case 'PERMISSION_CONFLICT':
      return await this.resolvePermissionConflict(localChange, serverData);

    default:
      // Неизвестный тип - всегда server wins
      return this.acceptServerVersion(serverData);
  }
}
```

**3-way merge для автоматического разрешения:**

```javascript
threeWayMerge(base, local, server) {
  const merged = { ...server };  // Начинаем с серверной версии

  for (const field of ['clientName', 'clientEmail', 'services', 'paxCount']) {
    const baseVal = base?.[field];
    const localVal = local[field];
    const serverVal = server[field];

    // Если только локально изменено - берём локальное
    if (localVal !== baseVal && serverVal === baseVal) {
      merged[field] = localVal;
    }
    // Если только на сервере - уже взято (server wins)
    // Если оба изменили - конфликт, берём серверное (server-first)
  }

  // Специальная логика для массива services
  if (Array.isArray(local.services) && Array.isArray(server.services)) {
    merged.services = this.mergeServices(
      base?.services || [],
      local.services,
      server.services
    );
  }

  return merged;
}
```

### 3.5 Optimistic Locking

```sql
-- Server-side UPDATE с проверкой версии
UPDATE estimates
SET
  data = ?,
  data_version = data_version + 1,  -- Increment версии
  data_hash = ?,
  updated_at = ?
WHERE id = ?
  AND organization_id = ?
  AND data_version = ?  -- КРИТИЧНО: проверка версии!
```

Если `changes = 0` → **VersionConflictError**

---

## 4. АРХИТЕКТУРА API

### 4.1 Список всех endpoints (28 total)

#### Estimates API (8 endpoints)

| Метод | Endpoint | Auth | Permissions | Описание |
|-------|----------|------|-------------|----------|
| GET | `/api/v1/estimates` | ✓ | user | Список смет с фильтрацией |
| GET | `/api/v1/estimates/:id` | ✓ | owner/shared | Получить смету |
| POST | `/api/v1/estimates` | ✓ | user | Создать смету |
| PUT | `/api/v1/estimates/:id` | ✓ | owner/admin | Обновить смету |
| DELETE | `/api/v1/estimates/:id` | ✓ | owner/admin | Удалить (soft) |
| POST | `/api/v1/estimates/:id/restore` | ✓ | owner/admin | Восстановить |
| PUT | `/api/v1/estimates/:id/rename` | ✓ | owner/admin | Переименовать |
| POST | `/api/v1/estimates/:id/share` | ✓ | owner/admin | Поделиться |

#### Catalogs API (3 endpoints)

| Метод | Endpoint | Auth | Permissions | Описание |
|-------|----------|------|-------------|----------|
| GET | `/api/v1/catalogs` | ✓ | user | Список каталогов |
| GET | `/api/v1/catalogs/:id` | ✓ | user | Получить каталог |
| POST | `/api/v1/catalogs` | ✓ | user | Создать/обновить |

#### Settings API (2 endpoints)

| Метод | Endpoint | Auth | Permissions | Описание |
|-------|----------|------|-------------|----------|
| GET | `/api/v1/settings` | ✓ | user | Получить настройки |
| PUT | `/api/v1/settings` | ✓ | user | Обновить настройки |

#### Sync API (2 endpoints)

| Метод | Endpoint | Auth | Permissions | Описание |
|-------|----------|------|-------------|----------|
| GET | `/api/v1/sync/updates` | ✓ | user | Получить обновления |
| POST | `/api/v1/sync/batch` | ✓ | user | Отправить изменения |

#### Authentication API (3 endpoints)

| Метод | Endpoint | Auth | Permissions | Описание |
|-------|----------|------|-------------|----------|
| POST | `/api/v1/auth/register` | - | - | Регистрация org+admin |
| POST | `/api/v1/auth/login` | - | - | Авторизация |
| POST | `/api/v1/auth/logout` | ✓ | user | Выход |

#### Users API (3 endpoints)

| Метод | Endpoint | Auth | Permissions | Описание |
|-------|----------|------|-------------|----------|
| GET | `/api/v1/users` | ✓ | admin | Список пользователей |
| POST | `/api/v1/users` | ✓ | admin | Создать пользователя |
| PUT | `/api/v1/users/:id` | ✓ | admin/self | Обновить |

#### Organizations API (3 endpoints)

| Метод | Endpoint | Auth | Permissions | Описание |
|-------|----------|------|-------------|----------|
| GET | `/api/v1/organizations` | ✓ | superuser | Список org |
| GET | `/api/v1/organizations/:id` | ✓ | member | Получить org |
| PUT | `/api/v1/organizations/:id` | ✓ | admin | Обновить org |

#### Export/Import API (4 endpoints)

| Метод | Endpoint | Auth | Permissions | Описание |
|-------|----------|------|-------------|----------|
| GET | `/api/v1/export/organization` | ✓ | admin | Экспорт org |
| GET | `/api/v1/export/full` | ✓ | superuser | Экспорт всего |
| POST | `/api/v1/import/organization` | ✓ | admin | Импорт org |
| POST | `/api/v1/import/full` | ✓ | superuser | Импорт всего |

### 4.1.1 Структура файлов API (Модульная архитектура)

**Расположение:** `routes/api-v1/`

Для удобства поддержки, все 28 endpoints разбиты на 8 модулей:

```
routes/
├── api-v1.js                  # Главный router, объединяет все модули
└── api-v1/
    ├── auth.js                # 3 endpoints - Регистрация, вход, выход
    ├── estimates.js           # 8 endpoints - CRUD смет
    ├── catalogs.js            # 3 endpoints - Каталоги услуг
    ├── settings.js            # 2 endpoints - Настройки
    ├── sync.js                # 2 endpoints - Синхронизация
    ├── users.js               # 3 endpoints - Управление пользователями
    ├── organizations.js       # 3 endpoints - Управление организациями
    └── export.js              # 4 endpoints - Экспорт/импорт данных
```

**Middleware:** `middleware/`
```
middleware/
├── jwt-auth.js                # JWT authentication (requireAuth, generateToken)
└── rbac.js                    # Role-based access control (requireRole, requireOwnership)
```

**Подключение в server:**
```javascript
const apiV1Router = require('./routes/api-v1');
app.use('/api/v1', apiV1Router);
```

### 4.2 Пример endpoint спецификации

**GET `/api/v1/estimates`**

```
Query Parameters:
  - page: number (default: 1)
  - limit: number (default: 50, max: 200)
  - sort: string (created_at|updated_at|client_name|tour_start) (default: updated_at)
  - order: string (asc|desc) (default: desc)
  - filter: object {
      client_name?: string,
      tour_start_from?: timestamp,
      tour_start_to?: timestamp,
      is_template?: boolean
    }
  - include_deleted: boolean (default: false, только для admin)

Response 200:
{
  "success": true,
  "data": {
    "estimates": [
      {
        "id": "uuid",
        "filename": "client_2025.json",
        "client_name": "Иванов",
        "pax_count": 27,
        "total_cost": 5000,
        "data_version": 5,
        "updated_at": 1732012346
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 234,
      "total_pages": 5
    }
  }
}

Errors:
  401 - Unauthorized
  403 - Forbidden
  500 - Server error
```

**POST `/api/v1/sync/batch`**

```
Body:
{
  "changes": [
    {
      "entity_type": "estimate",
      "entity_id": "uuid-123",
      "action": "update",
      "data": {...},
      "client_version": 5,
      "timestamp": 1732012345
    }
  ]
}

Response 200:
{
  "success": true,
  "data": {
    "results": [
      {
        "entity_type": "estimate",
        "entity_id": "uuid-123",
        "status": "success",           // success|conflict|error
        "data_version": 6,
        "serverData": {...}
      },
      {
        "entity_type": "estimate",
        "entity_id": "uuid-456",
        "status": "conflict",
        "serverData": {...},
        "server_version": 8,
        "conflict_type": "version_mismatch"
      }
    ],
    "server_timestamp": 1732012400
  }
}
```

---

## 5. ИМПОРТ/ЭКСПОРТ

### 5.1 Organization Export Format

```json
{
  "export_version": "1.0.0",
  "export_type": "organization",
  "exported_at": 1732012345,
  "exported_by": {
    "user_id": "user-123",
    "username": "admin.travel-agency",
    "email": "admin@example.com"
  },

  "organization": {
    "id": "org-456",
    "name": "Travel Agency",
    "slug": "travel-agency",
    "plan": "pro"
  },

  "data": {
    "estimates": [
      {
        "id": "est-123",
        "filename": "client_2025.json",
        "organization_id": "org-456",  // ФИКСИРОВАН в файле
        "owner_id": "user-123",
        "data": {...},
        "data_version": 5
      }
    ],

    "catalogs": [
      {
        "id": "cat-456",
        "name": "Ushuaia",
        "organization_id": "org-456",  // ФИКСИРОВАН
        "data": {...}
      }
    ],

    "settings": {
      "organization": {
        "currency": "$",
        "default_tax_rate": 0
      }
    }
  },

  "metadata": {
    "total_estimates": 234,
    "total_catalogs": 12,
    "app_version": "2.3.0"
  }
}
```

### 5.2 Import Logic (КРИТИЧНО)

```javascript
async importOrganizationData(importFile, currentUser, currentOrg) {
  // 1. Валидация
  validateImportFile(importFile);

  // 2. Проверка лимитов
  checkLimits(importFile, currentOrg);

  // 3. Backup ВСЕЙ организации перед импортом
  await createFullOrganizationBackup(currentOrg.id);

  // 4. Транзакция
  await db.transaction(async (tx) => {
    // 4.1. Удалить текущие данные организации
    await tx.run('DELETE FROM estimates WHERE organization_id = ?', [currentOrg.id]);

    // 4.2. Импортировать с АВТОПОДСТАНОВКОЙ
    for (const estimate of importFile.data.estimates) {
      await tx.run(`
        INSERT INTO estimates (
          id, filename, data, data_version,
          organization_id, owner_id,      -- ПОДСТАВЛЯЕМ АВТОМАТИЧЕСКИ!
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        estimate.id,
        estimate.filename,
        estimate.data,
        estimate.data_version,
        currentOrg.id,        // ТЕКУЩАЯ организация
        currentUser.id,       // ТЕКУЩИЙ пользователь
        estimate.created_at,
        Date.now()
      ]);
    }
  });
}
```

**ВАЖНО:** При импорте:
- ✅ `organization_id` ВСЕГДА текущей организации
- ✅ `owner_id` ВСЕГДА текущего пользователя
- ✅ Невозможно повредить данные других организаций
- ✅ Backup создаётся ДО импорта

### 5.3 Валидация импорта

```javascript
class ImportValidator {
  async validate(importFile, currentOrg) {
    const errors = [];

    // 1. Версия экспорта
    if (importFile.export_version !== CURRENT_EXPORT_VERSION) {
      errors.push('Incompatible export version');
    }

    // 2. Лимиты организации
    if (importFile.metadata.total_estimates > currentOrg.max_estimates) {
      errors.push(`Exceeds estimate limit: ${importFile.metadata.total_estimates} > ${currentOrg.max_estimates}`);
    }

    // 3. Схема каждого estimate
    for (const estimate of importFile.data.estimates) {
      const schemaErrors = this.validateEstimateSchema(estimate);
      if (schemaErrors.length > 0) {
        errors.push(`Estimate ${estimate.id}: ${schemaErrors.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

---

## 6. УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ И ОРГАНИЗАЦИЯМИ

### 6.1 Username Format

**Формат:** `prefix.organization_slug`

**Правила:**
- Для обычных пользователей: обязателен суффикс `.org_slug`
- Для superuser: может быть без суффикса
- Автогенерация из email: `email_prefix.org_slug`

**Примеры:**
```
admin@travel.com → admin.travel-agency
john.doe@company.com → john.doe.my-company
superuser (глобальный admin, без суффикса)
```

**Валидация:**

```javascript
function validateUsername(username, organizationSlug, role) {
  if (role === 'superuser') {
    return /^[a-z0-9._-]+$/i.test(username);
  }

  const parts = username.split('.');
  if (parts.length < 2) {
    throw new Error('Username must be in format: prefix.organization');
  }

  const orgPart = parts[parts.length - 1];
  if (orgPart !== organizationSlug) {
    throw new Error(`Username must end with .${organizationSlug}`);
  }

  return true;
}
```

### 6.2 Роли и права доступа

| Роль | Уровень | Может видеть | Может редактировать | Специальные права |
|------|---------|--------------|---------------------|-------------------|
| **user** | 10 | Свои estimates + shared | Только свои estimates | - |
| **admin** | 50 | Все estimates org | Все estimates org | Управление пользователями, экспорт org |
| **superuser** | 100 | Все org, все данные | Все org, все данные | Управление org, планами, full export |

### 6.3 UI по ролям

**User видит:**
- Dashboard с estimates
- Catalogs
- Свои settings

**Admin видит дополнительно:**
- `/admin/users` - управление пользователями
- `/admin/organization` - настройки организации
- Export/Import функции

**Superuser видит дополнительно:**
- `/superadmin/organizations` - список всех org
- Переключение между организациями
- Full export/import
- Управление планами и лимитами

---

## 7. ПЛАН МИГРАЦИИ

### Фаза 0: Подготовка (1 день до миграции)

**Задачи:**
- [ ] Создать полный backup БД: `cp db/quotes.db db/quotes.db.backup-$(date +%s)`
- [ ] Экспортировать все данные в JSON через API
- [ ] Сохранить dump localStorage в файл
- [ ] Проверить версии: app_version, catalog_version
- [ ] Оценить объём данных (количество estimates, catalogs, размер БД)
- [ ] Уведомить пользователей о предстоящем обновлении (email/notification)

### Фаза 1: Расширение схемы БД (09:00-10:00, 30 мин downtime)

```bash
# 1. Остановить приложение
docker compose down

# 2. Backup
cp db/quotes.db db/quotes.db.pre-migration-$(date +%s)

# 3. Применить миграции
node db/migrations/runner.js up 006  # Add multi-tenancy fields
node db/migrations/runner.js up 007  # Migrate existing data
node db/migrations/runner.js up 008  # Make fields NOT NULL

# 4. Создать дефолтную организацию и админа
node scripts/create-default-org.js
```

**Migration 006:**
```sql
ALTER TABLE estimates ADD COLUMN organization_id TEXT;
ALTER TABLE estimates ADD COLUMN owner_id TEXT;
ALTER TABLE estimates ADD COLUMN visibility TEXT DEFAULT 'private';
ALTER TABLE estimates ADD COLUMN shared_with TEXT;
```

**Migration 007:**
```sql
-- Создать org и admin
INSERT INTO organizations (id, name, slug, plan, owner_id, created_at, updated_at)
VALUES ('default-org', 'Default Organization', 'default', 'pro', 'admin-user-id', unixepoch(), unixepoch());

INSERT INTO users (id, email, username, password_hash, role, organization_id, is_active, created_at, updated_at)
VALUES ('admin-user-id', 'admin@localhost', 'admin', '$2b$10$...', 'admin', 'default-org', 1, unixepoch(), unixepoch());

-- Мигрировать существующие estimates
UPDATE estimates
SET organization_id = 'default-org',
    owner_id = 'admin-user-id',
    visibility = 'organization'
WHERE organization_id IS NULL;
```

### Фаза 2: Миграция Catalogs (10:00-11:00)

```bash
# Запустить приложение в migration mode
MIGRATION_MODE=true node server-with-db.js

# В отдельном терминале
node scripts/migrate-catalogs.js
```

**migrate-catalogs.js:**
```javascript
// Читаем из localStorage backup
const regions = ['Ushuaia', 'Patagonia', 'Buenos Aires'];

for (const region of regions) {
  const templates = readFromBackup(`quoteCalc_templates_${region}`);
  const categories = readFromBackup(`quoteCalc_categories_${region}`);

  await apiClient.post('/api/v1/catalogs', {
    name: `${region} Services`,
    slug: region.toLowerCase(),
    region: region,
    data: JSON.stringify({templates, categories}),
    visibility: 'organization'
  });
}
```

### Фаза 3: Миграция Settings (11:00-11:15)

```javascript
// User settings
await apiClient.put('/api/v1/settings', {
  scope: 'user',
  settings: {
    theme: localStorage.getItem('quoteCalc_theme'),
    currentMode: localStorage.getItem('quoteCalc_currentMode')
  }
});

// Org settings
await apiClient.put('/api/v1/settings', {
  scope: 'organization',
  settings: {
    currentRegion: localStorage.getItem('quoteCalc_currentRegion'),
    regions: JSON.parse(localStorage.getItem('quoteCalc_regions'))
  }
});
```

### Фаза 4: Валидация миграции (11:15-11:45)

```javascript
async function validateMigration() {
  // 1. Проверить организацию
  const orgs = await apiClient.get('/api/v1/organizations');
  assert(orgs.data.organizations.length > 0, 'No organizations found');

  // 2. Проверить estimates
  const estimates = await apiClient.get('/api/v1/estimates?limit=1000');
  const withoutOrg = estimates.data.estimates.filter(e => !e.organization_id);
  assert(withoutOrg.length === 0, 'Estimates without organization_id found');

  // 3. Проверить catalogs
  const catalogs = await apiClient.get('/api/v1/catalogs');
  assert(catalogs.data.catalogs.length > 0, 'No catalogs found');

  // 4. Проверить админа
  await apiClient.login('admin@localhost', 'admin123');

  console.log('✅ Migration validated successfully');
}
```

### Фаза 5: Включение синхронизации (11:45-12:00)

```javascript
// В index.html добавить
const syncManager = new SyncManager(apiClient, cacheManager);
syncManager.start();

// Первая полная синхронизация
await syncManager.performFullSync();
```

### Фаза 6: Финальная проверка (12:00-13:00)

**Checklist:**
- [ ] Открыть приложение в браузере
- [ ] Войти как admin@localhost / admin123
- [ ] Проверить список смет - все на месте?
- [ ] Открыть смету - загружается корректно?
- [ ] Проверить каталоги - все регионы доступны?
- [ ] Создать новую смету - сохраняется?
- [ ] Проверить autosave - работает?
- [ ] Проверить синхронизацию - работает?

### Rollback Plan

```bash
# При любых проблемах на любой фазе:

# 1. Остановить приложение
docker compose down

# 2. Восстановить backup
cp db/quotes.db.pre-migration-TIMESTAMP db/quotes.db

# 3. Откатить миграции
node db/migrations/runner.js down 008
node db/migrations/runner.js down 007
node db/migrations/runner.js down 006

# 4. Запустить приложение
docker compose up
```

**Total time:** ~4 часа
**Downtime:** ~30 минут (только фазы 1-4)

---

## 8. DATA FLOW ДИАГРАММЫ

### 8.1 Создание новой сметы

```
1. User заполняет форму в браузере
   ↓
2. ProfessionalQuoteCalculator.createNewQuote()
   - Генерирует UUID для id
   - Создаёт объект estimate data
   ↓
3. apiClient.saveEstimate(id, data)
   - POST /api/v1/estimates
   - Headers: Authorization: Bearer {jwt_token}
   ↓
4. Server: POST /api/v1/estimates handler
   - Проверяет authentication (req.user exists?)
   - Проверяет лимиты (current_estimates < max_estimates?)
   - Валидирует data schema (Joi)
   ↓
5. SQLiteStorage.saveEstimate(id, data, userId, orgId)
   - Извлекает метаданные (client_name, tour_start)
   - Вычисляет data_hash (SHA256)
   - BEGIN TRANSACTION
   ↓
6. INSERT INTO estimates
   - id, filename, data, data_version=1
   - organization_id, owner_id (из req.user)
   - метаданные, timestamps
   ↓
7. INSERT INTO audit_logs
   - entity_type='estimate', action='create'
   - snapshot_after=data
   ↓
8. UPDATE organizations
   - SET current_estimates_count = current_estimates_count + 1
   ↓
9. COMMIT TRANSACTION
   ↓
10. Response to frontend
    - {success: true, id, data_version: 1}
    ↓
11. Frontend updates cache
    - Добавляет в estimates_list
    - Добавляет в estimates_full
    - Обновляет UI
```

### 8.2 Autosave (каждые 2 секунды после изменения)

```
1. User изменяет services в смете
   ↓
2. Event handler → scheduleAutosave()
   - Проверяет isLoadingQuote flag (если true → return)
   - Сбрасывает предыдущий timeout
   - Устанавливает новый timeout (2 sec)
   ↓
3. Через 2 сек: executeAutosave()
   - Собирает currentState из UI
   - Добавляет в syncManager.pendingChanges
   ↓
4. SyncManager (каждые 5 минут)
   - Берёт batch pendingChanges (до 50)
   - POST /api/v1/sync/batch
   ↓
5. Server обрабатывает batch
   - Для каждого change:
     * Проверяет data_version (optimistic lock)
     * Если match → UPDATE с increment version
     * Если conflict → возвращает server data
   ↓
6. Response
   - {results: [{status: "success", data_version: 6}, ...]}
   ↓
7. SyncManager обрабатывает результаты
   - Success: обновляет cache.data_version
   - Conflict: вызывает handleConflict()
```

### 8.3 Синхронизация (каждые 5 минут)

```
┌─ SyncManager.performSync()
│
├─ PHASE 1: Push local changes
│  ├─ pendingChanges → POST /api/v1/sync/batch
│  ├─ Server проверяет optimistic locking
│  └─ Обработка: success|conflict
│
├─ PHASE 2: Pull server updates
│  ├─ GET /api/v1/sync/updates?since={last_sync}
│  ├─ Response: [{entity_id, data_version, updated_at}]
│  ├─ Для каждого update:
│  │  ├─ Если server.version > cache.version → Fetch full data
│  │  └─ Если deleted → Remove from cache
│  └─ Update cache
│
└─ PHASE 3: Cleanup stale cache
   ├─ Удалить items старше 7 дней
   └─ LRU eviction если превышен лимит
```

---

## 9. EDGE CASES И СЦЕНАРИИ

### 9.1 Concurrent Modifications (2 пользователя редактируют одну смету)

**Сценарий:**
```
T0: User A загружает estimate (data_version=5)
T1: User B загружает estimate (data_version=5)
T2: User A сохраняет → data_version=6
T3: User B пытается сохранить (client_version=5, server_version=6)
```

**Решение:**
```sql
-- Server проверяет версию
UPDATE estimates
SET data = ?, data_version = data_version + 1
WHERE id = ? AND data_version = ?  -- Client version

-- Если changes = 0 → VERSION_CONFLICT
```

Frontend получает error:
```javascript
{
  type: 'VERSION_CONFLICT',
  clientVersion: 5,
  serverVersion: 6,
  serverData: {...}
}
```

Автоматический 3-way merge или показ UI для ручного разрешения.

### 9.2 Network Failure во время autosave

**Решение:** Retry logic с exponential backoff

```javascript
async pushLocalChanges() {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await apiClient.saveEstimate(id, data);
      return { success: true };
    } catch (error) {
      if (error.type === 'NETWORK_ERROR') {
        attempt++;
        await sleep(Math.pow(2, attempt) * 1000);  // 2s, 4s, 8s
        continue;
      }
      throw error;
    }
  }

  // После 3 попыток → offline queue
  this.offlineQueue.add({ id, data, timestamp: Date.now() });
}
```

### 9.3 Deletion Conflict

**Сценарий:** User A редактирует смету, User B (admin) удаляет её

**Решение:**
```javascript
catch (error) {
  if (error.type === 'NOT_FOUND') {
    const restore = await confirm('Смета была удалена. Восстановить?');
    if (restore) {
      await apiClient.post(`/api/v1/estimates/${id}/restore`);
      await apiClient.saveEstimate(id, data);
    }
  }
}
```

### 9.4 Превышение лимитов при импорте

**Проверка перед импортом:**
```javascript
if (importFile.metadata.total_estimates + org.current_estimates_count > org.max_estimates) {
  throw new LimitExceededError({
    limit: org.max_estimates,
    current: org.current_estimates_count,
    trying_to_add: importFile.metadata.total_estimates
  });
}
```

UI показывает:
```
❌ Import would exceed estimate limit (75 > 50)

[Upgrade to Pro Plan]  [Cancel]
```

---

## 10. БЕЗОПАСНОСТЬ API

### 10.1 Authentication (JWT)

```javascript
const jwt = require('jsonwebtoken');

function generateToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    org: user.organization_id,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)  // 7 days
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    issuer: 'quote-calculator',
    audience: 'quote-calculator-api'
  });
}
```

### 10.2 Authorization (RBAC + Resource-based)

```javascript
// Role-Based
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Resource-Based (ownership check)
async function checkEstimateOwnership(req, res, next) {
  const estimate = await db.prepare(`
    SELECT * FROM estimates
    WHERE id = ? AND deleted_at IS NULL
  `).get(req.params.id);

  const hasAccess = (
    estimate.owner_id === req.user.id ||
    estimate.organization_id === req.user.organization_id &&
      (estimate.visibility === 'organization' ||
       (estimate.shared_with || '').includes(req.user.id)) ||
    req.user.role === 'superuser'
  );

  if (!hasAccess) {
    return res.status(403).json({ error: 'Access denied' });
  }

  req.estimate = estimate;
  next();
}
```

### 10.3 Input Validation (Joi)

```javascript
const Joi = require('joi');

const estimateSchema = Joi.object({
  filename: Joi.string().max(255).required(),
  data: Joi.object({
    version: Joi.string().valid('1.1.0').required(),
    state: Joi.object({
      services: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          name: Joi.string().max(100).required(),
          price: Joi.number().min(0).required(),
          quantity: Joi.number().integer().min(0).required()
        })
      ).required()
    }).required()
  }).required()
});

// Middleware
app.post('/api/v1/estimates',
  validateBody(estimateSchema),
  createEstimate
);
```

### 10.4 Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const orgRateLimiter = rateLimit({
  max: async (req) => {
    if (!req.user) return 100;
    const org = await getOrganization(req.user.organization_id);
    return org.api_rate_limit || 1000;
  },
  windowMs: 60 * 60 * 1000,  // 1 hour
  keyGenerator: (req) => req.user ? req.user.organization_id : req.ip
});

app.use('/api/v1/', orgRateLimiter);
```

### 10.5 SQL Injection Prevention

```javascript
// ✅ ПРАВИЛЬНО - prepared statements
db.prepare('SELECT * FROM estimates WHERE id = ?').get(estimateId);

// ❌ НЕПРАВИЛЬНО - string concatenation
db.exec(`SELECT * FROM estimates WHERE id = '${estimateId}'`);
```

### 10.6 XSS Prevention

```javascript
// Backend - Content Security Policy
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));

// Frontend - Output encoding
element.textContent = userInput;  // ✅ Safe
element.innerHTML = userInput;    // ❌ Dangerous
```

---

## 11. CHECKLIST ДЛЯ РАЗРАБОТЧИКОВ

### Архитектурные принципы

- [ ] **ID-First Pattern** - все операции используют UUID как ключ
- [ ] **Single Source of Truth** - только estimates table для runtime
- [ ] **Optimistic Locking** - data_version проверяется при UPDATE
- [ ] **Multi-Tenancy** - organization_id NOT NULL везде
- [ ] **Server-First Logic** - сервер = источник истины

### База данных

- [ ] 7 таблиц созданы с правильными схемами
- [ ] Индексы для производительности добавлены
- [ ] Foreign keys enabled (PRAGMA foreign_keys=ON)
- [ ] Triggers для auto updated_at работают
- [ ] Миграции идемпотентны и имеют rollback

### API

- [ ] 28 endpoints реализованы
- [ ] JWT authentication работает
- [ ] RBAC authorization настроена
- [ ] Input validation (Joi) на всех endpoints
- [ ] Rate limiting активен
- [ ] Audit logging работает

### Frontend

- [ ] SyncManager запущен и работает
- [ ] CacheManager LRU eviction работает
- [ ] Conflict resolution UI реализован
- [ ] Autosave с guard flags
- [ ] Offline queue для failed requests

### Безопасность

- [ ] Prepared statements везде (SQL injection)
- [ ] CSP headers настроены (XSS)
- [ ] Password hashing (bcrypt, 10 rounds)
- [ ] Rate limiting по планам
- [ ] Audit logs для всех операций

### Тестирование

- [ ] Backend unit tests (SQLiteStorage)
- [ ] API integration tests
- [ ] Frontend unit tests (SyncManager, CacheManager)
- [ ] E2E tests (migration flow)
- [ ] Performance tests (1000+ estimates)

### Миграция

- [ ] Backup стратегия определена
- [ ] Миграции протестированы на копии БД
- [ ] Rollback plan готов
- [ ] Валидация скрипты написаны
- [ ] Пользователи уведомлены

### Документация

- [ ] API documentation (OpenAPI/Swagger)
- [ ] Database schema documented
- [ ] Migration guide написан
- [ ] User guide обновлён
- [ ] Troubleshooting guide готов

---

## 12. МЕТРИКИ УСПЕХА

### Performance

- **API response time:** < 100ms (P95)
- **Sync time:** < 5s для 50 items
- **Cache hit ratio:** > 80%
- **Database size:** < 500MB для Pro plan

### Reliability

- **Uptime:** > 99.5%
- **Data loss:** ZERO
- **Conflict resolution success:** > 95%
- **Backup recovery time:** < 5 minutes

### Security

- **SQL injection vulnerabilities:** ZERO
- **XSS vulnerabilities:** ZERO
- **Rate limiting effectiveness:** < 1% abuse
- **Audit log coverage:** 100% операций

### User Experience

- **Autosave reliability:** > 99%
- **Offline queue success:** > 95%
- **Migration success:** 100% (zero manual intervention)
- **Conflict UI clarity:** User-friendly, понятно без документации

---

## ЗАКЛЮЧЕНИЕ

Данная архитектурная спецификация описывает полную миграцию Quote Calculator v2.3.0 → v3.0.0 на серверное хранение с multi-tenancy.

**Ключевые достижения:**
- ✅ Все данные на сервере (PostgreSQL/SQLite ready)
- ✅ Multi-tenant row-level security
- ✅ Optimistic locking для concurrent modifications
- ✅ Server-first conflict resolution
- ✅ Безопасный импорт/экспорт
- ✅ 3 роли пользователей с динамическим UI
- ✅ Zero data loss гарантия

**Готовность к внедрению:** 100%

**Следующие шаги:**
1. Утверждение спецификации
2. Реализация миграций БД
3. Разработка API endpoints
4. Frontend компоненты (SyncManager)
5. Тестирование на staging
6. Production migration

---

**Версия документа:** 1.0.0
**Последнее обновление:** 19 ноября 2025
**Статус:** ✅ Утверждено к разработке
