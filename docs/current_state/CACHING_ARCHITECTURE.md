# Backend Caching Architecture

## Overview

This document describes the backend caching and geocoding architecture implemented to optimize data fetching, minimize API calls, and improve performance for multiple concurrent users.

## Problem Statement

**Before Implementation:**
- Frontend fetched data from remote APIs on every page load/refresh for every user
- Geocoding happened in the browser using Mapbox API for each user
- No caching mechanism existed
- Multiple users created redundant API calls (N users = N × fetch rate)
- Mapbox API calls were unbounded and potentially costly

**Goals:**
- Centralize fetching in backend with single fetch per minute max
- Cache results in Azure Table Storage
- Move geocoding to backend with permanent caching
- Frontend reads only from cached backend data
- Minimize Mapbox API calls to only new/unique addresses

## Architecture Components

### 1. Storage Service (`api/shared/storageService.js`)

Manages all interactions with Azure Table Storage.

**Tables:**
- `FeedCache`: Stores latest feed data (partition: feed type, row: "latest")
- `EnrichedAlerts`: Stores geocoded coordinates (partition: feed type, row: normalized location key)
- `FetchTracker`: Tracks last fetch time (partition: "fetchTracker", row: feed type)

**Key Functions:**
- `shouldFetch(feedType)`: Checks if cache is stale (> 60 seconds old)
- `updateLastFetch(feedType)`: Updates fetch timestamp
- `getCachedFeed(feedType)`: Retrieves cached feed data
- `cacheFeed(feedType, data)`: Stores feed data in cache
- `getEnrichedAlert(feedType, locationKey)`: Gets cached geocoded coordinates
- `storeEnrichedAlert(feedType, locationKey, coordinates, placeName)`: Caches geocoding results
- `normalizeLocationKey(location)`: Creates consistent key for deduplication

**Cache TTL:** 60 seconds (1 minute)

**Configuration:**
- Uses `STORAGE_STRING` or `AzureWebJobsStorage` environment variable
- Gracefully degrades if storage is not configured (no caching, always fetch)

### 2. Geocoding Service (`api/shared/geocodingService.js`)

Handles Mapbox geocoding with caching to minimize API calls.

**Key Functions:**
- `geocodeLocation(location, feedType, context)`: Geocodes a location with cache check
- `enrichAlertsWithCoordinates(alerts, feedType, context)`: Batch enrichment of alerts

