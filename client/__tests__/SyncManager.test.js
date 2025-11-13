/**
 * SyncManager Unit Tests
 *
 * Тестирует:
 * - Immediate sync (critical changes)
 * - Batch queue (non-critical changes)
 * - localStorage fallback
 * - Retry logic с exponential backoff
 * - Recovery from localStorage
 */

const SyncManager = require('../SyncManager');

// Mock localStorage (compatible with real browser localStorage API)
global.localStorage = {
    _data: {},
    get length() {
        return Object.keys(this._data).length;
    },
    key(index) {
        const keys = Object.keys(this._data);
        return keys[index] || null;
    },
    getItem(key) {
        return this._data[key] || null;
    },
    setItem(key, value) {
        this._data[key] = value;
    },
    removeItem(key) {
        delete this._data[key];
    },
    clear() {
        this._data = {};
    }
};

// Mock APIClient
class MockAPIClient {
    constructor() {
        this.calls = [];
        this.shouldFail = false;
        this.failCount = 0;
    }

    async saveEstimate(data, filename) {
        this.calls.push({ method: 'saveEstimate', id: filename, data });

        if (this.shouldFail) {
            this.failCount++;
            throw new Error('Mock API error');
        }

        return { success: true, filename };
    }

    async loadEstimate(id) {
        this.calls.push({ method: 'loadEstimate', id });

        if (this.shouldFail) {
            throw new Error('Mock API error');
        }

        return { id, mockData: true };
    }

    reset() {
        this.calls = [];
        this.shouldFail = false;
        this.failCount = 0;
    }
}

