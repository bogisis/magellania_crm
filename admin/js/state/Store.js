/**
 * Simple Reactive Store
 * Version: 1.0.0
 * Created: 2025-12-13
 *
 * Lightweight reactive state management
 * No dependencies, no build step required
 *
 * Features:
 * - Subscribe to state changes
 * - Get/Set individual state properties
 * - Batch updates
 * - Debug logging
 */

export class Store {
    constructor(initialState = {}) {
        this.state = { ...initialState };
        this.subscribers = new Map();
        this.debug = false;

        this.log('Store initialized with state:', this.state);
    }

    /**
     * Get state property
     * @param {string} key - State key
     * @returns {*} State value
     */
    get(key) {
        return this.state[key];
    }

    /**
     * Get entire state
     * @returns {Object} Complete state object
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Set state property and notify subscribers
     * @param {string} key - State key
     * @param {*} value - New value
     */
    set(key, value) {
        const oldValue = this.state[key];

        // Only update if value changed
        if (oldValue === value) {
            return;
        }

        this.state[key] = value;
        this.log(`State updated: ${key}`, { oldValue, newValue: value });

        // Notify subscribers
        this.notify(key, value, oldValue);
    }

    /**
     * Batch update multiple state properties
     * @param {Object} updates - Object with state updates
     */
    batch(updates) {
        const changes = [];

        for (const [key, value] of Object.entries(updates)) {
            const oldValue = this.state[key];

            if (oldValue !== value) {
                this.state[key] = value;
                changes.push({ key, oldValue, newValue: value });
            }
        }

        if (changes.length > 0) {
            this.log('Batch update:', changes);

            // Notify all affected subscribers
            changes.forEach(({ key, newValue, oldValue }) => {
                this.notify(key, newValue, oldValue);
            });
        }
    }

    /**
     * Subscribe to state changes
     * @param {string} key - State key to watch (or '*' for all)
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    subscribe(key, callback) {
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Set());
        }

        this.subscribers.get(key).add(callback);

        this.log(`Subscribed to: ${key}`);

        // Return unsubscribe function
        return () => {
            this.unsubscribe(key, callback);
        };
    }

    /**
     * Unsubscribe from state changes
     * @param {string} key - State key
     * @param {Function} callback - Callback function
     */
    unsubscribe(key, callback) {
        const callbacks = this.subscribers.get(key);

        if (callbacks) {
            callbacks.delete(callback);

            if (callbacks.size === 0) {
                this.subscribers.delete(key);
            }

            this.log(`Unsubscribed from: ${key}`);
        }
    }

    /**
     * Notify subscribers of state change
     * @param {string} key - State key
     * @param {*} newValue - New value
     * @param {*} oldValue - Old value
     */
    notify(key, newValue, oldValue) {
        // Notify specific key subscribers
        const keySubscribers = this.subscribers.get(key);
        if (keySubscribers) {
            keySubscribers.forEach(callback => {
                try {
                    callback(newValue, oldValue);
                } catch (error) {
                    console.error(`[Store] Error in subscriber callback for ${key}:`, error);
                }
            });
        }

        // Notify wildcard subscribers
        const wildcardSubscribers = this.subscribers.get('*');
        if (wildcardSubscribers) {
            wildcardSubscribers.forEach(callback => {
                try {
                    callback({ key, newValue, oldValue });
                } catch (error) {
                    console.error('[Store] Error in wildcard subscriber:', error);
                }
            });
        }
    }

    /**
     * Reset state to initial values
     * @param {Object} initialState - New initial state
     */
    reset(initialState = {}) {
        const oldState = { ...this.state };
        this.state = { ...initialState };

        this.log('Store reset:', { oldState, newState: this.state });

        // Notify all subscribers
        for (const key of Object.keys(oldState)) {
            this.notify(key, this.state[key], oldState[key]);
        }
    }

    /**
     * Clear all subscribers
     */
    clearSubscribers() {
        this.subscribers.clear();
        this.log('All subscribers cleared');
    }

    /**
     * Enable/disable debug logging
     * @param {boolean} enabled - Enable debug mode
     */
    setDebug(enabled) {
        this.debug = enabled;
    }

    /**
     * Debug log helper
     * @param  {...any} args - Log arguments
     */
    log(...args) {
        if (this.debug) {
            console.log('[Store]', ...args);
        }
    }

    /**
     * Get subscriber count for debugging
     * @returns {Object} Subscriber counts by key
     */
    getSubscriberCounts() {
        const counts = {};

        for (const [key, callbacks] of this.subscribers.entries()) {
            counts[key] = callbacks.size;
        }

        return counts;
    }
}

/**
 * Create a computed property that derives from store state
 * @param {Store} store - Store instance
 * @param {Function} computeFn - Compute function
 * @param {Array<string>} dependencies - State keys to watch
 * @returns {Object} Computed property with get() and subscribe() methods
 */
export function computed(store, computeFn, dependencies = []) {
    let cachedValue = computeFn(store.getState());
    let subscribers = new Set();

    // Subscribe to dependencies
    const unsubscribers = dependencies.map(key =>
        store.subscribe(key, () => {
            const newValue = computeFn(store.getState());

            if (newValue !== cachedValue) {
                const oldValue = cachedValue;
                cachedValue = newValue;

                // Notify computed subscribers
                subscribers.forEach(callback => {
                    try {
                        callback(newValue, oldValue);
                    } catch (error) {
                        console.error('[Computed] Error in subscriber:', error);
                    }
                });
            }
        })
    );

    return {
        get() {
            return cachedValue;
        },

        subscribe(callback) {
            subscribers.add(callback);

            // Return unsubscribe function
            return () => {
                subscribers.delete(callback);
            };
        },

        destroy() {
            unsubscribers.forEach(unsub => unsub());
            subscribers.clear();
        }
    };
}
