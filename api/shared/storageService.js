/**
 * Azure Table Storage Service
 * Handles all interactions with Azure Table Storage for caching feed data and enriched records
 */

const { TableClient } = require('@azure/data-tables');

// Table names
const TABLES = {
    FEED_CACHE: 'FeedCache',
    ENRICHED_ALERTS: 'EnrichedAlerts',
    FETCH_TRACKER: 'FetchTracker'
};

// Cache TTL in milliseconds
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Get Table Storage connection string from environment
 */
function getConnectionString() {
    const connectionString = process.env.STORAGE_STRING || process.env.AzureWebJobsStorage;
    
    if (!connectionString) {
        console.warn('STORAGE_STRING not configured. Caching will be disabled.');
        return null;
    }
    
    return connectionString;
}

/**
 * Get or create a table client
 */
async function getTableClient(tableName) {
    const connectionString = getConnectionString();
    
    if (!connectionString) {
        return null;
    }
    
    try {
        const client = TableClient.fromConnectionString(connectionString, tableName);
        
        // Create table if it doesn't exist
        await client.createTable().catch(err => {
            // Ignore "table already exists" errors (HTTP 409 Conflict)
            if (err.statusCode !== 409) {
                throw err;
            }
        });
        
        return client;
    } catch (error) {
        console.error(`Failed to create table client for ${tableName}:`, error.message);
        return null;
    }
}

/**
 * Check if a fetch is needed based on last fetch timestamp
 * Returns true if last fetch was more than CACHE_TTL_MS ago
 */
async function shouldFetch(feedType) {
    const client = await getTableClient(TABLES.FETCH_TRACKER);
    
    if (!client) {
        // If storage is not available, always fetch
        return true;
    }
    
    try {
        const entity = await client.getEntity('fetchTracker', feedType);
        const lastFetch = new Date(entity.lastFetchTime);
        const now = new Date();
        const elapsed = now - lastFetch;
        
        const shouldFetchNow = elapsed >= CACHE_TTL_MS;
        console.log(`Feed ${feedType}: Last fetch ${elapsed}ms ago, TTL ${CACHE_TTL_MS}ms, should fetch: ${shouldFetchNow}`);
        
        return shouldFetchNow;
    } catch (error) {
        // If entity doesn't exist or error occurs, we should fetch
        if (error.statusCode === 404) {
            console.log(`Feed ${feedType}: No previous fetch record found, should fetch`);
        } else {
            console.warn(`Feed ${feedType}: Error checking fetch status, will fetch:`, error.message);
        }
        return true;
    }
}

/**
 * Update the last fetch timestamp for a feed
 */
async function updateLastFetch(feedType) {
    const client = await getTableClient(TABLES.FETCH_TRACKER);
    
    if (!client) {
        return;
    }
    
    try {
        const entity = {
            partitionKey: 'fetchTracker',
            rowKey: feedType,
            lastFetchTime: new Date().toISOString(),
            timestamp: new Date()
        };
        
        await client.upsertEntity(entity, 'Replace');
        console.log(`Updated last fetch time for ${feedType}`);
    } catch (error) {
        console.error(`Failed to update last fetch time for ${feedType}:`, error.message);
    }
}

/**
 * Get cached feed data
 */
async function getCachedFeed(feedType) {
    const client = await getTableClient(TABLES.FEED_CACHE);
    
    if (!client) {
        return null;
    }
    
    try {
        const entity = await client.getEntity(feedType, 'latest');
        
        // Check if cache is still valid
        const cacheTime = new Date(entity.cacheTime);
        const now = new Date();
        const age = now - cacheTime;
        
        if (age >= CACHE_TTL_MS) {
            console.log(`Cached feed ${feedType} is stale (${age}ms old)`);
            return null;
        }
        
        console.log(`Using cached feed ${feedType} (${age}ms old)`);
        return JSON.parse(entity.data);
    } catch (error) {
        if (error.statusCode !== 404) {
            console.error(`Error retrieving cached feed ${feedType}:`, error.message);
        }
        return null;
    }
}

/**
 * Store feed data in cache
 */
async function cacheFeed(feedType, data) {
    const client = await getTableClient(TABLES.FEED_CACHE);
    
    if (!client) {
        return;
    }
    
    try {
        const entity = {
            partitionKey: feedType,
            rowKey: 'latest',
            cacheTime: new Date().toISOString(),
            data: JSON.stringify(data),
            itemCount: data.length
        };
        
        await client.upsertEntity(entity, 'Replace');
        console.log(`Cached ${data.length} items for feed ${feedType}`);
    } catch (error) {
        console.error(`Failed to cache feed ${feedType}:`, error.message);
    }
}

/**
 * Get enriched alert by location key
 * Location key is a normalized version of the address for deduplication
 */
async function getEnrichedAlert(feedType, locationKey) {
    const client = await getTableClient(TABLES.ENRICHED_ALERTS);
    
    if (!client) {
        return null;
    }
    
    try {
        const entity = await client.getEntity(feedType, locationKey);
        return {
            coordinates: JSON.parse(entity.coordinates),
            placeName: entity.placeName,
            geocodedAt: entity.geocodedAt
        };
    } catch (error) {
        if (error.statusCode !== 404) {
            console.error(`Error retrieving enriched alert ${feedType}/${locationKey}:`, error.message);
        }
        return null;
    }
}

/**
 * Store enriched alert with geocoded coordinates
 */
async function storeEnrichedAlert(feedType, locationKey, coordinates, placeName) {
    const client = await getTableClient(TABLES.ENRICHED_ALERTS);
    
    if (!client) {
        return;
    }
    
    try {
        const entity = {
            partitionKey: feedType,
            rowKey: locationKey,
            coordinates: JSON.stringify(coordinates),
            placeName: placeName || '',
            geocodedAt: new Date().toISOString()
        };
        
        await client.upsertEntity(entity, 'Replace');
        console.log(`Stored enriched alert ${feedType}/${locationKey}`);
    } catch (error) {
        console.error(`Failed to store enriched alert ${feedType}/${locationKey}:`, error.message);
    }
}

/**
 * Normalize a location string to create a consistent key for deduplication
 * Azure Table Storage row keys support up to 1KB, we limit to 100 chars for consistency
 */
function normalizeLocationKey(location) {
    if (!location) return '';
    
    // Maximum row key length for readability and Azure Table Storage best practices
    const MAX_KEY_LENGTH = 100;
    
    // Convert to uppercase, remove extra spaces, and create a consistent format
    return location
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[^A-Z0-9 ]/g, '') // Remove special characters
        .substring(0, MAX_KEY_LENGTH); // Limit length for table storage row key
}

module.exports = {
    TABLES,
    CACHE_TTL_MS,
    shouldFetch,
    updateLastFetch,
    getCachedFeed,
    cacheFeed,
    getEnrichedAlert,
    storeEnrichedAlert,
    normalizeLocationKey
};
