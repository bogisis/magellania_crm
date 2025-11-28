/**
 * StorageAdapter - Abstract base class для storage implementations
 *
 * Определяет контракт для всех storage реализаций:
 * - FileStorage (текущая реализация на файлах)
 * - SQLiteStorage (новая реализация на SQLite)
 * - PostgresStorage (будущая реализация)
 *
 * Все методы возвращают Promises для единообразия API
 *
 * @abstract
 */
class StorageAdapter {
    constructor(config = {}) {
        if (new.target === StorageAdapter) {
            throw new TypeError('Cannot construct StorageAdapter instances directly');
        }
        this.config = config;
    }

    // ========================================================================
    // Estimates (Сметы)
    // ========================================================================

    /**
     * Получить список всех смет
     * @returns {Promise<Array>} Массив объектов { filename, id, clientName, paxCount, updatedAt, createdAt }
     */
    async getEstimatesList() {
        throw new Error('Method getEstimatesList() must be implemented');
    }

    /**
     * Загрузить смету по filename
     * @param {string} filename - Имя файла сметы
     * @returns {Promise<Object>} Объект сметы
     */
    async loadEstimate(filename) {
        throw new Error('Method loadEstimate() must be implemented');
    }

    /**
     * Сохранить смету
     * @param {string} filename - Имя файла
     * @param {Object} data - Данные сметы
     * @returns {Promise<Object>} { success: true }
     */
    async saveEstimate(filename, data) {
        throw new Error('Method saveEstimate() must be implemented');
    }

    /**
     * Удалить смету
     * @param {string} filename - Имя файла
     * @returns {Promise<Object>} { success: true }
     */
    async deleteEstimate(filename) {
        throw new Error('Method deleteEstimate() must be implemented');
    }

    /**
     * Переименовать смету
     * @param {string} oldFilename - Старое имя
     * @param {string} newFilename - Новое имя
     * @returns {Promise<Object>} { success: true, newFilename }
     */
    async renameEstimate(oldFilename, newFilename) {
        throw new Error('Method renameEstimate() must be implemented');
    }

    // ========================================================================
    // Backups (Резервные копии)
    // ========================================================================

    /**
     * Получить список backups
     * @returns {Promise<Array>} Массив backup объектов
     */
    async getBackupsList() {
        throw new Error('Method getBackupsList() must be implemented');
    }

    /**
     * Загрузить backup по ID
     * @param {string} id - ID backup
     * @returns {Promise<Object>} Данные backup
     */
    async loadBackup(id) {
        throw new Error('Method loadBackup() must be implemented');
    }

    /**
     * Сохранить backup
     * @param {string} id - ID backup
     * @param {Object} data - Данные
     * @returns {Promise<Object>} { success: true }
     */
    async saveBackup(id, data) {
        throw new Error('Method saveBackup() must be implemented');
    }

    /**
     * Восстановить смету из backup
     * @param {string} id - ID backup
     * @returns {Promise<Object>} { success: true, filename }
     */
    async restoreFromBackup(id) {
        throw new Error('Method restoreFromBackup() must be implemented');
    }

    // ========================================================================
    // Catalogs (Каталоги услуг)
    // ========================================================================

    /**
     * Получить список каталогов
     * @returns {Promise<Array>} Массив имен каталогов
     */
    async getCatalogsList() {
        throw new Error('Method getCatalogsList() must be implemented');
    }

    /**
     * Загрузить каталог
     * @param {string} filename - Имя каталога
     * @returns {Promise<Object>} Данные каталога
     */
    async loadCatalog(filename) {
        throw new Error('Method loadCatalog() must be implemented');
    }

    /**
     * Сохранить каталог
     * @param {string} filename - Имя каталога
     * @param {Object} data - Данные каталога
     * @returns {Promise<Object>} { success: true }
     */
    async saveCatalog(filename, data) {
        throw new Error('Method saveCatalog() must be implemented');
    }

    // ========================================================================
    // Settings (Настройки)
    // ========================================================================

    /**
     * Загрузить настройки
     * @returns {Promise<Object>} Объект настроек
     */
    async loadSettings() {
        throw new Error('Method loadSettings() must be implemented');
    }

    /**
     * Сохранить настройки
     * @param {Object} data - Данные настроек
     * @returns {Promise<Object>} { success: true }
     */
    async saveSettings(data) {
        throw new Error('Method saveSettings() must be implemented');
    }

    // ========================================================================
    // Transactions (Транзакции) - опционально для SQLite
    // ========================================================================

    /**
     * Транзакционное сохранение сметы + backup (атомарно)
     * Не все storage поддерживают, поэтому можно не реализовывать
     *
     * @param {string} filename - Имя файла
     * @param {Object} data - Данные сметы
     * @returns {Promise<Object>} { success: true }
     */
    async saveEstimateTransactional(filename, data) {
        // Default implementation - fallback на два отдельных вызова
        await this.saveEstimate(filename, data);
        await this.saveBackup(data.id, data);
        return { success: true };
    }

    // ========================================================================
    // Utilities (Утилиты)
    // ========================================================================

    /**
     * Проверить существование сметы
     * @param {string} filename - Имя файла
     * @returns {Promise<boolean>}
     */
    async estimateExists(filename) {
        try {
            await this.loadEstimate(filename);
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Получить статистику хранилища
     * @returns {Promise<Object>} { estimatesCount, catalogsCount, storageSize }
     */
    async getStats() {
        const estimates = await this.getEstimatesList();
        const catalogs = await this.getCatalogsList();

        return {
            estimatesCount: estimates.length,
            catalogsCount: catalogs.length,
            storageType: this.constructor.name
        };
    }

    /**
     * Health check
     * @returns {Promise<Object>} { healthy: boolean, message: string }
     */
    async healthCheck() {
        try {
            await this.getStats();
            return { healthy: true, message: 'OK' };
        } catch (err) {
            return { healthy: false, message: err.message };
        }
    }

    /**
     * Закрыть соединение (для БД)
     * @returns {Promise<void>}
     */
    async close() {
        // Default: no-op, override в SQLiteStorage
    }
}

module.exports = StorageAdapter;
