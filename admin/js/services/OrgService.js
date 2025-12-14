/**
 * Organization Management Service
 * Version: 1.0.0
 * Created: 2025-12-14
 *
 * Handles organization operations:
 * - List organizations (superadmin only)
 * - Create/Update/Delete organizations
 * - Manage organization settings
 * - View organization statistics
 */

import { apiClient } from './ApiClient.js';

export class OrgService {
    /**
     * Get paginated list of organizations
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Organizations list with pagination
     */
    async getOrganizations(options = {}) {
        const {
            page = 1,
            limit = 20,
            sort = 'created_at',
            order = 'desc',
            search = '',
            plan = '',
            is_active = ''
        } = options;

        const params = {
            page,
            limit,
            sort,
            order
        };

        if (search) params.search = search;
        if (plan) params.plan = plan;
        if (is_active !== '') params.is_active = is_active;

        const response = await apiClient.get('/organizations', params);

        if (response.success) {
            return response.data;
        }

        throw new Error(response.error || 'Failed to fetch organizations');
    }

    /**
     * Get organization by ID
     * @param {string} orgId - Organization ID
     * @returns {Promise<Object>} Organization data
     */
    async getOrganization(orgId) {
        const response = await apiClient.get(`/organizations/${orgId}`);

        if (response.success && response.data.organization) {
            return response.data.organization;
        }

        throw new Error(response.error || 'Failed to fetch organization');
    }

    /**
     * Create new organization
     * @param {Object} orgData - Organization data
     * @returns {Promise<Object>} Created organization
     */
    async createOrganization(orgData) {
        const response = await apiClient.post('/organizations', orgData);

        if (response.success && response.data.organization) {
            return response.data.organization;
        }

        throw new Error(response.error || 'Failed to create organization');
    }

    /**
     * Update organization
     * @param {string} orgId - Organization ID
     * @param {Object} orgData - Updated organization data
     * @returns {Promise<Object>} Updated organization
     */
    async updateOrganization(orgId, orgData) {
        const response = await apiClient.put(`/organizations/${orgId}`, orgData);

        if (response.success && response.data.organization) {
            return response.data.organization;
        }

        throw new Error(response.error || 'Failed to update organization');
    }

    /**
     * Delete organization (soft delete)
     * @param {string} orgId - Organization ID
     * @returns {Promise<void>}
     */
    async deleteOrganization(orgId) {
        const response = await apiClient.delete(`/organizations/${orgId}`);

        if (response.success) {
            return;
        }

        throw new Error(response.error || 'Failed to delete organization');
    }

    /**
     * Get organization statistics
     * @param {string} orgId - Organization ID
     * @returns {Promise<Object>} Organization statistics
     */
    async getStatistics(orgId) {
        const response = await apiClient.get(`/organizations/${orgId}/stats`);

        if (response.success && response.data.stats) {
            return response.data.stats;
        }

        throw new Error(response.error || 'Failed to fetch statistics');
    }

    /**
     * Validate organization data
     * @param {Object} orgData - Organization data to validate
     * @returns {Array} Array of validation errors
     */
    validateOrgData(orgData) {
        const errors = [];

        // Name validation
        if (!orgData.name) {
            errors.push({ field: 'name', message: 'Organization name is required' });
        } else if (orgData.name.length < 2) {
            errors.push({ field: 'name', message: 'Name must be at least 2 characters' });
        } else if (orgData.name.length > 100) {
            errors.push({ field: 'name', message: 'Name too long (max 100 characters)' });
        }

        // Plan validation
        if (orgData.plan && !['free', 'basic', 'pro', 'enterprise'].includes(orgData.plan)) {
            errors.push({ field: 'plan', message: 'Invalid plan type' });
        }

        // Limits validation
        if (orgData.max_users !== undefined) {
            const max = parseInt(orgData.max_users, 10);
            if (isNaN(max) || max < 1) {
                errors.push({ field: 'max_users', message: 'Max users must be at least 1' });
            }
        }

        if (orgData.max_estimates !== undefined) {
            const max = parseInt(orgData.max_estimates, 10);
            if (isNaN(max) || max < 1) {
                errors.push({ field: 'max_estimates', message: 'Max estimates must be at least 1' });
            }
        }

        if (orgData.max_catalogs !== undefined) {
            const max = parseInt(orgData.max_catalogs, 10);
            if (isNaN(max) || max < 1) {
                errors.push({ field: 'max_catalogs', message: 'Max catalogs must be at least 1' });
            }
        }

        if (orgData.storage_limit_mb !== undefined) {
            const limit = parseInt(orgData.storage_limit_mb, 10);
            if (isNaN(limit) || limit < 1) {
                errors.push({ field: 'storage_limit_mb', message: 'Storage limit must be at least 1 MB' });
            }
        }

        return errors;
    }
}

// Export singleton instance
export const orgService = new OrgService();
