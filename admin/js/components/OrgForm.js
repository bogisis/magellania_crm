/**
 * Organization Form Component
 * Version: 1.0.0
 * Created: 2025-12-14
 *
 * Form for creating/editing organizations (superadmin only) with:
 * - Field validation
 * - Error display
 * - Create/Update modes
 * - Plan selection
 * - Resource limits configuration
 */

import { BaseComponent } from './BaseComponent.js';
import { orgService } from '../services/OrgService.js';
import { validateForm, displayFormErrors, clearFormErrors } from '../utils/validators.js';
import { isSuperadmin } from '../utils/permissions.js';

export class OrgForm extends BaseComponent {
    constructor(container, props = {}, store = null) {
        super(container, props, store);

        this.state = {
            mode: props.orgId ? 'edit' : 'create',
            orgId: props.orgId || null,
            organization: null,
            loading: false,
            saving: false,
            error: null
        };

        this.currentUser = store?.get('user') || {};

        // Plan quotas
        this.planQuotas = {
            free: { users: 5, estimates: 10, catalogs: 5, storage: 100 },
            basic: { users: 20, estimates: 100, catalogs: 20, storage: 1000 },
            pro: { users: 100, estimates: 1000, catalogs: 100, storage: 10000 },
            enterprise: { users: 9999, estimates: 9999, catalogs: 9999, storage: 100000 }
        };

        // Check permission
        if (!isSuperadmin(this.currentUser)) {
            this.state.error = 'Access denied - Superadmin only';
        }
    }

    async mounted() {
        if (this.state.mode === 'edit' && !this.state.error) {
            await this.loadOrganization();
        }
    }

    /**
     * Load organization data (for edit mode)
     */
    async loadOrganization() {
        this.state.loading = true;
        this.showLoading('Loading organization...');

        try {
            const org = await orgService.getOrganization(this.state.orgId);
            this.state.organization = org;
            this.state.loading = false;
            this.state.error = null;
            this.update();

        } catch (error) {
            console.error('[OrgForm] Load organization error:', error);
            this.state.loading = false;
            this.state.error = error.message;
            this.renderError(error);
        }
    }

