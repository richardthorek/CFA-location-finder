// Using node-fetch v2 for compatibility with CommonJS modules in Azure Functions
// Note: Could migrate to native fetch API in Node.js 18+ or node-fetch v3 (ESM) in future
const fetch = require('node-fetch');

/**
 * Azure Function to fetch and parse CFA feed
 * This acts as a proxy to avoid CORS issues and parse the feed data
 */
module.exports = async function (context, req) {
    context.log('CFA Feed request received');

    const CFA_FEED_URL = 'https://www.mazzanet.net.au/cfa/pager-cfa.php';

    try {
        // Fetch the CFA feed
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
        
        // Parse the feed (assuming it's a simple text format or RSS)
        const alerts = parseCFAFeed(feedText);

        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify(alerts)
        };

    } catch (error) {
        context.log.error('Error fetching CFA feed:', error);
        
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to fetch CFA feed',
                message: error.message
            })
        };
    }
};

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
    'CODE', 'TANKER', 'REQUIRED', 'ASSEMBLE'
];

/**
 * Extract location from CFA message
 * Format varies: [TYPE] [ADDRESS] [LOCATION] /[ROAD1] //[ROAD2] [AREA_CODE]
 */
function extractLocation(message) {
    // Remove @@ALERT prefix if present
    const cleanMessage = message.replace('@@ALERT ', '');
    
    // Try to extract street address and suburb
    // Pattern: Captures "15 VERONA CR FRASER RISE /" 
    // Group 1: Street name (e.g., "VERONA CR")
    // Group 2: Suburb name (e.g., "FRASER RISE")
    const addressMatch = cleanMessage.match(/\d+\s+([A-Z][A-Za-z\s]+?)\s+([A-Z][A-Z\s]+?)\s+\//);
    if (addressMatch) {
        const street = addressMatch[1].trim();
        const suburb = addressMatch[2].trim();
        
        // Filter out fire types
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.slice(0, 7).join('|')})`);
        if (!suburb.match(filterPattern)) {
            return `${street}, ${suburb}`;
        }
    }
    
    // Pattern: Captures "SHELFORD-MT MERCER RD MOUNT MERCER /"
    // Group 1: Road name (e.g., "SHELFORD-MT MERCER")
    // Group 2: Suburb name (e.g., "MOUNT MERCER")
    const roadMatch = cleanMessage.match(/([A-Z][A-Za-z\s-]+?)\s+RD\s+([A-Z][A-Z\s]+?)\s+\//);
    if (roadMatch) {
        const road = roadMatch[1].trim();
        const suburb = roadMatch[2].trim();
        return `${road} Rd, ${suburb}`;
    }
    
    // Pattern: Extract suburb name before "/" or area code patterns (SV*, M <digit>)
    // Captures any capitalized location name before these markers
    const suburbMatch = cleanMessage.match(/\b([A-Z][A-Z\s]{4,25}?)\s+(?:\/|SV[A-Z]+|M\s+\d)/);
    if (suburbMatch) {
        const suburb = suburbMatch[1].trim();
        
        // Filter out fire types and common non-location words
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})`);
        if (!suburb.match(filterPattern)) {
            // Further clean up by removing trailing single letters or numbers
            const cleaned = suburb.replace(/\s+[A-Z]\d*$/, '').trim();
            if (cleaned.length >= 4) {
                return cleaned;
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
