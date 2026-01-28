/**
 * MockGPSProvider - Simulated GPS for testing and development
 * Generates fake GPS positions that move along a predefined path or randomly
 */

// Import base class if in Node environment
let GPSProvider;
if (typeof require !== 'undefined') {
    GPSProvider = require('./gps-provider.js');
}

class MockGPSProvider extends (GPSProvider || Object) {
    constructor(options = {}) {
        super();

        // Configuration
        this.updateInterval = options.updateInterval || 1000; // ms
        this.mode = options.mode || 'stationary'; // 'stationary', 'random', 'path'
        this.startPosition = options.startPosition || { lat: 37.7749, lng: -122.4194 }; // San Francisco
        this.speedKmh = options.speedKmh || 50; // km/h for path mode

        // Internal state
        this.intervalId = null;
        this.currentPosition = { ...this.startPosition };
        this.heading = 0;
        this.pathIndex = 0;

        // Sample path for demo (San Francisco streets)
        this.demoPath = [
            { lat: 37.7749, lng: -122.4194 },
            { lat: 37.7751, lng: -122.4180 },
            { lat: 37.7755, lng: -122.4165 },
            { lat: 37.7760, lng: -122.4150 },
            { lat: 37.7768, lng: -122.4135 },
            { lat: 37.7775, lng: -122.4120 },
            { lat: 37.7780, lng: -122.4105 },
            { lat: 37.7785, lng: -122.4090 },
            { lat: 37.7790, lng: -122.4075 },
            { lat: 37.7795, lng: -122.4060 }
        ];

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
     * Connect to the mock GPS
     */
    async connect() {
        console.log('MockGPS: Connecting...');

        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, 500));

        this.setConnected(true);
        console.log('MockGPS: Connected');

        // Start position updates
        this.startUpdates();
    }

    /**
     * Disconnect from the mock GPS
     */
    async disconnect() {
        console.log('MockGPS: Disconnecting...');

        this.stopUpdates();
        this.setConnected(false);
        console.log('MockGPS: Disconnected');
    }

    /**
     * Start generating position updates
     */
    startUpdates() {
        if (this.intervalId) {
            return;
        }

        // Send initial position
        this.generatePosition();

        // Start interval
        this.intervalId = setInterval(() => {
            this.generatePosition();
        }, this.updateInterval);
    }

    /**
     * Stop generating position updates
     */
    stopUpdates() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Generate a new position based on mode
     */
    generatePosition() {
        let position;

        switch (this.mode) {
            case 'random':
                position = this.generateRandomPosition();
                break;
            case 'path':
                position = this.generatePathPosition();
                break;
            case 'stationary':
            default:
                position = this.generateStationaryPosition();
                break;
        }

        this.updatePosition(position);
    }

    /**
     * Generate a stationary position with slight GPS drift
     */
    generateStationaryPosition() {
        // Add small random drift to simulate GPS inaccuracy
        const drift = 0.00001;
        return {
            lat: this.startPosition.lat + (Math.random() - 0.5) * drift,
            lng: this.startPosition.lng + (Math.random() - 0.5) * drift,
            accuracy: 5 + Math.random() * 10,
            heading: this.heading,
            speed: 0,
            altitude: 10 + Math.random() * 5
        };
    }

    /**
     * Generate a random walking position
     */
    generateRandomPosition() {
        // Random direction change
        this.heading += (Math.random() - 0.5) * 30;
        this.heading = this.heading % 360;

        // Move in heading direction
        const distance = 0.0001; // roughly 10 meters
        const headingRad = this.heading * Math.PI / 180;

        this.currentPosition.lat += distance * Math.cos(headingRad);
        this.currentPosition.lng += distance * Math.sin(headingRad);

        return {
            lat: this.currentPosition.lat,
            lng: this.currentPosition.lng,
            accuracy: 5 + Math.random() * 15,
            heading: this.heading,
            speed: 3 + Math.random() * 2, // 3-5 km/h walking speed
            altitude: 10 + Math.random() * 5
        };
    }

    /**
     * Generate position along a predefined path
     */
    generatePathPosition() {
        if (this.pathIndex >= this.demoPath.length - 1) {
            // Loop back to start
            this.pathIndex = 0;
        }

        const current = this.demoPath[this.pathIndex];
        const next = this.demoPath[this.pathIndex + 1];

        // Interpolate between points
        const progress = (Date.now() % 3000) / 3000;
        const lat = current.lat + (next.lat - current.lat) * progress;
        const lng = current.lng + (next.lng - current.lng) * progress;

        // Calculate heading
        this.heading = this.calculateHeading(current, next);

        // Move to next segment occasionally
        if (progress > 0.95) {
            this.pathIndex++;
        }

        return {
            lat,
            lng,
            accuracy: 3 + Math.random() * 5,
            heading: this.heading,
            speed: this.speedKmh,
            altitude: 10
        };
    }

    /**
     * Calculate heading between two points
     */
    calculateHeading(from, to) {
        const dLng = to.lng - from.lng;
        const dLat = to.lat - from.lat;
        const heading = Math.atan2(dLng, dLat) * 180 / Math.PI;
        return (heading + 360) % 360;
    }

    /**
     * Set the simulation mode
     * @param {string} mode - 'stationary', 'random', or 'path'
     */
    setMode(mode) {
        this.mode = mode;
        if (mode === 'stationary' || mode === 'random') {
            this.currentPosition = { ...this.startPosition };
        }
        if (mode === 'path') {
            this.pathIndex = 0;
        }
    }

    /**
     * Set the start/current position
     * @param {number} lat
     * @param {number} lng
     */
    setPosition(lat, lng) {
        this.startPosition = { lat, lng };
        this.currentPosition = { lat, lng };
    }

    /**
     * Set a custom path for path mode
     * @param {Array} path - Array of {lat, lng} objects
     */
    setPath(path) {
        this.demoPath = path;
        this.pathIndex = 0;
    }

    // Re-implement base class methods for browser compatibility
    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }

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

    updatePosition(position) {
        this.lastPosition = {
            ...position,
            timestamp: position.timestamp || Date.now()
        };
        this.emit('position', this.lastPosition);
    }

    setConnected(connected) {
        const wasConnected = this.isConnected;
        this.isConnected = connected;

        if (connected && !wasConnected) {
            this.emit('connected');
        } else if (!connected && wasConnected) {
            this.emit('disconnected');
        }
    }

    getLastPosition() {
        return this.lastPosition;
    }

    getIsConnected() {
        return this.isConnected;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MockGPSProvider;
}
