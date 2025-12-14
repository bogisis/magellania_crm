/**
 * Admin Panel Configuration
 * Version: 1.0.0
 * Created: 2025-12-13
 *
 * Global configuration for admin panel
 */

export const config = {
    // Application info
    app: {
        name: 'Magellania CRM - Admin Panel',
        version: '1.0.0',
        environment: 'production'
    },

    // API configuration
    api: {
        baseUrl: window.location.origin,
        version: 'v1',
        timeout: 30000, // 30 seconds
        retryAttempts: 3
    },

    // Auth configuration
    auth: {
        tokenKey: 'jwt_token',
        tokenExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
        loginUrl: '/login.html',
        verifyEndpoint: '/api/v1/auth/verify'
    },

    // Pagination defaults
    pagination: {
        defaultPage: 1,
        defaultLimit: 20,
        maxLimit: 100,
        limitOptions: [10, 20, 50, 100]
    },

    // Table configuration
    table: {
        defaultSort: 'created_at',
        defaultOrder: 'desc'
    },

    // Form validation
    validation: {
        maxUsernameLength: 50,
        maxEmailLength: 100,
        minPasswordLength: 8,
        maxPasswordLength: 128
    },

    // UI configuration
    ui: {
        toastDuration: 3000, // 3 seconds
        debounceDelay: 300,  // 300ms for search inputs
        animationDuration: 200 // Animation duration in ms
    },

    // Feature flags
    features: {
        auditLog: true,
        darkMode: false,
        advancedFiltering: true,
        bulkActions: true
    },

    // Roles configuration
    roles: {
        superadmin: {
            label: 'Superadmin',
            level: 100,
            canManageOrgs: true
        },
        admin: {
            label: 'Admin',
            level: 50,
            canManageOrgs: false
        },
        user: {
            label: 'User',
            level: 10,
            canManageOrgs: false
        }
    },

    // Routes configuration
    routes: {
        home: '/',
        users: '/users',
        organizations: '/organizations',
        settings: '/settings',
        profile: '/profile',
        auditLog: '/audit-log'
    }
};

/**
 * Get API URL with path
 * @param {string} path - API path (e.g., '/users')
 * @returns {string} Full API URL
 */
export function getApiUrl(path) {
    const base = config.api.baseUrl;
    const version = config.api.version;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}/api/${version}${cleanPath}`;
}

/**
 * Get auth token from localStorage
 * @returns {string|null} JWT token or null
 */
export function getAuthToken() {
    return localStorage.getItem(config.auth.tokenKey);
}

/**
 * Set auth token in localStorage
 * @param {string} token - JWT token
 */
export function setAuthToken(token) {
    localStorage.setItem(config.auth.tokenKey, token);
}

/**
 * Remove auth token from localStorage
 */
export function removeAuthToken() {
    localStorage.removeItem(config.auth.tokenKey);
}

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
export function isAuthenticated() {
    return !!getAuthToken();
}

/**
 * Get user role level
 * @param {string} role - Role name
 * @returns {number} Role level
 */
export function getRoleLevel(role) {
    return config.roles[role]?.level || 0;
}

/**
 * Check if role can perform action
 * @param {string} userRole - User's role
 * @param {string} requiredRole - Required role
 * @returns {boolean}
 */
export function hasRolePermission(userRole, requiredRole) {
    const userLevel = getRoleLevel(userRole);
    const requiredLevel = getRoleLevel(requiredRole);
    return userLevel >= requiredLevel;
}
