const fs = require('fs');

// Copy the parsing functions here for testing
function parseCFAFeed(feedText) {
    const alerts = [];
    const seenIncidents = new Set();
    
    const rowRegex = /<tr><td class='capcode'>([^<]*)<\/td><td class='timestamp'>([^<]*)<\/td><td>([\s\S]*?)<\/td><\/tr>/gi;
    
    let match;
    while ((match = rowRegex.exec(feedText)) !== null) {
        const capcode = match[1].trim();
        const timestamp = match[2].trim();
        const messageHtml = match[3];
        
        const message = stripHTML(messageHtml);
        
        if (!message.includes('@@ALERT')) {
            continue;
        }
        
        const incidentMatch = message.match(/F\d{9}/);
        const incidentId = incidentMatch ? incidentMatch[0] : null;
        
        if (incidentId && seenIncidents.has(incidentId)) {
            continue;
        }
        
        if (incidentId) {
            seenIncidents.add(incidentId);
        }
        
        const timestampISO = parseTimestamp(timestamp);
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

function parseTimestamp(timestamp) {
    try {
        const parts = timestamp.split(' ');
        if (parts.length === 2) {
            const time = parts[0];
            const date = parts[1];
            return new Date(`${date}T${time}Z`).toISOString();
        }
    } catch (e) {
        // Fallback
    }
    return new Date().toISOString();
}

function extractLocation(message) {
    const cleanMessage = message.replace('@@ALERT ', '');
    
    const locationMatch = cleanMessage.match(/\b([A-Z][A-Z\s]+?)(?:\s+\/|\s+\d+\s+[A-Z])/);
    if (locationMatch) {
        const location = locationMatch[1].trim();
        const filtered = location.replace(/^(G&SC\d+|STRUC\d+|NOSTC\d+|ALARC\d+|INCIC\d+|STRIKE TEAM|CODE)\s+/i, '');
        if (filtered.length > 3 && filtered.length < 50) {
            return filtered;
        }
    }
    
    const townMatch = cleanMessage.match(/\b([A-Z][A-Z\s]{3,30}?)\s+(?:\/|SV[A-Z]+|M\s+\d)/);
    if (townMatch) {
        const town = townMatch[1].trim();
        if (!town.match(/^(FIRE|GRASS|HOUSE|BATTERY|STRUCTURE|VEHICLE|UNDEFINED|SPREADING|INCIDENT)/)) {
            return town;
        }
    }
    
    return null;
}

function stripHTML(html) {
    let text = html;
    let prevText = '';
    
    while (text !== prevText) {
        prevText = text;
        text = text.replace(/<[^>]*>/g, '');
    }
    
    text = text.replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'")
               .replace(/&[^;]+;/g, ' ')
               .replace(/&amp;/g, '&');
    
    text = text.replace(/[<>]/g, '');
    
    return text.trim();
}

// Test with actual feed
const feedText = fs.readFileSync('/tmp/cfa_feed.html', 'utf-8');
const alerts = parseCFAFeed(feedText);

console.log(`Found ${alerts.length} alerts`);
console.log('\nFirst 5 alerts:');
alerts.slice(0, 5).forEach((alert, i) => {
    console.log(`\n${i + 1}. ${alert.location || 'Unknown location'}`);
    console.log(`   Incident: ${alert.incidentId}`);
    console.log(`   Time: ${alert.timestamp}`);
    console.log(`   Message: ${alert.message.substring(0, 100)}...`);
});
