const fetch = require('node-fetch');
const { TableClient } = require('@azure/data-tables');

// Get configuration from environment variables
const STORAGE_STRING = process.env.STORAGE_STRING;
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
const CFA_FEED_URL = process.env.CFA_FEED_URL || 'https://www.mazzanet.net.au/cfa/pager-cfa.php';

/**
 * Timer-triggered Azure Function to fetch CFA feed, enrich with geocoding, and store in Table Storage
 * Runs every 10 minutes to minimize API calls while keeping data fresh
 */
module.exports = async function (context, myTimer) {
    context.log('Fetch and Store CFA data function triggered');

    // Check if storage connection string is configured
    if (!STORAGE_STRING) {
        context.log.error('STORAGE_STRING environment variable is not configured');
        return;
    }

    if (!MAPBOX_TOKEN) {
        context.log.error('MAPBOX_TOKEN environment variable is not configured');
        return;
    }

    try {
        // Create table client
        const tableClient = TableClient.fromConnectionString(STORAGE_STRING, 'CFAAlerts');
        
        // Ensure table exists
        try {
            await tableClient.createTable();
            context.log('Table created successfully');
        } catch (err) {
            // Table already exists - this is expected and fine
            if (err.statusCode === 409) {
                context.log('Table already exists');
            } else {
                context.log.warn('Table creation check returned unexpected error:', err.message);
            }
        }

        // Fetch the CFA feed
        context.log('Fetching CFA feed from:', CFA_FEED_URL);
        const response = await fetch(CFA_FEED_URL, {
            headers: {
                'User-Agent': 'CFA-Location-Finder/1.0'
            },
            timeout: 10000
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const feedText = await response.text();
        
        // Parse the feed
        const alerts = parseCFAFeed(feedText);
        context.log(`Parsed ${alerts.length} alerts from feed`);

        // Enrich alerts with geocoding
        let enrichedCount = 0;
        const fetchTime = new Date();
        
        for (const alert of alerts) {
            // Generate a unique row key based on incident ID and timestamp
            const rowKey = alert.incidentId || generateRowKey(alert);
            
            // Check if this alert already exists in storage with coordinates
            let shouldGeocode = true;
            try {
                const existingEntity = await tableClient.getEntity('alert', rowKey);
                
                // If it exists and has coordinates, skip geocoding
                if (existingEntity.coordinates) {
                    context.log(`Alert ${rowKey} already exists with coordinates, skipping`);
                    shouldGeocode = false;
                }
            } catch (err) {
                // Entity doesn't exist (404 error) or other error - we'll create/update it
                if (err.statusCode !== 404) {
                    context.log.warn(`Unexpected error checking entity ${rowKey}:`, err.message);
                }
            }

            // Geocode the location if we need to
            if (shouldGeocode && alert.location) {
                context.log(`Geocoding location: ${alert.location}`);
                const geocoded = await geocodeLocation(alert.location, MAPBOX_TOKEN, context);
                
                if (geocoded) {
                    alert.coordinates = geocoded.coordinates;
                    alert.placeName = geocoded.placeName;
                    enrichedCount++;
                    
                    // Add a small delay to avoid hitting rate limits
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // Store in table storage only if we geocoded or if it's new
            if (shouldGeocode) {
                const entity = {
                    partitionKey: 'alert',
                    rowKey: rowKey,
                    message: alert.message,
                    timestamp: alert.timestamp,
                    location: alert.location || '',
                    coordinates: alert.coordinates ? JSON.stringify(alert.coordinates) : '',
                    placeName: alert.placeName || '',
                    incidentId: alert.incidentId || '',
                    capcode: alert.capcode || '',
                    fetchedAt: fetchTime.toISOString()
                };

                try {
                    await tableClient.upsertEntity(entity);
                    context.log(`Stored alert: ${rowKey}`);
                } catch (err) {
                    context.log.error(`Error storing alert ${rowKey}:`, err.message);
                }
            }
        }

        // Store metadata about this fetch
        const metadataEntity = {
            partitionKey: 'metadata',
            rowKey: 'lastFetch',
            fetchTime: fetchTime.toISOString(),
            alertCount: alerts.length,
            enrichedCount: enrichedCount
        };
        
        await tableClient.upsertEntity(metadataEntity);

        context.log(`Successfully processed ${alerts.length} alerts, enriched ${enrichedCount} new locations`);

    } catch (error) {
        context.log.error('Error in fetch and store function:', error);
        throw error;
    }
};

/**
 * Generate a unique row key for an alert
 */
function generateRowKey(alert) {
    // Use timestamp + capcode + hash of message for uniqueness
    const timestamp = new Date(alert.timestamp).getTime();
    const capcodePart = alert.capcode ? `_${alert.capcode.replace(/[^a-zA-Z0-9]/g, '')}` : '';
    const messageHash = simpleHash(alert.message);
    return `${timestamp}${capcodePart}_${messageHash}`;
}

/**
 * Simple hash function for strings
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Geocode location using MapBox API
 */
async function geocodeLocation(location, mapboxToken, context) {
    if (!location) return null;
    
    try {
        const query = encodeURIComponent(`${location}, Victoria, Australia`);
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&country=AU&limit=1`,
            { timeout: 5000 }
        );
        
        if (!response.ok) {
            context.log.warn(`Geocoding failed for ${location}: ${response.status}`);
            return null;
        }
        
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
        context.log.error('Geocoding error for', location, ':', error.message);
        return null;
    }
}

/**
 * Parse CFA feed data
 * The actual feed is an HTML table with alerts
 */
function parseCFAFeed(feedText) {
    const alerts = [];
    const seenIncidents = new Set();
    
    // Parse HTML table rows: <tr><td class='capcode'>...</td><td class='timestamp'>...</td><td>...</td></tr>
    const rowRegex = /<tr><td class='capcode'>([^<]*)<\/td><td class='timestamp'>([^<]*)<\/td><td>([\s\S]*?)<\/td><\/tr>/gi;
    
    let match;
    while ((match = rowRegex.exec(feedText)) !== null) {
        const capcode = match[1].trim();
        const timestamp = match[2].trim();
        const messageHtml = match[3];
        
        // Extract the text content from the span, removing HTML tags
        const message = stripHTML(messageHtml);
        
        // Skip non-alert messages (warnings, status updates without @@ALERT or Hb status)
        if (!message.includes('@@ALERT')) {
            continue;
        }
        
        // Skip warning messages about scraping
        if (message.includes('STOP SCRAPING')) {
            continue;
        }
        
        // Extract incident number to avoid duplicates
        const incidentMatch = message.match(/F\d{9}/);
        const incidentId = incidentMatch ? incidentMatch[0] : null;
        
        // Skip duplicate incidents (same incident dispatched to multiple units)
        if (incidentId && seenIncidents.has(incidentId)) {
            continue;
        }
        
        if (incidentId) {
            seenIncidents.add(incidentId);
        }
        
        // Parse timestamp: "HH:MM:SS YYYY-MM-DD"
        const timestampISO = parseTimestamp(timestamp);
        
        // Extract location from message
        const location = extractLocation(message);
        
        alerts.push({
            message: message.replace('@@ALERT ', '').trim(),
            timestamp: timestampISO,
            location: location,
            coordinates: null,
            incidentId: incidentId,
            capcode: capcode
        });
    }
    
    return alerts;
}

/**
 * Parse CFA timestamp format: "HH:MM:SS YYYY-MM-DD"
 * Note: CFA timestamps are in Australian Eastern Time (AEST/AEDT)
 */
function parseTimestamp(timestamp) {
    try {
        const parts = timestamp.split(' ');
        if (parts.length === 2) {
            const time = parts[0];
            const date = parts[1];
            // Parse as local time, then convert to ISO
            // CFA feed provides timestamps in Australian Eastern Time
            return new Date(`${date}T${time}+11:00`).toISOString();
        }
    } catch (e) {
        // Fallback to current time
    }
    return new Date().toISOString();
}

// Common words to filter out when extracting location names
const NON_LOCATION_KEYWORDS = [
    'FIRE', 'GRASS', 'HOUSE', 'BATTERY', 'STRUCTURE', 'VEHICLE', 
    'UNDEFINED', 'SPREADING', 'INCIDENT', 'STRIKE', 'TEAM', 
    'CODE', 'TANKER', 'REQUIRED', 'ASSEMBLE', 'ALERT', 'NOW',
    'EXTINGUISHED', 'ISSUING', 'SMOKE', 'COLUMN', 'ALARM', 'OPERATING',
    'LEAKING', 'DOWN', 'POWERLINES', 'SPREAD', 'BUSH', 'SCRUB'
];

// Constants for location extraction
const MIN_SUBURB_LENGTH = 3;
const MIN_SUBURB_CHARS = 4;
const MAX_SUBURB_CHARS = 30;
const SUBURB_PREFIX_ST = 'ST ';

/**
 * Extract location from CFA message
 * CFA messages follow patterns:
 * 1. [TYPE] [STREET_NUM] [STREET] [SUBURB] /[CROSS_ST1] //[CROSS_ST2] [REGION] [GRID] (CODE) [UNITS]
 * 2. [TYPE] CNR [ROAD1]/[ROAD2] [SUBURB] [REGION] ...
 * 3. STRIKE TEAM ... ASSEMBLE AT [LOCATION] [ADDRESS] ...
 * 4. [TYPE] [DESCRIPTION] AT [LOCATION] [ADDRESS] ...
 */
function extractLocation(message) {
    // Remove @@ALERT prefix if present
    const cleanMessage = message.replace('@@ALERT ', '').trim();
    
    // Pattern 1: "ASSEMBLE AT" locations (Strike teams)
    const assembleMatch = cleanMessage.match(/ASSEMBLE AT\s+([A-Z\s-]+?)\s+(?:CFA\s+)?(?:STATION|SHOWGROUNDS|RESERVE|FIRE STATION)[A-Z\s-]*?\s+(?:\d+\s+)?(?:[A-Z]+\s+(?:RD|ST|AV|HWY|CR|CT|DR))?\s+([A-Z][A-Z\s]+?)\s+\//);
    if (assembleMatch) {
        const suburb = assembleMatch[2].trim();
        
        // Clean up suburb - remove leading "ST" if it's not part of the name
        let cleanSuburb = suburb;
        if (cleanSuburb.startsWith(SUBURB_PREFIX_ST) && cleanSuburb.length > SUBURB_PREFIX_ST.length) {
            cleanSuburb = cleanSuburb.substring(SUBURB_PREFIX_ST.length);
        }
        
        return cleanSuburb;
    }
    
    // Pattern 2: Street address with number (most common)
    const streetAddressMatch = cleanMessage.match(/\b(\d+\s+[A-Z][A-Za-z\s-]+?(?:RD|ST|AV|AVE|CR|CT|DR|PDE|WAY|HWY|LANE|BOULEVARD|ROAD|STREET|AVENUE|CRESCENT|COURT|DRIVE|PARADE|HIGHWAY))\s+([A-Z][A-Z\s]+?)\s+\//);
    if (streetAddressMatch) {
        const streetAddress = streetAddressMatch[1].trim();
        const suburb = streetAddressMatch[2].trim();
        
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        if (!suburb.match(filterPattern) && suburb.length >= MIN_SUBURB_LENGTH) {
            const cleanSuburb = suburb.replace(/\s+[A-Z]\d*$/, '').trim();
            if (cleanSuburb.length >= MIN_SUBURB_LENGTH) {
                return `${streetAddress}, ${cleanSuburb}`;
            }
        }
    }
    
    // Pattern 3: Corner of two roads
    const cornerMatch = cleanMessage.match(/CNR\s+[A-Z][A-Za-z\s-]+?(?:HWY|RD|CR|ST)\s*\/\s*[A-Z][A-Za-z\s-]+?(?:RD|HWY|CR|ST)\s+([A-Z][A-Z\s]+?)(?:\s+SV[A-Z]+|\s+M\s+\d)/);
    if (cornerMatch) {
        const suburb = cornerMatch[1].trim();
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        if (!suburb.match(filterPattern) && suburb.length >= MIN_SUBURB_LENGTH) {
            return suburb;
        }
    }
    
    // Pattern 4: Road name without street number
    const roadMatch = cleanMessage.match(/\b([A-Z][A-Za-z\s-]+?)\s+RD\s+([A-Z][A-Z\s]+?)\s+(?:\/|SV[A-Z]+|M\s+\d)/);
    if (roadMatch) {
        const road = roadMatch[1].trim();
        const suburb = roadMatch[2].trim();
        
        const roadFilterPattern = new RegExp(`\\b(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        const suburbFilterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        
        if (!road.match(roadFilterPattern) && !suburb.match(suburbFilterPattern) && suburb.length >= MIN_SUBURB_LENGTH) {
            return `${road} Rd, ${suburb}`;
        }
    }
    
    // Pattern 5: "AT [LOCATION] [ADDRESS]" format
    const atLocationMatch = cleanMessage.match(/\bAT\s+(?:[A-Z\s]+-\s+)?[A-Z][A-Za-z\s-]+?\s+(\d+\s+[A-Z][A-Za-z\s-]+?)\s+([A-Z][A-Z\s]+?)\s+(?:\/|SV[A-Z]+|M\s+\d)/);
    if (atLocationMatch) {
        const address = atLocationMatch[1].trim();
        const suburb = atLocationMatch[2].trim();
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        if (!suburb.match(filterPattern) && suburb.length >= MIN_SUBURB_LENGTH) {
            const cleanSuburb = suburb.replace(/\s+[A-Z]\d*$/, '').trim();
            if (cleanSuburb.length >= MIN_SUBURB_LENGTH) {
                return `${address}, ${cleanSuburb}`;
            }
        }
    }
    
    // Pattern 6: Extract suburb name before regional codes
    const suburbOnlyMatch = cleanMessage.match(new RegExp(`\\b([A-Z][A-Z\\s]{${MIN_SUBURB_CHARS},${MAX_SUBURB_CHARS}}?)\\s+(?:SV[A-Z]+|M\\s+\\d)`));
    if (suburbOnlyMatch) {
        const suburb = suburbOnlyMatch[1].trim();
        
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        const words = suburb.split(/\s+/);
        
        for (let i = words.length - 1; i >= 0; i--) {
            const candidate = words.slice(i).join(' ');
            
            if (candidate.match(filterPattern)) {
                continue;
            }
            
            if (candidate.length < MIN_SUBURB_CHARS || candidate.match(/^[A-Z]$/) || candidate.match(/^\d/)) {
                continue;
            }
            
            if (candidate.includes(' ') || candidate.length >= 6) {
                return candidate;
            }
        }
    }
    
    // Pattern 7: Final fallback - look for suburb before "/"
    const slashMatch = cleanMessage.match(new RegExp(`\\b([A-Z][A-Z\\s]{${MIN_SUBURB_CHARS},${MAX_SUBURB_CHARS}}?)\\s+\\/`));
    if (slashMatch) {
        const suburb = slashMatch[1].trim();
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        const words = suburb.split(/\s+/);
        
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
    
    return null;
}

/**
 * Strip HTML tags from text
 * Uses multiple passes to ensure complete sanitization
 */
function stripHTML(html) {
    // Remove all HTML tags (repeat to catch nested tags)
    let text = html;
    let prevText = '';
    
    // Keep replacing until no more tags found (handles nested/malformed tags)
    while (text !== prevText) {
        prevText = text;
        text = text.replace(/<[^>]*>/g, '');
    }
    
    // Decode HTML entities (decode &amp; last to avoid double-escaping issues)
    text = text.replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'")
               .replace(/&[^;]+;/g, ' ')  // Replace other entities with space
               .replace(/&amp;/g, '&');    // Decode &amp; last
    
    // Remove any remaining < or > characters for safety
    text = text.replace(/[<>]/g, '');
    
    return text.trim();
}
