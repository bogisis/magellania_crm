/**
 * API Client Service
 * Version: 1.0.0
 * Created: 2025-12-14
 *
 * HTTP client wrapper with:
 * - Automatic JWT token handling
 * - Error handling
 * - Request/response interceptors
 * - Timeout support
 */

import { config, getAuthToken, removeAuthToken } from '../config.js';

export class ApiClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || config.api.baseUrl;
        this.timeout = options.timeout || config.api.timeout;
        this.defaultHeaders = {
            'Content-Type': 'application/json',
            ...options.headers
        };
    }

    /**
     * Get full API URL
     * @param {string} endpoint - API endpoint path
     * @returns {string} Full URL
     */
    getUrl(endpoint) {
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        return `${this.baseUrl}/api/${config.api.version}${cleanEndpoint}`;
    }

    /**
     * Get request headers with JWT token
     * @param {Object} customHeaders - Additional headers
     * @returns {Object} Headers object
     */
    getHeaders(customHeaders = {}) {
        const headers = { ...this.defaultHeaders, ...customHeaders };

        const token = getAuthToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }

    /**
     * Handle API response
     * @param {Response} response - Fetch response
     * @returns {Promise<Object>} Parsed response data
     */
    async handleResponse(response) {
        // Handle 401 Unauthorized - token expired or invalid
        if (response.status === 401) {
            removeAuthToken();
            window.dispatchEvent(new CustomEvent('unauthorized'));
            throw new Error('Unauthorized - please login again');
        }

        // Parse response body
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        // Handle error responses
        if (!response.ok) {
            const error = new Error(data.error || data.message || `HTTP ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }

    /**
     * Make HTTP request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} Response data
     */
    async request(endpoint, options = {}) {
        const url = this.getUrl(endpoint);
        const headers = this.getHeaders(options.headers);

        const config = {
            ...options,
            headers,
            signal: options.signal || AbortSignal.timeout(this.timeout)
        };

        try {
            const response = await fetch(url, config);
            return await this.handleResponse(response);
        } catch (error) {
            // Handle timeout
            if (error.name === 'AbortError' || error.name === 'TimeoutError') {
                throw new Error('Request timeout - please try again');
            }

            // Handle network errors
            if (error.message === 'Failed to fetch') {
                throw new Error('Network error - please check your connection');
            }

            // Re-throw other errors
            throw error;
        }
    }

    /**
     * GET request
     * @param {string} endpoint - API endpoint
     * @param {Object} params - Query parameters
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Response data
     */
    async get(endpoint, params = {}, options = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;

        return this.request(url, {
            ...options,
            method: 'GET'
        });
    }

    /**
     * POST request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Response data
     */
    async post(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * PUT request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Response data
     */
    async put(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    /**
     * DELETE request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Response data
     */
    async delete(endpoint, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'DELETE'
        });
    }

    /**
     * PATCH request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Response data
     */
    async patch(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }
}

// Export singleton instance
export const apiClient = new ApiClient();
