/**
 * Admin Panel Router
 * Version: 2.0.0
 * Created: 2025-12-13
 * Updated: 2025-12-14
 *
 * Simple hash-based client-side router with component integration
 * No dependencies, no build step required
 */

import { UserTable } from './components/UserTable.js';
import { UserForm } from './components/UserForm.js';
import { OrgTable } from './components/OrgTable.js';
import { OrgForm } from './components/OrgForm.js';

export class Router {
    constructor(options = {}) {
        this.container = options.container || document.getElementById('app');
        this.store = options.store || null;
        this.routes = {};
        this.currentRoute = null;
        this.currentComponent = null;
        this.currentModal = null;
    }

    /**
     * Initialize router
     */
    init() {
        // Register routes
        this.registerRoutes();

        // Listen for hash changes
        window.addEventListener('hashchange', () => this.handleRouteChange());

        // Handle initial route
        this.handleRouteChange();

        console.log('[Router] Initialized');
    }

    /**
     * Register all application routes
     */
    registerRoutes() {
        this.routes = {
            '/': {
                title: 'Dashboard',
                render: () => this.renderDashboard()
            },
            '/users': {
                title: 'Users Management',
                render: () => this.renderUsers()
            },
            '/organizations': {
                title: 'Organizations',
                render: () => this.renderOrganizations()
            },
            '/settings': {
                title: 'Settings',
                render: () => this.renderSettings()
            },
            '/profile': {
                title: 'My Profile',
                render: () => this.renderProfile()
            },
            '/audit-log': {
                title: 'Audit Log',
                render: () => this.renderAuditLog()
            }
        };
    }

    /**
     * Handle route changes
     */
    handleRouteChange() {
        const hash = window.location.hash.slice(1) || '/';
        const route = this.routes[hash];

        if (!route) {
            console.warn(`[Router] Route not found: ${hash}`);
            this.render404();
            return;
        }

        // Update store
        if (this.store) {
            this.store.set('route', hash);
        }

        // Update document title
        document.title = `${route.title} - Magellania CRM`;

        // Cleanup previous component
        if (this.currentComponent && this.currentComponent.unmount) {
            this.currentComponent.unmount();
        }

        // Render new route
        this.currentRoute = hash;
        route.render();

        console.log(`[Router] Navigated to: ${hash}`);
    }

    /**
     * Navigate to route
     * @param {string} path - Route path
     */
    navigate(path) {
        window.location.hash = path;
    }

    /**
     * Render layout wrapper
     * @param {string} content - Page content HTML
     */
    renderLayout(content) {
        const user = this.store?.get('user') || {};

        this.container.innerHTML = `
            <div class="app-layout">
                <!-- Sidebar -->
                <aside class="app-sidebar">
                    <div class="sidebar-logo">Magellania</div>

                    <nav class="sidebar-nav">
                        <ul>
                            <li class="sidebar-nav-item">
                                <a href="#/" class="sidebar-nav-link ${this.currentRoute === '/' ? 'active' : ''}">
                                    📊 Dashboard
                                </a>
                            </li>
                            <li class="sidebar-nav-item">
                                <a href="#/users" class="sidebar-nav-link ${this.currentRoute === '/users' ? 'active' : ''}">
                                    👥 Users
                                </a>
                            </li>
                            ${user.role === 'superadmin' ? `
                            <li class="sidebar-nav-item">
                                <a href="#/organizations" class="sidebar-nav-link ${this.currentRoute === '/organizations' ? 'active' : ''}">
                                    🏢 Organizations
                                </a>
                            </li>
                            ` : ''}
                            <li class="sidebar-nav-item">
                                <a href="#/audit-log" class="sidebar-nav-link ${this.currentRoute === '/audit-log' ? 'active' : ''}">
                                    📋 Audit Log
                                </a>
                            </li>
                            <li class="sidebar-nav-item">
                                <a href="#/settings" class="sidebar-nav-link ${this.currentRoute === '/settings' ? 'active' : ''}">
                                    ⚙️ Settings
                                </a>
                            </li>
                        </ul>
                    </nav>
                </aside>

                <!-- Header -->
                <header class="app-header">
                    <h1>${this.routes[this.currentRoute]?.title || 'Admin Panel'}</h1>

                    <div class="header-actions">
                        <a href="#/profile" class="btn btn-secondary btn-sm">
                            ${user.email || 'Profile'}
                        </a>
                        <button onclick="app.logout()" class="btn btn-secondary btn-sm">
                            Logout
                        </button>
                    </div>
                </header>

                <!-- Main Content -->
                <main class="app-main">
                    ${content}
                </main>
            </div>
        `;
    }

    /**
     * Render Dashboard page
     */
    renderDashboard() {
        const content = `
            <div class="page-header">
                <h2 class="page-title">Dashboard</h2>
                <p class="page-description">Welcome to Magellania CRM Admin Panel</p>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Quick Stats</h3>
                </div>
                <div class="card-body">
                    <p>Dashboard content will be implemented in Week 4-5</p>
                    <p class="mt-md">
                        <strong>Current version:</strong> 1.0.0 (Week 3: Frontend Structure)
                    </p>
                </div>
            </div>
        `;

        this.renderLayout(content);
    }

