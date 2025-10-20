/**
 * Тесты для ErrorBoundary
 * Проверяют обработку ошибок, recovery механизмы, логирование
 */

const ErrorBoundary = require('../errorBoundary');

describe('ErrorBoundary - Обработка ошибок и recovery', () => {
    let errorBoundary;
    let mockCalc;

    beforeEach(() => {
        // Создаём mock калькулятор
        mockCalc = {
            state: {
                services: [
                    { id: '1', name: 'Test Service', price: 100, quantity: 2 }
                ],
                paxCount: 10,
                hiddenMarkup: 5,
                taxRate: 10,
                currentQuoteId: 'test123',
                currentQuoteFile: 'test.json',
                isQuoteSaved: true,
                isLoadingQuote: false,
                clientName: 'Test Client',
                tourStart: '2025-11-01',
                tourEnd: '2025-11-10'
            },
            showNotification: jest.fn(),
            updateCalculations: jest.fn(),
            renderServicesTable: jest.fn(),
            createNewQuote: jest.fn(),
            loadQuoteData: jest.fn()
        };

        errorBoundary = new ErrorBoundary(mockCalc);
    });

    describe('Базовая функциональность', () => {
        it('должен создаться с пустым логом ошибок', () => {
            expect(errorBoundary.errors).toEqual([]);
            expect(errorBoundary.stats.total).toBe(0);
        });

        it('должен сохранять snapshot состояния', () => {
            const snapshot = errorBoundary.captureSnapshot();

            expect(snapshot).toBeDefined();
            expect(snapshot.paxCount).toBe(10);
            expect(snapshot.services.length).toBe(1);
            expect(snapshot.currentQuoteId).toBe('test123');
        });

        it('должен возвращать копию лога ошибок', () => {
            errorBoundary.errors.push({ test: 'error' });
            const log = errorBoundary.getErrorLog();

            expect(log).toEqual([{ test: 'error' }]);
            expect(log).not.toBe(errorBoundary.errors); // Должна быть копия
        });

        it('должен очищать лог ошибок', () => {
            errorBoundary.errors.push({ test: 'error' });
            errorBoundary.clearErrorLog();

            expect(errorBoundary.errors).toEqual([]);
        });
    });

    describe('wrapAsync() - Оборачивание функций', () => {
        it('должен успешно выполнить функцию без ошибок', async () => {
            const mockFn = jest.fn().mockResolvedValue('success');
            const wrapped = errorBoundary.wrapAsync(mockFn, 'test');

            const result = await wrapped();

            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalled();
            expect(errorBoundary.errors.length).toBe(0);
        });

        it('должен перехватить ошибку и залогировать', async () => {
            const testError = new Error('Test error');
            const mockFn = jest.fn().mockRejectedValue(testError);
            const wrapped = errorBoundary.wrapAsync(mockFn, 'test');

            await expect(wrapped()).rejects.toThrow('Test error');

            expect(errorBoundary.errors.length).toBe(1);
            expect(errorBoundary.errors[0].message).toBe('Test error');
            expect(errorBoundary.errors[0].context).toBe('test');
        });

        it('должен показать уведомление при ошибке', async () => {
            const testError = new Error('Test error');
            const mockFn = jest.fn().mockRejectedValue(testError);
            const wrapped = errorBoundary.wrapAsync(mockFn, 'save');

            await expect(wrapped()).rejects.toThrow('Test error');

            expect(mockCalc.showNotification).toHaveBeenCalledWith(
                'Ошибка сохранения сметы: Test error',
                true
            );
        });

        it('должен сохранить snapshot до выполнения функции', async () => {
            const testError = new Error('Test error');
            const mockFn = jest.fn().mockRejectedValue(testError);
            const wrapped = errorBoundary.wrapAsync(mockFn, 'test');

            await expect(wrapped()).rejects.toThrow();

            expect(errorBoundary.errors[0].snapshot).toBeDefined();
            expect(errorBoundary.errors[0].snapshot.paxCount).toBe(10);
        });

        it('должен обновить статистику после ошибки', async () => {
            const testError = new Error('Test error');
            const mockFn = jest.fn().mockRejectedValue(testError);
            const wrapped = errorBoundary.wrapAsync(mockFn, 'save');

            await expect(wrapped()).rejects.toThrow();

            expect(errorBoundary.stats.total).toBe(1);
            expect(errorBoundary.stats.byContext['save']).toBeDefined();
            expect(errorBoundary.stats.byContext['save'].total).toBe(1);
        });
    });

    describe('Recovery стратегии', () => {
        describe('recoverFromLoadError', () => {
            it('должен сбросить флаг isLoadingQuote', async () => {
                mockCalc.state.isLoadingQuote = true;
                const snapshot = errorBoundary.captureSnapshot();

                await errorBoundary.recoverFromLoadError(new Error('Load failed'), snapshot);

                expect(mockCalc.state.isLoadingQuote).toBe(false);
            });

            it('должен создать новую смету при невозможности восстановления', async () => {
                const snapshot = { currentQuoteId: null };

                await errorBoundary.recoverFromLoadError(new Error('Load failed'), snapshot);

                expect(mockCalc.createNewQuote).toHaveBeenCalled();
            });
        });

        describe('recoverFromSaveError', () => {
            it('должен откатить состояние из snapshot', async () => {
                const snapshot = {
                    services: [{ id: '2', name: 'Old Service', price: 50, quantity: 1 }],
                    paxCount: 5,
                    hiddenMarkup: 10,
                    taxRate: 20
                };

                // Изменяем текущее состояние
                mockCalc.state.paxCount = 999;
                mockCalc.state.hiddenMarkup = 999;

                const recovered = await errorBoundary.recoverFromSaveError(
                    new Error('Save failed'),
                    snapshot
                );

                expect(recovered).toBe(true);
                expect(mockCalc.state.paxCount).toBe(5);
                expect(mockCalc.state.hiddenMarkup).toBe(10);
                expect(mockCalc.state.taxRate).toBe(20);
                expect(mockCalc.state.isQuoteSaved).toBe(false);
            });

            it('должен вызвать updateCalculations после отката', async () => {
                const snapshot = errorBoundary.captureSnapshot();

                await errorBoundary.recoverFromSaveError(new Error('Save failed'), snapshot);

                expect(mockCalc.updateCalculations).toHaveBeenCalled();
                expect(mockCalc.renderServicesTable).toHaveBeenCalled();
            });
        });

        describe('recoverFromCalculationError', () => {
            it('должен удалить невалидные услуги', async () => {
                mockCalc.state.services = [
                    { id: '1', name: 'Valid', price: 100, quantity: 1 },
                    { id: '2', name: 'Invalid', price: NaN, quantity: 1 },
                    { id: '3', name: 'Invalid', price: 100, quantity: 'bad' }
                ];

                const recovered = await errorBoundary.recoverFromCalculationError(
                    new Error('Calculation failed'),
                    null
                );

                expect(recovered).toBe(true);
                expect(mockCalc.state.services.length).toBe(1);
                expect(mockCalc.state.services[0].id).toBe('1');
            });

            it('должен исправить невалидные числовые поля', async () => {
                mockCalc.state.paxCount = NaN;
                mockCalc.state.hiddenMarkup = NaN;
                mockCalc.state.taxRate = 'bad';

                const recovered = await errorBoundary.recoverFromCalculationError(
                    new Error('Calculation failed'),
                    null
                );

                expect(recovered).toBe(true);
                expect(mockCalc.state.paxCount).toBe(1);
                expect(mockCalc.state.hiddenMarkup).toBe(0);
                expect(mockCalc.state.taxRate).toBe(0);
            });

            it('должен пересчитать после исправления', async () => {
                mockCalc.state.paxCount = NaN;

                await errorBoundary.recoverFromCalculationError(
                    new Error('Calculation failed'),
                    null
                );

                expect(mockCalc.updateCalculations).toHaveBeenCalled();
            });
        });
    });

    describe('Логирование ошибок', () => {
        it('должен логировать ошибку с полным контекстом', () => {
            const error = new Error('Test error');
            const snapshot = errorBoundary.captureSnapshot();

            errorBoundary.logError('test', error, snapshot, 100);

            expect(errorBoundary.errors.length).toBe(1);
            expect(errorBoundary.errors[0].context).toBe('test');
            expect(errorBoundary.errors[0].message).toBe('Test error');
            expect(errorBoundary.errors[0].snapshot).toBe(snapshot);
            expect(errorBoundary.errors[0].duration).toBe(100);
            expect(errorBoundary.errors[0].timestamp).toBeDefined();
        });

        it('должен ограничивать размер лога', () => {
            // Заполняем лог больше максимума
            for (let i = 0; i < 105; i++) {
                errorBoundary.logError('test', new Error(`Error ${i}`), null, 0);
            }

            expect(errorBoundary.errors.length).toBe(100); // maxErrorLogSize
        });

        it('должен экспортировать лог в JSON', () => {
            errorBoundary.logError('test', new Error('Test error'), null, 100);

            const exported = errorBoundary.exportErrorLog();
            const parsed = JSON.parse(exported);

            expect(parsed.errors).toBeDefined();
            expect(parsed.stats).toBeDefined();
            expect(parsed.exportedAt).toBeDefined();
            expect(parsed.errors.length).toBe(1);
        });
    });

    describe('Статистика', () => {
        it('должен вести статистику по контекстам', async () => {
            const errorFn = jest.fn().mockRejectedValue(new Error('Test'));

            const wrapped1 = errorBoundary.wrapAsync(errorFn, 'save');
            const wrapped2 = errorBoundary.wrapAsync(errorFn, 'load');

            await expect(wrapped1()).rejects.toThrow();
            await expect(wrapped2()).rejects.toThrow();
            await expect(wrapped1()).rejects.toThrow();

            const stats = errorBoundary.getStats();

            expect(stats.total).toBe(3);
            expect(stats.byContext['save'].total).toBe(2);
            expect(stats.byContext['load'].total).toBe(1);
        });

        it('должен отслеживать успешные recovery', async () => {
            // Имитируем успешное восстановление
            const snapshot = errorBoundary.captureSnapshot();
            await errorBoundary.recoverFromSaveError(new Error('Test'), snapshot);

            errorBoundary.updateStats('save', true);

            expect(errorBoundary.stats.recovered).toBe(1);
            expect(errorBoundary.stats.failed).toBe(0);
        });
    });

    describe('Edge cases', () => {
        it('должен работать если calc не определён', () => {
            const boundary = new ErrorBoundary(null);
            const snapshot = boundary.captureSnapshot();

            expect(snapshot).toBe(null);
        });

        it('должен работать если showNotification не существует', () => {
            delete mockCalc.showNotification;

            errorBoundary.showNotification('test', new Error('Test'));

            // Не должно упасть
        });

        it('должен работать если state не определён', () => {
            mockCalc.state = null;

            const snapshot = errorBoundary.captureSnapshot();

            expect(snapshot).toBe(null);
        });
    });
});
