/**
 * User Table Component
 * Version: 1.0.0
 * Created: 2025-12-14
 *
 * Displays paginated user list with:
 * - Sorting
 * - Filtering
 * - Search
 * - Actions (edit, delete, reset password)
 */

import { BaseComponent } from './BaseComponent.js';
import { userService } from '../services/UserService.js';
import { canEditUser, canDeleteUser, canResetPassword } from '../utils/permissions.js';

export class UserTable extends BaseComponent {
    constructor(container, props = {}, store = null) {
        super(container, props, store);

        this.state = {
            users: [],
            pagination: {
                page: 1,
                limit: 20,
                total: 0,
                totalPages: 0
            },
            sort: 'created_at',
            order: 'desc',
            search: '',
            filters: {
                role: '',
                is_active: '',
                email_verified: ''
            },
            loading: false,
            error: null
        };

        this.currentUser = store?.get('user') || {};
    }

    async mounted() {
        await this.loadUsers();
    }

    /**
     * Load users from API
     */
    async loadUsers() {
        this.state.loading = true;
        this.showLoading('Loading users...');

        try {
            const data = await userService.getUsers({
                page: this.state.pagination.page,
                limit: this.state.pagination.limit,
                sort: this.state.sort,
                order: this.state.order,
                search: this.state.search,
                ...this.state.filters
            });

            this.state.users = data.users;
            this.state.pagination = data.pagination;
            this.state.loading = false;
            this.state.error = null;

            this.update();

        } catch (error) {
            console.error('[UserTable] Load users error:', error);
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
            return this.showLoading('Loading users...');
        }

        if (this.state.error) {
            return `
                <div class="error-state">
                    <p>${this.escapeHtml(this.state.error)}</p>
                    <button class="btn btn-primary retry-btn">Retry</button>
                </div>
            `;
        }

        if (this.state.users.length === 0) {
            return `
                <div class="empty-state">
                    <p>No users found</p>
                    <button class="btn btn-primary create-user-btn">Create User</button>
                </div>
            `;
        }

        return `
            <!-- Toolbar -->
            <div class="table-toolbar">
                <div class="toolbar-left">
                    <input
                        type="search"
                        class="form-input search-input"
                        placeholder="Search users..."
                        value="${this.escapeHtml(this.state.search)}"
                    />
                </div>
                <div class="toolbar-right">
                    <select class="form-select filter-role">
                        <option value="">All Roles</option>
                        <option value="admin" ${this.state.filters.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="user" ${this.state.filters.role === 'user' ? 'selected' : ''}>User</option>
                    </select>
                    <select class="form-select filter-status">
                        <option value="">All Status</option>
                        <option value="1" ${this.state.filters.is_active === '1' ? 'selected' : ''}>Active</option>
                        <option value="0" ${this.state.filters.is_active === '0' ? 'selected' : ''}>Inactive</option>
                    </select>
                    <button class="btn btn-primary create-user-btn">Create User</button>
                </div>
            </div>

            <!-- Table -->
            <div class="card mt-md">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="sortable" data-field="email">
                                Email ${this.renderSortIcon('email')}
                            </th>
                            <th class="sortable" data-field="username">
                                Username ${this.renderSortIcon('username')}
                            </th>
                            <th class="sortable" data-field="full_name">
                                Full Name ${this.renderSortIcon('full_name')}
                            </th>
                            <th>Role</th>
                            <th>Status</th>
                            <th class="sortable" data-field="created_at">
                                Created ${this.renderSortIcon('created_at')}
                            </th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.state.users.map(user => this.renderUserRow(user)).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Pagination -->
            ${this.renderPagination()}
        `;
    }

    /**
     * Render user table row
     */
    renderUserRow(user) {
        const canEdit = canEditUser(this.currentUser, user);
        const canDelete = canDeleteUser(this.currentUser, user);
        const canReset = canResetPassword(this.currentUser, user);

        return `
            <tr data-user-id="${user.id}">
                <td>${this.escapeHtml(user.email)}</td>
                <td>${this.escapeHtml(user.username)}</td>
                <td>${this.escapeHtml(user.full_name || 'N/A')}</td>
                <td><span class="badge badge-primary">${user.role}</span></td>
                <td>
                    ${user.is_active
                        ? '<span class="badge badge-success">Active</span>'
                        : '<span class="badge badge-danger">Inactive</span>'
                    }
                </td>
                <td>${this.formatDate(user.created_at)}</td>
                <td class="actions">
                    ${canEdit ? `<button class="btn btn-sm btn-secondary edit-btn" data-user-id="${user.id}">Edit</button>` : ''}
                    ${canReset ? `<button class="btn btn-sm btn-secondary reset-btn" data-user-id="${user.id}">Reset Password</button>` : ''}
                    ${canDelete ? `<button class="btn btn-sm btn-danger delete-btn" data-user-id="${user.id}">Delete</button>` : ''}
                </td>
            </tr>
        `;
    }

    /**
     * Render sort icon
     */
    renderSortIcon(field) {
        if (this.state.sort !== field) {
            return '↕';
        }
        return this.state.order === 'asc' ? '↑' : '↓';
    }

