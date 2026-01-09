// Using node-fetch v2 for compatibility with CommonJS modules in Azure Functions
const fetch = require('node-fetch');

/**
 * Azure Function to fetch and parse Emergency Victoria and NSW RFS RSS feeds
 * This provides current fire incidents with coordinates and warning levels
 */
module.exports = async function (context, req) {
    context.log('Emergency Feed request received');

    // Feed URLs
    const EMERGENCY_VIC_FEED_URL = 'https://data.emergency.vic.gov.au/Show?pageId=getIncidentRSS';
    const NSW_RFS_FEED_URL = 'https://www.rfs.nsw.gov.au/feeds/majorIncidents.xml';
    // Alternative CFA-specific incidents feed from Emergency VIC (filters for CFA incidents only)
    const CFA_INCIDENTS_URL = 'https://data.emergency.vic.gov.au/Show?pageId=getIncidentRSS';

    try {
        let allIncidents = [];
        
        // Fetch Emergency Victoria RSS feed (includes CFA current incidents)
        try {
            context.log('Fetching Emergency VIC feed from:', EMERGENCY_VIC_FEED_URL);
            const vicResponse = await fetch(EMERGENCY_VIC_FEED_URL, {
                headers: {
                    'User-Agent': 'CFA-Location-Finder/1.0',
                    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
                },
                timeout: 15000 // Increased timeout to 15 seconds
            });

            context.log(`Emergency VIC response status: ${vicResponse.status}`);

            if (vicResponse.ok) {
                const vicFeedText = await vicResponse.text();
                context.log(`Emergency VIC feed length: ${vicFeedText.length} characters`);
                
                // Log first 500 chars to debug format issues
                if (vicFeedText.length > 0) {
                    context.log('Emergency VIC feed preview:', vicFeedText.substring(0, 500));
                }
                
                const vicIncidents = parseEmergencyVicFeed(vicFeedText);
                
                // Filter for CFA incidents specifically
                const cfaIncidents = vicIncidents.filter(incident => {
                    const agency = (incident.agency || '').toUpperCase();
                    return agency.includes('CFA') || agency.includes('COUNTRY FIRE');
                });
                
                context.log(`Parsed ${vicIncidents.length} total incidents from Emergency VIC`);
                context.log(`Found ${cfaIncidents.length} CFA-specific incidents`);
                
                allIncidents = allIncidents.concat(vicIncidents);
            } else {
                context.log.warn(`Emergency VIC feed returned status: ${vicResponse.status}`);
                const errorText = await vicResponse.text();
                context.log.warn('Emergency VIC error response:', errorText.substring(0, 500));
            }
        } catch (vicError) {
            context.log.error('Error fetching Emergency VIC feed:', vicError.message);
            context.log.error('VIC Error stack:', vicError.stack);
        }

        // Fetch NSW RFS RSS feed
        try {
            context.log('Fetching NSW RFS feed from:', NSW_RFS_FEED_URL);
            const nswResponse = await fetch(NSW_RFS_FEED_URL, {
                headers: {
                    'User-Agent': 'CFA-Location-Finder/1.0',
                    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
                },
                timeout: 15000 // Increased timeout
            });

            context.log(`NSW RFS response status: ${nswResponse.status}`);

            if (nswResponse.ok) {
                const nswFeedText = await nswResponse.text();
                context.log(`NSW RFS feed length: ${nswFeedText.length} characters`);
                
                const nswIncidents = parseNSWRFSFeed(nswFeedText);
                allIncidents = allIncidents.concat(nswIncidents);
                context.log(`Fetched ${nswIncidents.length} incidents from NSW RFS`);
            } else {
                context.log.warn(`NSW RFS feed returned status: ${nswResponse.status}`);
                const errorText = await nswResponse.text();
                context.log.warn('NSW RFS error response:', errorText.substring(0, 500));
            }
        } catch (nswError) {
            context.log.error('Error fetching NSW RFS feed:', nswError.message);
            context.log.error('NSW Error stack:', nswError.stack);
        }

        // Log final results
        context.log(`Total incidents parsed: ${allIncidents.length}`);
        
        // Count by source
        const cfaCount = allIncidents.filter(i => i.source === 'VIC').length;
        const nswCount = allIncidents.filter(i => i.source === 'NSW').length;
        context.log(`CFA/VIC incidents: ${cfaCount}, NSW incidents: ${nswCount}`);

        // If no incidents from either feed, return empty array
        if (allIncidents.length === 0) {
            context.log.warn('No incidents available from either feed');
            context.res = {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET',
                    'Access-Control-Allow-Headers': 'Content-Type'
                },
                body: JSON.stringify([])
            };
            return;
        }

        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify(allIncidents)
        };

    } catch (error) {
        context.log.error('Error in Emergency feed handler:', error);
        
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to fetch Emergency feeds',
                message: error.message
            })
        };
    }
};

/**
 * Parse Emergency Victoria RSS feed
 * The feed is XML with items containing title, description, pubDate, and guid
 */
