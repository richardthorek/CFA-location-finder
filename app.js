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
let userLocation = null;
let userMarker = null;
let autoZoomEnabled = true; // Track if auto-zoom is enabled
let alertToMarkerMap = new Map(); // Maps alert global index to marker

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
    
    // Toggle button for auto-zoom
    document.getElementById('locateBtn').addEventListener('click', () => {
        toggleAutoZoom();
    });
}

// Load alerts from the API
async function loadAlerts() {
    const refreshBtn = document.getElementById('refreshBtn');
    const refreshIcon = document.getElementById('refreshIcon');
    
    refreshBtn.classList.add('loading');
    refreshBtn.disabled = true;
    
    try {
        // Fetch from both CFA feed and Emergency feed
        let alertsData = [];
        
        // Fetch CFA alerts
        try {
            const response = await fetch(CONFIG.apiEndpoint);
            if (response.ok) {
                const cfaAlerts = await response.json();
                // Mark CFA alerts as such and set default warning level (create new objects)
                const processedCfaAlerts = cfaAlerts.map(alert => ({
                    ...alert,
                    source: 'CFA',
                    warningLevel: alert.warningLevel || 'advice'
                }));
                alertsData = alertsData.concat(processedCfaAlerts);
            }
        } catch (cfaError) {
            console.warn('CFA API not available:', cfaError);
        }
        
        // Fetch Emergency Victoria incidents
        try {
            const response = await fetch('/api/getEmergencyFeed');
            if (response.ok) {
                const emergencyIncidents = await response.json();
                // Mark emergency incidents as such (create new objects)
                const processedEmergencyIncidents = emergencyIncidents.map(incident => ({
                    ...incident,
                    source: 'Emergency'
                }));
                alertsData = alertsData.concat(processedEmergencyIncidents);
            }
        } catch (emergencyError) {
            console.warn('Emergency API not available:', emergencyError);
        }
        
        // If both APIs failed, use mock data
        if (alertsData.length === 0) {
            console.warn('Both APIs unavailable, using mock data');
            alertsData = getMockAlerts();
        }
        
        // Sort alerts by timestamp (most recent first)
        alertsData.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime() || 0;
            const timeB = new Date(b.timestamp).getTime() || 0;
            return timeB - timeA;
        });
        
        // Limit to 50 most recent alerts (increased to accommodate both feeds)
        alerts = alertsData.slice(0, 50);
        displayAlerts(alerts);
        updateMap(alerts);
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
        displayAlerts(alerts);
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
    if (!userLocation || alerts.length === 0) {
        return;
    }
    
    // Calculate distances for all alerts with coordinates
    alerts.forEach(alert => {
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
    
    // Filter alerts with coordinates and valid distances
    const alertsWithCoords = alerts.filter(alert => alert.coordinates && alert.distance !== undefined);
    
    // Sort by distance
    alertsWithCoords.sort((a, b) => a.distance - b.distance);
    
    // Limit to closest 10 alerts
    const filteredAlerts = alertsWithCoords.slice(0, 10);
    
    // Update display
    displayAlerts(filteredAlerts);
    
    // Update map to show only filtered alerts
    updateMap(filteredAlerts);
    
    // Fit map to show user location and all filtered alerts
    if (filteredAlerts.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([userLocation.lng, userLocation.lat]);
        
        filteredAlerts.forEach(alert => {
            if (alert.coordinates) {
                bounds.extend(alert.coordinates);
            }
        });
        
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

// Display route on map
async function displayRoute(alertIndex) {
    if (!userLocation || !alerts[alertIndex] || !alerts[alertIndex].coordinates) {
        return;
    }
    
    // Remove existing route layer if present
    if (map.getLayer('route')) {
        map.removeLayer('route');
    }
    if (map.getSource('route')) {
        map.removeSource('route');
    }
    
    const route = await getRoute(alerts[alertIndex].coordinates);
    
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
        
        // Update alert with road distance
        alerts[alertIndex].roadDistance = route.distance;
        alerts[alertIndex].roadDuration = route.duration;
        
        // Update the display to show road distance
        const alertItem = document.querySelector(`[data-alert-id="${alertIndex}"]`);
        if (alertItem) {
            const distanceEl = alertItem.querySelector('.alert-distance');
            if (distanceEl) {
                distanceEl.textContent = `📍 ${route.distance} km (${route.duration} min by road)`;
            }
        }
    }
}

// Display alerts in the sidebar
function displayAlerts(alertsToDisplay) {
    const alertsList = document.getElementById('alertsList');
    const alertCount = document.getElementById('alertCount');
    
    alertCount.textContent = alertsToDisplay.length;
    
    if (alertsToDisplay.length === 0) {
        const noAlertsMsg = userLocation ? 
            'No alerts found near you' : 
            'No active alerts at this time';
        alertsList.innerHTML = `<div class="no-alerts">${noAlertsMsg}</div>`;
        return;
    }
    
    alertsList.innerHTML = alertsToDisplay.map((alert) => {
        // Find the original index in the global alerts array
        const originalIndex = alerts.indexOf(alert);
        
        // Get warning level styling
        const warningLevel = alert.warningLevel || 'advice';
        const warningStyle = getWarningStyle(warningLevel);
        
        let distanceHtml = '';
        if (alert.distance !== undefined) {
            distanceHtml = `<div class="alert-distance">📍 ${alert.distance.toFixed(1)} km away (straight line)</div>`;
        }
        
        // Add incident name if available
        let incidentNameHtml = '';
        if (alert.incidentName) {
            incidentNameHtml = `<div class="alert-incident-name">${alert.incidentName}</div>`;
        }
        
        return `
            <div class="alert-item" data-alert-id="${originalIndex}" data-warning-level="${warningLevel}" onclick="selectAlert(${originalIndex})" style="border-left-color: ${warningStyle.color};">
                <div class="alert-warning-badge">${warningStyle.label}</div>
                <div class="alert-location" style="color: ${warningStyle.color};">${alert.location || 'Location Unknown'}</div>
                ${incidentNameHtml}
                <div class="alert-message">${alert.message}</div>
                <div class="alert-time">${formatTime(alert.timestamp)}</div>
                ${distanceHtml}
            </div>
        `;
    }).join('');
}

// Update map with alert markers
async function updateMap(alertsToShow) {
    // Clear existing markers and mapping
    markers.forEach(marker => marker.remove());
    markers = [];
    alertToMarkerMap.clear();
    
    // Add new markers
    for (let i = 0; i < alertsToShow.length; i++) {
        const alert = alertsToShow[i];
        
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
            // Find the global index of this alert in the main alerts array
            const globalIndex = alerts.indexOf(alert);
            
            // Determine warning level and get appropriate styling
            const warningLevel = alert.warningLevel || 'advice';
            const warningStyle = getWarningStyle(warningLevel);
            
            // Create custom marker element
            const markerEl = document.createElement('div');
            markerEl.className = 'custom-marker';
            markerEl.setAttribute('role', 'button');
            markerEl.setAttribute('aria-label', `Fire alert at ${alert.location || 'unknown location'}`);
            markerEl.setAttribute('data-alert-index', globalIndex);
            markerEl.setAttribute('data-warning-level', warningLevel);
            
            // Create marker icon
            const iconDiv = document.createElement('div');
            iconDiv.className = 'marker-icon';
            iconDiv.textContent = '🔥';
            iconDiv.setAttribute('aria-hidden', 'true');
            
            // Create marker info container
            const infoDiv = document.createElement('div');
            infoDiv.className = 'marker-info';
            infoDiv.style.borderColor = warningStyle.color;
            
            // Create location text (textContent automatically escapes HTML)
            const locationDiv = document.createElement('div');
            locationDiv.className = 'marker-location';
            locationDiv.style.color = warningStyle.color;
            locationDiv.textContent = alert.location || 'Unknown';
            
            // Assemble info container with location and optional incident name
            infoDiv.appendChild(locationDiv);
            
            // Create incident name in small font below location
            if (alert.incidentName) {
                const incidentNameDiv = document.createElement('div');
                incidentNameDiv.className = 'marker-incident-name';
                incidentNameDiv.textContent = alert.incidentName;
                infoDiv.appendChild(incidentNameDiv);
            }
            
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
                            <div class="popup-location">${alert.location || 'Fire Alert'}</div>
                            <div class="popup-message">${alert.message}</div>
                            <div class="popup-time">${formatTime(alert.timestamp)}</div>
                        `)
                )
                .addTo(map);
            
            markers.push(marker);
            
            // Store global index for selection - map alert's global index to this marker
            marker.alertIndex = globalIndex;
            alertToMarkerMap.set(globalIndex, marker);
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
function selectAlert(globalAlertIndex) {
    selectedAlertId = globalAlertIndex;
    
    // Find the marker corresponding to this alert using the map
    const marker = alertToMarkerMap.get(globalAlertIndex);
    
    // Early return if marker doesn't exist
    if (!marker) {
        console.warn(`No marker found for alert index ${globalAlertIndex}`);
        return;
    }
    
    // Update UI - find the card with this alert index and select it
    document.querySelectorAll('.alert-item').forEach((item) => {
        const itemAlertId = parseInt(item.getAttribute('data-alert-id'));
        if (itemAlertId === globalAlertIndex) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    
    // Clear any previous selection styling
    document.querySelectorAll('.custom-marker').forEach(m => {
        m.classList.remove('marker-selected');
    });
    
    // Add selection styling to the marker
    const markerEl = marker.getElement();
    if (markerEl) {
        markerEl.classList.add('marker-selected');
    }
    
    // Pan to marker and show popup
    map.flyTo({
        center: marker.getLngLat(),
        zoom: 12
    });
    
    // Open the popup if not already open
    if (!marker.getPopup().isOpen()) {
        marker.togglePopup();
    }
    
    // If user location is available, show route
    if (userLocation && alerts[globalAlertIndex] && alerts[globalAlertIndex].coordinates) {
        displayRoute(globalAlertIndex);
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
