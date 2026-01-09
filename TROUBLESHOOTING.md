# Map Rendering Troubleshooting Guide

## Problem
The map was not rendering in the CFA Location Finder application.

## Root Cause
The Azure Static Web Apps workflow file had an incorrect configuration:
```yaml
api_location: ""  # ❌ Empty string - API functions not deployed
```

This prevented the Azure Functions from being deployed, which meant:
- `/api/getCFAFeed` endpoint was not available
- The application couldn't fetch fire alerts from the CFA feed
- However, the main issue is that in the main branch, the `/api/getConfig` endpoint is also not being deployed
- This prevents the frontend from fetching the MAPBOX_TOKEN from the environment

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

**Test the CFA Feed Endpoint:**
```
https://your-app-url.azurestaticapps.net/api/getCFAFeed
```

You should see a JSON array with fire alerts (or an empty array if no active alerts).

**Important**: The main branch has a `/api/getConfig` endpoint that this branch doesn't include. After merging this PR into main, both endpoints will be deployed and work together.

### 3. Check Browser Console
Open the application and check the browser console (F12):

**Expected Logs:**
```
Auto-refresh enabled: updating every 60 seconds
```

**If merging into main** (which has getConfig):
```
Configuration loaded from API
Auto-refresh enabled: updating every 60 seconds
```

**Check for Errors:**
- No "mapboxgl.accessToken is required" errors
- No 404 errors for API endpoints
- Map should initialize successfully

### 4. Verify Map Loads
The map should:
- ✅ Display the MapBox map with Victoria, Australia centered
- ✅ Show navigation controls (zoom +/-)
- ✅ Load fire alert markers (if any alerts exist)
- ✅ Respond to interactions (pan, zoom, click)

### 5. Check Network Tab
In browser DevTools Network tab, verify:
- ✅ Request to `/api/getCFAFeed` returns 200 OK (or gracefully falls back to mock data)
- ✅ Requests to `api.mapbox.com` for map tiles return 200 OK
- ✅ If merged to main: Request to `/api/getConfig` also returns 200 OK

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
# - /api/getCFAFeed not available (404)
# - /api/getConfig (in main) not available (404)
# - Frontend can't fetch fire alerts
# - Frontend can't get MAPBOX_TOKEN (in main)
# - Map may not load or show errors
```

### After (Fixed)
```yaml
# Workflow file
api_location: "api"  # Correctly points to /api directory

# Result when merged to main:
# - /api/getCFAFeed deployed and available
# - /api/getConfig deployed and available (from main)
# - Frontend fetches fire alerts successfully
# - Frontend fetches MAPBOX_TOKEN successfully (from main)
# - Map initializes and renders correctly
# - Fire alerts display on map
```

## Additional Notes

- The MAPBOX_TOKEN environment variable functionality was already implemented in main (PR #3)
- This PR only adds the critical workflow fix to deploy the API functions from the `/api` directory
- When merged to main, it will enable deployment of both:
  - `/api/getCFAFeed` - fetches CFA fire alerts
  - `/api/getConfig` - serves MAPBOX_TOKEN from environment (already in main)
- The workflow fix is the key change - without it, API functions aren't deployed regardless of the code

## Support

If the map still doesn't render after following all steps:
1. Check Azure Static Web App logs in Azure Portal
2. Check browser console for JavaScript errors
3. Verify network requests in DevTools
4. Confirm MAPBOX_TOKEN environment variable is set correctly
