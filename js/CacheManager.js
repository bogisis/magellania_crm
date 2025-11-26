/**
 * CacheManager v3.0.0
 *
 * Управление localStorage кэшем для Quote Calculator
 *
 * Концепция: Server-First Logic
 * - Сервер = источник истины (Single Source of Truth)
 * - localStorage = временный кэш для offline работы и производительности
 * - При конфликте ВСЕГДА выигрывает сервер
 *
 * Created: 2025-11-19
 * Migration: v3.0.0
 */

class CacheManager {
    constructor() {
        this.CACHE_CONFIG = {
            MAX_FULL_ESTIMATES: 10,              // Максимум 10 полных смет в кэше
            MAX_CATALOGS: 5,                     // Максимум 5 каталогов
            MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 дней
            SYNC_INTERVAL_MS: 5 * 60 * 1000      // Синхронизация каждые 5 минут
        };

        this.CACHE_KEYS = {
            METADATA: 'cache_metadata',
            ESTIMATES_LIST: 'estimates_list',
            ESTIMATES_FULL: 'estimates_full',
            CATALOGS: 'catalogs',
            USER_SETTINGS: 'user_settings',
            ORG_SETTINGS: 'org_settings'
        };

        this._initCache();
    }

    /**
     * Инициализация структуры кэша
     */
    _initCache() {
        try {
            const metadata = this.getMetadata();

            // Если метаданных нет - создаём пустую структуру
            if (!metadata) {
                this._createEmptyCache();
            }

            // Cleanup старых данных при инициализации
            this._cleanupStaleData();
        } catch (err) {
            console.error('Cache initialization failed:', err);
            this._createEmptyCache();
        }
    }

    /**
     * Создание пустой структуры кэша
     */
    _createEmptyCache() {
        const emptyCache = {
            cache_metadata: {
                version: '1.0.0',
                last_sync: Date.now(),
                user_id: null,
                organization_id: null
            },
            estimates_list: [],
            estimates_full: {},
            catalogs: {},
            user_settings: {},
            org_settings: {}
        };

        for (const [key, value] of Object.entries(emptyCache)) {
            this._setItem(key, value);
        }
    }

    /**
     * Получить метаданные кэша
     */
    getMetadata() {
        return this._getItem(this.CACHE_KEYS.METADATA);
    }

    /**
     * Обновить метаданные синхронизации
     */
    updateSyncMetadata(updates) {
        const metadata = this.getMetadata() || {
            version: '1.0.0',
            last_sync: null,
            user_id: null,
            organization_id: null
        };

        const updated = {
            ...metadata,
            ...updates,
            last_sync: Date.now()
        };

        this._setItem(this.CACHE_KEYS.METADATA, updated);
    }

    /**
     * Получить timestamp последней синхронизации
     */
    getLastSyncTimestamp() {
        const metadata = this.getMetadata();
        return metadata?.last_sync || 0;
    }

    // ============================================================================
    // Estimates List (всегда в кэше)
    // ============================================================================

    /**
     * Получить список всех смет из кэша
     */
    getEstimatesList() {
        return this._getItem(this.CACHE_KEYS.ESTIMATES_LIST) || [];
    }

    /**
     * Обновить весь список смет
     */
    updateEstimatesList(estimates) {
        this._setItem(this.CACHE_KEYS.ESTIMATES_LIST, estimates);
    }

    /**
     * Добавить смету в список
     */
    addToEstimatesList(estimate) {
        const list = this.getEstimatesList();
        const existing = list.findIndex(e => e.id === estimate.id);

        if (existing !== -1) {
            list[existing] = estimate;
        } else {
            list.push(estimate);
        }

        this.updateEstimatesList(list);
    }

    /**
     * Удалить смету из списка
     */
    removeFromEstimatesList(estimateId) {
        const list = this.getEstimatesList();
        const filtered = list.filter(e => e.id !== estimateId);
        this.updateEstimatesList(filtered);
    }

    // ============================================================================
    // Estimates Full Data (LRU policy)
    // ============================================================================

    /**
     * Получить полные данные сметы из кэша
     */
    getCachedEstimate(estimateId) {
        const fullCache = this._getItem(this.CACHE_KEYS.ESTIMATES_FULL) || {};
        const cached = fullCache[estimateId];

        if (cached) {
            // Обновляем last_accessed для LRU
            cached.last_accessed = Date.now();
            this._setItem(this.CACHE_KEYS.ESTIMATES_FULL, fullCache);

            return cached;
        }

        return null;
    }

