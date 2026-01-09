# Deployment Guide for Backend Fetch Changes

## Overview
This deployment implements an on-demand backend system that fetches and enriches CFA alert data only when users have pages open. The backend is triggered by the frontend every minute and rate-limits fetches to once per minute, storing enriched data in Azure Table Storage for efficient distribution to all users. When all pages are closed, fetching stops automatically.

## Pre-Deployment Requirements

### 1. Azure Storage Account
You need an Azure Storage Account to store the alert data.

**Option A: Create via Azure Portal**
1. Go to Azure Portal → Create a resource → Storage account
2. Fill in:
   - Resource group: (your resource group)
   - Storage account name: (unique name)
   - Region: (same as your app)
   - Performance: Standard
   - Redundancy: LRS (or as needed)
3. Review + Create

**Option B: Use Azure CLI**
```bash
az storage account create \
  --name <your-storage-name> \
  --resource-group <your-resource-group> \
  --location <your-region> \
  --sku Standard_LRS
```

### 2. Get Connection String
After creating the storage account:
1. Go to Storage Account → Access Keys
2. Copy "Connection string" from key1 or key2

## Configuration Steps

### For Production (Azure Static Web Apps)

1. **Navigate to Configuration**
   - Azure Portal → Your Static Web App → Configuration → Application settings

2. **Add STORAGE_STRING Variable**
   - Click "Add"
   - Name: `STORAGE_STRING`
   - Value: (paste your storage connection string)
   - Click "OK" then "Save"

3. **Verify MAPBOX_TOKEN**
   - Ensure `MAPBOX_TOKEN` is already configured
   - If not, add it with your MapBox API token

### For Local Development

1. **Create `api/local.settings.json`**
   ```json
   {
     "IsEncrypted": false,
     "Values": {
       "AzureWebJobsStorage": "",
       "FUNCTIONS_WORKER_RUNTIME": "node",
       "MAPBOX_TOKEN": "your_mapbox_token_here",
       "STORAGE_STRING": "your_storage_connection_string_here"
     }
   }
   ```

2. **Install Dependencies**
   ```bash
   cd api
   npm install
   ```

3. **Start Azure Functions Locally**
   ```bash
   cd api
   func start
   ```
   Or from root:
   ```bash
   cd api && npm start
   ```

## Testing the Deployment

### 1. Verify Timer Function
The `fetchAndStoreCFA` function should start automatically and run every 10 minutes.

**Check Logs:**
- Azure Portal → Your Static Web App → Functions → fetchAndStoreCFA → Monitor
### 1. Verify Fetch Function
The `fetchAndStoreCFA` function is now HTTP-triggered and called by the frontend.

**Check Frontend Calls:**
1. Open your app URL in a browser
2. Open Developer Tools (F12) → Network tab
3. Look for calls to `/api/fetchAndStoreCFA`
4. First call should return `{"success": true, ...}`
5. Subsequent calls within 1 minute should return `{"skipped": true, ...}`

**Check Logs:**
- Azure Portal → Your Static Web App → Functions → fetchAndStoreCFA → Monitor
- Look for log entries showing:
  - "Fetch and Store CFA data function called"
  - "Skipping fetch - only Xs since last fetch" (for rate-limited calls)
  - "Parsed X alerts from feed"
  - "Successfully processed X alerts, enriched Y new locations"

### 2. Verify API Endpoint
Test the getCFAFeed endpoint:

```bash
curl https://your-app.azurestaticapps.net/api/getCFAFeed
```

Expected response:
- HTTP 200 status
- JSON array of alerts with coordinates
- Each alert should have: message, timestamp, location, coordinates, incidentId

### 3. Verify Frontend
1. Open your app URL in a browser
2. Check that alerts load correctly
3. Verify markers appear on the map with coordinates
4. Check browser console for:
   - "Backend fetch completed: X alerts, Y enriched" (on first load)
   - "Backend fetch skipped: Too recent" (on subsequent refreshes within 1 minute)
5. Verify auto-refresh works every 1 minute
6. Close all tabs and verify fetching stops (no more calls to fetchAndStoreCFA)

### 4. Verify Table Storage
Check that data is being stored:

**Via Azure Portal:**
1. Go to Storage Account → Storage browser → Tables
2. Look for "CFAAlerts" table
3. Verify it contains entries with PartitionKey "alert"

