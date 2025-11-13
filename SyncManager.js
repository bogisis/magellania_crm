/**
 * SyncManager - Adaptive Batching для оптимизации server load
 *
 * Стратегия синхронизации:
 * 1. localStorage pre-save - мгновенный UI feedback
 * 2. Critical changes (user-initiated) → immediate sync
 * 3. Non-critical changes (autosave) → batch queue → periodic sync (30 sec)
 * 4. Auto-recovery from localStorage on load
 * 5. Exponential backoff for failed syncs
 *
 * @version 3.0.0
 * @author Claude Code Assistant
 */

class SyncManager {
    constructor(apiClient, config = {}) {
        this.apiClient = apiClient;

        // Configuration
        this.config = {
            batchInterval: config.batchInterval || 30000,        // 30 sec
            maxBatchSize: config.maxBatchSize || 10,             // Max items per batch
            maxRetries: config.maxRetries || 3,                  // Max retry attempts
            retryDelay: config.retryDelay || 1000,               // Initial retry delay (1 sec)
            localStoragePrefix: config.localStoragePrefix || 'syncManager_',
            debug: config.debug || false
        };

        // State
        this.batchQueue = new Map();        // id → {data, timestamp, retries}
        this.syncInProgress = new Set();    // ids being synced
        this.failedSyncs = new Map();       // id → {error, lastAttempt, retries}

        // Timers
        this.batchTimer = null;
        this.retryTimer = null;

        // Statistics
        this.stats = {
            immediateSync: 0,
            batchedSync: 0,
            failed: 0,
            recovered: 0
        };

        // Start periodic batch sync
        this._startBatchTimer();

        // Recovery on load
        this._recoverFromLocalStorage();

        this._log('SyncManager initialized', this.config);
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Сохранить estimate с адаптивной синхронизацией
     * @param {string} id - ID estimate
     * @param {object} data - Данные estimate
     * @param {object} options - Опции синхронизации
     * @param {boolean} options.critical - Критическое изменение (immediate sync)
     * @param {boolean} options.skipLocalStorage - Не сохранять в localStorage
     * @returns {Promise<{success: boolean, synced: boolean}>}
     */
    async save(id, data, options = {}) {
        const { critical = false, skipLocalStorage = false } = options;

        try {
            // Step 1: localStorage pre-save для мгновенного UI feedback
            if (!skipLocalStorage) {
                this._saveToLocalStorage(id, data);
            }

            // Step 2: Решаем стратегию синхронизации
            if (critical) {
                // Critical: immediate sync
                return await this._syncImmediate(id, data);
            } else {
                // Non-critical: добавить в batch queue
                this._addToBatchQueue(id, data);
                return { success: true, synced: false, queued: true };
            }
        } catch (err) {
            this._log('Save error:', err);

            // Fallback: добавить в failed queue для retry
            this._addToFailedQueue(id, data, err);

            return { success: false, error: err.message };
        }
    }

    /**
     * Загрузить estimate (с fallback на localStorage)
     * @param {string} id - ID estimate
     * @returns {Promise<object|null>}
     */
    async load(id) {
        try {
            // Попытка загрузить с сервера
            const data = await this.apiClient.loadEstimate(id);

            // Update localStorage cache
            this._saveToLocalStorage(id, data);

            return data;
        } catch (err) {
            this._log(`Server load failed for ${id}, trying localStorage:`, err.message);

            // Fallback: localStorage
            const localData = this._loadFromLocalStorage(id);
            if (localData) {
                this._log(`Recovered ${id} from localStorage`);
                this.stats.recovered++;
                return localData;
            }

            throw err;
        }
    }

    /**
     * Форсировать синхронизацию batch queue (manual trigger)
     * @returns {Promise<{succeeded: string[], failed: Array}>}
     */
    async flushBatchQueue() {
        if (this.batchQueue.size === 0) {
            return { succeeded: [], failed: [] };
        }

        this._log(`Flushing batch queue (${this.batchQueue.size} items)`);

        return await this._processBatchQueue();
    }

    /**
     * Retry failed syncs
     * @returns {Promise<{succeeded: string[], failed: Array}>}
     */
    async retryFailed() {
        if (this.failedSyncs.size === 0) {
            return { succeeded: [], failed: [] };
        }

        this._log(`Retrying failed syncs (${this.failedSyncs.size} items)`);

        const results = { succeeded: [], failed: [] };

        for (const [id, item] of this.failedSyncs.entries()) {
            try {
                await this._syncImmediate(id, item.data);
                this.failedSyncs.delete(id);
                results.succeeded.push(id);
            } catch (err) {
                item.retries++;
                item.lastAttempt = Date.now();
                item.error = err.message;
                results.failed.push({ id, error: err.message });
            }
        }

        return results;
    }

    /**
     * Получить статистику синхронизации
     * @returns {object}
     */
    getStats() {
        return {
            ...this.stats,
            queueSize: this.batchQueue.size,
            failedSize: this.failedSyncs.size,
            syncInProgress: this.syncInProgress.size
        };
    }

    /**
     * Очистить все данные (для тестирования)
     */
    clear() {
        this.batchQueue.clear();
        this.syncInProgress.clear();
        this.failedSyncs.clear();

        if (this.batchTimer) {
            clearInterval(this.batchTimer);
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
        }

        this._clearLocalStorage();

        this._log('SyncManager cleared');
    }

    // ========================================================================
    // Private Methods - Sync Strategies
    // ========================================================================

    /**
     * Immediate sync (для critical changes)
     * @private
     */
    async _syncImmediate(id, data) {
        this._log(`Immediate sync: ${id}`);
        this.stats.immediateSync++;

        // Предотвращаем concurrent sync того же ID
        if (this.syncInProgress.has(id)) {
            this._log(`Sync already in progress for ${id}, skipping`);
            return { success: true, synced: false, inProgress: true };
        }

        this.syncInProgress.add(id);

        try {
            // API call с ID-First архитектурой
            await this.apiClient.saveEstimate(id, data);

            // Success: очищаем из всех queues
            this.batchQueue.delete(id);
            this.failedSyncs.delete(id);
            this._removeFromLocalStorage(id);

            return { success: true, synced: true };
        } catch (err) {
            this._log(`Immediate sync failed for ${id}:`, err.message);

            // Добавляем в failed queue для retry
            this._addToFailedQueue(id, data, err);

            throw err;
        } finally {
            this.syncInProgress.delete(id);
        }
    }

    /**
     * Добавить в batch queue
     * @private
     */
    _addToBatchQueue(id, data) {
        const existing = this.batchQueue.get(id);

        this.batchQueue.set(id, {
            data,
            timestamp: Date.now(),
            retries: existing ? existing.retries : 0
        });

        this._log(`Added to batch queue: ${id} (queue size: ${this.batchQueue.size})`);

        // Если достигли maxBatchSize - немедленно обработать
        if (this.batchQueue.size >= this.config.maxBatchSize) {
            this._log('Batch queue full, processing immediately');
            this._processBatchQueue();
        }
    }

    /**
     * Добавить в failed queue
     * @private
     */
    _addToFailedQueue(id, data, error) {
        const existing = this.failedSyncs.get(id);

        this.failedSyncs.set(id, {
            data,
            error: error.message,
            lastAttempt: Date.now(),
            retries: existing ? existing.retries + 1 : 1
        });

        this.stats.failed++;

        this._log(`Added to failed queue: ${id} (retries: ${this.failedSyncs.get(id).retries})`);

        // Планируем retry с exponential backoff
        this._scheduleRetry();
    }

    /**
     * Обработать batch queue
     * @private
     */
    async _processBatchQueue() {
        if (this.batchQueue.size === 0) return { succeeded: [], failed: [] };

        this._log(`Processing batch queue (${this.batchQueue.size} items)`);
        this.stats.batchedSync++;

        // Конвертируем Map → Array для batch API
        const items = Array.from(this.batchQueue.entries()).map(([id, item]) => ({
            id,
            data: item.data
        }));

        try {
            // TODO: заменить на batch endpoint когда будет готов
            // const result = await this.apiClient.saveBatch(items);

            // Временно: последовательная отправка
            const results = { succeeded: [], failed: [] };

            for (const { id, data } of items) {
                try {
                    await this.apiClient.saveEstimate(id, data);
                    results.succeeded.push(id);

                    // Очищаем из queues
                    this.batchQueue.delete(id);
                    this.failedSyncs.delete(id);
                    this._removeFromLocalStorage(id);
                } catch (err) {
                    results.failed.push({ id, error: err.message });

                    // Добавляем в failed queue
                    this._addToFailedQueue(id, data, err);
                }
            }

            this._log(`Batch processed: ${results.succeeded.length} succeeded, ${results.failed.length} failed`);

            return results;
        } catch (err) {
            this._log('Batch processing error:', err);

            // Все items остаются в queue для retry
            return { succeeded: [], failed: items.map(item => ({ id: item.id, error: err.message })) };
        }
    }

    // ========================================================================
    // Private Methods - Timers
    // ========================================================================

    /**
     * Запустить periodic batch timer
     * @private
     */
    _startBatchTimer() {
        this.batchTimer = setInterval(() => {
            if (this.batchQueue.size > 0) {
                this._processBatchQueue();
            }
        }, this.config.batchInterval);

        this._log(`Batch timer started (interval: ${this.config.batchInterval}ms)`);
    }

    /**
     * Запланировать retry с exponential backoff
     * @private
     */
    _scheduleRetry() {
        if (this.retryTimer) return; // Уже запланирован

        // Находим item с минимальным количеством retries для приоритета
        let minRetries = Infinity;
        let nextRetryDelay = this.config.retryDelay;

        for (const item of this.failedSyncs.values()) {
            if (item.retries < minRetries) {
                minRetries = item.retries;
                // Exponential backoff: delay * 2^retries
                nextRetryDelay = this.config.retryDelay * Math.pow(2, item.retries);
            }
        }

        // Cap at 5 minutes
        nextRetryDelay = Math.min(nextRetryDelay, 5 * 60 * 1000);

        this._log(`Scheduling retry in ${nextRetryDelay}ms`);

        this.retryTimer = setTimeout(async () => {
            this.retryTimer = null;
            await this.retryFailed();

            // Если еще есть failed items - планируем следующий retry
            if (this.failedSyncs.size > 0) {
                this._scheduleRetry();
            }
        }, nextRetryDelay);
    }

    // ========================================================================
    // Private Methods - localStorage
    // ========================================================================

    /**
     * Сохранить в localStorage
     * @private
     */
    _saveToLocalStorage(id, data) {
        try {
            const key = this.config.localStoragePrefix + id;
            localStorage.setItem(key, JSON.stringify({
                data,
                savedAt: Date.now()
            }));
        } catch (err) {
            this._log(`localStorage save failed for ${id}:`, err.message);
        }
    }

    /**
     * Загрузить из localStorage
     * @private
     */
    _loadFromLocalStorage(id) {
        try {
            const key = this.config.localStoragePrefix + id;
            const stored = localStorage.getItem(key);

            if (!stored) return null;

            const parsed = JSON.parse(stored);
            return parsed.data;
        } catch (err) {
            this._log(`localStorage load failed for ${id}:`, err.message);
            return null;
        }
    }

    /**
     * Удалить из localStorage
     * @private
     */
    _removeFromLocalStorage(id) {
        try {
            const key = this.config.localStoragePrefix + id;
            localStorage.removeItem(key);
        } catch (err) {
            this._log(`localStorage remove failed for ${id}:`, err.message);
        }
    }

    /**
     * Очистить весь localStorage
     * @private
     */
    _clearLocalStorage() {
        try {
            const keys = Object.keys(localStorage);
            const prefix = this.config.localStoragePrefix;

            for (const key of keys) {
                if (key.startsWith(prefix)) {
                    localStorage.removeItem(key);
                }
            }
        } catch (err) {
            this._log('localStorage clear failed:', err.message);
        }
    }

    /**
     * Восстановить из localStorage на старте
     * @private
     */
    _recoverFromLocalStorage() {
        try {
            const keys = Object.keys(localStorage);
            const prefix = this.config.localStoragePrefix;
            let recovered = 0;

            for (const key of keys) {
                if (key.startsWith(prefix)) {
                    const id = key.substring(prefix.length);
                    const stored = localStorage.getItem(key);

                    if (stored) {
                        const parsed = JSON.parse(stored);
                        const age = Date.now() - parsed.savedAt;

                        // Если данные не старше 24 часов - добавляем в batch queue
                        if (age < 24 * 60 * 60 * 1000) {
                            this._addToBatchQueue(id, parsed.data);
                            recovered++;
                        } else {
                            // Старые данные удаляем
                            localStorage.removeItem(key);
                        }
                    }
                }
            }

            if (recovered > 0) {
                this._log(`Recovered ${recovered} items from localStorage`);
                this.stats.recovered += recovered;
            }
        } catch (err) {
            this._log('Recovery from localStorage failed:', err.message);
        }
    }

    // ========================================================================
    // Private Methods - Utilities
    // ========================================================================

    /**
     * Debug logging
     * @private
     */
    _log(...args) {
        if (this.config.debug) {
            console.log('[SyncManager]', ...args);
        }
    }

    /**
     * Cleanup при destroy
     */
    destroy() {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
        }

        this._log('SyncManager destroyed');
    }
}

// Export для использования в browser и Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SyncManager;
}
