/**
 * Base Component Class
 * Version: 1.0.0
 * Created: 2025-12-14
 *
 * Base class for all UI components
 * Provides:
 * - Lifecycle methods (mount, unmount, update)
 * - Event handling
 * - State management integration
 * - Error boundaries
 */

export class BaseComponent {
    /**
     * Create component
     * @param {HTMLElement} container - Container element
     * @param {Object} props - Component properties
     * @param {Store} store - Global store instance (optional)
     */
    constructor(container, props = {}, store = null) {
        this.container = container;
        this.props = props;
        this.store = store;
        this.state = {};
        this.eventListeners = [];
        this.storeUnsubscribers = [];
        this.isMounted = false;
    }

    /**
     * Render component HTML
     * @returns {string} HTML string
     */
    render() {
        // Override in subclass
        return '';
    }

    /**
     * Mount component to DOM
     */
    mount() {
        if (this.isMounted) {
            console.warn('[BaseComponent] Component already mounted');
            return;
        }

        try {
            // Lifecycle: beforeMount
            if (this.beforeMount) {
                this.beforeMount();
            }

            // Render HTML
            const html = this.render();
            this.container.innerHTML = html;

            // Bind events
            this.bindEvents();

            // Lifecycle: mounted
            this.isMounted = true;
            if (this.mounted) {
                this.mounted();
            }

        } catch (error) {
            console.error('[BaseComponent] Mount error:', error);
            this.renderError(error);
        }
    }

    /**
     * Unmount component from DOM
     */
    unmount() {
        if (!this.isMounted) {
            return;
        }

        try {
            // Lifecycle: beforeUnmount
            if (this.beforeUnmount) {
                this.beforeUnmount();
            }

            // Remove event listeners
            this.removeAllEventListeners();

            // Unsubscribe from store
            this.unsubscribeAll();

            // Clear container
            this.container.innerHTML = '';

            // Lifecycle: unmounted
            this.isMounted = false;
            if (this.unmounted) {
                this.unmounted();
            }

        } catch (error) {
            console.error('[BaseComponent] Unmount error:', error);
        }
    }

    /**
     * Update component (re-render)
     * @param {Object} newProps - New properties (optional)
     */
    update(newProps = null) {
        if (!this.isMounted) {
            console.warn('[BaseComponent] Cannot update unmounted component');
            return;
        }

        try {
            // Lifecycle: beforeUpdate
            if (this.beforeUpdate) {
                this.beforeUpdate(this.props, newProps);
            }

            // Update props if provided
            if (newProps) {
                this.props = { ...this.props, ...newProps };
            }

            // Remove old event listeners
            this.removeAllEventListeners();

            // Re-render
            const html = this.render();
            this.container.innerHTML = html;

            // Re-bind events
            this.bindEvents();

            // Lifecycle: updated
            if (this.updated) {
                this.updated();
            }

        } catch (error) {
            console.error('[BaseComponent] Update error:', error);
            this.renderError(error);
        }
    }

    /**
     * Bind event listeners (override in subclass)
     */
    bindEvents() {
        // Override in subclass
    }

    /**
     * Add event listener and track for cleanup
     * @param {HTMLElement} element - Target element
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object} options - Event options
     */
    addEventListener(element, event, handler, options = {}) {
        element.addEventListener(event, handler, options);

        this.eventListeners.push({
            element,
            event,
            handler,
            options
        });
    }

    /**
     * Remove all tracked event listeners
     */
    removeAllEventListeners() {
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            element.removeEventListener(event, handler, options);
        });

        this.eventListeners = [];
    }

    /**
     * Subscribe to store state changes
     * @param {string} key - State key to watch
     * @param {Function} callback - Callback function
     */
    subscribeToStore(key, callback) {
        if (!this.store) {
            console.warn('[BaseComponent] No store available');
            return;
        }

        const unsubscribe = this.store.subscribe(key, callback);
        this.storeUnsubscribers.push(unsubscribe);
    }

    /**
     * Unsubscribe from all store subscriptions
     */
    unsubscribeAll() {
        this.storeUnsubscribers.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });

        this.storeUnsubscribers = [];
    }

    /**
     * Find element within component
     * @param {string} selector - CSS selector
     * @returns {HTMLElement|null}
     */
    $(selector) {
        return this.container.querySelector(selector);
    }

    /**
     * Find all elements within component
     * @param {string} selector - CSS selector
     * @returns {NodeList}
     */
    $$(selector) {
        return this.container.querySelectorAll(selector);
    }

    /**
     * Show loading state
     * @param {string} message - Loading message
     */
    showLoading(message = 'Loading...') {
        this.container.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    /**
     * Show error state
     * @param {Error|string} error - Error object or message
     */
    renderError(error) {
        const message = error.message || error.toString();

        this.container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <h3>Error</h3>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="window.location.reload()">
                    Reload Page
                </button>
            </div>
        `;
    }

    /**
     * Show empty state
     * @param {string} message - Empty state message
     * @param {string} actionLabel - Action button label (optional)
     * @param {Function} actionHandler - Action button handler (optional)
     */
    renderEmpty(message = 'No data available', actionLabel = null, actionHandler = null) {
        let actionButton = '';

        if (actionLabel && actionHandler) {
            actionButton = `
                <button class="btn btn-primary empty-action">
                    ${actionLabel}
                </button>
            `;
        }

        this.container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>${message}</p>
                ${actionButton}
            </div>
        `;

        if (actionButton && actionHandler) {
            const button = this.$('.empty-action');
            if (button) {
                this.addEventListener(button, 'click', actionHandler);
            }
        }
    }

    /**
     * Show notification
     * @param {string} message - Notification message
     * @param {string} type - Notification type (success, error, warning, info)
     */
    showNotification(message, type = 'info') {
        // This will be handled by a global notification system
        window.dispatchEvent(new CustomEvent('notification', {
            detail: { message, type }
        }));
    }

    /**
     * Safely escape HTML to prevent XSS
     * @param {string} html - HTML string
     * @returns {string} Escaped string
     */
    escapeHtml(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }

    /**
     * Format date for display
     * @param {number|string} timestamp - Unix timestamp or ISO string
     * @returns {string} Formatted date
     */
    formatDate(timestamp) {
        if (!timestamp) return 'N/A';

        const date = typeof timestamp === 'number'
            ? new Date(timestamp * 1000)
            : new Date(timestamp);

        if (isNaN(date.getTime())) return 'Invalid Date';

        return date.toLocaleString('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Format relative time (e.g., "2 hours ago")
     * @param {number|string} timestamp - Unix timestamp or ISO string
     * @returns {string} Relative time string
     */
    formatRelativeTime(timestamp) {
        if (!timestamp) return 'N/A';

        const date = typeof timestamp === 'number'
            ? new Date(timestamp * 1000)
            : new Date(timestamp);

        if (isNaN(date.getTime())) return 'Invalid Date';

        const now = new Date();
        const diff = Math.floor((now - date) / 1000); // seconds

        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;

        return this.formatDate(timestamp);
    }
}