function parseEmergencyVicFeed(feedText) {
    const incidents = [];
    
    // Check if feed is empty or invalid
    if (!feedText || feedText.trim().length === 0) {
        console.warn('Emergency VIC feed is empty');
        return incidents;
    }
    
    // Check if it's actually XML/RSS
    if (!feedText.includes('<rss') && !feedText.includes('<feed')) {
        console.warn('Emergency VIC feed does not appear to be RSS/XML format');
        return incidents;
    }
    
    // Extract all <item> elements
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    
    let match;
    let itemCount = 0;
    while ((match = itemRegex.exec(feedText)) !== null) {
        itemCount++;
        const itemContent = match[1];
        
        try {
            // Extract fields from the item
            const title = extractTag(itemContent, 'title');
            const link = extractTag(itemContent, 'link');
            const description = extractTag(itemContent, 'description');
            const pubDate = extractTag(itemContent, 'pubDate');
            
            // Parse the description to extract structured data
            const incidentData = parseDescription(description);
            
            // Skip if we don't have coordinates
            if (!incidentData.latitude || !incidentData.longitude) {
                console.warn(`Skipping VIC incident ${itemCount}: No coordinates`);
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
                link: link,
                source: 'VIC'
            });
        } catch (itemError) {
            console.error(`Error parsing VIC incident ${itemCount}:`, itemError.message);
        }
    }
    
    console.log(`Parsed ${itemCount} items from Emergency VIC feed, ${incidents.length} valid incidents`);
    
    return incidents;
}

/**
 * Parse NSW RFS RSS feed
 * Uses georss:point for coordinates and category for alert level
 */
function parseNSWRFSFeed(feedText) {
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
        const category = extractTag(itemContent, 'category');
        
        // Extract georss:point (format: "lat lon")
        const pointMatch = itemContent.match(/<(?:georss:)?point[^>]*>([\s\S]*?)<\/(?:georss:)?point>/i);
        if (!pointMatch) {
            continue; // Skip if no coordinates
        }
        
        const pointData = pointMatch[1].trim().split(/\s+/);
        if (pointData.length < 2) {
            continue;
        }
        
        const latitude = parseFloat(pointData[0]);
        const longitude = parseFloat(pointData[1]);
        
        if (isNaN(latitude) || isNaN(longitude)) {
            continue;
        }
        
        // Parse the description to extract structured data
        const incidentData = parseNSWDescription(description);
        
        // Parse timestamp
        const timestamp = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString();
        
        // Map NSW category to warning level
        const warningLevel = mapNSWCategoryToWarningLevel(category);
        
        // Extract location from title (format: "LOCATION, SUBURB")
        const location = title || 'Unknown Location';
        
        incidents.push({
            title: title || 'Unknown Location',
            message: formatNSWIncidentMessage(title, incidentData),
            timestamp: timestamp,
            location: location,
            coordinates: [longitude, latitude],
            incidentId: null,
            incidentName: '',
            type: incidentData.type || 'FIRE',
            status: incidentData.status || 'Unknown',
            size: incidentData.size || 'Unknown',
            vehicles: incidentData.vehicles || '0',
            agency: incidentData.agency || 'NSW RFS',
            warningLevel: warningLevel,
            link: link,
            source: 'NSW'
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
        .replace(/&amp;/g, '&');  // Decode &amp; last to avoid double-decoding
}

/**
 * Parse NSW RFS description field
 * Format: ALERT LEVEL: <level> <br />LOCATION: <location> <br />...
 */
function parseNSWDescription(description) {
    if (!description) return {};
    
    const data = {};
    
    // NSW RFS uses different field names
    const fields = {
        'ALERT LEVEL': 'alertLevel',
        'LOCATION': 'location',
        'COUNCIL AREA': 'councilArea',
        'STATUS': 'status',
        'TYPE': 'type',
        'FIRE': 'fire',
        'SIZE': 'size',
        'RESPONSIBLE AGENCY': 'agency',
        'UPDATED': 'updated'
    };
    
    for (const [fieldLabel, fieldKey] of Object.entries(fields)) {
        // Escape special regex characters in field label
        const escapedLabel = fieldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match field with <br /> or <br> as separator
        const regex = new RegExp(`${escapedLabel}:\\s*([^<]*?)(?:<br\\s*\\/?>|$)`, 'i');
        const match = description.match(regex);
        if (match) {
            data[fieldKey] = match[1].trim();
        }
    }
    
    return data;
}

/**
 * Map NSW RFS category to warning level
 * NSW uses: "Emergency Warning", "Watch and Act", "Advice"
 */
function mapNSWCategoryToWarningLevel(category) {
    if (!category) return 'advice';
    
    const categoryLower = category.toLowerCase();
    
    if (categoryLower.includes('emergency')) {
        return 'emergency';
    }
    if (categoryLower.includes('watch') || categoryLower.includes('act')) {
        return 'watchAndAct';
    }
    // Default to advice
    return 'advice';
}

/**
 * Format NSW incident message for display
 */
function formatNSWIncidentMessage(title, incidentData) {
    const type = incidentData.type || 'FIRE';
    const location = title || 'Unknown Location';
    const status = incidentData.status || 'Unknown status';
    const size = incidentData.size || 'Unknown size';
    const alertLevel = incidentData.alertLevel || 'Advice';
    
    return `${alertLevel}: ${type} at ${location} - ${status} - Size: ${size}`;
}
