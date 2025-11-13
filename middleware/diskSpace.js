/**
 * Disk Space Validation Middleware
 *
 * DAY 1.3: Production Safety - проверка свободного места на диске
 * Предотвращает попытки записи при недостатке места (507 Insufficient Storage)
 */

const fs = require('fs');
const path = require('path');

// Минимальное свободное место (MB) для безопасной записи
const MIN_DISK_SPACE_MB = 100;

/**
 * Middleware для проверки свободного места на диске перед записью
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Express next middleware
 */
function checkDiskSpace(req, res, next) {
    try {
        // В тестовой среде пропускаем проверку (избегаем flaky tests)
        if (process.env.NODE_ENV === 'test') {
            return next();
        }

        // Получаем статистику файловой системы для директории БД
        const dbDir = path.resolve('./db');
        const stats = fs.statfsSync(dbDir);

        // Вычисляем свободное место в MB
        // bavail = доступно для непривилегированных пользователей
        // bsize = размер блока в байтах
        const freeSpaceMB = (stats.bavail * stats.bsize) / (1024 * 1024);

        if (freeSpaceMB < MIN_DISK_SPACE_MB) {
            console.error(`❌ Insufficient disk space: ${Math.floor(freeSpaceMB)}MB free (required: ${MIN_DISK_SPACE_MB}MB)`);

            return res.status(507).json({
                success: false,
                error: 'Insufficient disk space',
                freeSpaceMB: Math.floor(freeSpaceMB),
                requiredMB: MIN_DISK_SPACE_MB
            });
        }

        // Логируем предупреждение если места мало (< 500MB)
        if (freeSpaceMB < 500) {
            console.warn(`⚠️  Low disk space warning: ${Math.floor(freeSpaceMB)}MB free`);
        }

        next();
    } catch (err) {
        // Если проверка не удалась, логируем но разрешаем операцию (fail-open)
        // Это предотвращает DoS из-за проблем с проверкой диска
        console.warn('Disk space check failed (allowing operation):', err.message);
        next();
    }
}

/**
 * Получить текущее свободное место на диске (для health check)
 * @returns {object} { freeSpaceMB, totalSpaceMB, usagePercent }
 */
function getDiskSpaceInfo() {
    try {
        const dbDir = path.resolve('./db');
        const stats = fs.statfsSync(dbDir);

        const freeSpaceMB = (stats.bavail * stats.bsize) / (1024 * 1024);
        const totalSpaceMB = (stats.blocks * stats.bsize) / (1024 * 1024);
        const usedSpaceMB = totalSpaceMB - freeSpaceMB;
        const usagePercent = (usedSpaceMB / totalSpaceMB) * 100;

        return {
            freeSpaceMB: Math.floor(freeSpaceMB),
            totalSpaceMB: Math.floor(totalSpaceMB),
            usagePercent: Math.floor(usagePercent),
            healthy: freeSpaceMB >= MIN_DISK_SPACE_MB
        };
    } catch (err) {
        console.error('Failed to get disk space info:', err);
        return {
            freeSpaceMB: 0,
            totalSpaceMB: 0,
            usagePercent: 100,
            healthy: false,
            error: err.message
        };
    }
}

module.exports = {
    checkDiskSpace,
    getDiskSpaceInfo,
    MIN_DISK_SPACE_MB
};
