# Map Rendering Troubleshooting Guide

## Problem
The map was not rendering in the CFA Location Finder application.

## Root Cause
The Azure Static Web Apps workflow file had an incorrect configuration:
```yaml
api_location: ""  # ❌ Empty string - API functions not deployed
```

This prevented the Azure Functions from being deployed, which meant:
- `/api/getConfig` endpoint was not available
- The frontend couldn't fetch the MAPBOX_TOKEN from the environment
- MapBox initialization failed without a valid token
- Map failed to render

## Solution
Updated the workflow file to correctly specify the API location:
```yaml
api_location: "api"  # ✅ Correct - deploys functions from /api directory
```

## How to Verify the Fix

### 1. Check Deployment Status
After this PR is merged:
1. Go to GitHub Actions tab in the repository
2. Wait for the "Azure Static Web Apps CI/CD" workflow to complete
3. Verify it shows ✅ successful deployment

### 2. Verify API Functions Are Deployed
Open your browser to the deployed site and check:

**Test the Config Endpoint:**
```
https://your-app-url.azurestaticapps.net/api/getConfig
```

You should see a JSON response like:
```json
{
  "mapboxToken": "pk.your_actual_token_here...",
  "mapCenter": [144.9631, -37.8136],
  "mapZoom": 7,
  "apiEndpoint": "/api/getCFAFeed",
  "refreshInterval": 60000
}
```

### 3. Check Browser Console
Open the application and check the browser console (F12):

**Expected Logs:**
```
Configuration loaded from API
Auto-refresh enabled: updating every 60 seconds
```

**No Errors About:**
- "Failed to load configuration"
- "mapboxgl.accessToken is required"
- Network errors for `/api/getConfig`

### 4. Verify Map Loads
The map should:
- ✅ Display the MapBox map with Victoria, Australia centered
- ✅ Show navigation controls (zoom +/-)
- ✅ Load fire alert markers (if any alerts exist)
- ✅ Respond to interactions (pan, zoom, click)

### 5. Check Network Tab
In browser DevTools Network tab, verify:
- ✅ Request to `/api/getConfig` returns 200 OK
- ✅ Request to `/api/getCFAFeed` returns 200 OK (or uses mock data)
- ✅ Requests to `api.mapbox.com` for map tiles return 200 OK

## Environment Variables Setup

Ensure the MAPBOX_TOKEN is configured in Azure:

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your Static Web App resource
3. Select **Configuration** from the left menu
4. Under **Application settings**, verify:
   - **Name**: `MAPBOX_TOKEN`
   - **Value**: Your MapBox API token
5. If not present, add it and click **Save**

## Testing Locally

To test the fix locally before deployment:

```bash
# Install dependencies
cd api
npm install

# Set environment variable
export MAPBOX_TOKEN='your_mapbox_token_here'

# Start Azure Functions locally (requires Azure Functions Core Tools)
func start --prefix api

# In another terminal, serve the frontend
cd ..
python3 -m http.server 8080

# Open http://localhost:8080 in browser
```

## Common Issues After Fix

### Map Still Not Loading?

**Check 1: Environment Variable**
- Verify `MAPBOX_TOKEN` is set in Azure Configuration
- Value should start with `pk.`
- No extra spaces or quotes

**Check 2: Token Validity**
- Visit https://account.mapbox.com/
- Check your token hasn't expired or been revoked
- Verify it's a public token (not secret)

**Check 3: Rate Limits**
- MapBox free tier: 50,000 map loads/month
- Check your usage in MapBox dashboard
- May need to upgrade plan if exceeded

**Check 4: Browser Cache**
- Hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac)
- Or clear browser cache for the site
- Try in incognito/private mode

## What Changed

### Before (Broken)
```yaml
# Workflow file
api_location: ""  # Empty - no API deployment

# Result:
# - /api/getConfig not available (404)
# - Frontend can't get MAPBOX_TOKEN
# - Map initialization fails
# - Blank screen where map should be
```

### After (Fixed)
```yaml
# Workflow file
api_location: "api"  # Correctly points to /api directory

# Result:
# - /api/getConfig deployed and available
# - /api/getCFAFeed deployed and available  
# - Frontend fetches MAPBOX_TOKEN successfully
# - Map initializes and renders
# - Fire alerts display on map
```

## Additional Notes

- The MAPBOX_TOKEN functionality was already implemented in main (PR #3)
- This PR only adds the critical workflow fix to deploy the API functions
- No changes to application code needed - it already handles config correctly
- After merge, the app should work immediately once deployed

## Support

If the map still doesn't render after following all steps:
1. Check Azure Static Web App logs in Azure Portal
2. Check browser console for JavaScript errors
3. Verify network requests in DevTools
4. Confirm MAPBOX_TOKEN environment variable is set correctly
