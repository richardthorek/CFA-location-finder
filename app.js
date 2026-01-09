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
let cfaAlerts = []; // Primary feed: CFA pager alerts
let emergencyIncidents = []; // Secondary feed: Emergency Victoria incidents
let selectedAlertId = null;
let selectedFeedType = null; // Track which feed the selected alert is from ('cfa' or 'emergency')
let refreshIntervalId = null;
let userLocation = null;
let userMarker = null;
let autoZoomEnabled = true; // Track if auto-zoom is enabled
let alertToMarkerMap = new Map(); // Maps alert global index to marker

// Theme Management
function initTheme() {
    // Check for saved theme preference or default to light mode
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeButton(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeButton(newTheme);
    
    // Update map style for dark/light mode
    if (map) {
        const mapStyle = newTheme === 'dark' 
            ? 'mapbox://styles/mapbox/dark-v11' 
            : 'mapbox://styles/mapbox/streets-v11';
        map.setStyle(mapStyle);
        
        // Re-add markers after style change
        setTimeout(() => {
            updateMapWithSeparateFeeds();
        }, 1000);
    }
}

function updateThemeButton(theme) {
    const themeIcon = document.getElementById('themeIcon');
    const themeToggle = document.getElementById('themeToggle');
    
    if (theme === 'dark') {
        themeIcon.textContent = '☀️';
        themeToggle.setAttribute('aria-label', 'Switch to light mode');
        const span = themeToggle.querySelector('span:last-child');
        if (span) span.textContent = 'Light Mode';
    } else {
        themeIcon.textContent = '🌙';
        themeToggle.setAttribute('aria-label', 'Switch to dark mode');
        const span = themeToggle.querySelector('span:last-child');
        if (span) span.textContent = 'Dark Mode';
    }
}

/**
 * Get warning level styling based on Australian Warning System official colors
 * Uses official National Framework hazard colors and design guidelines
 * @param {string} warningLevel - 'advice', 'watchAndAct', or 'emergency'
 * @returns {object} Style object with color, label, and icon
 */
function getWarningStyle(warningLevel) {
    const styles = {
        advice: {
            color: '#FBE032',  // Official Hazard Yellow (C 3 M 7 Y 91 K 0)
            textColor: '#000000',  // Black for yellow tier
            label: 'Advice',
            icon: '🔥'
        },
        watchAndAct: {
            color: '#FF7900',  // Official Hazard Orange (C 0 M 65 Y 100 K 0)
            textColor: '#000000',  // Black for orange tier
            label: 'Watch and Act',
            icon: '🔥'
        },
        emergency: {
            color: '#D6001C',  // Official Hazard Red (C 9 M 100 Y 100 K 2)
            textColor: '#FFFFFF',  // White for red tier
            label: 'Emergency Warning',
            icon: '🔥'
        }
    };
    
    return styles[warningLevel] || styles.advice;
}

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
    // Initialize theme first
    initTheme();
    
    // Load configuration first
    await loadConfig();
    
    // Then initialize the rest of the app
    initMap();
    setupEventListeners();
    loadAlerts();
    startAutoRefresh();
    
    // Automatically detect user location on startup
    getUserLocation();
}

// Initialize MapBox map
function initMap() {
    mapboxgl.accessToken = CONFIG.mapboxToken;
    
    // Use dark or light style based on current theme
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const mapStyle = currentTheme === 'dark' 
        ? 'mapbox://styles/mapbox/dark-v11' 
        : 'mapbox://styles/mapbox/streets-v11';
    
    map = new mapboxgl.Map({
        container: 'map',
        style: mapStyle,
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
    
    // Toggle button for auto-zoom
    document.getElementById('locateBtn').addEventListener('click', () => {
        toggleAutoZoom();
    });
    
    // Theme toggle button
    document.getElementById('themeToggle').addEventListener('click', () => {
        toggleTheme();
    });
    
    // Keyboard navigation for alert cards
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Clear selection on Escape
            document.querySelectorAll('.alert-item').forEach(item => {
                item.classList.remove('selected');
            });
            document.querySelectorAll('.custom-marker').forEach(marker => {
                marker.classList.remove('marker-selected');
            });
        }
    });
}

