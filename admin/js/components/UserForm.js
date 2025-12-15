/**
 * User Form Component
 * Version: 1.0.0
 * Created: 2025-12-14
 *
 * Form for creating/editing users with:
 * - Field validation
 * - Error display
 * - Create/Update modes
 * - Role selection
 */

import { BaseComponent } from './BaseComponent.js';
import { userService } from '../services/UserService.js';
import { orgService } from '../services/OrgService.js';
import { validateForm, displayFormErrors, clearFormErrors } from '../utils/validators.js';
import { isSuperadmin } from '../utils/permissions.js';

export class UserForm extends BaseComponent {
    constructor(container, props = {}, store = null) {
        super(container, props, store);

        this.state = {
            mode: props.userId ? 'edit' : 'create',
            userId: props.userId || null,
            user: null,
            organizations: [],
            loading: false,
            saving: false,
            error: null
        };

        this.currentUser = store?.get('user') || {};
    }

    async mounted() {
        // Load organizations if superadmin
        if (isSuperadmin(this.currentUser)) {
            await this.loadOrganizations();
        }

        if (this.state.mode === 'edit') {
            await this.loadUser();
        }
    }

    /**
     * Load organizations list (for superadmin)
     */
    async loadOrganizations() {
        try {
            const data = await orgService.getOrganizations({ limit: 100 });
            this.state.organizations = data.organizations || [];
        } catch (error) {
            console.error('[UserForm] Load organizations error:', error);
            // Don't block form if org load fails
        }
    }

    /**
     * Load user data (for edit mode)
     */
    async loadUser() {
        this.state.loading = true;
        this.showLoading('Loading user...');

        try {
            const user = await userService.getUser(this.state.userId);
            this.state.user = user;
            this.state.loading = false;
            this.state.error = null;
            this.update();

        } catch (error) {
            console.error('[UserForm] Load user error:', error);
            this.state.loading = false;
            this.state.error = error.message;
            this.renderError(error);
        }
    }

