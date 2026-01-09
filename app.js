// Configuration
const CONFIG = {
    // IMPORTANT: Replace with your own MapBox token before production deployment
    // This is a public demo token with rate limits - get your free token at https://account.mapbox.com/
    mapboxToken: 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw',
    // Center on Victoria, Australia
    mapCenter: [144.9631, -37.8136],
    mapZoom: 7,
    // Azure Function endpoint - will need to be updated after deployment
    apiEndpoint: '/api/getCFAFeed'
};

// State
let map;
let markers = [];
let alerts = [];
let selectedAlertId = null;

// Initialize the application
function init() {
    initMap();
    setupEventListeners();
    loadAlerts();
}

// Initialize MapBox map
function initMap() {
    mapboxgl.accessToken = CONFIG.mapboxToken;
    
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: CONFIG.mapCenter,
        zoom: CONFIG.mapZoom
    });
    
    map.addControl(new mapboxgl.NavigationControl());
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadAlerts();
    });
}

// Load alerts from the API
async function loadAlerts() {
    const refreshBtn = document.getElementById('refreshBtn');
    const refreshIcon = document.getElementById('refreshIcon');
    
    refreshBtn.classList.add('loading');
    refreshBtn.disabled = true;
    
    try {
        // Try to fetch from Azure Function first, fallback to mock data
        let alertsData;
        try {
            const response = await fetch(CONFIG.apiEndpoint);
            if (!response.ok) throw new Error('API not available');
            alertsData = await response.json();
        } catch (apiError) {
            console.warn('API not available, using mock data:', apiError);
            alertsData = getMockAlerts();
        }
        
        alerts = alertsData;
        displayAlerts(alerts);
        updateMap(alerts);
        updateLastUpdate();
        
    } catch (error) {
        console.error('Error loading alerts:', error);
        showError('Failed to load alerts. Please try again.');
    } finally {
        refreshBtn.classList.remove('loading');
        refreshBtn.disabled = false;
    }
}

// Parse location from CFA alert message
function parseLocation(message) {
    // CFA messages typically contain location information
    // Common patterns: "AT LOCATION", "NR LOCATION", location names
    
    // Try to extract location between common keywords
    const patterns = [
        /(?:AT|at)\s+([A-Z][A-Za-z\s]+?)(?:\s+(?:VIC|Vic|VICTORIA|Victoria))/,
        /(?:NR|nr|NEAR|near)\s+([A-Z][A-Za-z\s]+?)(?:\s+(?:VIC|Vic|VICTORIA|Victoria))/,
        /(?:IN|in)\s+([A-Z][A-Za-z\s]+?)(?:\s+(?:VIC|Vic|VICTORIA|Victoria))/,
        /([A-Z][A-Za-z\s]+)\s+(?:VIC|VICTORIA)/i
    ];
    
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    
    // If no pattern matches, try to extract first capitalized word sequence
    const capitalizedMatch = message.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
    if (capitalizedMatch && capitalizedMatch[1]) {
        return capitalizedMatch[1];
    }
    
    return null;
}

// Geocode location using MapBox API
async function geocodeLocation(location) {
    if (!location) return null;
    
    try {
        const query = encodeURIComponent(`${location}, Victoria, Australia`);
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxgl.accessToken}&country=AU&limit=1`
        );
        
        if (!response.ok) throw new Error('Geocoding failed');
        
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            return {
                coordinates: feature.center,
                placeName: feature.place_name
            };
        }
        
        return null;
    } catch (error) {
        console.error('Geocoding error for', location, ':', error);
        return null;
    }
}

// Display alerts in the sidebar
function displayAlerts(alerts) {
    const alertsList = document.getElementById('alertsList');
    const alertCount = document.getElementById('alertCount');
    
    alertCount.textContent = alerts.length;
    
    if (alerts.length === 0) {
        alertsList.innerHTML = '<div class="no-alerts">No active alerts at this time</div>';
        return;
    }
    
    alertsList.innerHTML = alerts.map((alert, index) => `
        <div class="alert-item" data-alert-id="${index}" onclick="selectAlert(${index})">
            <div class="alert-location">${alert.location || 'Location Unknown'}</div>
            <div class="alert-message">${alert.message}</div>
            <div class="alert-time">${formatTime(alert.timestamp)}</div>
        </div>
    `).join('');
}

// Update map with alert markers
async function updateMap(alerts) {
    // Clear existing markers
    markers.forEach(marker => marker.remove());
    markers = [];
    
    // Add new markers
    for (let i = 0; i < alerts.length; i++) {
        const alert = alerts[i];
        
        if (!alert.coordinates) {
            // Try to geocode the location
            const location = parseLocation(alert.message);
            if (location) {
                const geocoded = await geocodeLocation(location);
                if (geocoded) {
                    alert.coordinates = geocoded.coordinates;
                    alert.location = location;
                }
            }
        }
        
        if (alert.coordinates) {
            const marker = new mapboxgl.Marker({ color: '#d32f2f' })
                .setLngLat(alert.coordinates)
                .setPopup(
                    new mapboxgl.Popup({ offset: 25 })
                        .setHTML(`
                            <div class="popup-location">${alert.location || 'Fire Alert'}</div>
                            <div class="popup-message">${alert.message}</div>
                            <div class="popup-time">${formatTime(alert.timestamp)}</div>
                        `)
                )
                .addTo(map);
            
            markers.push(marker);
            
            // Store index for selection
            marker.alertIndex = i;
        }
    }
    
    // Fit map to show all markers
    if (markers.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        markers.forEach(marker => {
            bounds.extend(marker.getLngLat());
        });
        map.fitBounds(bounds, { padding: 50, maxZoom: 12 });
    }
}

// Select an alert
function selectAlert(index) {
    selectedAlertId = index;
    
    // Update UI
    document.querySelectorAll('.alert-item').forEach((item, i) => {
        if (i === index) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    
    // Pan to marker and show popup
    if (markers[index]) {
        const marker = markers[index];
        map.flyTo({
            center: marker.getLngLat(),
            zoom: 12
        });
        marker.togglePopup();
    }
}

// Update last update timestamp
function updateLastUpdate() {
    const lastUpdate = document.getElementById('lastUpdate');
    lastUpdate.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
}

// Format timestamp
function formatTime(timestamp) {
    if (!timestamp) return 'Unknown time';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

// Show error message
function showError(message) {
    const alertsList = document.getElementById('alertsList');
    alertsList.innerHTML = `<div class="error-message">${message}</div>`;
}

// Mock data for testing when API is not available
function getMockAlerts() {
    return [
        {
            message: "GRASS FIRE AT BALLARAT VIC - Multiple units responding",
            timestamp: new Date().toISOString(),
            location: "Ballarat",
            coordinates: [143.8503, -37.5622]
        },
        {
            message: "STRUCTURE FIRE NR BENDIGO VICTORIA - CFA attending",
            timestamp: new Date(Date.now() - 600000).toISOString(),
            location: "Bendigo",
            coordinates: [144.2794, -36.7570]
        },
        {
            message: "VEHICLE FIRE AT GEELONG VIC - Emergency response",
            timestamp: new Date(Date.now() - 1200000).toISOString(),
            location: "Geelong",
            coordinates: [144.3631, -38.1499]
        }
    ];
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
