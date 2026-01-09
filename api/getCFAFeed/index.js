// Using node-fetch v2 for compatibility with CommonJS modules in Azure Functions
// Note: Could migrate to native fetch API in Node.js 18+ or node-fetch v3 (ESM) in future
const fetch = require('node-fetch');

/**
 * Azure Function to fetch and parse CFA feed
 * This acts as a proxy to avoid CORS issues and parse the feed data
 */
module.exports = async function (context, req) {
    context.log('CFA Feed request received');

    // Get CFA feed URL from environment variable or use default
    const CFA_FEED_URL = process.env.CFA_FEED_URL || 'https://www.mazzanet.net.au/cfa/pager-cfa.php';

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
    'CODE', 'TANKER', 'REQUIRED', 'ASSEMBLE', 'ALERT', 'NOW',
    'EXTINGUISHED', 'ISSUING', 'SMOKE', 'COLUMN', 'ALARM', 'OPERATING',
    'LEAKING', 'DOWN', 'POWERLINES', 'SPREAD', 'BUSH', 'SCRUB'
];

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
    // Example: "ASSEMBLE AT MERTON CFA STATION SHAWS RD MERTON /"
    // Example: "ASSEMBLE AT NATIMUK SHOWGROUNDS RECREATION RESERVE - NATIMUK 48 JORY ST NATIMUK /"
    // Strategy: Look for the location name that appears twice (once as part of location desc, once as suburb)
    const assembleMatch = cleanMessage.match(/ASSEMBLE AT\s+([A-Z\s-]+?)\s+(?:CFA\s+)?(?:STATION|SHOWGROUNDS|RESERVE|FIRE STATION)[A-Z\s-]*?\s+(?:\d+\s+)?(?:[A-Z]+\s+(?:RD|ST|AV|HWY|CR|CT|DR))?\s+([A-Z][A-Z\s]+?)\s+\//);
    if (assembleMatch) {
        const locationDesc = assembleMatch[1].trim();
        const suburb = assembleMatch[2].trim();
        
        // Clean up suburb - remove leading "ST" if it's not part of the name
        let cleanSuburb = suburb;
        if (cleanSuburb.startsWith('ST ') && cleanSuburb.length > 3) {
            cleanSuburb = cleanSuburb.substring(3);
        }
        
        // For assembly points, just return the suburb as it's most useful for geocoding
        return cleanSuburb;
    }
    
    // Pattern 2: Street address with number (most common)
    // Example: "230 CHURCHILL RD YARROWEYAH /" or "250 HEATHS RD HOPPERS CROSSING /"
    // Captures: street number + street name + suburb before "/"
    const streetAddressMatch = cleanMessage.match(/\b(\d+\s+[A-Z][A-Za-z\s-]+?(?:RD|ST|AV|AVE|CR|CT|DR|PDE|WAY|HWY|LANE|BOULEVARD|ROAD|STREET|AVENUE|CRESCENT|COURT|DRIVE|PARADE|HIGHWAY))\s+([A-Z][A-Z\s]+?)\s+\//);
    if (streetAddressMatch) {
        const streetAddress = streetAddressMatch[1].trim();
        const suburb = streetAddressMatch[2].trim();
        
        // Filter out fire types and non-location keywords
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        if (!suburb.match(filterPattern) && suburb.length >= 3) {
            // Clean up suburb name (remove trailing single letters/numbers that might be grid refs)
            const cleanSuburb = suburb.replace(/\s+[A-Z]\d*$/, '').trim();
            if (cleanSuburb.length >= 3) {
                return `${streetAddress}, ${cleanSuburb}`;
            }
        }
    }
    
    // Pattern 3: Corner of two roads
    // Example: "CNR FOGARTYS GAP RD/WOODBROOK RD RAVENSWOOD SOUTH"
    // Example: "CNR SOUTH GIPPSLAND HWY/STANLAKES RD LANG LANG"
    // Example: "CNR CHANDLER RD/LEMAN CR NOBLE PARK"
    const cornerMatch = cleanMessage.match(/CNR\s+[A-Z][A-Za-z\s-]+?(?:HWY|RD|CR|ST)\s*\/\s*[A-Z][A-Za-z\s-]+?(?:RD|HWY|CR|ST)\s+([A-Z][A-Z\s]+?)(?:\s+SV[A-Z]+|\s+M\s+\d)/);
    if (cornerMatch) {
        const suburb = cornerMatch[1].trim();
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        if (!suburb.match(filterPattern) && suburb.length >= 3) {
            return suburb;
        }
    }
    
    // Pattern 4: Road name without street number
    // Example: "SHELFORD-MT MERCER RD MOUNT MERCER /" or "BENALLA-TOCUMWAL RD MUCKATAH"
    const roadMatch = cleanMessage.match(/\b([A-Z][A-Za-z\s-]+?)\s+RD\s+([A-Z][A-Z\s]+?)\s+(?:\/|SV[A-Z]+|M\s+\d)/);
    if (roadMatch) {
        const road = roadMatch[1].trim();
        const suburb = roadMatch[2].trim();
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        if (!suburb.match(filterPattern) && suburb.length >= 3) {
            return `${road} Rd, ${suburb}`;
        }
    }
    
    // Pattern 5: "AT [LOCATION] [ADDRESS]" format
    // Example: "AT UTLRA PACK 139 PROSPERITY WAY DANDENONG SOUTH"
    const atLocationMatch = cleanMessage.match(/\bAT\s+(?:[A-Z\s]+-\s+)?[A-Z][A-Za-z\s-]+?\s+(\d+\s+[A-Z][A-Za-z\s-]+?)\s+([A-Z][A-Z\s]+?)\s+(?:\/|SV[A-Z]+|M\s+\d)/);
    if (atLocationMatch) {
        const address = atLocationMatch[1].trim();
        const suburb = atLocationMatch[2].trim();
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        if (!suburb.match(filterPattern) && suburb.length >= 3) {
            const cleanSuburb = suburb.replace(/\s+[A-Z]\d*$/, '').trim();
            if (cleanSuburb.length >= 3) {
                return `${address}, ${cleanSuburb}`;
            }
        }
    }
    
    // Pattern 6: Extract suburb name before regional codes
    // Example: "GRASS FIRE BULDAR TRAIL RD COMBIENBAR SVSE" -> COMBIENBAR
    // This is a fallback for messages that don't match previous patterns
    const suburbOnlyMatch = cleanMessage.match(/\b([A-Z][A-Z\s]{4,30}?)\s+(?:SV[A-Z]+|M\s+\d)/);
    if (suburbOnlyMatch) {
        const suburb = suburbOnlyMatch[1].trim();
        
        // Filter out fire types and common non-location words
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        const words = suburb.split(/\s+/);
        
        // Try to find the last valid location word(s) in the sequence
        for (let i = words.length - 1; i >= 0; i--) {
            const candidate = words.slice(i).join(' ');
            if (!candidate.match(filterPattern) && candidate.length >= 4 && 
                !candidate.match(/^[A-Z]$/) && !candidate.match(/^\d/)) {
                return candidate;
            }
        }
    }
    
    // Pattern 7: Final fallback - look for suburb before "/"
    const slashMatch = cleanMessage.match(/\b([A-Z][A-Z\s]{4,30}?)\s+\//);
    if (slashMatch) {
        const suburb = slashMatch[1].trim();
        const filterPattern = new RegExp(`^(${NON_LOCATION_KEYWORDS.join('|')})\\b`);
        const words = suburb.split(/\s+/);
        
        // Get last 1-3 words that look like a suburb name
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