// Load alerts from the API
async function loadAlerts() {
    const refreshBtn = document.getElementById('refreshBtn');
    const refreshIcon = document.getElementById('refreshIcon');
    
    refreshBtn.classList.add('loading');
    refreshBtn.disabled = true;
    
    try {
        // Fetch CFA alerts (Primary feed)
        try {
            const response = await fetch(CONFIG.apiEndpoint);
            if (response.ok) {
                const cfaAlertsData = await response.json();
                // Process CFA alerts - these don't have warning levels, just pager alerts
                cfaAlerts = cfaAlertsData.map(alert => ({
                    ...alert,
                    source: 'CFA'
                }));
                
                // Sort by timestamp (most recent first)
                cfaAlerts.sort((a, b) => {
                    const timeA = new Date(a.timestamp).getTime() || 0;
                    const timeB = new Date(b.timestamp).getTime() || 0;
                    return timeB - timeA;
                });
                
                // Limit to 30 most recent CFA alerts
                cfaAlerts = cfaAlerts.slice(0, 30);
            }
        } catch (cfaError) {
            console.warn('CFA API not available:', cfaError);
            cfaAlerts = [];
        }
        
        // Fetch Emergency Victoria incidents (Secondary feed)
        try {
            const response = await fetch('/api/getEmergencyFeed');
            if (response.ok) {
                const emergencyIncidentsData = await response.json();
                // Process Emergency incidents - these have warning levels
                emergencyIncidents = emergencyIncidentsData.map(incident => ({
                    ...incident,
                    source: 'Emergency'
                }));
                
                // Sort by timestamp (most recent first)
                emergencyIncidents.sort((a, b) => {
                    const timeA = new Date(a.timestamp).getTime() || 0;
                    const timeB = new Date(b.timestamp).getTime() || 0;
                    return timeB - timeA;
                });
                
                // Limit to 20 most recent Emergency incidents
                emergencyIncidents = emergencyIncidents.slice(0, 20);
            }
        } catch (emergencyError) {
            console.warn('Emergency API not available:', emergencyError);
            emergencyIncidents = [];
        }
        
        // If both APIs failed, use mock data
        if (cfaAlerts.length === 0 && emergencyIncidents.length === 0) {
            console.warn('Both APIs unavailable, using mock data');
            const mockData = getMockAlerts();
            cfaAlerts = mockData;
            emergencyIncidents = [];
        }
        
        displaySeparateFeeds();
        updateMapWithSeparateFeeds();
        updateLastUpdate();
        
        // Re-apply auto-zoom if enabled and user location is available
        if (autoZoomEnabled && userLocation) {
            filterAndUpdateAlerts();
        }
        
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
    
    // Constants for location extraction (match backend)
    const MIN_SUBURB_LENGTH = 3;
    const MIN_SUBURB_CHARS = 4;
    const MAX_SUBURB_CHARS = 30;
    
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
        if (!suburb.match(filterPattern) && suburb.length >= MIN_SUBURB_LENGTH) {
            return suburb;
        }
    }
    
    // Pattern 2: Road name without number
    // Example: "BENALLA-TOCUMWAL RD MUCKATAH"
    const roadMatch = message.match(/\b([A-Z][A-Za-z\s-]+?)\s+RD\s+([A-Z][A-Z\s]+?)(?:\s+\/|\s+SV[A-Z]+|\s+M\s+\d)/);
    if (roadMatch) {
        const suburb = roadMatch[2].trim();
        if (!suburb.match(filterPattern) && suburb.length >= MIN_SUBURB_LENGTH) {
            return suburb;
        }
    }
    
    // Pattern 3: ASSEMBLE AT location
    const assembleMatch = message.match(/ASSEMBLE AT\s+[A-Z\s-]+?\s+(?:\d+\s+)?[A-Z][A-Za-z\s-]+?\s+([A-Z][A-Z\s]+?)\s+\//);
    if (assembleMatch) {
        const suburb = assembleMatch[1].trim();
        if (!suburb.match(filterPattern) && suburb.length >= MIN_SUBURB_LENGTH) {
            return suburb;
        }
    }
    
    // Pattern 4: Extract suburb before regional codes (SV*, M <digit>)
    const suburbMatch = message.match(new RegExp(`\\b([A-Z][A-Z\\s]{${MIN_SUBURB_CHARS},${MAX_SUBURB_CHARS}}?)\\s+(?:SV[A-Z]+|M\\s+\\d)`));
    if (suburbMatch) {
        const suburb = suburbMatch[1].trim();
        const words = suburb.split(/\s+/);
        
        // Get the last few words that look like a suburb name
        for (let i = Math.max(0, words.length - 3); i < words.length; i++) {
            const candidate = words.slice(i).join(' ');
            if (!candidate.match(filterPattern) && candidate.length >= MIN_SUBURB_CHARS) {
                const cleaned = candidate.replace(/\s+[A-Z]\d*$/, '').trim();
                if (cleaned.length >= MIN_SUBURB_CHARS) {
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

// Get user's current location
function getUserLocation() {
    const locateBtn = document.getElementById('locateBtn');
    const locateIcon = document.getElementById('locateIcon');
    
    if (!navigator.geolocation) {
        console.warn('Geolocation is not supported by your browser');
        // Disable button and update appearance
        locateBtn.disabled = true;
        locateIcon.textContent = '❌';
        autoZoomEnabled = false;
        return;
    }
    
    // Show loading state
    updateLocateButton();
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            userLocation = {
                lng: position.coords.longitude,
                lat: position.coords.latitude
            };
            
            // Add or update user marker with pulsing blue dot
            if (userMarker) {
                userMarker.setLngLat([userLocation.lng, userLocation.lat]);
            } else {
                // Create custom HTML element for pulsing marker
                const markerElement = document.createElement('div');
                markerElement.className = 'user-location-marker';
                
                const pulse = document.createElement('div');
                pulse.className = 'user-location-pulse';
                
                const dot = document.createElement('div');
                dot.className = 'user-location-dot';
                
                markerElement.appendChild(pulse);
                markerElement.appendChild(dot);
                
                userMarker = new mapboxgl.Marker({ element: markerElement })
                    .setLngLat([userLocation.lng, userLocation.lat])
                    .setPopup(
                        new mapboxgl.Popup({ offset: 25 })
                            .setHTML('<div class="popup-location">Your Location</div>')
                    )
                    .addTo(map);
            }
            
            // Apply auto-zoom if enabled
            if (autoZoomEnabled) {
                // Center map on user location and zoom to 100km view
                map.flyTo({
                    center: [userLocation.lng, userLocation.lat],
                    zoom: 9 // Approximately 100km radius view
                });
                
                // Filter and update alerts within 100km
                filterAndUpdateAlerts();
            }
            
            // Update button to show auto-zoom is enabled
            updateLocateButton();
        },
        (error) => {
            console.error('Error getting location:', error);
            let errorMsg = 'Unable to get your location. ';
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg += 'Please enable location access in your browser.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg += 'Location information is unavailable.';
                    break;
                case error.TIMEOUT:
                    errorMsg += 'Location request timed out.';
                    break;
                default:
                    errorMsg += 'An unknown error occurred.';
            }
            
            console.warn(errorMsg);
            // Disable auto-zoom if location can't be obtained
            autoZoomEnabled = false;
            updateLocateButton();
        }
    );
}

// Toggle auto-zoom feature
function toggleAutoZoom() {
    autoZoomEnabled = !autoZoomEnabled;
    updateLocateButton();
    
    if (autoZoomEnabled && userLocation) {
        // Re-apply auto-zoom
        map.flyTo({
            center: [userLocation.lng, userLocation.lat],
            zoom: 9
        });
        filterAndUpdateAlerts();
    } else if (!autoZoomEnabled) {
        // Show all alerts without filtering
        displaySeparateFeeds();
    }
}

// Update the locate button text and style based on auto-zoom state
function updateLocateButton() {
    const locateBtn = document.getElementById('locateBtn');
    const locateIcon = document.getElementById('locateIcon');
    
    // If location hasn't been obtained yet, show waiting state
    if (!userLocation) {
        locateIcon.textContent = '⏳';
        locateBtn.classList.add('btn-locate-disabled');
        locateBtn.title = 'Detecting location...';
        locateBtn.disabled = true;
        return;
    }
    
    // Location obtained - enable button and show toggle state
    locateBtn.disabled = false;
    
    if (autoZoomEnabled) {
        locateIcon.textContent = '📍';
        locateBtn.classList.remove('btn-locate-disabled');
        locateBtn.title = 'Click to disable auto-zoom';
    } else {
        locateIcon.textContent = '📌';
        locateBtn.classList.add('btn-locate-disabled');
        locateBtn.title = 'Click to enable auto-zoom';
    }
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
}

// Filter alerts within 100km and calculate distances
function filterAndUpdateAlerts() {
    if (!userLocation || (cfaAlerts.length === 0 && emergencyIncidents.length === 0)) {
        return;
    }
    
    // Calculate distances for CFA alerts
    cfaAlerts.forEach(alert => {
        if (alert.coordinates) {
            const distance = calculateDistance(
                userLocation.lat,
                userLocation.lng,
                alert.coordinates[1],
                alert.coordinates[0]
            );
            alert.distance = distance;
        }
    });
    
    // Calculate distances for Emergency incidents
    emergencyIncidents.forEach(incident => {
        if (incident.coordinates) {
            const distance = calculateDistance(
                userLocation.lat,
                userLocation.lng,
                incident.coordinates[1],
                incident.coordinates[0]
            );
            incident.distance = distance;
        }
    });
    
    // Filter alerts with coordinates and valid distances (keep feeds separate)
    const cfaAlertsFiltered = cfaAlerts.filter(alert => alert.coordinates && alert.distance !== undefined)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10); // Top 10 closest CFA alerts
    
    const emergencyIncidentsFiltered = emergencyIncidents.filter(incident => incident.coordinates && incident.distance !== undefined)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10); // Top 10 closest Emergency incidents
    
    // Update display with filtered feeds
    displayCFAAlerts(cfaAlertsFiltered);
    displayEmergencyIncidents(emergencyIncidentsFiltered);
    
    // Update map bounds to show user location and filtered items
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([userLocation.lng, userLocation.lat]);
    
    cfaAlertsFiltered.forEach(alert => {
        if (alert.coordinates) {
            bounds.extend(alert.coordinates);
        }
    });
    
    emergencyIncidentsFiltered.forEach(incident => {
        if (incident.coordinates) {
            bounds.extend(incident.coordinates);
        }
    });
    
    if (cfaAlertsFiltered.length > 0 || emergencyIncidentsFiltered.length > 0) {
        map.fitBounds(bounds, { padding: 50, maxZoom: 12 });
    }
}

// Get route from user to alert location
async function getRoute(alertCoordinates) {
    if (!userLocation) {
        return null;
    }
    
    try {
        const query = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${userLocation.lng},${userLocation.lat};${alertCoordinates[0]},${alertCoordinates[1]}?geometries=geojson&access_token=${mapboxgl.accessToken}`,
            { method: 'GET' }
        );
        
        const json = await query.json();
        
        if (json.routes && json.routes.length > 0) {
            const data = json.routes[0];
            return {
                geometry: data.geometry,
                distance: (data.distance / 1000).toFixed(1), // Convert to km
                duration: Math.round(data.duration / 60) // Convert to minutes
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error fetching route:', error);
        return null;
    }
}

// Display CFA and Emergency feeds separately
function displaySeparateFeeds() {
    displayCFAAlerts(cfaAlerts);
    displayEmergencyIncidents(emergencyIncidents);
}

// Display CFA pager alerts with pager icon
function displayCFAAlerts(alertsToDisplay) {
    const alertsList = document.getElementById('cfaAlertsList');
    const alertCount = document.getElementById('cfaAlertCount');
    
    alertCount.textContent = alertsToDisplay.length;
    
    if (alertsToDisplay.length === 0) {
        const noAlertsMsg = 'No CFA pager alerts at this time';
        alertsList.innerHTML = `<div class="no-alerts" role="status">${noAlertsMsg}</div>`;
        return;
    }
    
    alertsList.innerHTML = alertsToDisplay.map((alert, index) => {
        let distanceHtml = '';
        if (alert.distance !== undefined) {
            distanceHtml = `<div class="alert-distance">📍 ${alert.distance.toFixed(1)} km away</div>`;
        }
        
        return `
            <div class="alert-item cfa-alert" 
                 data-alert-id="${index}" 
                 data-feed-type="cfa" 
                 onclick="selectCFAAlert(${index})"
                 role="listitem"
                 tabindex="0"
                 onkeypress="if(event.key==='Enter'||event.key===' '){selectCFAAlert(${index})}"
                 aria-label="CFA alert at ${alert.location || 'unknown location'}">
                <div class="alert-icon pager-icon" aria-hidden="true">📟</div>
                <div class="alert-content">
                    <div class="alert-location">${alert.location || 'Location Unknown'}</div>
                    <div class="alert-message">${alert.message}</div>
                    <div class="alert-time">${formatTime(alert.timestamp)}</div>
                    ${distanceHtml}
                </div>
            </div>
        `;
    }).join('');
}

// Display Emergency Victoria incidents with colored AWS triangles
function displayEmergencyIncidents(incidentsToDisplay) {
    const incidentsList = document.getElementById('emergencyIncidentsList');
    const incidentCount = document.getElementById('emergencyIncidentCount');
    
    incidentCount.textContent = incidentsToDisplay.length;
    
    if (incidentsToDisplay.length === 0) {
        const noIncidentsMsg = 'No Emergency incidents at this time';
        incidentsList.innerHTML = `<div class="no-alerts">${noIncidentsMsg}</div>`;
        return;
    }
    
    incidentsList.innerHTML = incidentsToDisplay.map((incident, index) => {
        // Get warning level styling
        const warningLevel = incident.warningLevel || 'advice';
        const warningStyle = getWarningStyle(warningLevel);
        
        let distanceHtml = '';
        if (incident.distance !== undefined) {
            distanceHtml = `<div class="alert-distance">📍 ${incident.distance.toFixed(1)} km away</div>`;
        }
        
        // Add incident name if available
        let incidentNameHtml = '';
        if (incident.incidentName) {
            incidentNameHtml = `<div class="alert-incident-name">${incident.incidentName}</div>`;
        }
        
        // Add source badge
        const sourceLabel = incident.source === 'NSW' ? 'NSW' : 'VIC';
        const sourceBadge = `<span class="source-badge source-${sourceLabel.toLowerCase()}">${sourceLabel}</span>`;
        
        return `
            <div class="alert-item emergency-incident" 
                 data-alert-id="${index}" 
                 data-feed-type="emergency" 
                 data-warning-level="${warningLevel}" 
                 onclick="selectEmergencyIncident(${index})"
                 role="listitem"
                 tabindex="0"
                 onkeypress="if(event.key==='Enter'||event.key===' '){selectEmergencyIncident(${index})}"
                 aria-label="Emergency incident, ${warningStyle.label}, at ${incident.location || 'unknown location'}"
                 style="border-left-color: ${warningStyle.color};">
                <div class="alert-icon triangle-icon" style="color: ${warningStyle.color};" aria-hidden="true">▲</div>
                <div class="alert-content">
                    <div class="alert-warning-badge">${warningStyle.label} ${sourceBadge}</div>
                    <div class="alert-location" style="color: ${warningStyle.color};">${incident.location || 'Location Unknown'}</div>
                    ${incidentNameHtml}
                    <div class="alert-message">${incident.message}</div>
                    <div class="alert-time">${formatTime(incident.timestamp)}</div>
                    ${distanceHtml}
                </div>
            </div>
        `;
    }).join('');
}

// Select a CFA alert
function selectCFAAlert(index) {
    selectedAlertId = index;
    selectedFeedType = 'cfa';
    
    const alert = cfaAlerts[index];
    if (!alert) return;
    
    // Find the marker
    const marker = alertToMarkerMap.get(`cfa-${index}`);
    if (!marker) {
        console.warn(`No marker found for CFA alert index ${index}`);
        return;
    }
    
    // Update UI selection
    document.querySelectorAll('.alert-item').forEach((item) => {
        item.classList.remove('selected');
    });
    document.querySelector(`.cfa-alert[data-alert-id="${index}"]`)?.classList.add('selected');
    
    // Clear previous marker selection
    document.querySelectorAll('.custom-marker').forEach(m => {
        m.classList.remove('marker-selected');
    });
    
    // Add selection to marker
    const markerEl = marker.getElement();
    if (markerEl) {
        markerEl.classList.add('marker-selected');
    }
    
    // Pan to marker and show popup
    map.flyTo({
        center: marker.getLngLat(),
        zoom: 12
    });
    
    if (!marker.getPopup().isOpen()) {
        marker.togglePopup();
    }
    
    // Show route if user location available
    if (userLocation && alert.coordinates) {
        displayRouteForAlert(alert);
    }
}

// Select an Emergency incident
function selectEmergencyIncident(index) {
    selectedAlertId = index;
    selectedFeedType = 'emergency';
    
    const incident = emergencyIncidents[index];
    if (!incident) return;
    
    // Find the marker
    const marker = alertToMarkerMap.get(`emergency-${index}`);
    if (!marker) {
        console.warn(`No marker found for Emergency incident index ${index}`);
        return;
    }
    
    // Update UI selection
    document.querySelectorAll('.alert-item').forEach((item) => {
        item.classList.remove('selected');
    });
    document.querySelector(`.emergency-incident[data-alert-id="${index}"]`)?.classList.add('selected');
    
    // Clear previous marker selection
    document.querySelectorAll('.custom-marker').forEach(m => {
        m.classList.remove('marker-selected');
    });
    
    // Add selection to marker
    const markerEl = marker.getElement();
    if (markerEl) {
        markerEl.classList.add('marker-selected');
    }
    
    // Pan to marker and show popup
    map.flyTo({
        center: marker.getLngLat(),
        zoom: 12
    });
    
    if (!marker.getPopup().isOpen()) {
        marker.togglePopup();
    }
    
    // Show route if user location available
    if (userLocation && incident.coordinates) {
        displayRouteForAlert(incident);
    }
}

// Display route for a specific alert (helper function)
async function displayRouteForAlert(alert) {
    if (!userLocation || !alert.coordinates) {
        return;
    }
    
    // Remove existing route layer if present
    if (map.getLayer('route')) {
        map.removeLayer('route');
    }
    if (map.getSource('route')) {
        map.removeSource('route');
    }
    
    const route = await getRoute(alert.coordinates);
    
    if (route) {
        // Add route layer
        map.addLayer({
            id: 'route',
            type: 'line',
            source: {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: {},
                    geometry: route.geometry
                }
            },
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#1976d2',
                'line-width': 3,
                'line-opacity': 0.6
            }
        });
    }
}

// Update map with separate feeds
async function updateMapWithSeparateFeeds() {
    // Clear existing markers and mapping
    markers.forEach(marker => marker.remove());
    markers = [];
    alertToMarkerMap.clear();
    
    // Add CFA alert markers with pager icon
    for (let i = 0; i < cfaAlerts.length; i++) {
        const alert = cfaAlerts[i];
        
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
            // Create custom marker element with pager icon
            const markerEl = document.createElement('div');
            markerEl.className = 'custom-marker cfa-marker';
            markerEl.setAttribute('role', 'button');
            markerEl.setAttribute('aria-label', `CFA alert at ${alert.location || 'unknown location'}`);
            markerEl.setAttribute('data-alert-index', `cfa-${i}`);
            
            // Create marker icon (pager icon)
            const iconDiv = document.createElement('div');
            iconDiv.className = 'marker-icon';
            iconDiv.textContent = '📟';
            iconDiv.setAttribute('aria-hidden', 'true');
            
            // Create marker info container
            const infoDiv = document.createElement('div');
            infoDiv.className = 'marker-info';
            infoDiv.style.borderColor = '#2196F3'; // Blue for CFA
            
            // Create location text
            const locationDiv = document.createElement('div');
            locationDiv.className = 'marker-location';
            locationDiv.style.color = '#2196F3';
            locationDiv.textContent = alert.location || 'Unknown';
            
            infoDiv.appendChild(locationDiv);
            
            // Create and add time text
            const timeDiv = document.createElement('div');
            timeDiv.className = 'marker-time';
            timeDiv.textContent = formatTime(alert.timestamp);
            infoDiv.appendChild(timeDiv);
            
            // Assemble the marker element
            markerEl.appendChild(iconDiv);
            markerEl.appendChild(infoDiv);
            
            const marker = new mapboxgl.Marker({ element: markerEl })
                .setLngLat(alert.coordinates)
                .setPopup(
                    new mapboxgl.Popup({ offset: 25 })
                        .setHTML(`
                            <div class="popup-type">📟 CFA Alert</div>
                            <div class="popup-location">${alert.location || 'Location Unknown'}</div>
                            <div class="popup-message">${alert.message}</div>
                            <div class="popup-time">${formatTime(alert.timestamp)}</div>
                        `)
                )
                .addTo(map);
            
            markers.push(marker);
            alertToMarkerMap.set(`cfa-${i}`, marker);
        }
    }
    
    // Add Emergency incident markers with colored triangles
    for (let i = 0; i < emergencyIncidents.length; i++) {
        const incident = emergencyIncidents[i];
        
        if (incident.coordinates) {
            // Determine warning level and get appropriate styling
            const warningLevel = incident.warningLevel || 'advice';
            const warningStyle = getWarningStyle(warningLevel);
            
            // Create custom marker element with triangle icon
            const markerEl = document.createElement('div');
            markerEl.className = 'custom-marker emergency-marker';
            markerEl.setAttribute('role', 'button');
            markerEl.setAttribute('aria-label', `Emergency incident at ${incident.location || 'unknown location'}`);
            markerEl.setAttribute('data-alert-index', `emergency-${i}`);
            markerEl.setAttribute('data-warning-level', warningLevel);
            
            // Create marker icon (triangle icon with warning color)
            const iconDiv = document.createElement('div');
            iconDiv.className = 'marker-icon triangle-marker';
            iconDiv.textContent = '▲';
            iconDiv.style.color = warningStyle.color;
            iconDiv.setAttribute('aria-hidden', 'true');
            
            // Create marker info container
            const infoDiv = document.createElement('div');
            infoDiv.className = 'marker-info';
            infoDiv.style.borderColor = warningStyle.color;
            
            // Create location text
            const locationDiv = document.createElement('div');
            locationDiv.className = 'marker-location';
            locationDiv.style.color = warningStyle.color;
            locationDiv.textContent = incident.location || 'Unknown';
            
            infoDiv.appendChild(locationDiv);
            
            // Add incident name if available
            if (incident.incidentName) {
                const incidentNameDiv = document.createElement('div');
                incidentNameDiv.className = 'marker-incident-name';
                incidentNameDiv.textContent = incident.incidentName;
                infoDiv.appendChild(incidentNameDiv);
            }
            
            // Create and add time text
            const timeDiv = document.createElement('div');
            timeDiv.className = 'marker-time';
            timeDiv.textContent = formatTime(incident.timestamp);
            infoDiv.appendChild(timeDiv);
            
            // Assemble the marker element
            markerEl.appendChild(iconDiv);
            markerEl.appendChild(infoDiv);
            
            const marker = new mapboxgl.Marker({ element: markerEl })
                .setLngLat(incident.coordinates)
                .setPopup(
                    new mapboxgl.Popup({ offset: 25 })
                        .setHTML(`
                            <div class="popup-warning" style="background-color: ${warningStyle.color}; color: ${warningStyle.textColor};">${warningStyle.label}</div>
                            <div class="popup-location">${incident.location || 'Location Unknown'}</div>
                            ${incident.incidentName ? `<div class="popup-incident-name">${incident.incidentName}</div>` : ''}
                            <div class="popup-message">${incident.message}</div>
                            <div class="popup-time">${formatTime(incident.timestamp)}</div>
                            <div class="popup-source">Source: ${incident.source === 'NSW' ? 'NSW RFS' : 'Emergency VIC'}</div>
                        `)
                )
                .addTo(map);
            
            markers.push(marker);
            alertToMarkerMap.set(`emergency-${i}`, marker);
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

// Update last update timestamp
function updateLastUpdate() {
    const lastUpdate = document.getElementById('lastUpdate');
    lastUpdate.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
}

// Format timestamp
function formatTime(timestamp) {
    if (!timestamp) return 'Unknown time';
    const date = new Date(timestamp);
    // Check if date is valid
    if (isNaN(date.getTime())) return 'Unknown time';
    return date.toLocaleString();
}

// Show error message
function showError(message) {
    // Show error in both feed sections
    const cfaAlertsList = document.getElementById('cfaAlertsList');
    const emergencyIncidentsList = document.getElementById('emergencyIncidentsList');
    
    const errorHtml = `<div class="error-message">${message}</div>`;
    
    if (cfaAlertsList) {
        cfaAlertsList.innerHTML = errorHtml;
    }
    if (emergencyIncidentsList) {
        emergencyIncidentsList.innerHTML = errorHtml;
    }
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