**Caching Strategy:**
1. Check `EnrichedAlerts` table for existing geocoded location
2. If found, return cached coordinates (no Mapbox API call)
3. If not found, call Mapbox API and cache the result
4. Geocoding cache never expires (addresses don't change location)

**Deduplication:**
- Locations are normalized (uppercase, trimmed, special chars removed)
- Same location across different alerts uses same cached result
- Example: "BALLARAT VIC" and "Ballarat, Victoria" → same cache key

### 3. Updated API Endpoints

#### `/api/getCFAFeed`
**Caching Flow:**
1. Check if last fetch was < 60 seconds ago
2. If yes, return cached enriched data (X-Cache-Status: HIT)
3. If no, fetch from source
4. Parse feed data
5. Enrich with geocoded coordinates (using cached or new Mapbox calls)
6. Update fetch tracker
7. Cache enriched results
8. Return data (X-Cache-Status: MISS)

**Error Handling:**
- On fetch error, return stale cache if available (X-Cache-Status: STALE)
- Gracefully handles missing storage configuration

#### `/api/getEmergencyFeed`
**Same caching flow as CFA feed**
- Fetches both VIC and NSW feeds
- Emergency feeds often include coordinates, geocoding fills gaps
- Combined result is cached as single feed

### 4. Frontend Changes

**Removed:**
- `geocodeLocation()` function (lines 392-418)
- Frontend Mapbox geocoding API calls
- Manual location parsing and enrichment in `updateMapWithSeparateFeeds()`

**Frontend now:**
- Receives pre-enriched alerts with coordinates from backend
- Only handles display, filtering, and user interaction
- No direct external API calls (except Mapbox for map tiles and routes)

## Data Flow

### Before (Per-User Fetch)
```
User 1 → Frontend → Backend Proxy → Source API → Parse → Frontend Geocode → Display
User 2 → Frontend → Backend Proxy → Source API → Parse → Frontend Geocode → Display
User N → Frontend → Backend Proxy → Source API → Parse → Frontend Geocode → Display

Issues:
- N users = N source fetches + N × M geocoding calls (M = alerts without coords)
- No coordination between users
- Rate limiting not enforced
```

### After (Centralized Caching)
```
User 1 → Frontend → Backend → Check Cache → [Cache Hit] → Return cached data → Display
User 2 → Frontend → Backend → Check Cache → [Cache Hit] → Return cached data → Display
User N → Frontend → Backend → Check Cache → [Cache Hit] → Return cached data → Display

First request (cache miss):
User 1 → Frontend → Backend → Check Cache → [Cache Miss]
                                    ↓
                            Fetch from source
                                    ↓
                            Parse feed
                                    ↓
                            Enrich (geocode only new locations)
                                    ↓
                            Cache results + Update fetch tracker
                                    ↓
                            Return enriched data → Display

Subsequent requests within 60s:
User 2-N → Frontend → Backend → Check Cache → [Cache Hit] → Return cached data

Benefits:
- 1 source fetch per 60 seconds regardless of user count
- Geocoding only for new/unique locations
- Coordinated caching across all users
```

## Table Storage Schema

### FeedCache Table
| PartitionKey | RowKey   | cacheTime            | data (JSON) | itemCount |
|--------------|----------|----------------------|-------------|-----------|
| CFA          | latest   | 2026-01-09T23:15:00Z | [...alerts] | 25        |
| EMERGENCY    | latest   | 2026-01-09T23:15:05Z | [...items]  | 18        |

### EnrichedAlerts Table
| PartitionKey | RowKey          | coordinates (JSON) | placeName           | geocodedAt           |
|--------------|-----------------|--------------------|--------------------|----------------------|
| CFA          | BALLARATVIC     | [143.85, -37.56]   | Ballarat, VIC, AU  | 2026-01-09T22:30:00Z |
| CFA          | BENDIGOVICTORIA | [144.28, -36.76]   | Bendigo, VIC, AU   | 2026-01-09T22:31:00Z |
| EMERGENCY    | GEELONGVIC      | [144.36, -38.15]   | Geelong, VIC, AU   | 2026-01-09T22:32:00Z |

### FetchTracker Table
| PartitionKey   | RowKey    | lastFetchTime        |
|----------------|-----------|----------------------|
| fetchTracker   | CFA       | 2026-01-09T23:15:00Z |
| fetchTracker   | EMERGENCY | 2026-01-09T23:15:05Z |

## Performance Benefits

### API Call Reduction

**Before (10 users over 5 minutes):**
- Source API fetches: 10 users × 5 requests = 50 calls
- Mapbox geocoding: 10 users × 5 requests × 20 new locations/request = 1000 calls
- **Total: 1050 API calls**

**After (10 users over 5 minutes):**
- Source API fetches: 5 requests (1 per minute, cached for all users)
- Mapbox geocoding: ~20 unique locations (cached permanently)
- **Total: 25 API calls (97.6% reduction)**

### Latency Improvement

**Before:**
- Cold load: 2-3 seconds (fetch + parse + geocode)
- Each user experiences full latency

**After:**
- Cache hit: <100ms (read from Table Storage)
- Cache miss: 2-3 seconds (only first user in 60s window)
- 90%+ of requests are cache hits

### Cost Reduction

**Mapbox Geocoding:**
- Before: Potentially 100,000+ calls/month
- After: Only unique locations, ~1,000-5,000 calls/month
- **Savings: 95%+ of Mapbox API costs**

**Source API Respect:**
- Rate-limited to 1 request per minute per feed
- Prevents overwhelming third-party APIs
- Better API citizenship

## Configuration

### Required Environment Variables

```bash
# Azure Table Storage connection string
STORAGE_STRING="DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"
# OR
AzureWebJobsStorage="<same format>"

# Mapbox API token (for backend geocoding)
MAPBOX_TOKEN="pk.ey..."
```

### Deployment Notes

1. **Storage Account Setup:**
   - Create Azure Storage Account (Standard performance, LRS redundancy)
   - Copy connection string from Access Keys
   - Set `STORAGE_STRING` in Azure Function App settings

2. **Mapbox Token:**
   - Must be set in backend (Azure Function App settings)
   - Frontend no longer uses Mapbox for geocoding
   - Still uses Mapbox for map tiles and routing

3. **Table Auto-Creation:**
   - Tables are created automatically on first use
   - No manual setup required

4. **Monitoring:**
   - Check X-Cache-Status headers: HIT, MISS, STALE
   - Monitor Azure Function logs for cache statistics
   - Track Table Storage costs in Azure portal

## Graceful Degradation

**If STORAGE_STRING is not configured:**
- Storage service returns null clients
- Functions fall back to always fetching
- Geocoding still works but not cached
- No errors thrown, just logs warnings

**If Mapbox token is missing:**
- Geocoding returns null
- Alerts without coordinates are skipped on map
- List view still shows alerts
- Logs error messages

**If source feeds are down:**
- Returns stale cache if available (X-Cache-Status: STALE)
- Frontend displays last known good data
- Error message if no cache available

## Monitoring & Debugging

### Cache Status Headers

All API responses include `X-Cache-Status` header:
- `HIT`: Data served from fresh cache (< 60s old)
- `MISS`: Data fetched from source and cached
- `STALE`: Data served from expired cache (fallback on error)

### Azure Function Logs

Look for these log messages:
```
Feed CFA: Last fetch 15234ms ago, TTL 60000ms, should fetch: false
Using cached coordinates for BALLARAT
Geocoding BENDIGO via Mapbox API
Cached 25 items for feed CFA
Enrichment complete: 5 new geocoded, 15 from cache, 0 failed
```

### Table Storage Metrics

Monitor in Azure Portal:
- Storage account → Metrics
- Track transaction count (reads/writes)
- Monitor storage capacity
- Check request latency

## Testing

### Verify Caching Works

1. **First Request (Cache Miss):**
   ```bash
   curl -i https://your-app.azurewebsites.net/api/getCFAFeed
   # X-Cache-Status: MISS
   # Takes 2-3 seconds
   ```

2. **Second Request (Cache Hit):**
   ```bash
   curl -i https://your-app.azurewebsites.net/api/getCFAFeed
   # X-Cache-Status: HIT
   # Takes <100ms
   ```

3. **Wait 61 Seconds, Third Request (Cache Miss):**
   ```bash
   sleep 61
   curl -i https://your-app.azurewebsites.net/api/getCFAFeed
   # X-Cache-Status: MISS
   # Takes 2-3 seconds
   ```

### Verify Geocoding Cache

1. Deploy with fresh Table Storage
2. Load page, check logs: "5 new geocoded"
3. Refresh page, check logs: "5 from cache, 0 new geocoded"
4. Verify no Mapbox API calls on subsequent loads

### Verify Rate Limiting

1. Open page in multiple tabs/browsers simultaneously
2. All tabs request data at same time
3. Check Azure Function logs: Only 1 fetch to source API
4. All tabs receive same cached response

## Future Enhancements

1. **Adaptive Cache TTL:**
   - Longer TTL during low-activity periods
   - Shorter TTL during high-fire-danger days

2. **Pre-warming:**
   - Background timer trigger to refresh cache proactively
   - Ensures first user never sees cache miss

3. **Geo-Partitioning:**
   - Separate caches for different regions
   - Reduces cache size and improves query speed

4. **Analytics:**
   - Track cache hit rates
   - Monitor Mapbox API usage
   - Alert on unusual patterns

5. **Compression:**
   - Compress cached JSON in Table Storage
   - Reduces storage costs for large feeds

## Rollback Plan

To revert to previous behavior:

1. Remove new files:
   - `api/shared/storageService.js`
   - `api/shared/geocodingService.js`

2. Restore original API endpoints from git history:
   - `api/getCFAFeed/index.js`
   - `api/getEmergencyFeed/index.js`

3. Restore frontend geocoding:
   - `app.js` (restore `geocodeLocation()` function)

4. Remove dependency:
   - Remove `@azure/data-tables` from `api/package.json`

5. Redeploy application

6. Delete Table Storage tables (optional):
   - FeedCache
   - EnrichedAlerts
   - FetchTracker

## Security Considerations

1. **STORAGE_STRING protection:**
   - Never commit to source control
   - Use Azure Key Vault in production
   - Rotate keys periodically

2. **MAPBOX_TOKEN security:**
   - Backend-only token (not exposed to frontend)
   - Restrict to geocoding API only
   - Monitor usage for anomalies

3. **Table Storage access:**
   - Use SAS tokens for least privilege
   - Enable Azure AD authentication
   - Audit access logs

4. **Rate limiting:**
   - 1 fetch per minute prevents abuse
   - Consider adding user-based rate limiting
   - Monitor for unusual patterns

## Support

For issues or questions:
1. Check Azure Function logs in Azure Portal
2. Verify environment variables are set correctly
3. Test Table Storage connectivity
4. Review X-Cache-Status headers
5. Check this documentation for troubleshooting steps
