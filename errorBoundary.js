/**
 * ErrorBoundary - Централизованная обработка ошибок с recovery механизмом
 *
 * Назначение:
 * - Перехват ошибок в критических операциях (load, save, calculations)
 * - Логирование ошибок с контекстом и snapshot'ом состояния
 * - Автоматическое восстановление после ошибок где возможно
 * - Уведомление пользователя о проблемах
 *
 * @version 1.0.0
 * @created 2025-10-20
 */

class ErrorBoundary {
    /**
     * @param {Object} calculator - Ссылка на ProfessionalQuoteCalculator
     */
    constructor(calculator) {
        this.calc = calculator;
        this.errors = [];
        this.maxErrorLogSize = 100; // Максимум ошибок в логе

        // Счётчики для статистики
        this.stats = {
            total: 0,
            recovered: 0,
            failed: 0,
            byContext: {}
        };
    }

    /**
     * Оборачивает асинхронную функцию с обработкой ошибок
     *
     * @param {Function} fn - Асинхронная функция для оборачивания
     * @param {string} context - Контекст операции ('load', 'save', 'calculations', etc)
     * @returns {Function} - Обёрнутая функция
     */
    wrapAsync(fn, context) {
        const self = this;

        return async function(...args) {
            // Сохраняем snapshot состояния ПЕРЕД операцией
            const snapshot = self.captureSnapshot();
            const startTime = Date.now();

            try {
                const result = await fn.apply(this, args);
                return result;

            } catch (err) {
                const duration = Date.now() - startTime;

                // Логируем ошибку
                self.logError(context, err, snapshot, duration);

                // Показываем уведомление пользователю
                self.showNotification(context, err);

                // Пытаемся восстановиться
                const recovered = await self.tryRecover(context, err, snapshot);

                // Обновляем статистику
                self.updateStats(context, recovered);

                // Пробрасываем ошибку дальше (caller может обработать)
                throw err;
            }
        };
    }

    /**
     * Сохраняет snapshot текущего состояния
     * @returns {Object} - Копия состояния
     */
    captureSnapshot() {
        if (!this.calc || !this.calc.state) {
            return null;
        }

        return {
            services: this.calc.state.services ? [...this.calc.state.services] : [],
            paxCount: this.calc.state.paxCount,
            hiddenMarkup: this.calc.state.hiddenMarkup,
            taxRate: this.calc.state.taxRate,
            currentQuoteId: this.calc.state.currentQuoteId,
            currentQuoteFile: this.calc.state.currentQuoteFile,
            isQuoteSaved: this.calc.state.isQuoteSaved,
            clientName: this.calc.state.clientName,
            tourStart: this.calc.state.tourStart,
            tourEnd: this.calc.state.tourEnd
        };
    }

