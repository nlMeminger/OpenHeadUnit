/**
 * NavigationManager - Main controller for navigation functionality
 * Coordinates GPS, map display, routing, and voice guidance
 */

class NavigationManager {
    constructor() {
        // Components
        this.mapController = null;
        this.gpsProvider = null;

        // State
        this.state = 'idle'; // idle, navigating, recalculating
        this.currentRoute = null;
        this.isInitialized = false;

        // Settings
        this.settings = {
            gpsSource: 'mock',
            autoFollow: true,
            voiceEnabled: true,
            mapStyle: 'dark'
        };

        // Event listeners
        this.listeners = {
            stateChange: [],
            gpsUpdate: [],
            routeUpdate: [],
            error: []
        };
    }

    /**
     * Initialize navigation system
     */
    async init() {
        if (this.isInitialized) {
            console.log('Navigation already initialized');
            return;
        }

        console.log('Initializing navigation system...');

        try {
            // Initialize map controller
            this.mapController = new MapController('navMap');
            this.mapController.init();

            // Set up map event handlers
            if (this.mapController.map) {
                this.mapController.map.on('dragstart', () => {
                    this.mapController.setAutoFollow(false);
                    this.updateCenterButton(false);
                });
            }

            // Initialize GPS provider (mock for now)
            await this.initGPS();

            // Set up UI event handlers
            this.setupUIHandlers();

            this.isInitialized = true;
            console.log('Navigation system initialized');

        } catch (error) {
            console.error('Failed to initialize navigation:', error);
            this.emit('error', error.message);
        }
    }

    /**
     * Initialize GPS provider based on settings
     */
    async initGPS() {
        // For now, always use mock GPS
        // In future phases, this will check settings.gpsSource
        this.gpsProvider = new MockGPSProvider({
            mode: 'stationary',
            updateInterval: 1000
        });

        // Listen for GPS events
        this.gpsProvider.on('position', (position) => {
            this.onGPSUpdate(position);
        });

        this.gpsProvider.on('connected', () => {
            this.updateGPSStatus('connected');
        });

        this.gpsProvider.on('disconnected', () => {
            this.updateGPSStatus('disconnected');
        });

        this.gpsProvider.on('error', (message) => {
            this.updateGPSStatus('error', message);
        });

        // Connect to GPS
        await this.gpsProvider.connect();
    }

    /**
     * Handle GPS position updates
     */
    onGPSUpdate(position) {
        // Update map
        if (this.mapController) {
            this.mapController.updatePosition(position);
        }

        // Update speed display
        this.updateSpeedDisplay(position.speed);

        // Emit event
        this.emit('gpsUpdate', position);

        // If navigating, check route progress
        if (this.state === 'navigating' && this.currentRoute) {
            this.checkRouteProgress(position);
        }
    }

    /**
     * Update GPS status indicator
     */
    updateGPSStatus(status, message = '') {
        const statusEl = document.getElementById('navGpsStatus');
        const textEl = document.getElementById('navGpsText');

        if (!statusEl || !textEl) return;

        statusEl.classList.remove('connected', 'error');

        switch (status) {
            case 'connected':
                statusEl.classList.add('connected');
                textEl.textContent = 'GPS Connected';
                break;
            case 'disconnected':
                textEl.textContent = 'GPS Disconnected';
                break;
            case 'error':
                statusEl.classList.add('error');
                textEl.textContent = message || 'GPS Error';
                break;
            default:
                textEl.textContent = 'Searching...';
        }
    }

    /**
     * Update speed display
     */
    updateSpeedDisplay(speedKmh) {
        const speedEl = document.getElementById('navSpeed');
        if (speedEl) {
            const speedMph = Math.round((speedKmh || 0) * 0.621371);
            speedEl.textContent = `${speedMph} mph`;
        }
    }

    /**
     * Update center button active state
     */
    updateCenterButton(isFollowing) {
        const centerBtn = document.getElementById('navCenterBtn');
        if (centerBtn) {
            centerBtn.classList.toggle('active', isFollowing);
        }
    }

    /**
     * Set up UI event handlers
     */
    setupUIHandlers() {
        // Zoom controls
        const zoomInBtn = document.getElementById('navZoomIn');
        const zoomOutBtn = document.getElementById('navZoomOut');

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                this.mapController?.zoomIn();
            });
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                this.mapController?.zoomOut();
            });
        }

        // Center on position
        const centerBtn = document.getElementById('navCenterBtn');
        if (centerBtn) {
            centerBtn.addEventListener('click', () => {
                this.mapController?.centerOnPosition();
                this.updateCenterButton(true);
            });
        }

        // Stop navigation
        const stopBtn = document.getElementById('navStopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this.stopNavigation();
            });
        }

        // Search input (placeholder for future)
        const searchInput = document.getElementById('navSearchInput');
        if (searchInput) {
            searchInput.addEventListener('focus', () => {
                // Future: Show search interface / on-screen keyboard
                console.log('Search focused - feature coming in future phase');
            });
        }
    }

    /**
     * Start navigation to a destination
     * @param {Object} destination - { lat, lng, name }
     */
    async startNavigation(destination) {
        console.log('Starting navigation to:', destination);

        this.state = 'navigating';
        this.emit('stateChange', this.state);

        // Set destination marker
        this.mapController?.setDestination(destination.lat, destination.lng, destination.name);

        // Show turn panel
        const turnPanel = document.getElementById('navTurnPanel');
        if (turnPanel) {
            turnPanel.style.display = 'flex';
        }

        // Future: Calculate route using OSRM
        // For now, just draw a simple line to destination
        const currentPos = this.gpsProvider?.getLastPosition();
        if (currentPos) {
            this.mapController?.displayRoute([
                [currentPos.lat, currentPos.lng],
                [destination.lat, destination.lng]
            ]);
        }
    }

    /**
     * Stop navigation
     */
    stopNavigation() {
        console.log('Stopping navigation');

        this.state = 'idle';
        this.currentRoute = null;
        this.emit('stateChange', this.state);

        // Clear route from map
        this.mapController?.clearRoute();

        // Hide turn panel
        const turnPanel = document.getElementById('navTurnPanel');
        if (turnPanel) {
            turnPanel.style.display = 'none';
        }
    }

    /**
     * Check progress along route
     */
    checkRouteProgress(position) {
        // Future: Implement route progress tracking
        // Check if off-route, update turn instructions, etc.
    }

    /**
     * Handle map resize (call when interface becomes visible)
     */
    onShow() {
        // Invalidate map size to handle container resize
        setTimeout(() => {
            this.mapController?.invalidateSize();
        }, 100);
    }

    /**
     * Clean up when hiding interface
     */
    onHide() {
        // Could pause GPS updates here if needed
    }

    /**
     * Destroy navigation system
     */
    destroy() {
        this.gpsProvider?.disconnect();
        this.mapController?.destroy();
        this.isInitialized = false;
    }

    /**
     * Event handling
     */
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
                    console.error(`Error in navigation ${event} listener:`, error);
                }
            });
        }
    }
}

// Global instance
let navigationManager = null;

/**
 * Initialize navigation (called from app.js)
 */
function initNavigation() {
    if (!navigationManager) {
        navigationManager = new NavigationManager();
    }

    if (!navigationManager.isInitialized) {
        navigationManager.init();
    } else {
        navigationManager.onShow();
    }
}

/**
 * Get navigation manager instance
 */
function getNavigationManager() {
    return navigationManager;
}
