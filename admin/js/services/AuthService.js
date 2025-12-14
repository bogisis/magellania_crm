/**
 * Authentication Service
 * Version: 1.0.0
 * Created: 2025-12-14
 *
 * Handles user authentication:
 * - Login/Logout
 * - Token verification
 * - User session management
 */

import { apiClient } from './ApiClient.js';
import { setAuthToken, removeAuthToken, getAuthToken } from '../config.js';

export class AuthService {
    /**
     * Login user
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<Object>} User data and token
     */
    async login(email, password) {
        const response = await apiClient.post('/auth/login', { email, password });

        if (response.success && response.data.token) {
            setAuthToken(response.data.token);
            return response.data;
        }

        throw new Error(response.error || 'Login failed');
    }

    /**
     * Logout user
     * @returns {Promise<void>}
     */
    async logout() {
        try {
            await apiClient.post('/auth/logout');
        } catch (error) {
            console.warn('[AuthService] Logout API call failed:', error);
            // Continue anyway - remove token locally
        } finally {
            removeAuthToken();
        }
    }

    /**
     * Verify JWT token and get current user
     * @returns {Promise<Object>} User data
     */
    async verify() {
        const token = getAuthToken();

        if (!token) {
            throw new Error('No authentication token found');
        }

        const response = await apiClient.get('/auth/verify');

        if (response.success && response.data.user) {
            return response.data.user;
        }

        throw new Error(response.error || 'Token verification failed');
    }

    /**
     * Register new organization and admin user
     * @param {Object} data - Registration data
     * @returns {Promise<Object>} User and organization data
     */
    async register(data) {
        const response = await apiClient.post('/auth/register', data);

        if (response.success && response.data.token) {
            setAuthToken(response.data.token);
            return response.data;
        }

        throw new Error(response.error || 'Registration failed');
    }

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        return !!getAuthToken();
    }

    /**
     * Get current auth token
     * @returns {string|null}
     */
    getToken() {
        return getAuthToken();
    }
}

// Export singleton instance
export const authService = new AuthService();