    /**
     * Логирует ошибку с полным контекстом
     *
     * @param {string} context - Контекст операции
     * @param {Error} err - Объект ошибки
     * @param {Object} snapshot - Snapshot состояния
     * @param {number} duration - Длительность операции в ms
     */
    logError(context, err, snapshot, duration) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            context: context,
            message: err.message,
            stack: err.stack,
            snapshot: snapshot,
            duration: duration,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            url: typeof window !== 'undefined' ? window.location.href : 'unknown'
        };

        // Добавляем в лог
        this.errors.push(errorEntry);

        // Ограничиваем размер лога
        if (this.errors.length > this.maxErrorLogSize) {
            this.errors.shift(); // Удаляем самую старую
        }

        // Логируем в console для debugging
        console.error(`[ErrorBoundary] ${context}:`, err);
        console.debug('[ErrorBoundary] Snapshot:', snapshot);
    }

    /**
     * Показывает уведомление пользователю
     *
     * @param {string} context - Контекст операции
     * @param {Error} err - Объект ошибки
     */
    showNotification(context, err) {
        if (!this.calc || typeof this.calc.showNotification !== 'function') {
            console.warn('[ErrorBoundary] Cannot show notification - calc.showNotification not available');
            return;
        }

        // Формируем понятное сообщение для пользователя
        const userMessages = {
            'load': 'Ошибка загрузки сметы',
            'save': 'Ошибка сохранения сметы',
            'calculations': 'Ошибка расчёта стоимости',
            'import': 'Ошибка импорта файла',
            'export': 'Ошибка экспорта файла',
            'backup': 'Ошибка работы с backup'
        };

        const message = userMessages[context] || 'Произошла ошибка';
        this.calc.showNotification(`${message}: ${err.message}`, true);
    }

    /**
     * Пытается восстановиться после ошибки
     *
     * @param {string} context - Контекст операции
     * @param {Error} err - Объект ошибки
     * @param {Object} snapshot - Snapshot состояния до ошибки
     * @returns {boolean} - true если восстановление успешно
     */
    async tryRecover(context, err, snapshot) {
        console.log(`[ErrorBoundary] Attempting recovery for context: ${context}`);

        try {
            switch (context) {
                case 'load':
                    return await this.recoverFromLoadError(err, snapshot);

                case 'save':
                    return await this.recoverFromSaveError(err, snapshot);

                case 'calculations':
                    return await this.recoverFromCalculationError(err, snapshot);

                case 'import':
                    return await this.recoverFromImportError(err, snapshot);

                default:
                    console.warn(`[ErrorBoundary] No recovery strategy for context: ${context}`);
                    return false;
            }
        } catch (recoveryErr) {
            console.error('[ErrorBoundary] Recovery failed:', recoveryErr);
            return false;
        }
    }

    /**
     * Recovery стратегия для ошибок загрузки
     */
    async recoverFromLoadError(err, snapshot) {
        if (!this.calc) return false;

        // 1. Сбрасываем флаг загрузки если он застрял
        if (this.calc.state && this.calc.state.isLoadingQuote) {
            this.calc.state.isLoadingQuote = false;
            console.log('[ErrorBoundary] Reset isLoadingQuote flag');
        }

        // 2. Если есть currentQuoteId - пытаемся загрузить из backup
        if (snapshot && snapshot.currentQuoteId) {
            try {
                console.log(`[ErrorBoundary] Attempting to restore from backup: ${snapshot.currentQuoteId}`);

                // Используем apiClient если доступен
                if (typeof apiClient !== 'undefined' && apiClient.loadBackup) {
                    const backupData = await apiClient.loadBackup(snapshot.currentQuoteId);

                    // Восстанавливаем из backup
                    if (backupData && typeof this.calc.loadQuoteData === 'function') {
                        this.calc.loadQuoteData(backupData);
                        this.calc.showNotification('Смета восстановлена из backup', false);
                        return true;
                    }
                }
            } catch (backupErr) {
                console.error('[ErrorBoundary] Backup restore failed:', backupErr);
            }
        }

        // 3. Fallback: создаём пустую смету
        console.log('[ErrorBoundary] Creating empty quote as fallback');
        if (typeof this.calc.createNewQuote === 'function') {
            await this.calc.createNewQuote();
            return true;
        }

        return false;
    }

    /**
     * Recovery стратегия для ошибок сохранения
     */
    async recoverFromSaveError(err, snapshot) {
        if (!this.calc || !snapshot) return false;

        // 1. Откатываем состояние из snapshot
        console.log('[ErrorBoundary] Rolling back state from snapshot');

        // Восстанавливаем критические поля
        if (this.calc.state) {
            this.calc.state.services = snapshot.services || [];
            this.calc.state.paxCount = snapshot.paxCount || 1;
            this.calc.state.hiddenMarkup = snapshot.hiddenMarkup || 0;
            this.calc.state.taxRate = snapshot.taxRate || 0;
            this.calc.state.isQuoteSaved = false; // Помечаем как несохранённую
        }

        // 2. Пересчитываем
        if (typeof this.calc.updateCalculations === 'function') {
            this.calc.updateCalculations();
        }

        // 3. Обновляем UI
        if (typeof this.calc.renderServicesTable === 'function') {
            this.calc.renderServicesTable();
        }

        console.log('[ErrorBoundary] State rolled back successfully');
        return true;
    }

    /**
     * Recovery стратегия для ошибок расчётов
     */
    async recoverFromCalculationError(err, snapshot) {
        if (!this.calc) return false;

        console.log('[ErrorBoundary] Attempting to fix calculation error');

        // 1. Проверяем валидность данных
        if (this.calc.state && this.calc.state.services) {
            // Удаляем невалидные услуги
            const validServices = this.calc.state.services.filter(service => {
                return service &&
                       typeof service.price === 'number' &&
                       !isNaN(service.price) &&
                       typeof service.quantity === 'number' &&
                       !isNaN(service.quantity);
            });

            if (validServices.length !== this.calc.state.services.length) {
                console.log(`[ErrorBoundary] Removed ${this.calc.state.services.length - validServices.length} invalid services`);
                this.calc.state.services = validServices;
            }
        }

        // 2. Проверяем числовые поля
        if (this.calc.state) {
            if (isNaN(this.calc.state.paxCount) || this.calc.state.paxCount < 1) {
                this.calc.state.paxCount = 1;
                console.log('[ErrorBoundary] Reset paxCount to 1');
            }

            if (isNaN(this.calc.state.hiddenMarkup)) {
                this.calc.state.hiddenMarkup = 0;
                console.log('[ErrorBoundary] Reset hiddenMarkup to 0');
            }

            if (isNaN(this.calc.state.taxRate)) {
                this.calc.state.taxRate = 0;
                console.log('[ErrorBoundary] Reset taxRate to 0');
            }
        }

        // 3. Пытаемся пересчитать
        try {
            if (typeof this.calc.updateCalculations === 'function') {
                this.calc.updateCalculations();
                console.log('[ErrorBoundary] Recalculation successful');
                return true;
            }
        } catch (recalcErr) {
            console.error('[ErrorBoundary] Recalculation failed:', recalcErr);
        }

        return false;
    }

    /**
     * Recovery стратегия для ошибок импорта
     */
    async recoverFromImportError(err, snapshot) {
        // Для импорта recovery обычно не нужен - просто отменяем операцию
        console.log('[ErrorBoundary] Import cancelled, no recovery needed');
        return true;
    }

    /**
     * Обновляет статистику ошибок
     */
    updateStats(context, recovered) {
        this.stats.total++;

        if (recovered) {
            this.stats.recovered++;
        } else {
            this.stats.failed++;
        }

        if (!this.stats.byContext[context]) {
            this.stats.byContext[context] = { total: 0, recovered: 0, failed: 0 };
        }

        this.stats.byContext[context].total++;
        if (recovered) {
            this.stats.byContext[context].recovered++;
        } else {
            this.stats.byContext[context].failed++;
        }
    }

    /**
     * Возвращает лог ошибок
     * @returns {Array} - Массив ошибок
     */
    getErrorLog() {
        return [...this.errors]; // Возвращаем копию
    }

    /**
     * Возвращает статистику
     * @returns {Object} - Статистика ошибок
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Очищает лог ошибок
     */
    clearErrorLog() {
        this.errors = [];
        console.log('[ErrorBoundary] Error log cleared');
    }

    /**
     * Экспортирует лог ошибок в JSON
     * @returns {string} - JSON строка с ошибками
     */
    exportErrorLog() {
        return JSON.stringify({
            errors: this.errors,
            stats: this.stats,
            exportedAt: new Date().toISOString()
        }, null, 2);
    }
}

// Экспорт для использования в index.html
if (typeof window !== 'undefined') {
    window.ErrorBoundary = ErrorBoundary;
}

// Экспорт для Node.js (тестирование)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorBoundary;
}
