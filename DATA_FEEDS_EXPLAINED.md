# Data Feeds Explained

This document explains the three different data feeds used by the CFA Location Finder application and how to troubleshoot feed issues.

## Overview of the Three Feeds

The application integrates three distinct data sources:

### 1. CFA Pager Alerts (✓ Working)
- **Source**: CFA pager messages via third-party feed
- **API Endpoint**: `/api/getCFAFeed`
- **Feed URL**: `https://www.mazzanet.net.au/cfa/pager-cfa.php`
- **Data Type**: Real-time pager dispatches to CFA units
- **Format**: HTML table with capcode, timestamp, and message
- **Display**: Shows in "CFA Pager Alerts" section with 📟 icon
- **Characteristics**:
  - Contains dispatch messages to fire brigades
  - Includes location extraction from message text
  - Requires geocoding to get coordinates
  - No warning levels (these are dispatch alerts, not public warnings)

### 2. CFA Current Incidents (❌ Not Loading)
- **Source**: Emergency Victoria RSS feed (filtered for CFA incidents)
- **API Endpoint**: `/api/getEmergencyFeed`
- **Feed URL**: `https://data.emergency.vic.gov.au/Show?pageId=getIncidentRSS`
- **Data Type**: Current fire incidents managed by CFA
- **Format**: RSS/XML with structured incident data
- **Display**: Shows in "Emergency Incidents" section with ▲ icon and "VIC" badge
- **Characteristics**:
  - Contains official incident information
  - Includes coordinates, warning levels, and status
  - Filtered by agency (CFA or "Country Fire")
  - Has warning level classification (Advice, Watch & Act, Emergency)
  - **Status**: Currently not returning CFA incidents (possible feed issue)

### 3. NSW RFS Current Incidents (✓ Working)
- **Source**: NSW Rural Fire Service RSS feed
- **API Endpoint**: `/api/getEmergencyFeed`
- **Feed URL**: `https://www.rfs.nsw.gov.au/feeds/majorIncidents.xml`
- **Data Type**: Major fire incidents in NSW
- **Format**: RSS/XML with georss:point coordinates
- **Display**: Shows in "Emergency Incidents" section with ▲ icon and "NSW" badge
- **Characteristics**:
  - Contains major fire incidents in NSW
  - Includes coordinates via georss:point
  - Has warning level classification
  - Used for cross-border awareness

## Feed Architecture

```
Frontend (app.js)
    │
    ├─► loadAlerts()
    │   │
    │   ├─► fetch('/api/getCFAFeed') ──► CFA Pager Alerts
    │   │   └─► cfaAlerts[] (📟 icons)
    │   │
    │   └─► fetch('/api/getEmergencyFeed') ──► Combined Emergency Feed
    │       ├─► Emergency VIC ──► CFA Current Incidents
    │       │   └─► emergencyIncidents[] (▲ VIC badge)
    │       └─► NSW RFS ──► NSW Incidents
    │           └─► emergencyIncidents[] (▲ NSW badge)
    │
    └─► Display
        ├─► displayCFAAlerts() → "CFA Pager Alerts" section
        └─► displayEmergencyIncidents() → "Emergency Incidents" section
```

## Troubleshooting CFA Current Incidents

The CFA current incidents feed is not loading. Here's how to diagnose:

### Step 1: Check Azure Function Logs

After deployment, check the Azure Function logs:

1. Go to Azure Portal → Your Static Web App
2. Navigate to Functions → getEmergencyFeed
3. Check the logs for:
   ```
   Emergency Feed request received
   Fetching Emergency VIC feed from: https://data.emergency.vic.gov.au/...
   Emergency VIC response status: <status_code>
   Emergency VIC feed length: <number> characters
   Parsed X total incidents from Emergency VIC
   Found Y CFA-specific incidents
   ```

### Step 2: Verify Feed URL

Test the feed URL directly:
```bash
curl -L "https://data.emergency.vic.gov.au/Show?pageId=getIncidentRSS"
```

Expected output: XML/RSS feed with `<item>` elements

### Step 3: Check Browser Console

Open browser console (F12) and look for:
```
✓ Loaded X emergency incidents (VIC: Y, NSW: Z)
Displaying Y VIC incidents and Z NSW incidents
```

If VIC count is 0, the feed is not returning CFA incidents.

### Step 4: Common Issues

