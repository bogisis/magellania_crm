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