    /**
     * Render component HTML
     */
    render() {
        if (this.state.error && this.state.error.includes('Access denied')) {
            return `
                <div class="error-state">
                    <h3>Access Denied</h3>
                    <p>Only superadmin can manage organizations</p>
                </div>
            `;
        }

        if (this.state.loading) {
            return '';
        }

        const org = this.state.organization || {};
        const isCreate = this.state.mode === 'create';

        // Default values for create mode
        const defaults = {
            plan: 'free',
            max_users: 5,
            max_estimates: 100,
            max_catalogs: 10,
            storage_limit_mb: 100,
            api_rate_limit: 1000
        };

        return `
            <div class="org-form">
                <div class="form-header">
                    <h3>${isCreate ? 'Create New Organization' : 'Edit Organization'}</h3>
                    <button class="btn btn-secondary btn-sm close-btn">Close</button>
                </div>

                <form class="form" id="orgForm">
                    <!-- Name -->
                    <div class="form-group">
                        <label class="form-label" for="name">
                            Organization Name <span class="required">*</span>
                        </label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            class="form-input"
                            value="${this.escapeHtml(org.name || '')}"
                            required
                            maxlength="100"
                        />
                    </div>

                    <!-- Plan -->
                    <div class="form-group">
                        <label class="form-label" for="plan">
                            Plan <span class="required">*</span>
                        </label>
                        <select
                            id="plan"
                            name="plan"
                            class="form-select"
                            required
                        >
                            <option value="free" ${(org.plan || defaults.plan) === 'free' ? 'selected' : ''}>Free</option>
                            <option value="basic" ${org.plan === 'basic' ? 'selected' : ''}>Basic</option>
                            <option value="pro" ${org.plan === 'pro' ? 'selected' : ''}>Pro</option>
                            <option value="enterprise" ${org.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
                        </select>
                    </div>

                    <h4 class="mt-lg">Resource Limits</h4>

                    <!-- Max Users -->
                    <div class="form-group">
                        <label class="form-label" for="max_users">
                            Max Users <span class="required">*</span>
                        </label>
                        <input
                            type="number"
                            id="max_users"
                            name="max_users"
                            class="form-input"
                            value="${org.max_users || defaults.max_users}"
                            required
                            min="1"
                        />
                    </div>

                    <!-- Max Estimates -->
                    <div class="form-group">
                        <label class="form-label" for="max_estimates">
                            Max Estimates <span class="required">*</span>
                        </label>
                        <input
                            type="number"
                            id="max_estimates"
                            name="max_estimates"
                            class="form-input"
                            value="${org.max_estimates || defaults.max_estimates}"
                            required
                            min="1"
                        />
                    </div>

                    <!-- Max Catalogs -->
                    <div class="form-group">
                        <label class="form-label" for="max_catalogs">
                            Max Catalogs <span class="required">*</span>
                        </label>
                        <input
                            type="number"
                            id="max_catalogs"
                            name="max_catalogs"
                            class="form-input"
                            value="${org.max_catalogs || defaults.max_catalogs}"
                            required
                            min="1"
                        />
                    </div>

                    <!-- Storage Limit -->
                    <div class="form-group">
                        <label class="form-label" for="storage_limit_mb">
                            Storage Limit (MB) <span class="required">*</span>
                        </label>
                        <input
                            type="number"
                            id="storage_limit_mb"
                            name="storage_limit_mb"
                            class="form-input"
                            value="${org.storage_limit_mb || defaults.storage_limit_mb}"
                            required
                            min="1"
                        />
                    </div>

                    <!-- API Rate Limit -->
                    <div class="form-group">
                        <label class="form-label" for="api_rate_limit">
                            API Rate Limit (requests/hour) <span class="required">*</span>
                        </label>
                        <input
                            type="number"
                            id="api_rate_limit"
                            name="api_rate_limit"
                            class="form-input"
                            value="${org.api_rate_limit || defaults.api_rate_limit}"
                            required
                            min="100"
                        />
                    </div>

                    <!-- Active Status -->
                    <div class="form-group">
                        <label class="form-label">
                            <input
                                type="checkbox"
                                name="is_active"
                                ${(isCreate || org.is_active) ? 'checked' : ''}
                            />
                            Active
                        </label>
                    </div>

                    ${!isCreate ? `
                        <div class="card mt-md">
                            <div class="card-body">
                                <h4>Current Usage</h4>
                                <dl style="display: grid; grid-template-columns: 150px 1fr; gap: 0.5rem;">
                                    <dt>Users:</dt>
                                    <dd>${org.current_users_count || 0} / ${org.max_users}</dd>

                                    <dt>Estimates:</dt>
                                    <dd>${org.current_estimates_count || 0} / ${org.max_estimates}</dd>

                                    <dt>Catalogs:</dt>
                                    <dd>${org.current_catalogs_count || 0} / ${org.max_catalogs}</dd>

                                    <dt>Storage:</dt>
                                    <dd>${org.current_storage_mb || 0} / ${org.storage_limit_mb} MB</dd>
                                </dl>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Actions -->
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary" ${this.state.saving ? 'disabled' : ''}>
                            ${this.state.saving ? 'Saving...' : (isCreate ? 'Create Organization' : 'Update Organization')}
                        </button>
                        <button type="button" class="btn btn-secondary cancel-btn">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        `;
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        const form = this.$('#orgForm');
        if (form) {
            this.addEventListener(form, 'submit', (e) => {
                e.preventDefault();
                this.handleSubmit(e);
            });
        }

        // Plan change - auto-fill quotas
        const planSelect = this.$('#plan');
        if (planSelect) {
            this.addEventListener(planSelect, 'change', (e) => {
                this.fillPlanQuotas(e.target.value);
            });
        }

        // Name change - auto-generate slug
        const nameInput = this.$('#name');
        const slugInput = this.$('#slug');
        if (nameInput && slugInput && this.state.mode === 'create') {
            this.addEventListener(nameInput, 'input', (e) => {
                const slug = this.generateSlug(e.target.value);
                slugInput.value = slug;
            });
        }

        const closeBtn = this.$('.close-btn');
        if (closeBtn) {
            this.addEventListener(closeBtn, 'click', () => {
                this.handleClose();
            });
        }

        const cancelBtn = this.$('.cancel-btn');
        if (cancelBtn) {
            this.addEventListener(cancelBtn, 'click', () => {
                this.handleClose();
            });
        }
    }

    /**
     * Fill quotas based on selected plan
     */
    fillPlanQuotas(plan) {
        const quotas = this.planQuotas[plan];
        if (!quotas) return;

        const maxUsersInput = this.$('#max_users');
        const maxEstimatesInput = this.$('#max_estimates');
        const maxCatalogsInput = this.$('#max_catalogs');
        const storageInput = this.$('#storage_limit_mb');

        if (maxUsersInput) maxUsersInput.value = quotas.users;
        if (maxEstimatesInput) maxEstimatesInput.value = quotas.estimates;
        if (maxCatalogsInput) maxCatalogsInput.value = quotas.catalogs;
        if (storageInput) storageInput.value = quotas.storage;
    }

    /**
     * Generate URL-friendly slug from name
     */
    generateSlug(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    /**
     * Handle form submit
     */
    async handleSubmit(e) {
        const form = e.target;
        const formData = new FormData(form);

        // Clear previous errors
        clearFormErrors(form);

        // Collect form data
        const data = {
            name: formData.get('name'),
            plan: formData.get('plan'),
            max_users: parseInt(formData.get('max_users'), 10),
            max_estimates: parseInt(formData.get('max_estimates'), 10),
            max_catalogs: parseInt(formData.get('max_catalogs'), 10),
            storage_limit_mb: parseInt(formData.get('storage_limit_mb'), 10),
            api_rate_limit: parseInt(formData.get('api_rate_limit'), 10),
            is_active: formData.has('is_active') ? 1 : 0
        };

        // Add slug for create mode
        if (this.state.mode === 'create') {
            data.slug = formData.get('slug') || this.generateSlug(data.name);
        }

        // Validate
        const validation = this.validateOrgData(data);
        if (!validation.isValid) {
            displayFormErrors(form, validation.fieldErrors);
            return;
        }

        // Save
        this.state.saving = true;
        this.update();

        try {
            let org;

            if (this.state.mode === 'create') {
                org = await orgService.createOrganization(data);
                this.showNotification(`Organization "${org.name}" created successfully`, 'success');
            } else {
                org = await orgService.updateOrganization(this.state.orgId, data);
                this.showNotification(`Organization "${org.name}" updated successfully`, 'success');
            }

            this.state.saving = false;

            // Callback
            if (this.props.onSaved) {
                this.props.onSaved(org);
            }

        } catch (error) {
            console.error('[OrgForm] Save error:', error);
            this.state.saving = false;
            this.showNotification(`Failed to save organization: ${error.message}`, 'error');
            this.update();
        }
    }

    /**
     * Validate organization data
     */
    validateOrgData(data) {
        const rules = {
            name: [
                { type: 'required', label: 'Organization name' },
                { type: 'length', min: 2, max: 100, label: 'Organization name' }
            ],
            plan: [
                { type: 'required', label: 'Plan' }
            ],
            max_users: [
                { type: 'required', label: 'Max users' },
                { type: 'range', min: 1, max: 10000, label: 'Max users' }
            ],
            max_estimates: [
                { type: 'required', label: 'Max estimates' },
                { type: 'range', min: 1, max: 100000, label: 'Max estimates' }
            ],
            max_catalogs: [
                { type: 'required', label: 'Max catalogs' },
                { type: 'range', min: 1, max: 1000, label: 'Max catalogs' }
            ],
            storage_limit_mb: [
                { type: 'required', label: 'Storage limit' },
                { type: 'range', min: 1, max: 100000, label: 'Storage limit' }
            ],
            api_rate_limit: [
                { type: 'required', label: 'API rate limit' },
                { type: 'range', min: 100, max: 1000000, label: 'API rate limit' }
            ]
        };

        return validateForm(data, rules);
    }

    /**
     * Handle close
     */
    handleClose() {
        if (this.props.onClose) {
            this.props.onClose();
        }
    }
}
