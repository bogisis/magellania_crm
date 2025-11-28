/**
 * SQLiteStorage - SQLite-based storage implementation
 *
 * Использует better-sqlite3 для ACID транзакций и производительности
 *
 * Преимущества над FileStorage:
 * - ACID транзакции (решает проблему рассинхронизации)
 * - Optimistic locking (решает race conditions)
 * - Audit log (для будущего undo/redo)
 * - Быстрый поиск (индексы)
 * - Единый файл БД (легкий деплой)
 *
 * Upgrade path: SQLite → PostgreSQL через общий интерфейс
 */

const StorageAdapter = require('./StorageAdapter');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { transliterate } = require('../utils');

class SQLiteStorage extends StorageAdapter {
    constructor(config = {}) {
        super(config);

        const isTestMode = process.env.NODE_ENV === 'test';
        const baseDir = config.baseDir || process.cwd();

        // Путь к БД файлу
        this.dbPath = config.dbPath || path.join(
            baseDir,
            'db',
            isTestMode ? 'quotes_test.db' : 'quotes.db'
        );

        // Путь к схеме
        this.schemaPath = config.schemaPath || path.join(baseDir, 'db', 'schema.sql');

        this.db = null;
        this.initialized = false;

        // Prepared statements (для производительности)
        this.statements = {};

        // Multi-tenancy defaults (production values)
        // ВАЖНО: Всегда используем superadmin и magellania-org как defaults
        // См. миграцию 010_superadmin_setup.sql и CLAUDE.md
        this.defaultUserId = config.userId || 'superadmin';
        this.defaultOrganizationId = config.organizationId || 'magellania-org';

        // App version для metadata
        this.appVersion = config.appVersion || '2.3.0';
    }

    /**
     * Инициализация БД
     */
    async init() {
        if (this.initialized) return;

        try {
            // Создаем директорию для БД если не существует
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // Открываем БД (создается автоматически если не существует)
            this.db = new Database(this.dbPath, {
                verbose: process.env.NODE_ENV === 'development' ? console.log : null
            });

            // ВАЖНО: Включаем FOREIGN KEY constraints (по умолчанию выключены в SQLite!)
            this.db.pragma('foreign_keys = ON');

            // Применяем схему
            await this._applySchema();

            // DAY 1.2: Enable Write-Ahead Logging for crash recovery (Production Safety)
            // WAL mode provides automatic crash recovery and better concurrent read performance
            this.db.pragma('journal_mode = WAL');
            // NORMAL synchronous mode balances performance and safety
            // (FULL would be slower but safer, OFF would be faster but risky)
            this.db.pragma('synchronous = NORMAL');

            // Подготавливаем statements для производительности
            this._prepareStatements();

            this.initialized = true;
            console.log(`SQLite database initialized at ${this.dbPath}`);
        } catch (err) {
            console.error('Failed to initialize SQLite database:', err);
            throw err;
        }
    }

    /**
     * Применить SQL схему из файла
     * @private
     */
    async _applySchema() {
        if (!fs.existsSync(this.schemaPath)) {
            throw new Error(`Schema file not found: ${this.schemaPath}`);
        }

        const schema = fs.readFileSync(this.schemaPath, 'utf8');

        // Выполняем схему (SQLite поддерживает IF NOT EXISTS)
        this.db.exec(schema);
    }

