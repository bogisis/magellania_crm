/**
 * Version Control - Единый источник версий для всего приложения
 *
 * ВАЖНО: При изменении версий обновить:
 * - package.json → "version"
 * - index.html → <div id="app-version">
 * - CLAUDE.md → версия в заголовке
 * - CHANGELOG.md → новая запись
 */

const VERSION = {
    // Версия приложения (основная)
    app: '2.2.0',

    // Версия формата каталога услуг
    catalog: '1.2.0',

    // Версия формата сметы (JSON)
    quote: '1.1.0',

    // Версия схемы localStorage
    dataSchema: '1.0.0',

    // Дата релиза
    releaseDate: '2025-10-17',

    // Статус релиза
    status: 'stable' // 'alpha' | 'beta' | 'rc' | 'stable'
};

// Export для использования в модулях (когда перейдём на модульную архитектуру)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VERSION;
}

// Export для браузера
if (typeof window !== 'undefined') {
    window.VERSION = VERSION;
}
