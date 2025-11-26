/**
 * JWT Authentication Middleware для API v1
 *
 * Проверяет JWT токен в заголовке Authorization
 * Добавляет req.user с данными пользователя
 *
 * Created: 2025-11-19
 * Version: 3.0.0
 */

const jwt = require('jsonwebtoken');

// JWT secret (в production должен быть в ENV)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRATION = '7d'; // 7 days

/**
 * Генерация JWT токена
 */
function generateToken(user) {
    const payload = {
        id: user.id,
        email: user.email,
        username: user.username,
        organization_id: user.organization_id,
        role: user.role
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRATION
    });
}

/**
 * Middleware для проверки JWT токена
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized: No token provided'
        });
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    // ✅ SECURITY: NO guest tokens - только реальная JWT авторизация (Migration 010)
    // Guest аккаунты удалены, используется только superadmin/magellania-org

    // JWT token verification
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        req.isGuest = false;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: Token expired'
            });
        }

        return res.status(401).json({
            success: false,
            error: 'Unauthorized: Invalid token'
        });
    }
}

/**
 * Optional auth - не требует токен, но если есть - валидирует
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
    } catch (err) {
        req.user = null;
    }

    next();
}

module.exports = {
    generateToken,
    requireAuth,
    optionalAuth,
    JWT_SECRET,
    JWT_EXPIRATION
};
