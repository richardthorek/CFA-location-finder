const { TableClient } = require('@azure/data-tables');

// Get configuration from environment variables
const STORAGE_STRING = process.env.STORAGE_STRING;

/**
 * Azure Function to retrieve CFA alerts from Table Storage
 * This replaces the direct fetch approach to reduce API calls and provide cached data
 */
module.exports = async function (context, req) {
    context.log('CFA Feed request received');

    // Check if storage connection string is configured
    if (!STORAGE_STRING) {
        context.log.error('STORAGE_STRING environment variable is not configured');
        
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Configuration error',
                message: 'Storage is not configured. Please contact the administrator.'
            })
        };
        return;
    }

    try {
        // Create table client
        const tableClient = TableClient.fromConnectionString(STORAGE_STRING, 'CFAAlerts');
        
        // Query alerts from storage, ordered by timestamp (descending)
        const alerts = [];
        const entities = tableClient.listEntities({
            queryOptions: { 
                filter: `PartitionKey eq 'alert'`
            }
        });
        
        for await (const entity of entities) {
            alerts.push({
                message: entity.message,
                timestamp: entity.timestamp,
                location: entity.location || null,
                coordinates: entity.coordinates ? JSON.parse(entity.coordinates) : null,
                placeName: entity.placeName || null,
                incidentId: entity.incidentId || null,
                capcode: entity.capcode || null
            });
        }
        
        // Sort by timestamp (most recent first)
        alerts.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime() || 0;
            const timeB = new Date(b.timestamp).getTime() || 0;
            return timeB - timeA;
        });
        
        // Limit to 100 most recent alerts
        const recentAlerts = alerts.slice(0, 100);
        
        context.log(`Returning ${recentAlerts.length} alerts from storage`);

        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 'public, max-age=60' // Cache for 1 minute
            },
            body: JSON.stringify(recentAlerts)
        };

    } catch (error) {
        context.log.error('Error fetching alerts from storage:', error);
        
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to fetch alerts',
                message: error.message
            })
        };
    }
};

const { TableClient } = require('@azure/data-tables');

// Get configuration from environment variables
const STORAGE_STRING = process.env.STORAGE_STRING;