    /**
     * Сохранить полную смету в кэш
     */
    cacheEstimate(estimateId, data, dataVersion) {
        const fullCache = this._getItem(this.CACHE_KEYS.ESTIMATES_FULL) || {};

        // LRU: если превышен лимит, удаляем самую старую
        const cacheSize = Object.keys(fullCache).length;
        if (cacheSize >= this.CACHE_CONFIG.MAX_FULL_ESTIMATES && !fullCache[estimateId]) {
            this._evictLRU(fullCache);
        }

        fullCache[estimateId] = {
            id: estimateId,
            data: data,
            data_version: dataVersion,
            cached_at: Date.now(),
            last_accessed: Date.now()
        };

        this._setItem(this.CACHE_KEYS.ESTIMATES_FULL, fullCache);
    }

    /**
     * Удалить смету из full cache
     */
    removeCachedEstimate(estimateId) {
        const fullCache = this._getItem(this.CACHE_KEYS.ESTIMATES_FULL) || {};
        delete fullCache[estimateId];
        this._setItem(this.CACHE_KEYS.ESTIMATES_FULL, fullCache);
    }

    /**
     * Обновить кэшированную смету
     */
    updateCachedItem(entityType, entityId, serverData) {
        if (entityType === 'estimate') {
            this.cacheEstimate(entityId, serverData, serverData.data_version);

            // Также обновить в списке
            this.addToEstimatesList({
                id: entityId,
                filename: serverData.filename,
                client_name: serverData.client_name,
                updated_at: serverData.updated_at,
                data_version: serverData.data_version,
                cached_at: Date.now()
            });
        } else if (entityType === 'catalog') {
            this.cacheCatalog(entityId, serverData, serverData.data_version);
        }
    }

    /**
     * Получить кэшированный item (generic)
     */
    getCachedItem(entityType, entityId) {
        if (entityType === 'estimate') {
            return this.getCachedEstimate(entityId);
        } else if (entityType === 'catalog') {
            return this.getCachedCatalog(entityId);
        }
        return null;
    }

    /**
     * Добавить в кэш если есть место
     */
    addToCacheIfSpace(entityType, data) {
        if (entityType === 'estimate') {
            const fullCache = this._getItem(this.CACHE_KEYS.ESTIMATES_FULL) || {};
            const cacheSize = Object.keys(fullCache).length;

            if (cacheSize < this.CACHE_CONFIG.MAX_FULL_ESTIMATES) {
                this.cacheEstimate(data.id, data, data.data_version);
            }
        } else if (entityType === 'catalog') {
            const catalogCache = this._getItem(this.CACHE_KEYS.CATALOGS) || {};
            const cacheSize = Object.keys(catalogCache).length;

            if (cacheSize < this.CACHE_CONFIG.MAX_CATALOGS) {
                this.cacheCatalog(data.id, data, data.data_version);
            }
        }
    }

    /**
     * Удалить item из кэша
     */
    removeCachedItem(entityType, entityId) {
        if (entityType === 'estimate') {
            this.removeCachedEstimate(entityId);
            this.removeFromEstimatesList(entityId);
        } else if (entityType === 'catalog') {
            this.removeCachedCatalog(entityId);
        }
    }

    // ============================================================================
    // Catalogs
    // ============================================================================

    /**
     * Получить каталог из кэша
     */
    getCachedCatalog(catalogId) {
        const catalogs = this._getItem(this.CACHE_KEYS.CATALOGS) || {};
        return catalogs[catalogId] || null;
    }

    /**
     * Сохранить каталог в кэш
     */
    cacheCatalog(catalogId, data, dataVersion) {
        const catalogs = this._getItem(this.CACHE_KEYS.CATALOGS) || {};

        // LRU: если превышен лимит, удаляем самый старый
        const cacheSize = Object.keys(catalogs).length;
        if (cacheSize >= this.CACHE_CONFIG.MAX_CATALOGS && !catalogs[catalogId]) {
            this._evictLRU(catalogs);
        }

        catalogs[catalogId] = {
            id: catalogId,
            data: data,
            data_version: dataVersion,
            cached_at: Date.now()
        };

        this._setItem(this.CACHE_KEYS.CATALOGS, catalogs);
    }

    /**
     * Удалить каталог из кэша
     */
    removeCachedCatalog(catalogId) {
        const catalogs = this._getItem(this.CACHE_KEYS.CATALOGS) || {};
        delete catalogs[catalogId];
        this._setItem(this.CACHE_KEYS.CATALOGS, catalogs);
    }

    // ============================================================================
    // Settings
    // ============================================================================

    /**
     * Получить user settings
     */
    getUserSettings() {
        return this._getItem(this.CACHE_KEYS.USER_SETTINGS) || {};
    }

    /**
     * Сохранить user settings
     */
    saveUserSettings(settings) {
        this._setItem(this.CACHE_KEYS.USER_SETTINGS, settings);
    }

