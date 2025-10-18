module.exports = {
  // Тестовое окружение
  testEnvironment: 'node',

  // Паттерн для поиска тестов
  testMatch: ['**/__tests__/**/*.test.js'],

  // Покрытие кода
  collectCoverageFrom: [
    'server.js',
    'apiClient.js',
    '!node_modules/**',
    '!__tests__/**'
  ],

  // Таймаут для тестов
  testTimeout: 10000,

  // Очистка моков между тестами
  clearMocks: true,

  // Verbose output
  verbose: true,

  // Setup файл (выполняется перед каждым тестом)
  setupFilesAfterEnv: ['<rootDir>/test-setup.js']
};