1. **Feed is Down**: Emergency VIC feed may be temporarily unavailable
   - **Solution**: Wait and retry, the feed is maintained by Emergency Victoria

2. **No Current CFA Incidents**: There may genuinely be no active CFA incidents
   - **Check**: Look at CFA website to verify
   - **Expected**: During low-risk periods, this is normal

3. **Parsing Error**: Feed format may have changed
   - **Check**: Azure Function logs will show parsing errors
   - **Solution**: Update parsing logic in `api/getEmergencyFeed/index.js`

4. **Filtering Issue**: CFA incidents exist but are filtered out
   - **Check**: Look for "agency" field in feed data
   - **Current Filter**: `agency.includes('CFA') || agency.includes('COUNTRY FIRE')`
   - **Solution**: Adjust filter if agency names have changed

### Step 5: Enhanced Logging

The code now includes extensive logging:

**Backend (Azure Function)**:
- Feed URL being fetched
- Response status code
- Feed content length
- Preview of first 500 characters
- Number of items parsed
- Number of CFA-specific incidents found
- Error messages with stack traces

**Frontend (Browser)**:
- Total incidents loaded
- Breakdown by source (VIC vs NSW)
- Feed fetch status messages

## Testing with Mock Data

If feeds are unavailable, the app falls back to mock data when BOTH CFA alerts and Emergency incidents fail:

```javascript
// If both APIs failed, use mock data
if (cfaAlerts.length === 0 && emergencyIncidents.length === 0) {
    console.warn('Both APIs unavailable, using mock data');
    const mockData = getMockAlerts();
    cfaAlerts = mockData;
    emergencyIncidents = [];
}
```

## Differences Between Feeds

| Feature | CFA Pager Alerts | CFA Current Incidents | NSW RFS Incidents |
|---------|------------------|----------------------|-------------------|
| **Icon** | 📟 (Pager) | ▲ (Triangle) | ▲ (Triangle) |
| **Badge** | None | VIC | NSW |
| **Source** | Pager dispatches | Emergency VIC | NSW RFS |
| **Coordinates** | Via geocoding | In feed | In feed (georss:point) |
| **Warning Level** | No | Yes (Advice/Watch/Emergency) | Yes |
| **Real-time** | Yes (~1-2 min delay) | Yes (~5-10 min delay) | Yes |
| **Geographic Coverage** | Victoria only | Victoria only | NSW only |
| **Data Freshness** | Immediate | Updated regularly | Updated regularly |
| **Reliability** | High | Medium* | High |

*Currently experiencing issues

## Feed Update Intervals

The application refreshes all feeds automatically:

- **Auto-refresh interval**: 60 seconds (1 minute)
- **Manual refresh**: Click "Refresh Alerts" button
- **On load**: Fetches immediately when page loads

## Expected Behavior

When all three feeds are working correctly:

1. **CFA Pager Alerts section** (📟):
   - Shows recent dispatch messages
   - Typically 5-30 alerts
   - Locations extracted from message text

2. **Emergency Incidents section** (▲):
   - Shows mix of VIC and NSW incidents
   - VIC incidents from CFA and other agencies
   - NSW incidents for border awareness
   - Typically 0-20 incidents total
   - Each has warning level color coding

3. **Map**:
   - Blue markers (📟) for CFA pager alerts
   - Colored triangles (▲) for emergency incidents
   - Color indicates warning level (yellow/orange/red)

## Next Steps

To fully resolve the CFA current incidents issue:

1. **Monitor Azure Function logs** after deployment
2. **Verify Emergency VIC feed** is accessible and returning data
3. **Check agency field values** in feed to ensure filter is correct
4. **Consider alternative feeds** if Emergency VIC feed is permanently unavailable
5. **Add fallback CFA source** if primary feed continues to fail

## Alternative CFA Sources

If the Emergency VIC feed continues to fail for CFA incidents, consider:

1. **VicEmergency API**: Official Emergency Victoria API (requires registration)
2. **CFA RSS/JSON feeds**: Direct CFA incident feeds if available
3. **Scraping CFA Incidents page**: Last resort, parse HTML from CFA website

## Contact

For issues with:
- **CFA Pager Feed**: Contact feed maintainer at mazzanet.net.au
- **Emergency VIC Feed**: Contact Emergency Management Victoria
- **NSW RFS Feed**: Contact NSW Rural Fire Service
- **This Application**: Open an issue on GitHub
