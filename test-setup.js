// Тестовая настройка окружения
// Этот файл выполняется перед каждым тестом

// Устанавливаем тестовое окружение
process.env.NODE_ENV = 'test';
process.env.TEST_MODE = 'true';

// Увеличиваем таймауты для медленных операций
jest.setTimeout(10000);

// Глобальные переменные для тестов
global.testPort = 3001; // Тестовый порт (не 3000!)
global.testPaths = {
    catalog: '__test_catalog__',
    estimate: '__test_estimate__',
    backup: '__test_backup__'
};

// Логирование для отладки
console.log('🧪 Test environment initialized');
console.log('   NODE_ENV:', process.env.NODE_ENV);
console.log('   Test port:', global.testPort);
console.log('   Test paths:', global.testPaths);
