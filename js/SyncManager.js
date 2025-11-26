/**
 * SyncManager v3.0.0
 *
 * Управление синхронизацией между localStorage и сервером
 *
 * Принципы:
 * - Server-First Logic (сервер всегда приоритет)
 * - Периодическая синхронизация каждые 5 минут
 * - Batch операции для эффективности
 * - Conflict resolution с 3-way merge
 * - Optimistic locking защита
 *
 * Created: 2025-11-19
 * Migration: v3.0.0
 */

class SyncManager {
    constructor(apiClient, cacheManager) {
        this.apiClient = apiClient;
        this.cache = cacheManager;

        this.syncInterval = 5 * 60 * 1000;  // 5 минут
        this.syncTimer = null;
        this.isSyncing = false;
        this.pendingChanges = [];           // Очередь изменений для отправки
    }

    /**
     * Запустить периодическую синхронизацию
     */
    start() {
        console.log('[SyncManager] Starting periodic sync...');

        // Периодическая синхронизация
        this.syncTimer = setInterval(() => {
            this.performSync();
        }, this.syncInterval);

        // Немедленная синхронизация при старте
        this.performSync();
    }

    /**
     * Остановить синхронизацию
     */
    stop() {
        console.log('[SyncManager] Stopping sync...');

        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    /**
     * Выполнить полную синхронизацию
     */
    async performSync() {
        if (this.isSyncing) {
            console.log('[SyncManager] Sync already in progress, skipping...');
            return;
        }

        this.isSyncing = true;
        console.log('[SyncManager] Starting sync cycle...');

        try {
            // PHASE 1: Push local changes
            await this.pushLocalChanges();

            // PHASE 2: Pull server updates
            await this.pullServerUpdates();

            // PHASE 3: Cleanup stale cache
            await this.cleanupCache();

            // Update metadata
            this.cache.updateSyncMetadata({
                last_sync: Date.now(),
                status: 'success'
            });

            console.log('[SyncManager] Sync completed successfully');
        } catch (error) {
            console.error('[SyncManager] Sync failed:', error);

            this.cache.updateSyncMetadata({
                last_sync: Date.now(),
                status: 'error',
                error: error.message
            });

            // Не выбрасываем ошибку дальше, просто логируем
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Выполнить полную синхронизацию (для первого запуска)
     */
    async performFullSync() {
        console.log('[SyncManager] Performing FULL sync...');

        try {
            // Очистить локальный кэш (кроме settings)
            this.cache.clearCacheExcept(['user_settings', 'cache_metadata']);

            // Загрузить весь список смет
            const response = await this.apiClient.get('/api/v1/estimates?limit=1000');

            if (response.success && response.data && response.data.estimates) {
                const estimates = response.data.estimates;

                // Обновить список в кэше
                this.cache.updateEstimatesList(estimates.map(e => ({
                    id: e.id,
                    filename: e.filename,
                    client_name: e.client_name,
                    updated_at: e.updated_at,
                    data_version: e.data_version,
                    cached_at: Date.now()
                })));

                console.log(`[SyncManager] Full sync: loaded ${estimates.length} estimates`);
            }

            // Загрузить каталоги
            const catalogsResponse = await this.apiClient.get('/api/v1/catalogs');

            if (catalogsResponse.success && catalogsResponse.data && catalogsResponse.data.catalogs) {
                const catalogs = catalogsResponse.data.catalogs;

                for (const catalog of catalogs) {
                    // Загрузить полные данные каталога
                    const fullCatalog = await this.apiClient.get(`/api/v1/catalogs/${catalog.id}`);

                    if (fullCatalog.success) {
                        this.cache.cacheCatalog(
                            catalog.id,
                            fullCatalog.data,
                            catalog.data_version
                        );
                    }
                }

                console.log(`[SyncManager] Full sync: loaded ${catalogs.length} catalogs`);
            }

            this.cache.updateSyncMetadata({
                last_sync: Date.now(),
                status: 'full_sync_success'
            });

        } catch (error) {
            console.error('[SyncManager] Full sync failed:', error);
            throw error;
        }
    }

    // ============================================================================
    // PUSH Strategy (локальные изменения → сервер)
    // ============================================================================

    /**
     * Отправить локальные изменения на сервер
     */
    async pushLocalChanges() {
        if (this.pendingChanges.length === 0) {
            console.log('[SyncManager] No pending changes to push');
            return;
        }

        console.log(`[SyncManager] Pushing ${this.pendingChanges.length} local changes...`);

        // Батчами по 50
        const batch = this.pendingChanges.splice(0, 50);

        try {
            const response = await this.apiClient.post('/api/v1/sync/batch', {
                changes: batch.map(change => ({
                    entity_type: change.entityType,
                    entity_id: change.entityId,
                    action: change.action,
                    data: change.data,
                    client_version: change.dataVersion,
                    timestamp: change.timestamp
                }))
            });

            if (!response.success) {
                throw new Error(response.error || 'Batch sync failed');
            }

            // Обработка результатов
            const results = response.data.results || [];

            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const originalChange = batch[i];

                if (result.status === 'conflict') {
                    console.warn('[SyncManager] Conflict detected:', result);
                    await this.handleConflict(originalChange, result.serverData, result);
                } else if (result.status === 'success') {
                    // Обновить кэш с серверной версией
                    this.cache.updateCachedItem(
                        result.entity_type,
                        result.entity_id,
                        result.serverData
                    );

                    console.log(`[SyncManager] Pushed ${result.entity_type} ${result.entity_id} successfully`);
                } else if (result.status === 'error') {
                    console.error('[SyncManager] Server rejected change:', result);
                }
            }

        } catch (error) {
            console.error('[SyncManager] Push failed:', error);

            // Возвращаем в очередь при ошибке
            this.pendingChanges.unshift(...batch);

            throw error;
        }
    }

    /**
     * Добавить изменение в очередь отправки
     */
    queueChange(entityType, entityId, action, data, dataVersion) {
        this.pendingChanges.push({
            entityType,
            entityId,
            action,
            data,
            dataVersion,
            timestamp: Date.now()
        });

        console.log(`[SyncManager] Queued ${action} for ${entityType} ${entityId}`);
    }

    // ============================================================================
    // PULL Strategy (сервер → локальный кэш)
    // ============================================================================

    /**
     * Получить обновления с сервера
     */
    async pullServerUpdates() {
        const lastSync = this.cache.getLastSyncTimestamp();

        console.log(`[SyncManager] Pulling updates since ${new Date(lastSync).toISOString()}...`);

        try {
            const response = await this.apiClient.get('/api/v1/sync/updates', {
                timestamp: Math.floor(lastSync / 1000),  // Конвертировать в Unix timestamp
                entity_types: ['estimate', 'catalog', 'setting']
            });

            if (!response.success) {
                throw new Error(response.error || 'Failed to get updates');
            }

            const updates = response.data.changes || [];

            console.log(`[SyncManager] Received ${updates.length} updates from server`);

            for (const update of updates) {
                const cachedItem = this.cache.getCachedItem(
                    update.entity_type,
                    update.entity_id
                );

                // Новый item - добавить если есть место
                if (!cachedItem) {
                    this.cache.addToCacheIfSpace(update.entity_type, update);
                    console.log(`[SyncManager] Added new ${update.entity_type} ${update.entity_id} to cache`);
                }
                // Server version новее - обновить
                else if (update.data_version > cachedItem.data_version) {
                    this.cache.updateCachedItem(
                        update.entity_type,
                        update.entity_id,
                        update
                    );
                    console.log(`[SyncManager] Updated ${update.entity_type} ${update.entity_id} from server`);
                }
                // Item удалён на сервере
                else if (update.deleted_at) {
                    this.cache.removeCachedItem(
                        update.entity_type,
                        update.entity_id
                    );
                    console.log(`[SyncManager] Removed deleted ${update.entity_type} ${update.entity_id} from cache`);
                }
            }

        } catch (error) {
            console.error('[SyncManager] Pull failed:', error);
            throw error;
        }
    }

    // ============================================================================
    // Conflict Resolution
    // ============================================================================

    /**
     * Обработать конфликт версий
     */
    async handleConflict(localChange, serverData, result) {
        console.warn('[SyncManager] Handling conflict:', {
            local: localChange,
            server: serverData,
            result
        });

        const conflictType = this.detectConflictType(localChange, serverData, result);

        switch (conflictType) {
            case 'VERSION_CONFLICT':
                return await this.resolveVersionConflict(localChange, serverData);

            case 'DELETE_CONFLICT':
                return await this.resolveDeleteConflict(localChange, serverData);

            case 'PERMISSION_CONFLICT':
                return await this.resolvePermissionConflict(localChange, serverData);

            default:
                // Неизвестный тип - всегда server wins
                console.warn('[SyncManager] Unknown conflict type, accepting server version');
                return this.acceptServerVersion(serverData);
        }
    }

    /**
     * Определить тип конфликта
     */
    detectConflictType(localChange, serverData, result) {
        if (result.conflict_type === 'version_mismatch') {
            return 'VERSION_CONFLICT';
        }

        if (result.conflict_type === 'deleted') {
            return 'DELETE_CONFLICT';
        }

        if (result.conflict_type === 'permission_denied') {
            return 'PERMISSION_CONFLICT';
        }

        return 'UNKNOWN';
    }

    /**
     * Разрешить конфликт версий (3-way merge)
     */
    async resolveVersionConflict(localChange, serverData) {
        console.log('[SyncManager] Attempting 3-way merge...');

        // Получить базовую версию из кэша
        const base = this.cache.getCachedItem(localChange.entityType, localChange.entityId);

        if (!base) {
            // Нет базовой версии - принимаем серверную
            console.warn('[SyncManager] No base version, accepting server version');
            return this.acceptServerVersion(serverData);
        }

        // Попытка автоматического merge
        const merged = this.threeWayMerge(base.data, localChange.data, serverData);

        if (merged) {
            // Merge успешен - сохранить на сервер
            console.log('[SyncManager] 3-way merge successful, saving merged version...');

            try {
                await this.apiClient.put(`/api/v1/estimates/${localChange.entityId}`, {
                    data: merged,
                    client_version: serverData.data_version
                });

                // Обновить кэш
                this.cache.updateCachedItem(localChange.entityType, localChange.entityId, merged);

                return merged;
            } catch (err) {
                console.error('[SyncManager] Failed to save merged version:', err);
                return this.acceptServerVersion(serverData);
            }
        } else {
            // Merge failed - требуется ручное разрешение или принимаем server
            console.warn('[SyncManager] 3-way merge failed, accepting server version');
            return this.acceptServerVersion(serverData);
        }
    }

    /**
     * 3-way merge для автоматического разрешения конфликтов
     */
    threeWayMerge(base, local, server) {
        try {
            const merged = { ...server };  // Начинаем с серверной версии

            const fields = ['clientName', 'clientEmail', 'clientPhone', 'services', 'paxCount', 'hiddenMarkup', 'taxRate'];

            for (const field of fields) {
                const baseVal = base?.[field];
                const localVal = local[field];
                const serverVal = server[field];

                // Если только локально изменено - берём локальное
                if (JSON.stringify(localVal) !== JSON.stringify(baseVal) &&
                    JSON.stringify(serverVal) === JSON.stringify(baseVal)) {
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
        } catch (err) {
            console.error('[SyncManager] 3-way merge error:', err);
            return null;
        }
    }

    /**
     * Merge массивов services (по service.id)
     */
    mergeServices(baseServices, localServices, serverServices) {
        // Стратегия: объединить по ID, при конфликте берём server version

        const merged = new Map();

        // Добавляем серверные услуги
        for (const service of serverServices) {
            merged.set(service.id, service);
        }

        // Добавляем локальные услуги которых нет на сервере
        for (const service of localServices) {
            if (!merged.has(service.id)) {
                // Проверяем, была ли эта услуга в base
                const inBase = baseServices.find(s => s.id === service.id);

                if (!inBase) {
                    // Новая услуга, добавленная локально
                    merged.set(service.id, service);
                }
                // Если была в base, но удалена на сервере - не добавляем
            }
        }

        return Array.from(merged.values());
    }

    /**
     * Разрешить конфликт удаления
     */
    async resolveDeleteConflict(localChange, serverData) {
        // Показать пользователю уведомление (если возможно)
        // Пока просто логируем и принимаем серверную версию (deleted)

        console.warn('[SyncManager] Item was deleted on server:', localChange.entityId);

        // Удалить из кэша
        this.cache.removeCachedItem(localChange.entityType, localChange.entityId);

        return null;
    }

    /**
     * Разрешить конфликт прав доступа
     */
    async resolvePermissionConflict(localChange, serverData) {
        console.error('[SyncManager] Permission denied for:', localChange.entityId);

        // Показать ошибку пользователю (если возможно)
        // Пока просто логируем

        // Не обновляем кэш - оставляем как было

        return null;
    }

    /**
     * Принять серверную версию
     */
    acceptServerVersion(serverData) {
        console.log('[SyncManager] Accepting server version');

        // Обновить кэш с серверными данными
        if (serverData.id) {
            this.cache.updateCachedItem('estimate', serverData.id, serverData);
        }

        return serverData;
    }

    // ============================================================================
    // Cache Cleanup
    // ============================================================================

    /**
     * Очистка устаревшего кэша
     */
    async cleanupCache() {
        // CacheManager сам управляет LRU и stale data
        // Здесь можем сделать дополнительную очистку если нужно

        console.log('[SyncManager] Cache cleanup completed');
    }

    // ============================================================================
    // Manual Sync Triggers
    // ============================================================================

    /**
     * Ручная синхронизация (вызывается пользователем)
     */
    async manualSync() {
        console.log('[SyncManager] Manual sync triggered');
        return await this.performSync();
    }

    /**
     * Ручная полная синхронизация
     */
    async manualFullSync() {
        console.log('[SyncManager] Manual FULL sync triggered');
        return await this.performFullSync();
    }
}
