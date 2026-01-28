/**
 * GPSProvider - Abstract base class for GPS providers
 * Provides a common interface for different GPS sources
 */

class GPSProvider {
    constructor() {
        this.listeners = {
            position: [],
            error: [],
            connected: [],
            disconnected: []
        };
        this.isConnected = false;
        this.lastPosition = null;
    }

    /**
     * Connect to the GPS source
     * @returns {Promise<void>}
     */
    async connect() {
        throw new Error('connect() must be implemented by subclass');
    }

    /**
     * Disconnect from the GPS source
     * @returns {Promise<void>}
     */
    async disconnect() {
        throw new Error('disconnect() must be implemented by subclass');
    }

    /**
     * Get the last known position
     * @returns {Object|null} Position object or null
     */
    getLastPosition() {
        return this.lastPosition;
    }

    /**
     * Check if connected to GPS
     * @returns {boolean}
     */
    getIsConnected() {
        return this.isConnected;
    }

    /**
     * Add an event listener
     * @param {string} event - Event name (position, error, connected, disconnected)
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    /**
     * Remove an event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function to remove
     */
    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in GPS ${event} listener:`, error);
                }
            });
        }
    }

    /**
     * Update the last position and emit event
     * @param {Object} position - Position object { lat, lng, accuracy, heading, speed, altitude, timestamp }
     */
    updatePosition(position) {
        this.lastPosition = {
            ...position,
            timestamp: position.timestamp || Date.now()
        };
        this.emit('position', this.lastPosition);
    }

    /**
     * Set connected state and emit event
     * @param {boolean} connected
     */
    setConnected(connected) {
        const wasConnected = this.isConnected;
        this.isConnected = connected;

        if (connected && !wasConnected) {
            this.emit('connected');
        } else if (!connected && wasConnected) {
            this.emit('disconnected');
        }
    }

    /**
     * Emit an error
     * @param {string} message - Error message
     */
    emitError(message) {
        this.emit('error', message);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GPSProvider;
}
