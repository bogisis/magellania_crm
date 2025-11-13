// API Client для работы с сервером
// Заменяет localStorage на серверное хранилище

class APIClient {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
        this.autosaveTimeout = null;
        this.currentEstimateFilename = null;
    }

    // ============ Каталог ============

    async getCatalogList() {
        const response = await fetch(`${this.baseURL}/api/catalog/list`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result.files;
    }

    async loadCatalog(filename = 'catalog.json') {
        const response = await fetch(`${this.baseURL}/api/catalog/${filename}`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result.data;
    }

    async saveCatalog(data, filename = 'catalog.json') {
        const response = await fetch(`${this.baseURL}/api/catalog/${filename}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result;
    }

    // ============ Сметы ============

    async getEstimatesList() {
        const response = await fetch(`${this.baseURL}/api/estimates`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result.estimates;
    }

    async loadEstimate(filename) {
        const response = await fetch(`${this.baseURL}/api/estimates/${filename}`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        this.currentEstimateFilename = filename;
        return result.data;
    }

    async saveEstimate(id, data) {
        // ID-First архитектура: используем ID как первичный идентификатор
        if (!id) {
            throw new Error('ID is required for saveEstimate');
        }

        // Используем ID в URL (а не filename)
        const response = await fetch(`${this.baseURL}/api/estimates/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to save estimate: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        this.currentEstimateId = id;
        return { ...result, id };
    }

    async saveBatch(items) {
        const response = await fetch(`${this.baseURL}/api/estimates/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result;
    }

    async deleteEstimate(id) {
        // ID-First: используем ID для удаления
        const response = await fetch(`${this.baseURL}/api/estimates/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to delete estimate: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        if (this.currentEstimateId === id) {
            this.currentEstimateId = null;
        }
        return result;
    }

    async renameEstimate(id, newFilename) {
        // ID-First: используем ID для идентификации, меняем только filename в metadata
        const response = await fetch(`${this.baseURL}/api/estimates/${id}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newFilename })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to rename estimate: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        return result;
    }

    // ============ Backup ============

    async getBackupsList() {
        const response = await fetch(`${this.baseURL}/api/backups`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result.backups;
    }

    async loadBackup(id) {
        const response = await fetch(`${this.baseURL}/api/backups/${id}`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result.data;
    }

    async saveBackup(data, id) {
        const response = await fetch(`${this.baseURL}/api/backups/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result;
    }

    async restoreFromBackup(id) {
        const response = await fetch(`${this.baseURL}/api/backups/${id}/restore`, {
            method: 'POST'
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result;
    }

    // Автосохранение с debounce
    // НОВАЯ ЛОГИКА: сохраняем в файл сметы И в backup по ID
    scheduleAutosave(data, filename) {
        if (!filename || !data.id) {
            return; // Не автосохраняем несохраненные сметы
        }

        if (this.autosaveTimeout) {
            clearTimeout(this.autosaveTimeout);
        }

        this.autosaveTimeout = setTimeout(async () => {
            try {
                // Сохраняем в текущий файл
                await this.saveEstimate(data, filename);
                // Сохраняем в backup по ID
                await this.saveBackup(data, data.id);
                // Автосохранение тихое - не логируем
            } catch (err) {
                // Только критичные ошибки логируем
                console.error('Autosave failed:', err);
            }
        }, 8000); // 8 секунд - оптимальный баланс между безопасностью данных и нагрузкой на сервер
    }

    // ============ Транзакционное сохранение ============

    /**
     * Генерация уникального ID для транзакции
     */
    generateTransactionId() {
        return 'xxxxxxxxxxxx'.replace(/x/g, () => {
            return (Math.random() * 16 | 0).toString(16);
        });
    }

    /**
     * Подготовка транзакции - сохранение во временные файлы
     */
    async prepareTransaction(data, filename) {
        const transactionId = this.generateTransactionId();

        const response = await fetch(`${this.baseURL}/api/transaction/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transactionId,
                estimate: {
                    filename: filename,
                    data: data
                },
                backup: {
                    id: data.id,
                    data: data
                }
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        return {
            transactionId,
            filename,
            backupId: data.id
        };
    }

    /**
     * Commit транзакции - atomic rename временных файлов в финальные
     */
    async commitTransaction(transactionId, filename, backupId, data) {
        const response = await fetch(`${this.baseURL}/api/transaction/commit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transactionId,
                estimateFilename: filename,
                backupId: backupId,
                data: data  // ✅ ДОБАВЛЕНО: передаем данные
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        return result;
    }

    /**
     * Rollback транзакции - удаление временных файлов
     */
    async rollbackTransaction(transactionId, filename, backupId) {
        try {
            const response = await fetch(`${this.baseURL}/api/transaction/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionId,
                    estimateFilename: filename,
                    backupId: backupId
                })
            });

            const result = await response.json();
            // Не бросаем ошибку если rollback не удался - это не критично
            if (!result.success) {
                console.warn('Rollback warning:', result.error);
            }

            return result;
        } catch (err) {
            // Rollback не критичен - логируем и продолжаем
            console.warn('Rollback failed:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Транзакционное сохранение с rollback при ошибках
     * Это главный метод который нужно использовать вместо двойного save
     *
     * @param {Object} data - данные сметы
     * @param {string} filename - имя файла
     * @returns {Promise<Object>} - результат сохранения
     */
    async saveTransactional(data, filename) {
        if (!filename) {
            // Генерация имени файла из данных клиента
            const clientName = data.clientName || 'Unnamed';
            const date = new Date().toISOString().split('T')[0];
            filename = `${clientName}_${date}.json`.replace(/[^a-zA-Z0-9_.-]/g, '_');
        }

        let transaction = null;

        try {
            // Step 1: Prepare - сохранить во временные файлы
            transaction = await this.prepareTransaction(data, filename);

            // Step 2: Commit - atomic rename в финальные файлы
            const result = await this.commitTransaction(
                transaction.transactionId,
                transaction.filename,
                transaction.backupId,
                data  // ✅ ДОБАВЛЕНО: передаем данные
            );

            // Успех - обновляем текущее имя файла
            this.currentEstimateFilename = filename;

            return {
                success: true,
                filename: filename,
                message: 'Saved successfully with transaction'
            };

        } catch (err) {
            // Step 3: Rollback при любой ошибке
            if (transaction) {
                await this.rollbackTransaction(
                    transaction.transactionId,
                    transaction.filename,
                    transaction.backupId
                );
            }

            // Пробрасываем ошибку дальше
            throw new Error(`Transaction failed: ${err.message}`);
        }
    }

    /**
     * Автосохранение с использованием транзакций
     * Отложенное сохранение через 8 секунд
     */
    scheduleTransactionalAutosave(data, filename) {
        // Отменяем предыдущий таймер
        if (this.autosaveTimeout) {
            clearTimeout(this.autosaveTimeout);
        }

        // Проверка наличия ID и filename
        if (!filename || !data.id) {
            console.warn('Autosave skipped: missing filename or id');
            return;
        }

        this.autosaveTimeout = setTimeout(async () => {
            try {
                await this.saveTransactional(data, filename);
                // Автосохранение тихое - не логируем успех
            } catch (err) {
                console.error('Transactional autosave failed:', err.message);
                // При ошибке транзакционного автосохранения можно попробовать fallback
                // на обычное сохранение (без транзакций)
                try {
                    console.log('Fallback to non-transactional save...');
                    await this.saveEstimate(data, filename);
                    await this.saveBackup(data, data.id);
                } catch (fallbackErr) {
                    console.error('Fallback save also failed:', fallbackErr.message);
                }
            }
        }, 8000); // 8 секунд
    }

    // ============ Настройки ============

    async loadSettings() {
        const response = await fetch(`${this.baseURL}/api/settings`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result.data;
    }

    async saveSettings(data) {
        const response = await fetch(`${this.baseURL}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result;
    }

    // ============ Export/Import (Data Portability) ============

    /**
     * Export all data (estimates, catalogs, settings, backups) as JSON
     * @param {boolean} includeBackups - Include backups in export (default: true)
     * @returns {Promise<Object>} Export data object
     */
    async exportAll(includeBackups = true) {
        const url = `${this.baseURL}/api/export/all?includeBackups=${includeBackups}`;
        const response = await fetch(url);

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Export failed');
        }

        return await response.json();
    }

    /**
     * Import data from JSON export
     * @param {Object} importData - Export data object from exportAll()
     * @returns {Promise<Object>} Import result with imported/failed counts
     */
    async importAll(importData) {
        const response = await fetch(`${this.baseURL}/api/import/all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(importData)
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        return result;
    }

    /**
     * Export SQLite database as binary file
     * @returns {Promise<Blob>} Database file as blob
     */
    async exportDatabase() {
        const response = await fetch(`${this.baseURL}/api/export/database`);

        if (!response.ok) {
            // Try to parse error message
            try {
                const result = await response.json();
                throw new Error(result.error || 'Database export failed');
            } catch (e) {
                throw new Error(`Database export failed: ${response.status} ${response.statusText}`);
            }
        }

        return await response.blob();
    }

    /**
     * Helper: Download blob as file (triggers browser download)
     * @param {Blob} blob - File blob
     * @param {string} filename - Suggested filename
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Helper: Download JSON object as file
     * @param {Object} data - JSON data
     * @param {string} filename - Suggested filename
     */
    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        this.downloadBlob(blob, filename);
    }

    // ============ Утилиты ============

    getCurrentFilename() {
        return this.currentEstimateFilename;
    }

    setCurrentFilename(filename) {
        this.currentEstimateFilename = filename;
    }
}

// Экспорт для использования в index.html
if (typeof window !== 'undefined') {
    window.APIClient = APIClient;
}
