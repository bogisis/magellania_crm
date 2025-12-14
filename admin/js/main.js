/**
 * Admin Panel - Main Entry Point
 * Version: 1.0.0
 * Created: 2025-12-13
 *
 * Responsibilities:
 * - Auth guard (redirect to login if not authenticated)
 * - App initialization
 * - Router setup
 * - Global error handling
 */

import { config } from './config.js';
import { Router } from './router.js';
import { Store } from './state/Store.js';

/**
 * App Class - Main application controller
 */
class App {
    constructor() {
        this.config = config;
        this.store = null;
        this.router = null;
        this.isAuthenticated = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('[App] Initializing Admin Panel v1.0.0');

        try {
            // 1. Check authentication
            await this.checkAuth();

            // 2. Initialize store
            this.initStore();

            // 3. Initialize router
            this.initRouter();

            // 4. Setup global error handling
            this.setupErrorHandling();

            // 5. Hide loading overlay
            this.hideLoading();

            console.log('[App] Initialization complete');

        } catch (error) {
            console.error('[App] Initialization failed:', error);
            this.showError('Failed to initialize application');
        }
    }

    /**
     * Check if user is authenticated
     * Redirect to login if not authenticated
     */
    async checkAuth() {
        const token = localStorage.getItem('jwt_token');

        if (!token) {
            console.log('[App] No JWT token found, redirecting to login');
            window.location.href = '/login.html';
            return;
        }

        try {
            // Verify token with server
            const response = await fetch('/api/v1/auth/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Token verification failed');
            }

            const data = await response.json();
            this.isAuthenticated = true;
            this.currentUser = data.user;

            console.log('[App] User authenticated:', this.currentUser.email);

        } catch (error) {
            console.error('[App] Auth check failed:', error);
            localStorage.removeItem('jwt_token');
            window.location.href = '/login.html';
        }
    }

    /**
     * Initialize reactive store
     */
    initStore() {
        this.store = new Store({
            user: this.currentUser,
            route: null,
            loading: false,
            error: null
        });

        console.log('[App] Store initialized');
    }

    /**
     * Initialize router
     */
    initRouter() {
        this.router = new Router({
            container: document.getElementById('app'),
            store: this.store
        });

        this.router.init();

        console.log('[App] Router initialized');
    }

    /**
     * Setup global error handling
     */
    setupErrorHandling() {
        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('[App] Unhandled rejection:', event.reason);
            this.showError('An unexpected error occurred');
        });

        // Handle regular errors
        window.addEventListener('error', (event) => {
            console.error('[App] Error:', event.error);
        });

        // Handle 401 Unauthorized (token expired)
        window.addEventListener('unauthorized', () => {
            console.log('[App] Unauthorized access detected, redirecting to login');
            localStorage.removeItem('jwt_token');
            window.location.href = '/login.html';
        });
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'none';
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        const appContainer = document.getElementById('app');
        appContainer.innerHTML = `
            <div class="error-container" style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                padding: 2rem;
            ">
                <div style="text-align: center; max-width: 400px;">
                    <h1 style="font-size: 4rem; margin-bottom: 1rem;">⚠️</h1>
                    <h2 style="font-size: 1.5rem; margin-bottom: 0.5rem;">Ошибка</h2>
                    <p style="color: #6b7280; margin-bottom: 1.5rem;">${message}</p>
                    <button
                        onclick="window.location.reload()"
                        class="btn btn-primary"
                    >
                        Перезагрузить страницу
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Logout user
     */
    logout() {
        localStorage.removeItem('jwt_token');
        window.location.href = '/login.html';
    }
}

/**
 * Initialize app when DOM is ready
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const app = new App();
        app.init();

        // Expose app globally for debugging
        window.app = app;
    });
} else {
    const app = new App();
    app.init();

    // Expose app globally for debugging
    window.app = app;
}
