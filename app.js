// Configuration - will be loaded from API
let CONFIG = {
    // Fallback values for local development without API
    mapboxToken: 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw',
    mapCenter: [144.9631, -37.8136],
    mapZoom: 7,
    apiEndpoint: '/api/getCFAFeed',
    refreshInterval: 60000
};

// State
let map;
let markers = [];
let alerts = [];
let selectedAlertId = null;
let refreshIntervalId = null;

// Load configuration from API
async function loadConfig() {
    try {
        const response = await fetch('/api/getConfig');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const config = await response.json();
        
        // Update CONFIG with values from API
        CONFIG = {
            ...CONFIG,
            ...config
        };
        
        console.log('Configuration loaded from API');
        return true;
    } catch (error) {
        console.warn('Failed to load configuration from API, using fallback values:', error);
        return false;
    }
}

// Initialize the application
async function init() {
    // Load configuration first
    await loadConfig();
    
    // Then initialize the rest of the app
    initMap();
    setupEventListeners();
    loadAlerts();
    startAutoRefresh();
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
// Note: The backend already extracts locations, but this provides a fallback
function parseLocation(message) {
    if (!message) return null;
    
    // Common non-location keywords to filter out
    const nonLocationKeywords = [
        'FIRE', 'GRASS', 'HOUSE', 'BATTERY', 'STRUCTURE', 'VEHICLE',
        'ALERT', 'SPREADING', 'INCIDENT', 'STRIKE', 'TEAM', 'CODE',
        'ALARM', 'SMOKE', 'COLUMN', 'DOWN', 'POWERLINES'
    ];
    const filterPattern = new RegExp(`^(${nonLocationKeywords.join('|')})\\b`);
    
    // Pattern 1: Address with street number before "/"
    // Example: "250 HEATHS RD HOPPERS CROSSING /"
    const streetMatch = message.match(/\b(\d+\s+[A-Z][A-Za-z\s-]+?)\s+([A-Z][A-Z\s]+?)\s+\//);
    if (streetMatch) {
        const suburb = streetMatch[2].trim().replace(/\s+[A-Z]\d*$/, '').trim();
        if (!suburb.match(filterPattern) && suburb.length >= 3) {
            return suburb;
        }
    }
    
    // Pattern 2: Road name without number
    // Example: "BENALLA-TOCUMWAL RD MUCKATAH"
    const roadMatch = message.match(/\b([A-Z][A-Za-z\s-]+?)\s+RD\s+([A-Z][A-Z\s]+?)(?:\s+\/|\s+SV[A-Z]+|\s+M\s+\d)/);
    if (roadMatch) {
        const suburb = roadMatch[2].trim();
        if (!suburb.match(filterPattern) && suburb.length >= 3) {
            return suburb;
        }
    }
    
    // Pattern 3: ASSEMBLE AT location
    const assembleMatch = message.match(/ASSEMBLE AT\s+[A-Z\s-]+?\s+(?:\d+\s+)?[A-Z][A-Za-z\s-]+?\s+([A-Z][A-Z\s]+?)\s+\//);
    if (assembleMatch) {
        const suburb = assembleMatch[1].trim();
        if (!suburb.match(filterPattern) && suburb.length >= 3) {
            return suburb;
        }
    }
    
    // Pattern 4: Extract suburb before regional codes (SV*, M <digit>)
    const suburbMatch = message.match(/\b([A-Z][A-Z\s]{4,30}?)\s+(?:SV[A-Z]+|M\s+\d)/);
    if (suburbMatch) {
        const suburb = suburbMatch[1].trim();
        const words = suburb.split(/\s+/);
        
        // Get the last few words that look like a suburb name
        for (let i = Math.max(0, words.length - 3); i < words.length; i++) {
            const candidate = words.slice(i).join(' ');
            if (!candidate.match(filterPattern) && candidate.length >= 4) {
                const cleaned = candidate.replace(/\s+[A-Z]\d*$/, '').trim();
                if (cleaned.length >= 4) {
                    return cleaned;
                }
            }
        }
    }
    
    // Pattern 5: Try to extract location with VIC/VICTORIA suffix (legacy support)
    const vicPattern = /\b([A-Z][A-Za-z\s]+?)\s+(?:VIC|VICTORIA)\b/i;
    const vicMatch = message.match(vicPattern);
    if (vicMatch && vicMatch[1]) {
        const location = vicMatch[1].trim();
        if (!location.match(filterPattern)) {
            return location;
        }
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

// Start auto-refresh at configured interval
function startAutoRefresh() {
    // Clear any existing interval
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
    }
    
    // Set up new interval to refresh alerts every minute
    refreshIntervalId = setInterval(() => {
        console.log('Auto-refreshing alerts...');
        loadAlerts();
    }, CONFIG.refreshInterval);
    
    console.log(`Auto-refresh enabled: updating every ${CONFIG.refreshInterval / 1000} seconds`);
}

// Stop auto-refresh (if needed for cleanup)
function stopAutoRefresh() {
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
        refreshIntervalId = null;
        console.log('Auto-refresh disabled');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
