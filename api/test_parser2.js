const fs = require('fs');

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
        
        if (message.includes('STOP SCRAPING')) {
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
    } catch (e) {}
    return new Date().toISOString();
}

function extractLocation(message) {
    const cleanMessage = message.replace('@@ALERT ', '');
    
    const addressMatch = cleanMessage.match(/\d+\s+([A-Z][A-Za-z\s]+?)\s+([A-Z][A-Z\s]+?)\s+\//);
    if (addressMatch) {
        const street = addressMatch[1].trim();
        const suburb = addressMatch[2].trim();
        
        if (!suburb.match(/^(FIRE|GRASS|HOUSE|BATTERY|STRUCTURE|VEHICLE|UNDEFINED|SPREADING)/)) {
            return `${street}, ${suburb}`;
        }
    }
    
    const roadMatch = cleanMessage.match(/([A-Z][A-Za-z\s-]+?)\s+RD\s+([A-Z][A-Z\s]+?)\s+\//);
    if (roadMatch) {
        const road = roadMatch[1].trim();
        const suburb = roadMatch[2].trim();
        return `${road} Rd, ${suburb}`;
    }
    
    const suburbMatch = cleanMessage.match(/\b([A-Z][A-Z\s]{4,25}?)\s+(?:\/|SV[A-Z]+|M\s+\d)/);
    if (suburbMatch) {
        const suburb = suburbMatch[1].trim();
        
        if (!suburb.match(/^(FIRE|GRASS|HOUSE|BATTERY|STRUCTURE|VEHICLE|UNDEFINED|SPREADING|INCIDENT|STRIKE|TEAM|CODE|TANKER|REQUIRED|ASSEMBLE)/)) {
            const cleaned = suburb.replace(/\s+[A-Z]\d*$/, '').trim();
            if (cleaned.length >= 4) {
                return cleaned;
            }
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

const feedText = fs.readFileSync('/tmp/cfa_feed.html', 'utf-8');
const alerts = parseCFAFeed(feedText);

console.log(`Found ${alerts.length} unique alerts\n`);
console.log('Sample alerts:');
alerts.slice(0, 10).forEach((alert, i) => {
    console.log(`\n${i + 1}. Location: ${alert.location || 'Unknown'}`);
    console.log(`   Incident: ${alert.incidentId}`);
    console.log(`   Message: ${alert.message.substring(0, 80)}...`);
});
