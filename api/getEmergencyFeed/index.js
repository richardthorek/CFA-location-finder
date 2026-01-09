// Using node-fetch v2 for compatibility with CommonJS modules in Azure Functions
const fetch = require('node-fetch');

/**
 * Azure Function to fetch and parse Emergency Victoria RSS feed
 * This provides current fire incidents with coordinates and warning levels
 */
module.exports = async function (context, req) {
    context.log('Emergency Feed request received');

    // Emergency Victoria RSS feed URL
    const EMERGENCY_FEED_URL = 'https://data.emergency.vic.gov.au/Show?pageId=getIncidentRSS';

    try {
        // Fetch the Emergency Victoria RSS feed
        const response = await fetch(EMERGENCY_FEED_URL, {
            headers: {
                'User-Agent': 'CFA-Location-Finder/1.0'
            },
            timeout: 10000
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const feedText = await response.text();
        
        // Parse the RSS feed
        const incidents = parseEmergencyFeed(feedText);

        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify(incidents)
        };

    } catch (error) {
        context.log.error('Error fetching Emergency feed:', error);
        
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to fetch Emergency feed',
                message: error.message
            })
        };
    }
};

/**
 * Parse Emergency Victoria RSS feed
 * The feed is XML with items containing title, description, pubDate, and guid
 */
function parseEmergencyFeed(feedText) {
    const incidents = [];
    
    // Extract all <item> elements
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    
    let match;
    while ((match = itemRegex.exec(feedText)) !== null) {
        const itemContent = match[1];
        
        // Extract fields from the item
        const title = extractTag(itemContent, 'title');
        const link = extractTag(itemContent, 'link');
        const description = extractTag(itemContent, 'description');
        const pubDate = extractTag(itemContent, 'pubDate');
        
        // Parse the description to extract structured data
        const incidentData = parseDescription(description);
        
        // Skip if we don't have coordinates
        if (!incidentData.latitude || !incidentData.longitude) {
            continue;
        }
        
        // Parse timestamp
        const timestamp = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString();
        
        // Determine warning level based on available information
        const warningLevel = determineWarningLevel(incidentData);
        
        incidents.push({
            title: title || 'Unknown Location',
            message: formatIncidentMessage(title, incidentData),
            timestamp: timestamp,
            location: incidentData.location || title,
            coordinates: [parseFloat(incidentData.longitude), parseFloat(incidentData.latitude)],
            incidentId: incidentData.incidentNo || null,
            incidentName: incidentData.incidentName || '',
            type: incidentData.type || 'FIRE',
            status: incidentData.status || 'Unknown',
            size: incidentData.size || 'Unknown',
            vehicles: incidentData.vehicles || '0',
            agency: incidentData.agency || 'Unknown',
            warningLevel: warningLevel,
            link: link
        });
    }
    
    return incidents;
}

/**
 * Extract content from XML tag
 */
function extractTag(xml, tagName) {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? decodeHTML(match[1].trim()) : null;
}

/**
 * Parse the description field which contains structured data
 * Format: <strong>Field Name:</strong> Value<br>
 */
function parseDescription(description) {
    if (!description) return {};
    
    const data = {};
    
    // Extract each field
    const fields = {
        'Incident Name': 'incidentName',
        'Territory': 'territory',
        'Agency': 'agency',
        'Fire District': 'fireDistrict',
        'Incident No': 'incidentNo',
        'Date/Time': 'dateTime',
        'Type': 'type',
        'Location': 'location',
        'Status': 'status',
        'Size': 'size',
        'Vehicles': 'vehicles',
        'Latitude': 'latitude',
        'Longitude': 'longitude'
    };
    
    for (const [fieldLabel, fieldKey] of Object.entries(fields)) {
        const regex = new RegExp(`<strong>${fieldLabel}:<\\/strong>\\s*([^<]*?)(?:<br>|$)`, 'i');
        const match = description.match(regex);
        if (match) {
            data[fieldKey] = match[1].trim();
        }
    }
    
    return data;
}

/**
 * Determine warning level based on incident data
 * In the absence of explicit warning data, we use heuristics:
 * - BUSHFIRE with multiple vehicles or unknown size = Watch and Act (orange)
 * - Large incidents = Watch and Act (orange)
 * - Small incidents = Advice (yellow)
 * - Default = Advice (yellow)
 */
function determineWarningLevel(incidentData) {
    const type = (incidentData.type || '').toUpperCase();
    const size = (incidentData.size || '').toUpperCase();
    const status = (incidentData.status || '').toUpperCase();
    const vehicles = parseInt(incidentData.vehicles || '0', 10);
    
    // Check for explicit warning indicators in status (using uppercase strings)
    if (status.includes('EMERGENCY')) {
        return 'emergency';
    }
    if (status.includes('WATCH') || status.includes('ACT')) {
        return 'watchAndAct';
    }
    
    // Heuristics based on incident characteristics
    if (type === 'BUSHFIRE') {
        // Bushfires are more serious
        if (size === 'UNKNOWN' || vehicles > 10) {
            return 'watchAndAct';
        }
    }
    
    if (size === 'LARGE' || vehicles > 20) {
        return 'watchAndAct';
    }
    
    // Default to advice level
    return 'advice';
}

/**
 * Format incident message for display
 */
function formatIncidentMessage(title, incidentData) {
    const type = incidentData.type || 'FIRE';
    const location = incidentData.location || title;
    const status = incidentData.status || 'Unknown status';
    const size = incidentData.size || 'Unknown size';
    const vehicles = incidentData.vehicles || '0';
    
    return `${type} at ${location} - ${status} - Size: ${size} - Vehicles: ${vehicles}`;
}

/**
 * Decode HTML entities
 */
function decodeHTML(html) {
    return html
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}
