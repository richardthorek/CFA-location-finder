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
 * The feed format may vary - this handles common formats
 */
function parseCFAFeed(feedText) {
    const alerts = [];
    
    try {
        // Check if it's JSON
        const jsonData = JSON.parse(feedText);
        if (Array.isArray(jsonData)) {
            return jsonData.map(item => ({
                message: item.message || item.text || item.description || '',
                timestamp: item.timestamp || item.time || item.date || new Date().toISOString(),
                location: item.location || null,
                coordinates: item.coordinates || null
            }));
        }
    } catch (e) {
        // Not JSON, continue with other parsing methods
    }

    // Try parsing as RSS/XML
    if (feedText.includes('<rss') || feedText.includes('<feed')) {
        return parseRSSFeed(feedText);
    }

    // Try parsing as plain text (line-by-line)
    const lines = feedText.split('\n').filter(line => line.trim().length > 0);
    
    for (const line of lines) {
        // Skip headers or empty lines
        if (line.length < 10) continue;
        
        // Each line is an alert message
        alerts.push({
            message: line.trim(),
            timestamp: new Date().toISOString(),
            location: null,
            coordinates: null
        });
    }

    return alerts;
}

/**
 * Parse RSS/XML feed
 */
function parseRSSFeed(xmlText) {
    const alerts = [];
    
    // Simple regex-based XML parsing (for basic RSS feeds)
    // In production, use a proper XML parser
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/i;
    const descRegex = /<description[^>]*>([\s\S]*?)<\/description>/i;
    const dateRegex = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i;
    
    let match;
    while ((match = itemRegex.exec(xmlText)) !== null) {
        const itemContent = match[1];
        
        const titleMatch = titleRegex.exec(itemContent);
        const descMatch = descRegex.exec(itemContent);
        const dateMatch = dateRegex.exec(itemContent);
        
        const title = titleMatch ? stripHTML(titleMatch[1]) : '';
        const description = descMatch ? stripHTML(descMatch[1]) : '';
        const message = `${title} ${description}`.trim();
        
        if (message) {
            alerts.push({
                message: message,
                timestamp: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString(),
                location: null,
                coordinates: null
            });
        }
    }
    
    return alerts;
}

/**
 * Strip HTML tags from text
 */
function stripHTML(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
}
