/**
 * User Management Service
 * Version: 1.0.0
 * Created: 2025-12-14
 *
 * Handles user CRUD operations:
 * - List users with pagination/filtering
 * - Create/Update/Delete users
 * - Reset password
 * - Manage user sessions
 */

import { apiClient } from './ApiClient.js';

export class UserService {
    /**
     * Get paginated list of users
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Users list with pagination
     */
    async getUsers(options = {}) {
        const {
            page = 1,
            limit = 20,
            sort = 'created_at',
            order = 'desc',
            search = '',
            role = '',
            is_active = '',
            email_verified = ''
        } = options;

        const params = {
            page,
            limit,
            sort,
            order
        };

        if (search) params.search = search;
        if (role) params.role = role;
        if (is_active !== '') params.is_active = is_active;
        if (email_verified !== '') params.email_verified = email_verified;

        const response = await apiClient.get('/users', params);

        if (response.success) {
            return response.data;
        }

        throw new Error(response.error || 'Failed to fetch users');
    }

    /**
     * Get user by ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} User data
     */
    async getUser(userId) {
        const response = await apiClient.get(`/users/${userId}`);

        if (response.success && response.data.user) {
            return response.data.user;
        }

        throw new Error(response.error || 'Failed to fetch user');
    }

    /**
     * Create new user
     * @param {Object} userData - User data
     * @returns {Promise<Object>} Created user
     */
    async createUser(userData) {
        const response = await apiClient.post('/users', userData);

        if (response.success && response.data.user) {
            return response.data.user;
        }

        throw new Error(response.error || 'Failed to create user');
    }

    /**
     * Update user
     * @param {string} userId - User ID
     * @param {Object} userData - Updated user data
     * @returns {Promise<Object>} Updated user
     */
    async updateUser(userId, userData) {
        const response = await apiClient.put(`/users/${userId}`, userData);

        if (response.success && response.data.user) {
            return response.data.user;
        }

        throw new Error(response.error || 'Failed to update user');
    }

    /**
     * Delete user (soft delete)
     * @param {string} userId - User ID
     * @returns {Promise<void>}
     */
    async deleteUser(userId) {
        const response = await apiClient.delete(`/users/${userId}`);

        if (response.success) {
            return;
        }

        throw new Error(response.error || 'Failed to delete user');
    }

    /**
     * Reset user password
     * @param {string} userId - User ID
     * @param {string} newPassword - New password
     * @returns {Promise<void>}
     */
    async resetPassword(userId, newPassword) {
        const response = await apiClient.post(`/users/${userId}/reset-password`, {
            new_password: newPassword
        });

        if (response.success) {
            return;
        }

        throw new Error(response.error || 'Failed to reset password');
    }

    /**
     * Get user sessions
     * @param {string} userId - User ID
     * @returns {Promise<Array>} List of sessions
     */
    async getSessions(userId) {
        const response = await apiClient.get(`/users/${userId}/sessions`);

        if (response.success && response.data.sessions) {
            return response.data.sessions;
        }

        throw new Error(response.error || 'Failed to fetch sessions');
    }

    /**
     * Terminate user session
     * @param {string} userId - User ID
     * @param {string} sessionId - Session ID
     * @returns {Promise<void>}
     */
    async terminateSession(userId, sessionId) {
        const response = await apiClient.delete(`/users/${userId}/sessions/${sessionId}`);

        if (response.success) {
            return;
        }

        throw new Error(response.error || 'Failed to terminate session');
    }

    /**
     * Validate user data
     * @param {Object} userData - User data to validate
     * @returns {Array} Array of validation errors
     */
    validateUserData(userData) {
        const errors = [];

        // Email validation
        if (!userData.email) {
            errors.push({ field: 'email', message: 'Email is required' });
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
            errors.push({ field: 'email', message: 'Invalid email format' });
        }

        // Password validation (only for new users)
        if (userData.password !== undefined) {
            if (!userData.password) {
                errors.push({ field: 'password', message: 'Password is required' });
            } else if (userData.password.length < 8) {
                errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
            }
        }

        // Username validation
        if (userData.username && userData.username.length > 50) {
            errors.push({ field: 'username', message: 'Username too long (max 50 characters)' });
        }

        // Role validation
        if (userData.role && !['admin', 'user'].includes(userData.role)) {
            errors.push({ field: 'role', message: 'Invalid role' });
        }

        return errors;
    }
}

// Export singleton instance
export const userService = new UserService();
