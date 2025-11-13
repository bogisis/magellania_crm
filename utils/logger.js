/**
 * Production Logger with Winston
 *
 * DAY 2.1: Structured logging для production deployment
 * - JSON формат для машинного парсинга
 * - Separate files для errors и combined logs
 * - Console output в development
 * - Timestamps и metadata
 * - No sensitive data logging
 */

const winston = require('winston');
const path = require('path');

// Определяем окружение
const isDevelopment = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

// Директория для логов
const logsDir = path.join(__dirname, '..', 'logs');

// Custom format для добавления timestamp и pretty-print
const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // Include stack traces
    winston.format.splat(), // String interpolation
    winston.format.json()
);

// Console format для development (читаемый)
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, service, ...metadata }) => {
        let msg = `${timestamp} [${service}] ${level}: ${message}`;

        // Добавляем metadata если есть
        if (Object.keys(metadata).length > 0) {
            // Фильтруем пустые объекты и Symbol
            const filteredMeta = Object.fromEntries(
                Object.entries(metadata).filter(([key, value]) => {
                    return typeof key === 'string' &&
                           value !== undefined &&
                           value !== null &&
                           !(typeof value === 'object' && Object.keys(value).length === 0);
                })
            );

            if (Object.keys(filteredMeta).length > 0) {
                msg += `\n  ${JSON.stringify(filteredMeta, null, 2)}`;
            }
        }

        return msg;
    })
);

// Создаем transports
const transports = [];

// File transports (всегда активны кроме test mode)
if (!isTest) {
    // Error logs - только errors
    transports.push(
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            format: customFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            tailable: true
        })
    );

    // Combined logs - все уровни
    transports.push(
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            format: customFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            tailable: true
        })
    );
}

// Console transport (в development или если явно включен)
if (isDevelopment || process.env.LOG_CONSOLE === 'true') {
    transports.push(
        new winston.transports.Console({
            format: consoleFormat,
            level: process.env.LOG_LEVEL || 'debug'
        })
    );
}

// Создаем logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    format: customFormat,
    defaultMeta: {
        service: 'quote-calculator',
        version: '2.3.0',
        environment: process.env.NODE_ENV || 'development'
    },
    transports,
    // Не падать при ошибках логирования
    exitOnError: false
});

// Helper функции для безопасного логирования

/**
 * Sanitize data - убирает чувствительные поля
 * @param {object} data - объект для очистки
 * @returns {object} - очищенный объект
 */
function sanitize(data) {
    if (!data || typeof data !== 'object') {
        return data;
    }

    const sensitiveFields = [
        'password', 'token', 'secret', 'apiKey', 'api_key',
        'authorization', 'auth', 'cookie', 'session'
    ];

    const sanitized = Array.isArray(data) ? [...data] : { ...data };

    for (const key in sanitized) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
            sanitized[key] = '[REDACTED]';
        } else if (typeof sanitized[key] === 'object') {
            sanitized[key] = sanitize(sanitized[key]);
        }
    }

    return sanitized;
}

/**
 * Log HTTP request (для Express middleware)
 */
logger.logRequest = (req, res, duration) => {
    logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent')
    });
};

/**
 * Log database operation
 */
logger.logDB = (operation, details) => {
    logger.debug('Database Operation', {
        operation,
        ...sanitize(details)
    });
};

/**
 * Log storage operation
 */
logger.logStorage = (operation, details) => {
    logger.info('Storage Operation', {
        operation,
        ...sanitize(details)
    });
};

/**
 * Log error with context
 */
logger.logError = (error, context = {}) => {
    logger.error(error.message, {
        stack: error.stack,
        ...sanitize(context)
    });
};

/**
 * Log security event
 */
logger.logSecurity = (event, details) => {
    logger.warn('Security Event', {
        event,
        timestamp: new Date().toISOString(),
        ...sanitize(details)
    });
};

/**
 * Express middleware для автологирования запросов
 */
logger.middleware = () => {
    return (req, res, next) => {
        const startTime = Date.now();

        // Перехватываем res.end для логирования response
        const originalEnd = res.end;
        res.end = function(...args) {
            const duration = Date.now() - startTime;
            logger.logRequest(req, res, duration);
            originalEnd.apply(res, args);
        };

        next();
    };
};

// Создаем logs директорию если не существует
const fs = require('fs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    logger.info('Logs directory created', { path: logsDir });
}

// Export logger
module.exports = logger;
