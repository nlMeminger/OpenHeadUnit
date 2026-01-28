/**
 * MapController - Leaflet map wrapper for navigation
 * Handles map initialization, rendering, and interactions
 */

class MapController {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.positionMarker = null;
        this.accuracyCircle = null;
        this.routeLine = null;
        this.destinationMarker = null;
        this.autoFollow = true;
        this.currentZoom = 15;
        this.defaultCenter = [37.7749, -122.4194]; // San Francisco as default
    }

    /**
     * Initialize the Leaflet map
     */
    init() {
        if (this.map) {
            return;
        }

        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Map container not found:', this.containerId);
            return;
        }

        // Initialize map
        this.map = L.map(this.containerId, {
            center: this.defaultCenter,
            zoom: this.currentZoom,
            zoomControl: false,
            attributionControl: true
        });

        // Add OpenStreetMap tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(this.map);

        // Create custom position marker icon
        this.positionIcon = L.divIcon({
            className: 'nav-position-marker-wrapper',
            html: '<div class="nav-position-marker"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        console.log('Map initialized');
    }

    /**
     * Update the current position on the map
     * @param {Object} position - { lat, lng, accuracy, heading, speed }
     */
    updatePosition(position) {
        if (!this.map) return;

        const { lat, lng, accuracy, heading } = position;
        const latlng = L.latLng(lat, lng);

        // Update or create position marker
        if (this.positionMarker) {
            this.positionMarker.setLatLng(latlng);
        } else {
            this.positionMarker = L.marker(latlng, {
                icon: this.positionIcon,
                zIndexOffset: 1000
            }).addTo(this.map);
        }

        // Update or create accuracy circle
        if (accuracy) {
            if (this.accuracyCircle) {
                this.accuracyCircle.setLatLng(latlng);
                this.accuracyCircle.setRadius(accuracy);
            } else {
                this.accuracyCircle = L.circle(latlng, {
                    radius: accuracy,
                    className: 'nav-position-accuracy',
                    fillOpacity: 0.15,
                    stroke: true,
                    weight: 1
                }).addTo(this.map);
            }
        }

        // Auto-follow if enabled
        if (this.autoFollow) {
            this.map.setView(latlng, this.map.getZoom(), {
                animate: true,
                duration: 0.5
            });
        }

        // Rotate map to heading if available (optional feature)
        // This would require a rotation plugin for Leaflet
    }

    /**
     * Center the map on a specific location
     * @param {number} lat
     * @param {number} lng
     * @param {number} zoom
     */
    centerOn(lat, lng, zoom = null) {
        if (!this.map) return;

        this.map.setView([lat, lng], zoom || this.map.getZoom(), {
            animate: true,
            duration: 0.5
        });
    }

    /**
     * Center on current position marker
     */
    centerOnPosition() {
        if (this.positionMarker && this.map) {
            const pos = this.positionMarker.getLatLng();
            this.map.setView(pos, this.map.getZoom(), {
                animate: true,
                duration: 0.5
            });
            this.autoFollow = true;
        }
    }

    /**
     * Zoom in
     */
    zoomIn() {
        if (this.map) {
            this.map.zoomIn();
        }
    }

    /**
     * Zoom out
     */
    zoomOut() {
        if (this.map) {
            this.map.zoomOut();
        }
    }

    /**
     * Set auto-follow mode
     * @param {boolean} enabled
     */
    setAutoFollow(enabled) {
        this.autoFollow = enabled;
    }

    /**
     * Display a route on the map
     * @param {Array} coordinates - Array of [lat, lng] pairs
     */
    displayRoute(coordinates) {
        if (!this.map) return;

        // Remove existing route
        if (this.routeLine) {
            this.map.removeLayer(this.routeLine);
        }

        // Create new route polyline
        this.routeLine = L.polyline(coordinates, {
            color: '#00ff88',
            weight: 6,
            opacity: 0.9,
            lineJoin: 'round',
            lineCap: 'round'
        }).addTo(this.map);

        // Fit map to show entire route
        this.map.fitBounds(this.routeLine.getBounds(), {
            padding: [50, 50]
        });
    }

    /**
     * Set destination marker
     * @param {number} lat
     * @param {number} lng
     * @param {string} name
     */
    setDestination(lat, lng, name = 'Destination') {
        if (!this.map) return;

        // Remove existing destination marker
        if (this.destinationMarker) {
            this.map.removeLayer(this.destinationMarker);
        }

        // Create destination marker
        const destIcon = L.divIcon({
            className: 'nav-destination-marker',
            html: '<div class="marker-pin"></div>',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });

        this.destinationMarker = L.marker([lat, lng], {
            icon: destIcon,
            title: name
        }).addTo(this.map);

        this.destinationMarker.bindPopup(name);
    }

    /**
     * Clear the current route
     */
    clearRoute() {
        if (this.routeLine) {
            this.map.removeLayer(this.routeLine);
            this.routeLine = null;
        }
        if (this.destinationMarker) {
            this.map.removeLayer(this.destinationMarker);
            this.destinationMarker = null;
        }
    }

    /**
     * Handle map drag (disables auto-follow)
     */
    onMapDrag() {
        this.autoFollow = false;
    }

    /**
     * Invalidate map size (call after container resize)
     */
    invalidateSize() {
        if (this.map) {
            this.map.invalidateSize();
        }
    }

    /**
     * Destroy the map instance
     */
    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
            this.positionMarker = null;
            this.accuracyCircle = null;
            this.routeLine = null;
            this.destinationMarker = null;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapController;
}