    /**
     * Render Users page
     */
    renderUsers() {
        const content = `
            <div class="page-header">
                <h2 class="page-title">Users Management</h2>
                <p class="page-description">Manage system users and permissions</p>
            </div>

            <div id="userTableContainer"></div>
        `;

        this.renderLayout(content);

        // Mount UserTable component
        const container = document.getElementById('userTableContainer');
        if (container) {
            this.currentComponent = new UserTable(container, {
                onCreateUser: () => this.showUserForm(),
                onEditUser: (userId) => this.showUserForm(userId)
            }, this.store);
            this.currentComponent.mount();
        }
    }

    /**
     * Render Organizations page
     */
    renderOrganizations() {
        const content = `
            <div class="page-header">
                <h2 class="page-title">Organizations</h2>
                <p class="page-description">Manage organizations (Superadmin only)</p>
            </div>

            <div id="orgTableContainer"></div>
        `;

        this.renderLayout(content);

        // Mount OrgTable component
        const container = document.getElementById('orgTableContainer');
        if (container) {
            this.currentComponent = new OrgTable(container, {
                onCreateOrg: () => this.showOrgForm(),
                onEditOrg: (orgId) => this.showOrgForm(orgId)
            }, this.store);
            this.currentComponent.mount();
        }
    }

    /**
     * Render Settings page
     */
    renderSettings() {
        const content = `
            <div class="page-header">
                <h2 class="page-title">Settings</h2>
                <p class="page-description">Application settings</p>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">General Settings</h3>
                </div>
                <div class="card-body">
                    <p>Settings UI will be implemented in Week 4-5</p>
                </div>
            </div>
        `;

        this.renderLayout(content);
    }

    /**
     * Render Profile page
     */
    renderProfile() {
        const user = this.store?.get('user') || {};

        const content = `
            <div class="page-header">
                <h2 class="page-title">My Profile</h2>
                <p class="page-description">Manage your profile settings</p>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Profile Information</h3>
                </div>
                <div class="card-body">
                    <dl style="display: grid; grid-template-columns: 150px 1fr; gap: 0.5rem;">
                        <dt style="font-weight: 600;">Email:</dt>
                        <dd>${user.email || 'N/A'}</dd>

                        <dt style="font-weight: 600;">Username:</dt>
                        <dd>${user.username || 'N/A'}</dd>

                        <dt style="font-weight: 600;">Role:</dt>
                        <dd><span class="badge badge-primary">${user.role || 'N/A'}</span></dd>

                        <dt style="font-weight: 600;">Organization:</dt>
                        <dd>${user.organization_id || 'N/A'}</dd>
                    </dl>
                </div>
                <div class="card-footer">
                    <p>Profile editing will be implemented in Week 4-5</p>
                </div>
            </div>
        `;

        this.renderLayout(content);
    }

    /**
     * Render Audit Log page
     */
    renderAuditLog() {
        const content = `
            <div class="page-header">
                <h2 class="page-title">Audit Log</h2>
                <p class="page-description">View system audit logs</p>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Recent Activities</h3>
                </div>
                <div class="card-body">
                    <p>Audit log UI will be implemented in Week 4-5</p>
                </div>
            </div>
        `;

        this.renderLayout(content);
    }

    /**
     * Render 404 page
     */
    render404() {
        this.container.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                text-align: center;
            ">
                <h1 style="font-size: 4rem; margin-bottom: 1rem;">404</h1>
                <h2 style="font-size: 1.5rem; margin-bottom: 0.5rem;">Page Not Found</h2>
                <p style="color: #6b7280; margin-bottom: 1.5rem;">
                    The requested page does not exist.
                </p>
                <a href="#/" class="btn btn-primary">Go to Dashboard</a>
            </div>
        `;
    }

    /**
     * Show user create/edit form modal
     * @param {string} userId - User ID (for edit mode)
     */
    showUserForm(userId = null) {
        // Create modal backdrop
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = '<div class="modal-content"></div>';
        document.body.appendChild(modal);

        // Mount UserForm component
        const container = modal.querySelector('.modal-content');
        this.currentModal = new UserForm(container, {
            userId,
            onSaved: (user) => {
                console.log('User saved:', user);
                this.closeModal();
                // Refresh user table
                if (this.currentComponent && this.currentComponent.refresh) {
                    this.currentComponent.refresh();
                }
            },
            onClose: () => {
                this.closeModal();
            }
        }, this.store);

        this.currentModal.mount();

        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('visible');
        }, 10);
    }

    /**
     * Show organization create/edit form modal
     * @param {string} orgId - Organization ID (for edit mode)
     */
    showOrgForm(orgId = null) {
        // Create modal backdrop
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = '<div class="modal-content"></div>';
        document.body.appendChild(modal);

        // Mount OrgForm component
        const container = modal.querySelector('.modal-content');
        this.currentModal = new OrgForm(container, {
            orgId,
            onSaved: (org) => {
                console.log('Organization saved:', org);
                this.closeModal();
                // Refresh org table
                if (this.currentComponent && this.currentComponent.refresh) {
                    this.currentComponent.refresh();
                }
            },
            onClose: () => {
                this.closeModal();
            }
        }, this.store);

        this.currentModal.mount();

        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('visible');
        }, 10);
    }

    /**
     * Close modal
     */
    closeModal() {
        const modal = document.querySelector('.modal-backdrop');
        if (!modal) return;

        // Hide with animation
        modal.classList.remove('visible');

        setTimeout(() => {
            // Unmount component
            if (this.currentModal) {
                this.currentModal.unmount();
                this.currentModal = null;
            }

            // Remove modal from DOM
            modal.remove();
        }, 200);
    }
}
