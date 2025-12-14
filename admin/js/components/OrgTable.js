/**
 * Organization Table Component
 * Version: 1.0.0
 * Created: 2025-12-14
 *
 * Displays paginated organization list (superadmin only) with:
 * - Sorting
 * - Filtering
 * - Search
 * - Actions (edit, delete, view stats)
 */

import { BaseComponent } from './BaseComponent.js';
import { orgService } from '../services/OrgService.js';
import { isSuperadmin } from '../utils/permissions.js';

export class OrgTable extends BaseComponent {
    constructor(container, props = {}, store = null) {
        super(container, props, store);

        this.state = {
            organizations: [],
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
                plan: '',
                is_active: ''
            },
            loading: false,
            error: null
        };

        this.currentUser = store?.get('user') || {};

        // Check permission
        if (!isSuperadmin(this.currentUser)) {
            this.state.error = 'Access denied - Superadmin only';
        }
    }

    async mounted() {
        if (!this.state.error) {
            await this.loadOrganizations();
        }
    }

    /**
     * Load organizations from API
     */
    async loadOrganizations() {
        this.state.loading = true;
        this.showLoading('Loading organizations...');

        try {
            const data = await orgService.getOrganizations({
                page: this.state.pagination.page,
                limit: this.state.pagination.limit,
                sort: this.state.sort,
                order: this.state.order,
                search: this.state.search,
                ...this.state.filters
            });

            this.state.organizations = data.organizations;
            this.state.pagination = data.pagination;
            this.state.loading = false;
            this.state.error = null;

            this.update();

        } catch (error) {
            console.error('[OrgTable] Load organizations error:', error);
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
            return this.showLoading('Loading organizations...');
        }

        if (this.state.error) {
            return `
                <div class="error-state">
                    <p>${this.escapeHtml(this.state.error)}</p>
                    <button class="btn btn-primary retry-btn">Retry</button>
                </div>
            `;
        }

        if (this.state.organizations.length === 0) {
            return `
                <div class="empty-state">
                    <p>No organizations found</p>
                    <button class="btn btn-primary create-org-btn">Create Organization</button>
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
                        placeholder="Search organizations..."
                        value="${this.escapeHtml(this.state.search)}"
                    />
                </div>
                <div class="toolbar-right">
                    <select class="form-select filter-plan">
                        <option value="">All Plans</option>
                        <option value="free" ${this.state.filters.plan === 'free' ? 'selected' : ''}>Free</option>
                        <option value="basic" ${this.state.filters.plan === 'basic' ? 'selected' : ''}>Basic</option>
                        <option value="pro" ${this.state.filters.plan === 'pro' ? 'selected' : ''}>Pro</option>
                        <option value="enterprise" ${this.state.filters.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
                    </select>
                    <select class="form-select filter-status">
                        <option value="">All Status</option>
                        <option value="1" ${this.state.filters.is_active === '1' ? 'selected' : ''}>Active</option>
                        <option value="0" ${this.state.filters.is_active === '0' ? 'selected' : ''}>Inactive</option>
                    </select>
                    <button class="btn btn-primary create-org-btn">Create Organization</button>
                </div>
            </div>

            <!-- Table -->
            <div class="card mt-md">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="sortable" data-field="name">
                                Name ${this.renderSortIcon('name')}
                            </th>
                            <th>Plan</th>
                            <th>Users</th>
                            <th>Estimates</th>
                            <th>Catalogs</th>
                            <th>Storage</th>
                            <th>Status</th>
                            <th class="sortable" data-field="created_at">
                                Created ${this.renderSortIcon('created_at')}
                            </th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.state.organizations.map(org => this.renderOrgRow(org)).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Pagination -->
            ${this.renderPagination()}
        `;
    }

    /**
     * Render organization table row
     */
    renderOrgRow(org) {
        const userUsage = `${org.current_users_count || 0} / ${org.max_users}`;
        const estimateUsage = `${org.current_estimates_count || 0} / ${org.max_estimates}`;
        const catalogUsage = `${org.current_catalogs_count || 0} / ${org.max_catalogs}`;
        const storageUsage = `${org.current_storage_mb || 0} / ${org.storage_limit_mb} MB`;

        return `
            <tr data-org-id="${org.id}">
                <td>
                    <strong>${this.escapeHtml(org.name)}</strong><br>
                    <small class="text-muted">${this.escapeHtml(org.slug)}</small>
                </td>
                <td><span class="badge badge-primary">${org.plan}</span></td>
                <td>${userUsage}</td>
                <td>${estimateUsage}</td>
                <td>${catalogUsage}</td>
                <td>${storageUsage}</td>
                <td>
                    ${org.is_active
                        ? '<span class="badge badge-success">Active</span>'
                        : '<span class="badge badge-danger">Inactive</span>'
                    }
                </td>
                <td>${this.formatDate(org.created_at)}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-secondary edit-btn" data-org-id="${org.id}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-btn" data-org-id="${org.id}">Delete</button>
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
                    Showing page ${page} of ${totalPages} (${total} total organizations)
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
                this.loadOrganizations();
            }, 300));
        }

        // Filter selects
        const planFilter = this.$('.filter-plan');
        if (planFilter) {
            this.addEventListener(planFilter, 'change', (e) => {
                this.state.filters.plan = e.target.value;
                this.state.pagination.page = 1;
                this.loadOrganizations();
            });
        }

        const statusFilter = this.$('.filter-status');
        if (statusFilter) {
            this.addEventListener(statusFilter, 'change', (e) => {
                this.state.filters.is_active = e.target.value;
                this.state.pagination.page = 1;
                this.loadOrganizations();
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

                this.loadOrganizations();
            });
        });

        // Pagination
        const prevBtn = this.$('.prev-page');
        const nextBtn = this.$('.next-page');

        if (prevBtn) {
            this.addEventListener(prevBtn, 'click', () => {
                if (this.state.pagination.page > 1) {
                    this.state.pagination.page--;
                    this.loadOrganizations();
                }
            });
        }

        if (nextBtn) {
            this.addEventListener(nextBtn, 'click', () => {
                if (this.state.pagination.page < this.state.pagination.totalPages) {
                    this.state.pagination.page++;
                    this.loadOrganizations();
                }
            });
        }

        // Action buttons
        const editBtns = this.$$('.edit-btn');
        editBtns.forEach(btn => {
            this.addEventListener(btn, 'click', () => {
                const orgId = btn.dataset.orgId;
                this.handleEdit(orgId);
            });
        });

        const deleteBtns = this.$$('.delete-btn');
        deleteBtns.forEach(btn => {
            this.addEventListener(btn, 'click', () => {
                const orgId = btn.dataset.orgId;
                this.handleDelete(orgId);
            });
        });

        // Create org button
        const createBtns = this.$$('.create-org-btn');
        createBtns.forEach(btn => {
            this.addEventListener(btn, 'click', () => {
                this.handleCreate();
            });
        });

        // Retry button
        const retryBtn = this.$('.retry-btn');
        if (retryBtn) {
            this.addEventListener(retryBtn, 'click', () => {
                this.loadOrganizations();
            });
        }
    }

    /**
     * Handle create organization
     */
    handleCreate() {
        if (this.props.onCreateOrg) {
            this.props.onCreateOrg();
        }
    }

    /**
     * Handle edit organization
     */
    handleEdit(orgId) {
        if (this.props.onEditOrg) {
            this.props.onEditOrg(orgId);
        }
    }

    /**
     * Handle delete organization
     */
    async handleDelete(orgId) {
        const org = this.state.organizations.find(o => o.id === orgId);
        if (!org) return;

        const confirmed = confirm(`Are you sure you want to delete organization "${org.name}"?\n\nThis will also delete all users, estimates, and catalogs belonging to this organization.`);
        if (!confirmed) return;

        try {
            await orgService.deleteOrganization(orgId);
            this.showNotification(`Organization "${org.name}" deleted successfully`, 'success');
            this.loadOrganizations();
        } catch (error) {
            this.showNotification(`Failed to delete organization: ${error.message}`, 'error');
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
        await this.loadOrganizations();
    }
}
