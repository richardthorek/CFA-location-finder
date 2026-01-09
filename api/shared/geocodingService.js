/**
 * Geocoding Service
 * Handles geocoding of locations using Mapbox API with caching to minimize API calls
 */

const fetch = require('node-fetch');
const { getEnrichedAlert, storeEnrichedAlert, normalizeLocationKey } = require('./storageService');

/**
 * Geocode a location using Mapbox API
 * Checks cache first, only calls Mapbox if location hasn't been geocoded before
 */
async function geocodeLocation(location, feedType = 'default', context = null) {
    if (!location) {
        return null;
    }
    
    // Create a normalized key for cache lookup
    const locationKey = normalizeLocationKey(location);
    
    if (!locationKey) {
        return null;
    }
    
    // Check cache first
    const cached = await getEnrichedAlert(feedType, locationKey);
    if (cached) {
        if (context) {
            context.log(`Using cached coordinates for ${location}`);
        }
        return {
            coordinates: cached.coordinates,
            placeName: cached.placeName
        };
    }
    
    // Not in cache, call Mapbox API
    const mapboxToken = process.env.MAPBOX_TOKEN;
    
    if (!mapboxToken) {
        console.error('MAPBOX_TOKEN not configured, cannot geocode');
        return null;
    }
    
    // Timeout for Mapbox API calls - 10 seconds is sufficient for geocoding requests
    // which are typically fast (<1s) but may be slow on network issues
    const MAPBOX_TIMEOUT_MS = 10000;
    
    try {
        const query = encodeURIComponent(`${location}, Victoria, Australia`);
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&country=AU&limit=1`;
        
        if (context) {
            context.log(`Geocoding ${location} via Mapbox API`);
        }
        
        const response = await fetch(url, {
            timeout: MAPBOX_TIMEOUT_MS
        });
        
        if (!response.ok) {
            throw new Error(`Mapbox API returned status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            const coordinates = feature.center;
            const placeName = feature.place_name;
            
            // Store in cache for future use
            await storeEnrichedAlert(feedType, locationKey, coordinates, placeName);
            
            if (context) {
                context.log(`Geocoded ${location} successfully: ${placeName}`);
            }
            
            return {
                coordinates: coordinates,
                placeName: placeName
            };
        }
        
        if (context) {
            context.log(`No geocoding results found for ${location}`);
        }
        return null;
        
    } catch (error) {
        console.error(`Geocoding error for ${location}:`, error.message);
        return null;
    }
}

/**
 * Enrich alerts with coordinates by geocoding their locations
 * Only geocodes locations that aren't already enriched in the cache
 */
async function enrichAlertsWithCoordinates(alerts, feedType, context = null) {
    if (!alerts || alerts.length === 0) {
        return alerts;
    }
    
    let geocodedCount = 0;
    let cachedCount = 0;
    let failedCount = 0;
    
    // Process alerts sequentially to avoid overwhelming Mapbox API
    for (const alert of alerts) {
        // Skip if already has coordinates (e.g., from Emergency VIC feed)
        if (alert.coordinates && alert.coordinates.length === 2) {
            continue;
        }
        
        // Try to get coordinates for the location
        if (alert.location) {
            const locationKey = normalizeLocationKey(alert.location);
            const cached = await getEnrichedAlert(feedType, locationKey);
            
            if (cached) {
                alert.coordinates = cached.coordinates;
                cachedCount++;
            } else {
                // Geocode the location
                const geocoded = await geocodeLocation(alert.location, feedType, context);
                if (geocoded) {
                    alert.coordinates = geocoded.coordinates;
                    geocodedCount++;
                } else {
                    failedCount++;
                }
            }
        }
    }
    
    if (context) {
        context.log(`Enrichment complete: ${geocodedCount} new geocoded, ${cachedCount} from cache, ${failedCount} failed`);
    }
    
    return alerts;
}

module.exports = {
    geocodeLocation,
    enrichAlertsWithCoordinates
};
