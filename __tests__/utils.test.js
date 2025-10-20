const { transliterate, generateId } = require('../utils');

describe('Utils - Вспомогательные функции', () => {

    describe('transliterate()', () => {
        test('должна транслитерировать русские символы в латиницу', () => {
            expect(transliterate('Иванов Иван')).toBe('ivanov_ivan');
        });

        test('должна обрабатывать сложные символы', () => {
            expect(transliterate('Щербаков')).toBe('scherbakov');
            expect(transliterate('Юрий')).toBe('yuriy');
            expect(transliterate('Ёлкин')).toBe('yolkin');
        });

        test('должна конвертировать пробелы в подчёркивания', () => {
            expect(transliterate('Петров Пётр Петрович')).toBe('petrov_pyotr_petrovich');
        });

        test('должна оставлять латинские символы без изменений', () => {
            expect(transliterate('test user')).toBe('test_user');
        });

        test('должна обрабатывать пустую строку', () => {
            expect(transliterate('')).toBe('');
        });

        test('должна обрабатывать смешанный текст', () => {
            expect(transliterate('Иван Smith')).toBe('ivan_smith');
        });

        // Edge cases - новые тесты для улучшенной функции
        describe('Edge cases', () => {
            test('должна удалять emoji', () => {
                expect(transliterate('Тур в Баку 🏖️✈️')).toBe('tur_v_baku');
                expect(transliterate('😀 Отдых 🌴')).toBe('otdyh');
            });

            test('должна удалять специальные символы', () => {
                expect(transliterate('Тур#2024@gmail.com')).toBe('tur2024gmailcom');
                expect(transliterate('Цена: $1000!')).toBe('tsena_1000');
                expect(transliterate('Москва (Россия)')).toBe('moskva_rossiya');
            });

            test('должна конвертировать множественные пробелы в один underscore', () => {
                expect(transliterate('Иван    Иванов')).toBe('ivan_ivanov');
                expect(transliterate('Тур  в   Баку')).toBe('tur_v_baku');
            });

            test('должна конвертировать множественные дефисы в один дефис', () => {
                expect(transliterate('Москва---Баку')).toBe('moskva-baku');
                expect(transliterate('test--case')).toBe('test-case');
            });

            test('должна обрезать длинные имена до 50 символов', () => {
                const longName = 'Очень Длинное Название Сметы Для Тестирования Функции Транслитерации И Проверки Лимитов';
                const result = transliterate(longName);
                expect(result.length).toBeLessThanOrEqual(50);
                // Actual result is 50 chars exactly (includes '_fu' from 'Функции')
                expect(result).toBe('ochen_dlinnoe_nazvanie_smety_dlya_testirovaniya_fu');
            });

            test('должна удалять underscores и дефисы с начала и конца', () => {
                expect(transliterate('  Иванов  ')).toBe('ivanov');
                expect(transliterate('--test--')).toBe('test');
                expect(transliterate('_Петров_')).toBe('petrov');
                expect(transliterate(' - test - ')).toBe('test');
            });

            test('должна обрабатывать non-string input', () => {
                expect(transliterate(null)).toBe('');
                expect(transliterate(undefined)).toBe('');
                expect(transliterate(123)).toBe('');
                expect(transliterate({})).toBe('');
            });

            test('должна обрабатывать только специальные символы', () => {
                expect(transliterate('!@#$%^&*()')).toBe('');
                expect(transliterate('   ')).toBe('');
                expect(transliterate('---')).toBe('');
            });

            test('должна сохранять дефисы и underscores в середине', () => {
                expect(transliterate('test-case_name')).toBe('test-case_name');
                expect(transliterate('Москва-Сити_2024')).toBe('moskva-siti_2024');
            });

            test('должна правильно обрабатывать ё → yo', () => {
                expect(transliterate('Ёлка')).toBe('yolka');
                expect(transliterate('ёж')).toBe('yozh');
                expect(transliterate('Моё')).toBe('moyo');
            });

            test('должна обрабатывать смешанный контент с emoji и спецсимволами', () => {
                // Dash is preserved, spaces around it become underscores
                expect(transliterate('Тур 2024 🌴 (Баку) - $1500!')).toBe('tur_2024_baku_-_1500');
            });

            test('должна обрабатывать цифры корректно', () => {
                expect(transliterate('Смета 123')).toBe('smeta_123');
                expect(transliterate('v2.0.1')).toBe('v201');
            });

            test('должна обрабатывать уже транслитерированный текст', () => {
                expect(transliterate('test_user_123')).toBe('test_user_123');
                expect(transliterate('moscow-baku-2024')).toBe('moscow-baku-2024');
            });

            test('должна trim после обрезания длинных строк', () => {
                // Строка которая обрежется ровно на underscore
                const name = 'Очень Длинное Название_ Которое Обрезается На Символе';
                const result = transliterate(name);
                expect(result[result.length - 1]).not.toBe('_');
                expect(result[0]).not.toBe('_');
            });

            test('должна обрабатывать Unicode символы вне кириллицы', () => {
                expect(transliterate('Тур в 北京')).toBe('tur_v');
                expect(transliterate('Баку + العربية')).toBe('baku');
            });
        });
    });

    describe('generateId()', () => {
        test('должна генерировать строку из 12 символов', () => {
            const id = generateId();
            expect(id).toHaveLength(12);
        });

        test('должна генерировать строку только из hex символов', () => {
            const id = generateId();
            expect(id).toMatch(/^[0-9a-f]{12}$/);
        });

        test('должна генерировать разные ID', () => {
            const id1 = generateId();
            const id2 = generateId();
            expect(id1).not.toBe(id2);
        });

        test('должна генерировать много уникальных ID', () => {
            const ids = new Set();
            for (let i = 0; i < 1000; i++) {
                ids.add(generateId());
            }
            // Все ID должны быть уникальными
            expect(ids.size).toBe(1000);
        });
    });
});
