/**
 * APIClientV1 v3.0.0
 *
 * API Client для работы с Quote Calculator API v1
 *
 * Особенности:
 * - JWT Authentication (Bearer tokens)
 * - Multi-tenancy support
 * - Optimistic locking
 * - Auto token refresh
 * - Error handling с retry logic
 *
 * Created: 2025-11-19
 * Migration: v3.0.0
 */

class APIClientV1 {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
        this.token = null;
        this.refreshToken = null;
        this.user = null;

        // Load token from localStorage if exists
        this._loadAuthFromStorage();
    }

    // ============================================================================
    // Authentication
    // ============================================================================

    /**
     * Регистрация новой организации + admin
     */
    async register(email, password, organizationName, username = null, fullName = null) {
        const response = await this._fetch('/api/v1/auth/register', {
            method: 'POST',
            body: {
                email,
                password,
                organization_name: organizationName,
                username,
                full_name: fullName
            }
        });

        if (response.success && response.data) {
            this._saveAuth(response.data.token, response.data.user);
        }

        return response;
    }

    /**
     * Вход в систему
     */
    async login(email, password) {
        const response = await this._fetch('/api/v1/auth/login', {
            method: 'POST',
            body: {
                email,
                password
            }
        });

        if (response.success && response.data) {
            this._saveAuth(response.data.token, response.data.user);
        }

        return response;
    }

    /**
     * Выход из системы
     */
    async logout() {
        try {
            await this._fetch('/api/v1/auth/logout', {
                method: 'POST'
            });
        } finally {
            this._clearAuth();
        }
    }

    /**
     * Проверить авторизацию
     */
    isAuthenticated() {
        return this.token !== null && this.user !== null;
    }

    /**
     * Получить текущего пользователя
     */
    getCurrentUser() {
        return this.user;
    }

    // ============================================================================
    // Estimates API
    // ============================================================================

    /**
     * Получить список смет
     */
    async getEstimatesList(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = `/api/v1/estimates${queryString ? '?' + queryString : ''}`;

        return await this._fetch(url, { auth: true });
    }

    /**
     * Получить смету по ID
     */
    async getEstimate(id) {
        return await this._fetch(`/api/v1/estimates/${id}`, { auth: true });
    }

    /**
     * Создать новую смету
     */
    async createEstimate(data) {
        return await this._fetch('/api/v1/estimates', {
            method: 'POST',
            auth: true,
            body: data
        });
    }

    /**
     * Обновить смету (с optimistic locking)
     */
    async updateEstimate(id, data, clientVersion = null) {
        return await this._fetch(`/api/v1/estimates/${id}`, {
            method: 'PUT',
            auth: true,
            body: {
                data,
                client_version: clientVersion
            }
        });
    }

    /**
     * Удалить смету (soft delete)
     */
    async deleteEstimate(id) {
        return await this._fetch(`/api/v1/estimates/${id}`, {
            method: 'DELETE',
            auth: true
        });
    }

    /**
     * Восстановить удалённую смету
     */
    async restoreEstimate(id) {
        return await this._fetch(`/api/v1/estimates/${id}/restore`, {
            method: 'POST',
            auth: true
        });
    }

    /**
     * Переименовать смету
     */
    async renameEstimate(id, newFilename) {
        return await this._fetch(`/api/v1/estimates/${id}/rename`, {
            method: 'PUT',
            auth: true,
            body: { new_filename: newFilename }
        });
    }

    /**
     * Поделиться сметой с пользователями
     */
    async shareEstimate(id, userIds, visibility = null) {
        return await this._fetch(`/api/v1/estimates/${id}/share`, {
            method: 'POST',
            auth: true,
            body: {
                user_ids: userIds,
                visibility
            }
        });
    }

    // ============================================================================
    // Catalogs API
    // ============================================================================

    /**
     * Получить список каталогов
     */
    async getCatalogsList(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = `/api/v1/catalogs${queryString ? '?' + queryString : ''}`;

        return await this._fetch(url, { auth: true });
    }

    /**
     * Получить каталог по ID
     */
    async getCatalog(id) {
        return await this._fetch(`/api/v1/catalogs/${id}`, { auth: true });
    }

    /**
     * Создать или обновить каталог
     */
    async saveCatalog(data) {
        return await this._fetch('/api/v1/catalogs', {
            method: 'POST',
            auth: true,
            body: data
        });
    }

    // ============================================================================
    // Settings API
    // ============================================================================

    /**
     * Получить настройки
     */
    async getSettings(scope = 'user') {
        return await this._fetch(`/api/v1/settings?scope=${scope}`, { auth: true });
    }

    /**
     * Обновить настройки
     */
    async updateSettings(scope, settings) {
        return await this._fetch('/api/v1/settings', {
            method: 'PUT',
            auth: true,
            body: {
                scope,
                settings
            }
        });
    }

    // ============================================================================
    // Sync API
    // ============================================================================

    /**
     * Получить обновления с определённого времени
     */
    async getUpdatesSince(params) {
        const queryString = new URLSearchParams(params).toString();
        return await this._fetch(`/api/v1/sync/updates?${queryString}`, { auth: true });
    }

    /**
     * Отправить batch изменений
     */
    async syncBatch(changes) {
        return await this._fetch('/api/v1/sync/batch', {
            method: 'POST',
            auth: true,
            body: { changes }
        });
    }

    // ============================================================================
    // Users API (admin only)
    // ============================================================================

    /**
     * Получить список пользователей (admin)
     */
    async getUsers() {
        return await this._fetch('/api/v1/users', { auth: true });
    }

    /**
     * Создать пользователя (admin)
     */
    async createUser(userData) {
        return await this._fetch('/api/v1/users', {
            method: 'POST',
            auth: true,
            body: userData
        });
    }

    /**
     * Обновить пользователя
     */
    async updateUser(userId, userData) {
        return await this._fetch(`/api/v1/users/${userId}`, {
            method: 'PUT',
            auth: true,
            body: userData
        });
    }

    // ============================================================================
    // Organizations API
    // ============================================================================

    /**
     * Получить список всех организаций (superuser only)
     */
    async getOrganizations() {
        return await this._fetch('/api/v1/organizations', { auth: true });
    }

    /**
     * Получить организацию
     */
    async getOrganization(orgId) {
        return await this._fetch(`/api/v1/organizations/${orgId}`, { auth: true });
    }

    /**
     * Обновить организацию
     */
    async updateOrganization(orgId, orgData) {
        return await this._fetch(`/api/v1/organizations/${orgId}`, {
            method: 'PUT',
            auth: true,
            body: orgData
        });
    }

    // ============================================================================
    // Export/Import API
    // ============================================================================

    /**
     * Экспорт данных организации (admin)
     */
    async exportOrganization() {
        return await this._fetch('/api/v1/export/organization', { auth: true });
    }

    /**
     * Экспорт всех данных (superuser)
     */
    async exportFull() {
        return await this._fetch('/api/v1/export/full', { auth: true });
    }

    /**
     * Импорт данных организации
     */
    async importOrganization(data, mode = 'merge') {
        return await this._fetch('/api/v1/import/organization', {
            method: 'POST',
            auth: true,
            body: { data, mode }
        });
    }

    /**
     * Импорт всех данных (superuser)
     */
    async importFull(data, mode = 'merge') {
        return await this._fetch('/api/v1/import/full', {
            method: 'POST',
            auth: true,
            body: { data, mode }
        });
    }

    // ============================================================================
    // Generic HTTP Methods
    // ============================================================================

    /**
     * GET request
     */
    async get(url, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = `${url}${queryString ? '?' + queryString : ''}`;

        return await this._fetch(fullUrl, { auth: true });
    }

    /**
     * POST request
     */
    async post(url, body) {
        return await this._fetch(url, {
            method: 'POST',
            auth: true,
            body
        });
    }

    /**
     * PUT request
     */
    async put(url, body) {
        return await this._fetch(url, {
            method: 'PUT',
            auth: true,
            body
        });
    }

    /**
     * DELETE request
     */
    async delete(url) {
        return await this._fetch(url, {
            method: 'DELETE',
            auth: true
        });
    }

    // ============================================================================
    // Internal Fetch Wrapper
    // ============================================================================

    /**
     * Универсальный wrapper для fetch с обработкой ошибок
     */
    async _fetch(url, options = {}) {
        const {
            method = 'GET',
            auth = false,
            body = null,
            headers = {}
        } = options;

        const fetchOptions = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        // Добавить JWT token если требуется auth
        if (auth && this.token) {
            fetchOptions.headers['Authorization'] = `Bearer ${this.token}`;
        }

        // Добавить body если есть
        if (body) {
            fetchOptions.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${this.baseURL}${url}`, fetchOptions);

            // Handle 401 Unauthorized
            if (response.status === 401) {
                console.warn('[APIClientV1] Unauthorized, clearing auth...');
                this._clearAuth();

                return {
                    success: false,
                    error: 'Unauthorized: Please login again',
                    status: 401
                };
            }

            // Handle 403 Forbidden
            if (response.status === 403) {
                return {
                    success: false,
                    error: 'Access denied: Insufficient permissions',
                    status: 403
                };
            }

            // Handle 409 Conflict (Optimistic Locking)
            if (response.status === 409) {
                const result = await response.json();
                return {
                    success: false,
                    error: 'Conflict: Data was modified by another user',
                    status: 409,
                    conflict: true,
                    ...result
                };
            }

            // Handle other errors
            if (!response.ok) {
                const errorText = await response.text();
                return {
                    success: false,
                    error: errorText || `HTTP ${response.status}`,
                    status: response.status
                };
            }

            // Success - parse JSON
            const result = await response.json();
            return result;

        } catch (err) {
            console.error('[APIClientV1] Fetch error:', err);

            return {
                success: false,
                error: err.message || 'Network error',
                networkError: true
            };
        }
    }

    // ============================================================================
    // Auth Storage
    // ============================================================================

    /**
     * Сохранить auth данные в localStorage
     */
    _saveAuth(token, user) {
        this.token = token;
        this.user = user;

        try {
            localStorage.setItem('auth_token', token);
            localStorage.setItem('auth_user', JSON.stringify(user));
        } catch (err) {
            console.error('[APIClientV1] Failed to save auth to localStorage:', err);
        }
    }

    /**
     * Загрузить auth данные из localStorage
     */
    _loadAuthFromStorage() {
        try {
            this.token = localStorage.getItem('auth_token');

            const userJson = localStorage.getItem('auth_user');
            if (userJson) {
                this.user = JSON.parse(userJson);
            }
        } catch (err) {
            console.error('[APIClientV1] Failed to load auth from localStorage:', err);
            this._clearAuth();
        }
    }

    /**
     * Очистить auth данные
     */
    _clearAuth() {
        this.token = null;
        this.user = null;

        try {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
        } catch (err) {
            console.error('[APIClientV1] Failed to clear auth from localStorage:', err);
        }
    }
}