**Via Azure Storage Explorer (Desktop App):**
1. Connect to your storage account
2. Navigate to Tables → CFAAlerts
3. View stored entities

## Troubleshooting

### Fetch Function Not Running
- **Check Configuration:** Verify `STORAGE_STRING` and `MAPBOX_TOKEN` are set
- **Check Logs:** Look for error messages in Function logs in Azure Portal
- **Check Frontend Calls:** Open browser console and verify fetchAndStoreCFA is being called
- **Manual Test:** Call `/api/fetchAndStoreCFA` directly in browser to test

### API Returns No Data
- **Wait for First Fetch:** Function needs to run at least once (triggered when first user opens page)
- **Check Table Storage:** Verify data exists in CFAAlerts table
- **Check Logs:** Look for errors in getCFAFeed function logs
- **Test Fetch:** Open page and check if fetchAndStoreCFA is being called in network tab

### Geocoding Not Working
- **Check MapBox Token:** Verify token is valid and has quota remaining
- **Check Rate Limits:** Function adds 100ms delay between geocoding calls
- **Check Logs:** Look for "Geocoding location: ..." messages

### Frontend Shows No Coordinates
- **Check API Response:** Verify getCFAFeed returns coordinates
- **Check Browser Console:** Look for JavaScript errors
- **Clear Cache:** Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

## Migration Notes

### What Changed
1. **Frontend:** 
   - No longer performs geocoding - receives pre-enriched data
   - Calls fetchAndStoreCFA endpoint when page loads and every minute
   - Automatically stops fetching when all pages are closed
2. **Backend:** 
   - Changed from timer trigger to HTTP trigger (fetchAndStoreCFA)
   - Rate-limits fetches to once per minute maximum
   - Only fetches when called by frontend (when users have pages open)
3. **Storage:** Dependency on Azure Table Storage for caching and rate limiting

### Backwards Compatibility
- The getCFAFeed API endpoint URL remains the same
- Response format is compatible with existing frontend
- New fetchAndStoreCFA endpoint is backward compatible (returns JSON with status)

### Rollback Plan
If issues occur:
1. Revert to previous commit
2. Redeploy via GitHub Actions
3. Remove STORAGE_STRING environment variable if needed

## Performance Expectations

### Initial Run
- First fetch may take 2-5 minutes (fetching + geocoding all alerts)
- Subsequent fetches are faster (only geocode new alerts)

### Steady State
- Fetches happen every 1 minute while users have pages open
- Rate-limited to prevent excessive API calls
- Geocoding only new alerts (typically 0-10 per fetch)
- API response time: <1 second (reading from cache)
- Frontend load time: Significantly faster (no geocoding delays)
- Automatic stop when all pages closed (zero cost when idle)

### Resource Usage
- Storage: ~1 KB per alert (minimal cost)
- MapBox API: ~1 geocoding request per new alert (vs. per user previously)
- Azure Functions: 
  - fetchAndStoreCFA: Called every minute per active user (rate-limited)
  - getCFAFeed: Called every minute per active user
  - getConfig: Called once per page load
- Cost scales with active users, but fetching rate-limited to 1/minute max

## Monitoring

### Key Metrics to Watch
1. **Fetch Function Call Rate:** Should match number of active users calling every minute
2. **Fetch Function Skip Rate:** Most calls should be skipped due to rate limiting
3. **Geocoding Success Rate:** Check enrichedCount in logs
4. **API Response Time:** Should be <1s for getCFAFeed
5. **Storage Growth:** Monitor table size over time
6. **MapBox API Usage:** Should be minimal (only new alerts geocoded)
7. **Function Execution Time:** fetchAndStoreCFA should complete in <30s

### Alerts to Set Up
- Timer function failures
- API endpoint errors
- MapBox API quota warnings
- Storage account errors

## Next Steps After Deployment

1. **Monitor for 24 hours:** Watch logs and metrics
2. **Verify Cost Impact:** Should see reduced MapBox API usage
3. **Test Edge Cases:** Verify behavior with no data, many alerts, etc.
4. **Document Learnings:** Note any issues or optimizations discovered
5. **Clean Up Old Data:** Consider implementing data retention policy if needed

## Support

For issues or questions:
1. Check Azure Portal logs first
2. Review this deployment guide
3. Check main README.md for environment variable details
4. Open GitHub issue with logs and error messages