    /**
     * Render component HTML
     */
    render() {
        if (this.state.loading) {
            return '';
        }

        const user = this.state.user || {};
        const isCreate = this.state.mode === 'create';
        const canChangeRole = isSuperadmin(this.currentUser);

        return `
            <div class="user-form">
                <div class="form-header">
                    <h3>${isCreate ? 'Create New User' : 'Edit User'}</h3>
                    <button class="btn btn-secondary btn-sm close-btn">Close</button>
                </div>

                <form class="form" id="userForm">
                    <!-- Email -->
                    <div class="form-group">
                        <label class="form-label" for="email">
                            Email <span class="required">*</span>
                        </label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            class="form-input"
                            value="${this.escapeHtml(user.email || '')}"
                            required
                            ${!isCreate ? 'readonly' : ''}
                        />
                    </div>

                    <!-- Username -->
                    <div class="form-group">
                        <label class="form-label" for="username">
                            Username
                        </label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            class="form-input"
                            value="${this.escapeHtml(user.username || '')}"
                            maxlength="50"
                        />
                    </div>

                    <!-- Full Name -->
                    <div class="form-group">
                        <label class="form-label" for="full_name">
                            Full Name
                        </label>
                        <input
                            type="text"
                            id="full_name"
                            name="full_name"
                            class="form-input"
                            value="${this.escapeHtml(user.full_name || '')}"
                            maxlength="100"
                        />
                    </div>

                    <!-- Organization (for superadmin or display for others) -->
                    ${isSuperadmin(this.currentUser) ? `
                        <div class="form-group">
                            <label class="form-label" for="organization_id">
                                Organization <span class="required">*</span>
                            </label>
                            <select
                                id="organization_id"
                                name="organization_id"
                                class="form-select"
                                required
                            >
                                <option value="">Select Organization</option>
                                ${this.state.organizations.map(org => `
                                    <option value="${org.id}" ${user.organization_id === org.id ? 'selected' : ''}>
                                        ${this.escapeHtml(org.name)}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    ` : `
                        <input type="hidden" name="organization_id" value="${this.currentUser.organization_id}" />
                    `}

                    <!-- Password (only for create) -->
                    ${isCreate ? `
                        <div class="form-group">
                            <label class="form-label" for="password">
                                Password <span class="required">*</span>
                            </label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                class="form-input"
                                required
                                minlength="8"
                            />
                            <small class="form-help">Minimum 8 characters</small>
                        </div>
                    ` : ''}

                    <!-- Role -->
                    <div class="form-group">
                        <label class="form-label" for="role">
                            Role ${canChangeRole ? '<span class="required">*</span>' : ''}
                        </label>
                        <select
                            id="role"
                            name="role"
                            class="form-select"
                            required
                            ${!canChangeRole ? 'disabled' : ''}
                        >
                            <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                        ${!canChangeRole ? '<small class="form-help">Only superadmin can change roles</small>' : ''}
                    </div>

                    <!-- Active Status -->
                    <div class="form-group">
                        <label class="form-label">
                            <input
                                type="checkbox"
                                name="is_active"
                                ${(isCreate || user.is_active) ? 'checked' : ''}
                            />
                            Active
                        </label>
                    </div>

                    <!-- Email Verified -->
                    ${!isCreate ? `
                        <div class="form-group">
                            <label class="form-label">
                                <input
                                    type="checkbox"
                                    name="email_verified"
                                    ${user.email_verified ? 'checked' : ''}
                                />
                                Email Verified
                            </label>
                        </div>
                    ` : ''}

                    <!-- Actions -->
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary" ${this.state.saving ? 'disabled' : ''}>
                            ${this.state.saving ? 'Saving...' : (isCreate ? 'Create User' : 'Update User')}
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
        const form = this.$('#userForm');
        if (form) {
            this.addEventListener(form, 'submit', (e) => {
                e.preventDefault();
                this.handleSubmit(e);
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
     * Handle form submit
     */
    async handleSubmit(e) {
        const form = e.target;
        const formData = new FormData(form);

        // Clear previous errors
        clearFormErrors(form);

        // Collect form data
        const data = {
            email: formData.get('email'),
            username: formData.get('username') || null,
            full_name: formData.get('full_name') || null,
            organization_id: formData.get('organization_id') || this.currentUser.organization_id,
            role: formData.get('role') || 'user', // Default to 'user' if disabled field
            is_active: formData.has('is_active') ? 1 : 0,
            email_verified: formData.has('email_verified') ? 1 : 0
        };

        // Add password for create mode
        if (this.state.mode === 'create') {
            data.password = formData.get('password');
        }

        // Validate
        const validation = this.validateUserData(data);
        if (!validation.isValid) {
            displayFormErrors(form, validation.fieldErrors);
            return;
        }

        // Save
        this.state.saving = true;
        this.update();

        try {
            let user;

            if (this.state.mode === 'create') {
                user = await userService.createUser(data);
                this.showNotification(`User "${user.email}" created successfully`, 'success');
            } else {
                user = await userService.updateUser(this.state.userId, data);
                this.showNotification(`User "${user.email}" updated successfully`, 'success');
            }

            this.state.saving = false;

            // Callback
            if (this.props.onSaved) {
                this.props.onSaved(user);
            }

        } catch (error) {
            console.error('[UserForm] Save error:', error);
            this.state.saving = false;
            this.showNotification(`Failed to save user: ${error.message}`, 'error');
            this.update();
        }
    }

    /**
     * Validate user data
     */
    validateUserData(data) {
        const rules = {
            email: [
                { type: 'required', label: 'Email' },
                { type: 'email', message: 'Invalid email format' }
            ],
            organization_id: [
                { type: 'required', label: 'Organization' }
            ],
            role: [
                { type: 'required', label: 'Role' }
            ]
        };

        // Add password validation for create mode
        if (this.state.mode === 'create') {
            rules.password = [
                { type: 'required', label: 'Password' },
                { type: 'password' }
            ];
        }

        // Add username validation if provided
        if (data.username) {
            rules.username = [
                { type: 'length', min: 1, max: 50, label: 'Username' }
            ];
        }

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