    /**
     * Подготовить prepared statements
     * @private
     */
    _prepareStatements() {
        // ========================================================================
        // Estimates - ID-First + Multi-Tenant
        // ========================================================================

        this.statements.insertEstimate = this.db.prepare(`
            INSERT INTO estimates (
                id, filename, version, app_version, data,
                client_name, client_email, client_phone,
                pax_count, tour_start, tour_end,
                total_cost, total_profit, services_count,
                data_version, data_hash, created_at, updated_at,
                owner_id, organization_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        this.statements.updateEstimate = this.db.prepare(`
            UPDATE estimates SET
                filename = ?, data = ?,
                client_name = ?, client_email = ?, client_phone = ?,
                pax_count = ?, tour_start = ?, tour_end = ?,
                total_cost = ?, total_profit = ?, services_count = ?,
                data_version = data_version + 1,
                data_hash = ?,
                updated_at = ?
            WHERE id = ? AND data_version = ? AND organization_id = ?
        `);

        // ✅ ID-First: только по ID (filename больше не используется для поиска)
        this.statements.getEstimateById = this.db.prepare(`
            SELECT * FROM estimates
            WHERE id = ? AND organization_id = ? AND deleted_at IS NULL
        `);

        // Для backward compatibility (но deprecated)
        this.statements.getEstimateByFilename = this.db.prepare(`
            SELECT * FROM estimates
            WHERE filename = ? AND organization_id = ? AND deleted_at IS NULL
        `);

        // ✅ ID-First: delete по ID
        this.statements.deleteEstimate = this.db.prepare(`
            UPDATE estimates SET deleted_at = ?
            WHERE id = ? AND organization_id = ?
        `);

        // ✅ Multi-tenant: только сметы организации
        this.statements.listEstimates = this.db.prepare(`
            SELECT id, filename, client_name, pax_count, tour_start, created_at, updated_at
            FROM estimates
            WHERE organization_id = ? AND deleted_at IS NULL
            ORDER BY updated_at DESC
        `);

        // ✅ Простое переименование (только UPDATE filename)
        this.statements.renameEstimate = this.db.prepare(`
            UPDATE estimates SET filename = ?, updated_at = ?
            WHERE id = ? AND organization_id = ?
        `);

        // ========================================================================
        // Catalogs - Multi-Tenant + Visibility
        // ========================================================================

        this.statements.upsertCatalog = this.db.prepare(`
            INSERT INTO catalogs (id, name, slug, version, data, region, templates_count, created_at, updated_at, owner_id, organization_id, visibility, data_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(organization_id, slug) DO UPDATE SET
                name = excluded.name,
                data = excluded.data,
                region = excluded.region,
                templates_count = excluded.templates_count,
                updated_at = excluded.updated_at,
                visibility = excluded.visibility,
                data_version = excluded.data_version,
                deleted_at = NULL  -- ✅ FIX: Восстанавливаем удалённый каталог при повторном импорте
        `);

        this.statements.getCatalogByName = this.db.prepare(`
            SELECT * FROM catalogs
            WHERE name = ? AND organization_id = ? AND deleted_at IS NULL
        `);

        this.statements.getCatalogById = this.db.prepare(`
            SELECT * FROM catalogs
            WHERE id = ? AND organization_id = ? AND deleted_at IS NULL
        `);

        this.statements.listCatalogs = this.db.prepare(`
            SELECT name FROM catalogs
            WHERE organization_id = ? AND deleted_at IS NULL
        `);

        // ========================================================================
        // Settings - Multi-Tenant (Migration 009: scope-based)
        // ========================================================================

        this.statements.upsertSetting = this.db.prepare(`
            INSERT INTO settings (scope, scope_id, key, value, value_type, description, created_at, updated_at)
            VALUES ('organization', ?, ?, ?, 'object', NULL, ?, ?)
            ON CONFLICT(scope, scope_id, key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
        `);

        this.statements.getSetting = this.db.prepare(`
            SELECT value FROM settings
            WHERE scope = 'organization' AND scope_id = ? AND key = ?
        `);

        this.statements.getAllSettings = this.db.prepare(`
            SELECT key, value FROM settings
            WHERE scope = 'organization' AND scope_id = ?
        `);
    }

    // ========================================================================
    // Estimates (Сметы)
    // ========================================================================

    /**
     * Получить список смет организации
     * @param {string} organizationId - ID организации (опционально, используется default)
     */
    async getEstimatesList(organizationId = null) {
        await this.init();

        const orgId = organizationId || this.defaultOrganizationId;
        const rows = this.statements.listEstimates.all(orgId);

        return rows.map(row => ({
            filename: row.filename,
            id: row.id,
            clientName: row.client_name || 'Без имени',
            paxCount: row.pax_count || 0,
            tourStart: row.tour_start || '',
            updatedAt: new Date(row.updated_at * 1000),
            createdAt: new Date(row.created_at * 1000)
        }));
    }

    /**
     * Alias для getEstimatesList() (для совместимости с тестами v3.0)
     * @param {string} organizationId - ID организации (опционально)
     */
    async listEstimates(organizationId = null) {
        return this.getEstimatesList(organizationId);
    }

    /**
     * Загрузить смету по ID (ID-First архитектура)
     * @param {string} id - ID сметы
     * @param {string} organizationId - ID организации (опционально)
     */
    async loadEstimate(id, organizationId = null) {
        await this.init();

        const orgId = organizationId || this.defaultOrganizationId;
        const row = this.statements.getEstimateById.get(id, orgId);

        if (!row) {
            throw new Error(`Estimate not found: ${id}`);
        }

        // Включаем metadata для v3.0.0 API
        const data = JSON.parse(row.data);
        data.dataVersion = row.data_version; // Добавляем data_version для optimistic locking
        data.updatedAt = new Date(row.updated_at * 1000);
        data.createdAt = new Date(row.created_at * 1000);

        return data;
    }

    /**
     * DEPRECATED: Загрузить смету по filename (для backward compatibility)
     * Используйте loadEstimate(id) вместо этого
     * @param {string} filename - Имя файла (deprecated)
     * @param {string} organizationId - ID организации (опционально)
     */
    async loadEstimateByFilename(filename, organizationId = null) {
        await this.init();

        const orgId = organizationId || this.defaultOrganizationId;
        const row = this.statements.getEstimateByFilename.get(filename, orgId);

        if (!row) {
            throw new Error(`Estimate not found: ${filename}`);
        }

        return JSON.parse(row.data);
    }

    /**
     * Сохранить смету (ID-First архитектура + Multi-Tenant)
     * @param {string} id - ID сметы (обязательно для ID-First)
     * @param {object} data - Данные сметы
     * @param {string} userId - ID пользователя (опционально)
     * @param {string} organizationId - ID организации (опционально)
     */
    async saveEstimate(id, data, userId = null, organizationId = null) {
        await this.init();

        // Валидация входных данных
        if (!data || typeof data !== 'object') {
            throw new Error(`Invalid data for estimate: ${id} - data must be a non-null object`);
        }

        if (!id || typeof id !== 'string' || !id.trim()) {
            throw new Error('Invalid id: must be a non-empty string');
        }

        const now = Math.floor(Date.now() / 1000);
        const dataStr = JSON.stringify(data);

        // Проверка что JSON.stringify сработал корректно
        if (!dataStr || dataStr === 'null' || dataStr === 'undefined') {
            throw new Error(`Failed to serialize estimate data for: ${id}`);
        }

        const dataHash = this._calculateHash(dataStr);

        // Извлекаем метаданные для индексации
        const metadata = this._extractMetadata(data);

        // Filename извлекаем из данных или генерируем
        const filename = data.filename || metadata.filename || `estimate_${id}.json`;

        // Multi-tenancy параметры
        const ownerId = userId || this.defaultUserId;
        const orgId = organizationId || this.defaultOrganizationId;

        // ID-First: проверяем существование только по ID
        const existing = this.statements.getEstimateById.get(id, orgId);

        if (existing) {
            // UPDATE с optimistic locking
            const result = this.statements.updateEstimate.run(
                filename,
                dataStr,
                metadata.clientName,
                metadata.clientEmail,
                metadata.clientPhone,
                metadata.paxCount,
                metadata.tourStart,
                metadata.tourEnd,
                metadata.totalCost,
                metadata.totalProfit,
                metadata.servicesCount,
                dataHash,
                now,
                id,                         // WHERE id = ?
                existing.data_version,      // AND data_version = ? (optimistic lock)
                orgId                       // AND organization_id = ?
            );

            if (result.changes === 0) {
                throw new Error('Concurrent modification detected. Please reload and try again.');
            }

            return { success: true, id, isNew: false };
        } else {
            // INSERT новой сметы
            this.statements.insertEstimate.run(
                id,
                filename,
                data.version || '1.1.0',
                this.appVersion,
                dataStr,
                metadata.clientName,
                metadata.clientEmail,
                metadata.clientPhone,
                metadata.paxCount,
                metadata.tourStart,
                metadata.tourEnd,
                metadata.totalCost,
                metadata.totalProfit,
                metadata.servicesCount,
                1,              // initial data_version
                dataHash,
                now,            // created_at
                now,            // updated_at
                ownerId,        // owner_id
                orgId           // organization_id
            );

            return { success: true, id, isNew: true };
        }
    }

    /**
     * Удалить смету (soft delete) - ID-First + Multi-Tenant
     * @param {string} id - ID сметы
     * @param {string} organizationId - ID организации (опционально)
     */
    async deleteEstimate(id, organizationId = null) {
        await this.init();

        const orgId = organizationId || this.defaultOrganizationId;
        const now = Math.floor(Date.now() / 1000);

        const result = this.statements.deleteEstimate.run(now, id, orgId);

        // Multi-tenancy security: Don't throw if estimate not found in this org
        // (prevents information leak about IDs in other orgs)
        // If result.changes === 0, either:
        // 1. ID doesn't exist at all (ok to return success)
        // 2. ID exists in different org (security: don't reveal this)
        // Both cases should return success from caller's perspective

        return { success: true, deleted: result.changes > 0 };
    }

    /**
     * Переименовать смету (ID-First: просто UPDATE filename)
     * @param {string} id - ID сметы
     * @param {string} newFilename - Новое имя файла
     * @param {string} organizationId - ID организации (опционально)
     */
    async renameEstimate(id, newFilename, organizationId = null) {
        await this.init();

        const orgId = organizationId || this.defaultOrganizationId;
        const now = Math.floor(Date.now() / 1000);

        // Загружаем текущие данные
        const existing = this.statements.getEstimateById.get(id, orgId);
        if (!existing) {
            throw new Error(`Estimate not found: ${id}`);
        }

        // Обновляем filename в JSON data
        const data = JSON.parse(existing.data);
        data.filename = newFilename;
        const updatedDataStr = JSON.stringify(data);
        const dataHash = this._calculateHash(updatedDataStr);

        // Обновляем и колонку filename И data blob
        const updateStmt = this.db.prepare(`
            UPDATE estimates
            SET filename = ?, data = ?, data_hash = ?, updated_at = ?
            WHERE id = ? AND organization_id = ?
        `);

        const result = updateStmt.run(newFilename, updatedDataStr, dataHash, now, id, orgId);

        if (result.changes === 0) {
            throw new Error(`Failed to rename estimate: ${id}`);
        }

        return { success: true, id, newFilename };
    }

    // ========================================================================
    // Catalogs (Каталоги услуг) - Multi-Tenant + Visibility
    // ========================================================================

    /**
     * Получить список каталогов организации
     * @param {string} organizationId - ID организации (опционально)
     */
    async getCatalogsList(organizationId = null) {
        await this.init();

        const orgId = organizationId || this.defaultOrganizationId;
        const rows = this.statements.listCatalogs.all(orgId);
        return rows.map(row => row.name);
    }

    /**
     * Загрузить каталог по имени
     * @param {string} name - Имя каталога
     * @param {string} organizationId - ID организации (опционально)
     */
    async loadCatalog(name, organizationId = null) {
        await this.init();

        const orgId = organizationId || this.defaultOrganizationId;
        const row = this.statements.getCatalogByName.get(name, orgId);

        if (!row) {
            throw new Error(`Catalog not found: ${name}`);
        }

        return JSON.parse(row.data);
    }

    /**
     * Загрузить каталог по ID
     * @param {string} id - UUID каталога
     * @param {string} organizationId - ID организации (опционально)
     */
    async loadCatalogById(id, organizationId = null) {
        await this.init();

        const orgId = organizationId || this.defaultOrganizationId;
        const row = this.statements.getCatalogById.get(id, orgId);

        if (!row) {
            throw new Error(`Catalog not found: ${id}`);
        }

        return JSON.parse(row.data);
    }

    /**
     * Сохранить каталог - Multi-Tenant + Visibility
     * @param {string} name - Имя каталога
     * @param {object} data - Данные каталога
     * @param {string} userId - ID пользователя (опционально)
     * @param {string} organizationId - ID организации (опционально)
     * @param {string} visibility - Видимость: 'private', 'team', 'organization' (опционально)
     */
    async saveCatalog(name, data, userId = null, organizationId = null, visibility = 'organization') {
        await this.init();

        const now = Math.floor(Date.now() / 1000);
        const dataStr = JSON.stringify(data);

        const ownerId = userId || this.defaultUserId;
        const orgId = organizationId || this.defaultOrganizationId;

        // Проверяем существует ли каталог
        const existing = this.statements.getCatalogByName.get(name, orgId);

        // Используем существующий ID или генерируем новый на основе name
        const id = existing ? existing.id : this._generateIdFromString(name);
        const region = data.region || name;  // ✅ FIX: используем name если data.region пустой
        const templatesCount = Array.isArray(data.templates) ? data.templates.length : 0;
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Детальное логирование для отладки FOREIGN KEY
        console.log('[SQLite saveCatalog] Parameters:', {
            id, name, slug, ownerId, orgId, visibility,
            existingCatalog: existing ? 'UPDATE' : 'INSERT'
        });

        // Проверяем существование пользователя и организации
        const userExists = this.db.prepare('SELECT id FROM users WHERE id = ?').get(ownerId);
        const orgExists = this.db.prepare('SELECT id FROM organizations WHERE id = ?').get(orgId);
        console.log('[SQLite saveCatalog] FK Check:', {
            userExists: !!userExists,
            orgExists: !!orgExists
        });

        this.statements.upsertCatalog.run(
            id,
            name,
            slug,           // slug
            data.version || '1.2.0',
            dataStr,
            region,
            templatesCount,
            existing ? existing.created_at : now,  // Сохраняем оригинальный created_at
            now,            // updated_at
            ownerId,        // owner_id
            orgId,          // organization_id
            visibility,     // visibility
            existing ? existing.data_version + 1 : 1  // data_version (increment on update)
        );

        return { success: true };
    }

    // ========================================================================
    // Settings (Настройки) - Multi-Tenant
    // ========================================================================

    /**
     * Загрузить настройки организации
     * @param {string} organizationId - ID организации (опционально)
     */
    async loadSettings(organizationId = null) {
        await this.init();

        const orgId = organizationId || this.defaultOrganizationId;
        const rows = this.statements.getAllSettings.all(orgId);

        const settings = {};
        for (const row of rows) {
            settings[row.key] = JSON.parse(row.value);
        }

        // Дефолтные настройки если нет в БД
        if (Object.keys(settings).length === 0) {
            return {
                bookingTerms: '',
                version: '1.0.0'
            };
        }

        return settings;
    }

    /**
     * Сохранить настройки организации
     * @param {object} data - Настройки (key-value pairs)
     * @param {string} organizationId - ID организации (опционально)
     */
    async saveSettings(data, organizationId = null) {
        await this.init();

        const now = Math.floor(Date.now() / 1000);
        const orgId = organizationId || this.defaultOrganizationId;

        // Сохраняем каждую настройку
        for (const [key, value] of Object.entries(data)) {
            this.statements.upsertSetting.run(
                key,
                JSON.stringify(value),
                now,
                now,
                orgId       // organization_id
            );
        }

        return { success: true };
    }

    // ========================================================================
    // Utilities (Вспомогательные методы)
    // ========================================================================

    /**
     * Извлечь метаданные из data для индексации
     * @private
     */
    _extractMetadata(data) {
        const clientName = data.clientName || '';
        const paxCount = data.paxCount || 0;
        const tourStart = data.tourStart || new Date().toISOString().split('T')[0];
        const id = data.id || '';

        // Генерация filename из метаданных (для ID-First архитектуры)
        const transliterated = clientName
            ? transliterate(clientName.trim().toLowerCase()).replace(/\s+/g, '_')
            : 'untitled';
        const filename = `${transliterated}_${tourStart}_${paxCount}pax_${id}`;

        return {
            clientName,
            clientEmail: data.clientEmail || '',
            clientPhone: data.clientPhone || '',
            paxCount,
            tourStart,
            tourEnd: data.tourEnd || '',
            totalCost: 0, // TODO: calculate from services
            totalProfit: 0, // TODO: calculate from services
            servicesCount: Array.isArray(data.services) ? data.services.length : 0,
            filename  // ✅ Добавлено для ID-First архитектуры
        };
    }

    /**
     * Вычислить hash данных для optimistic locking
     * @private
     */
    _calculateHash(data) {
        if (!data || typeof data !== 'string') {
            throw new Error('_calculateHash requires a non-empty string');
        }

        return crypto
            .createHash('sha256')
            .update(data)
            .digest('hex')
            .substring(0, 32);
    }

    /**
     * Генерировать ID (совместимо с текущей системой)
     * @private
     */
    _generateId() {
        return 'xxxxxxxxxxxx'.replace(/x/g, () => {
            return (Math.random() * 16 | 0).toString(16);
        });
    }

    /**
     * Генерирует детерминированный ID из строки (для catalog names)
     * Использует простой хеш для постоянства ID при повторных сохранениях
     */
    _generateIdFromString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        // Конвертируем в положительное hex значение и ограничиваем до 12 символов
        return Math.abs(hash).toString(16).padStart(12, '0').substring(0, 12);
    }

    /**
     * Получить статистику хранилища
     */
    async getStats() {
        await this.init();

        const baseStats = await super.getStats();

        // Размер БД файла
        const dbStats = fs.statSync(this.dbPath);

        // Дополнительная статистика из БД
        const dbInfo = this.db.pragma('page_count');
        const pageSize = this.db.pragma('page_size');

        return {
            ...baseStats,
            storageSize: dbStats.size,
            storageSizeFormatted: this._formatBytes(dbStats.size),
            dbPath: this.dbPath,
            dbPages: dbInfo[0].page_count,
            pageSize: pageSize[0].page_size
        };
    }

    _formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            await this.init();

            // Проверяем БД простым запросом
            const result = this.db.prepare('SELECT 1 as test').get();

            return {
                healthy: result.test === 1,
                message: 'Database responsive',
                dbPath: this.dbPath
            };
        } catch (err) {
            return {
                healthy: false,
                message: err.message
            };
        }
    }

    /**
     * Закрыть соединение с БД
     */
    async close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.initialized = false;
        }
    }
}

module.exports = SQLiteStorage;
