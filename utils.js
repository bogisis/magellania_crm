// Вспомогательные функции для сервера

/**
 * Транслитерация кириллицы в латиницу
 * @param {string} text - Текст для транслитерации
 * @returns {string} Транслитерированный текст
 */
function transliterate(text) {
    const map = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        ' ': '_'
    };
    return text.toLowerCase().split('').map(char => map[char] || char).join('');
}

/**
 * Генерация UUID v4 (12 символов)
 * @returns {string} UUID
 */
function generateId() {
    return 'xxxxxxxxxxxx'.replace(/x/g, () => {
        return (Math.random() * 16 | 0).toString(16);
    });
}

module.exports = {
    transliterate,
    generateId
};