describe('SyncManager', () => {
    let syncManager;
    let mockAPIClient;

    beforeEach(() => {
        // Clear localStorage BEFORE creating SyncManager (to prevent recovery of old items)
        global.localStorage.clear();

        mockAPIClient = new MockAPIClient();
        syncManager = new SyncManager(mockAPIClient, {
            batchInterval: 1000,  // 1 sec для быстрых тестов
            maxBatchSize: 3,
            debug: false
        });
    });

    afterEach(() => {
        syncManager.destroy();
    });

    // ========================================================================
    // Immediate Sync Tests
    // ========================================================================

    test('should immediately sync critical changes', async () => {
        const result = await syncManager.save('test-id', { data: 'test' }, { critical: true });

        expect(result.success).toBe(true);
        expect(result.synced).toBe(true);
        expect(mockAPIClient.calls.length).toBe(1);
        expect(mockAPIClient.calls[0].method).toBe('saveEstimate');
        expect(mockAPIClient.calls[0].id).toBe('test-id');

        const stats = syncManager.getStats();
        expect(stats.immediateSync).toBe(1);
    });

    test('should save to localStorage even for critical changes', async () => {
        await syncManager.save('test-id', { data: 'test' }, { critical: true });

        const stored = global.localStorage.getItem('syncManager_test-id');
        expect(stored).toBeTruthy();

        const parsed = JSON.parse(stored);
        expect(parsed.data).toEqual({ data: 'test' });
    });

    test('should handle immediate sync failures', async () => {
        mockAPIClient.shouldFail = true;

        await expect(
            syncManager.save('test-id', { data: 'test' }, { critical: true })
        ).rejects.toThrow('Mock API error');

        const stats = syncManager.getStats();
        expect(stats.failed).toBe(1);
        expect(stats.failedSize).toBe(1);
    });

    // ========================================================================
    // Batch Queue Tests
    // ========================================================================

    test('should add non-critical changes to batch queue', async () => {
        const result = await syncManager.save('test-id', { data: 'test' }, { critical: false });

        expect(result.success).toBe(true);
        expect(result.synced).toBe(false);
        expect(result.queued).toBe(true);

        const stats = syncManager.getStats();
        expect(stats.queueSize).toBe(1);
    });

    test('should process batch queue when max size reached', async () => {
        // Добавляем 3 items (maxBatchSize = 3)
        await syncManager.save('id-1', { data: 'test1' }, { critical: false });
        await syncManager.save('id-2', { data: 'test2' }, { critical: false });

        // Третий item должен trigger immediate batch processing
        await syncManager.save('id-3', { data: 'test3' }, { critical: false });

        // Даём время на async processing
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockAPIClient.calls.length).toBe(3);

        const stats = syncManager.getStats();
        expect(stats.queueSize).toBe(0);  // Batch processed
        expect(stats.batchedSync).toBeGreaterThan(0);
    });

    test('should manually flush batch queue', async () => {
        await syncManager.save('id-1', { data: 'test1' }, { critical: false });
        await syncManager.save('id-2', { data: 'test2' }, { critical: false });

        const result = await syncManager.flushBatchQueue();

        expect(result.succeeded.length).toBe(2);
        expect(result.failed.length).toBe(0);

        const stats = syncManager.getStats();
        expect(stats.queueSize).toBe(0);
    });

    // ========================================================================
    // localStorage Fallback Tests
    // ========================================================================

    test('should fallback to localStorage on load failure', async () => {
        // Сначала сохраняем в localStorage
        await syncManager.save('test-id', { data: 'test' }, { critical: false });

        // Теперь API падает
        mockAPIClient.shouldFail = true;

        // Load должен вернуть данные из localStorage
        const data = await syncManager.load('test-id');

        expect(data).toEqual({ data: 'test' });

        const stats = syncManager.getStats();
        expect(stats.recovered).toBe(1);
    });

    test('should throw if both server and localStorage fail', async () => {
        mockAPIClient.shouldFail = true;

        await expect(
            syncManager.load('nonexistent-id')
        ).rejects.toThrow();
    });

    // ========================================================================
    // Retry Logic Tests
    // ========================================================================

    test('should retry failed syncs', async () => {
        mockAPIClient.shouldFail = true;

        // Попытка sync падает
        await expect(
            syncManager.save('test-id', { data: 'test' }, { critical: true })
        ).rejects.toThrow();

        expect(mockAPIClient.failCount).toBe(1);

        const statsAfterFail = syncManager.getStats();
        expect(statsAfterFail.failedSize).toBe(1);

        // Теперь API работает
        mockAPIClient.shouldFail = false;

        // Retry
        const result = await syncManager.retryFailed();

        expect(result.succeeded.length).toBe(1);
        expect(result.failed.length).toBe(0);

        const statsAfterRetry = syncManager.getStats();
        expect(statsAfterRetry.failedSize).toBe(0);
    });

    test('should handle multiple retries with exponential backoff', async () => {
        mockAPIClient.shouldFail = true;

        // Первая попытка
        await expect(
            syncManager.save('test-id', { data: 'test' }, { critical: true })
        ).rejects.toThrow();

        // Вторая попытка (retry)
        await syncManager.retryFailed();

        const failed = syncManager.failedSyncs.get('test-id');
        expect(failed.retries).toBe(2);  // Initial + 1 retry
    });

    // ========================================================================
    // Recovery Tests
    // ========================================================================

    test('should recover from localStorage on initialization', () => {
        // Симулируем сохраненные данные
        global.localStorage.setItem('syncManager_id-1', JSON.stringify({
            data: { test: 'data1' },
            savedAt: Date.now()
        }));

        global.localStorage.setItem('syncManager_id-2', JSON.stringify({
            data: { test: 'data2' },
            savedAt: Date.now()
        }));

        // Создаем новый SyncManager (должен восстановить из localStorage)
        const newSyncManager = new SyncManager(mockAPIClient, { debug: false });

        const stats = newSyncManager.getStats();
        expect(stats.queueSize).toBe(2);
        expect(stats.recovered).toBe(2);

        newSyncManager.destroy();
    });

    test('should ignore old localStorage items (> 24h)', () => {
        // Старые данные (25 hours ago)
        global.localStorage.setItem('syncManager_old-id', JSON.stringify({
            data: { test: 'old' },
            savedAt: Date.now() - (25 * 60 * 60 * 1000)
        }));

        const newSyncManager = new SyncManager(mockAPIClient, { debug: false });

        const stats = newSyncManager.getStats();
        expect(stats.queueSize).toBe(0);  // Старые данные игнорируются

        // Проверяем что старые данные удалены
        const stored = global.localStorage.getItem('syncManager_old-id');
        expect(stored).toBeNull();

        newSyncManager.destroy();
    });

    // ========================================================================
    // Statistics Tests
    // ========================================================================

    test('should track statistics correctly', async () => {
        // Immediate sync
        await syncManager.save('id-1', { data: 'test1' }, { critical: true });

        // Batch queue
        await syncManager.save('id-2', { data: 'test2' }, { critical: false });
        await syncManager.save('id-3', { data: 'test3' }, { critical: false });
        await syncManager.flushBatchQueue();

        const stats = syncManager.getStats();

        expect(stats.immediateSync).toBe(1);
        expect(stats.batchedSync).toBe(1);
        expect(stats.queueSize).toBe(0);
        expect(stats.failedSize).toBe(0);
    });

    // ========================================================================
    // Clear Tests
    // ========================================================================

    test('should clear all data', async () => {
        await syncManager.save('id-1', { data: 'test1' }, { critical: false });
        await syncManager.save('id-2', { data: 'test2' }, { critical: false });

        syncManager.clear();

        const stats = syncManager.getStats();
        expect(stats.queueSize).toBe(0);
        expect(stats.failedSize).toBe(0);

        // localStorage должен быть очищен
        const stored = global.localStorage.getItem('syncManager_id-1');
        expect(stored).toBeNull();
    });
});

// Run tests
if (require.main === module) {
    console.log('Running SyncManager tests...');
    // Запустить через Jest: npm test client/SyncManager.test.js
}