    /**
     * Render pagination
     */
    renderPagination() {
        const { page, totalPages, total } = this.state.pagination;

        if (totalPages <= 1) return '';

        const prevDisabled = page === 1;
        const nextDisabled = page === totalPages;

        return `
            <div class="pagination mt-md">
                <div class="pagination-info">
                    Showing page ${page} of ${totalPages} (${total} total users)
                </div>
                <div class="pagination-controls">
                    <button class="btn btn-sm btn-secondary prev-page" ${prevDisabled ? 'disabled' : ''}>
                        Previous
                    </button>
                    <span class="pagination-current">Page ${page}</span>
                    <button class="btn btn-sm btn-secondary next-page" ${nextDisabled ? 'disabled' : ''}>
                        Next
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Search input
        const searchInput = this.$('.search-input');
        if (searchInput) {
            this.addEventListener(searchInput, 'input', this.debounce((e) => {
                this.state.search = e.target.value;
                this.state.pagination.page = 1;
                this.loadUsers();
            }, 300));
        }

        // Filter selects
        const roleFilter = this.$('.filter-role');
        if (roleFilter) {
            this.addEventListener(roleFilter, 'change', (e) => {
                this.state.filters.role = e.target.value;
                this.state.pagination.page = 1;
                this.loadUsers();
            });
        }

        const statusFilter = this.$('.filter-status');
        if (statusFilter) {
            this.addEventListener(statusFilter, 'change', (e) => {
                this.state.filters.is_active = e.target.value;
                this.state.pagination.page = 1;
                this.loadUsers();
            });
        }

        // Sort headers
        const sortHeaders = this.$$('.sortable');
        sortHeaders.forEach(header => {
            this.addEventListener(header, 'click', () => {
                const field = header.dataset.field;

                if (this.state.sort === field) {
                    this.state.order = this.state.order === 'asc' ? 'desc' : 'asc';
                } else {
                    this.state.sort = field;
                    this.state.order = 'asc';
                }

                this.loadUsers();
            });
        });

        // Pagination
        const prevBtn = this.$('.prev-page');
        const nextBtn = this.$('.next-page');

        if (prevBtn) {
            this.addEventListener(prevBtn, 'click', () => {
                if (this.state.pagination.page > 1) {
                    this.state.pagination.page--;
                    this.loadUsers();
                }
            });
        }

        if (nextBtn) {
            this.addEventListener(nextBtn, 'click', () => {
                if (this.state.pagination.page < this.state.pagination.totalPages) {
                    this.state.pagination.page++;
                    this.loadUsers();
                }
            });
        }

        // Action buttons
        const editBtns = this.$$('.edit-btn');
        editBtns.forEach(btn => {
            this.addEventListener(btn, 'click', () => {
                const userId = btn.dataset.userId;
                this.handleEdit(userId);
            });
        });

        const deleteBtns = this.$$('.delete-btn');
        deleteBtns.forEach(btn => {
            this.addEventListener(btn, 'click', () => {
                const userId = btn.dataset.userId;
                this.handleDelete(userId);
            });
        });

        const resetBtns = this.$$('.reset-btn');
        resetBtns.forEach(btn => {
            this.addEventListener(btn, 'click', () => {
                const userId = btn.dataset.userId;
                this.handleResetPassword(userId);
            });
        });

        // Create user button
        const createBtns = this.$$('.create-user-btn');
        createBtns.forEach(btn => {
            this.addEventListener(btn, 'click', () => {
                this.handleCreate();
            });
        });

        // Retry button
        const retryBtn = this.$('.retry-btn');
        if (retryBtn) {
            this.addEventListener(retryBtn, 'click', () => {
                this.loadUsers();
            });
        }
    }

    /**
     * Handle create user
     */
    handleCreate() {
        if (this.props.onCreateUser) {
            this.props.onCreateUser();
        }
    }

    /**
     * Handle edit user
     */
    handleEdit(userId) {
        if (this.props.onEditUser) {
            this.props.onEditUser(userId);
        }
    }

    /**
     * Handle delete user
     */
    async handleDelete(userId) {
        const user = this.state.users.find(u => u.id === userId);
        if (!user) return;

        const confirmed = confirm(`Are you sure you want to delete user "${user.email}"?`);
        if (!confirmed) return;

        try {
            await userService.deleteUser(userId);
            this.showNotification(`User "${user.email}" deleted successfully`, 'success');
            this.loadUsers();
        } catch (error) {
            this.showNotification(`Failed to delete user: ${error.message}`, 'error');
        }
    }

    /**
     * Handle reset password
     */
    async handleResetPassword(userId) {
        const user = this.state.users.find(u => u.id === userId);
        if (!user) return;

        const newPassword = prompt(`Enter new password for "${user.email}":`);
        if (!newPassword) return;

        if (newPassword.length < 8) {
            this.showNotification('Password must be at least 8 characters', 'error');
            return;
        }

        try {
            await userService.resetPassword(userId, newPassword);
            this.showNotification(`Password reset successfully for "${user.email}"`, 'success');
        } catch (error) {
            this.showNotification(`Failed to reset password: ${error.message}`, 'error');
        }
    }

    /**
     * Debounce helper
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Refresh table data
     */
    async refresh() {
        await this.loadUsers();
    }
}