    /**
     * Получить organization settings
     */
    getOrgSettings() {
        return this._getItem(this.CACHE_KEYS.ORG_SETTINGS) || {};
    }

    /**
     * Сохранить organization settings
     */
    saveOrgSettings(settings) {
        this._setItem(this.CACHE_KEYS.ORG_SETTINGS, settings);
    }

    // ============================================================================
    // Cache Invalidation
    // ============================================================================

    /**
     * Полная очистка кэша
     */
    clearAllCache() {
        this._createEmptyCache();
    }

    /**
     * Очистка кэша кроме исключений
     */
    clearCacheExcept(keysToKeep = []) {
        const toKeep = {};

        for (const key of keysToKeep) {
            const value = this._getItem(key);
            if (value) {
                toKeep[key] = value;
            }
        }

        // Очистить всё
        this._createEmptyCache();

        // Восстановить исключения
        for (const [key, value] of Object.entries(toKeep)) {
            this._setItem(key, value);
        }
    }

    /**
     * Инвалидация кэша каталогов
     */
    invalidateCatalogCache() {
        this._setItem(this.CACHE_KEYS.CATALOGS, {});
    }

    /**
     * Инвалидация списка смет
     */
    invalidateEstimatesList() {
        this._setItem(this.CACHE_KEYS.ESTIMATES_LIST, []);
    }

    /**
     * Удалить конкретную смету из кэша
     */
    deleteCachedItem(itemId) {
        this.removeCachedEstimate(itemId);
    }

    // ============================================================================
    // LRU Eviction
    // ============================================================================

    /**
     * Удалить самый старый элемент (LRU)
     */
    _evictLRU(cache) {
        const items = Object.entries(cache);

        if (items.length === 0) return;

        // Сортировка по last_accessed (или cached_at если нет last_accessed)
        items.sort((a, b) => {
            const timeA = a[1].last_accessed || a[1].cached_at || 0;
            const timeB = b[1].last_accessed || b[1].cached_at || 0;
            return timeA - timeB;
        });

        // Удалить самый старый
        const [oldestKey] = items[0];
        delete cache[oldestKey];

        console.log(`[CacheManager] LRU eviction: removed ${oldestKey}`);
    }

    /**
     * Очистка устаревших данных (> 7 дней)
     */
    _cleanupStaleData() {
        const now = Date.now();
        const maxAge = this.CACHE_CONFIG.MAX_AGE_MS;

        // Cleanup full estimates
        const fullCache = this._getItem(this.CACHE_KEYS.ESTIMATES_FULL) || {};
        let removed = 0;

        for (const [id, item] of Object.entries(fullCache)) {
            const age = now - (item.cached_at || 0);
            if (age > maxAge) {
                delete fullCache[id];
                removed++;
            }
        }

        if (removed > 0) {
            this._setItem(this.CACHE_KEYS.ESTIMATES_FULL, fullCache);
            console.log(`[CacheManager] Removed ${removed} stale items from cache`);
        }
    }

    // ============================================================================
    // localStorage Helpers
    // ============================================================================

    /**
     * Безопасное чтение из localStorage
     */
    _getItem(key) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (err) {
            console.error(`[CacheManager] Failed to get ${key}:`, err);
            return null;
        }
    }

    /**
     * Безопасная запись в localStorage
     */
    _setItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (err) {
            console.error(`[CacheManager] Failed to set ${key}:`, err);

            // Quota exceeded - очистить старые данные
            if (err.name === 'QuotaExceededError') {
                console.warn('[CacheManager] Quota exceeded, performing cleanup...');
                this._cleanupStaleData();

                // Попробовать снова
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                } catch (retryErr) {
                    console.error('[CacheManager] Failed even after cleanup:', retryErr);
                }
            }
        }
    }

    // ============================================================================
    // Debug & Stats
    // ============================================================================

    /**
     * Получить статистику кэша
     */
    getStats() {
        const estimatesList = this.getEstimatesList();
        const estimatesFull = this._getItem(this.CACHE_KEYS.ESTIMATES_FULL) || {};
        const catalogs = this._getItem(this.CACHE_KEYS.CATALOGS) || {};
        const metadata = this.getMetadata();

        return {
            estimates_list_count: estimatesList.length,
            estimates_full_count: Object.keys(estimatesFull).length,
            catalogs_count: Object.keys(catalogs).length,
            last_sync: metadata?.last_sync,
            last_sync_ago_ms: metadata?.last_sync ? Date.now() - metadata.last_sync : null,
            user_id: metadata?.user_id,
            organization_id: metadata?.organization_id
        };
    }
}
