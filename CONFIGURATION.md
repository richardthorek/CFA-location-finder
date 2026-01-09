# CFA Location Finder - Configuration Guide

## MapBox API Setup

The application uses MapBox for displaying maps and geocoding locations. You'll need a free MapBox account and API token.

### Getting a MapBox Token

1. Go to [MapBox Account](https://account.mapbox.com/)
2. Sign up for a free account
3. Navigate to "Access Tokens"
4. Copy your default public token or create a new one

### Configuring the Token

The application now reads the MapBox token from the `MAPBOX_TOKEN` environment variable instead of hardcoding it in the source code.

**For Local Development:**
- The app will use a fallback demo token if the `MAPBOX_TOKEN` environment variable is not set
- To test with your own token locally, you can set the environment variable before running:
  ```bash
  export MAPBOX_TOKEN='your_token_here'
  ```

**For Production (Azure Static Web Apps):**
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your Static Web App resource
3. Select **Configuration** from the left menu
4. Add a new Application Setting:
   - **Name**: `MAPBOX_TOKEN`
   - **Value**: Your MapBox API token from https://account.mapbox.com/
5. Click **Save**
6. The Azure Function will now serve this token to the frontend application

### Azure Static Web App Deployment

1. **Create Azure Static Web App**:
   - Go to [Azure Portal](https://portal.azure.com)
   - Create new Static Web App
   - Connect to your GitHub repository
   - Set build configuration:
     - App location: `/`
     - API location: `api`
     - Output location: `` (empty)

2. **Configure GitHub Secret**:
   - The deployment action needs `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - This is automatically created when you set up the Static Web App
   - Available in your Azure resource under "Deployment token"

3. **Update MapBox Token**:
   - Set the `MAPBOX_TOKEN` environment variable in Azure Static Web App Configuration
   - Navigate to: Azure Portal → Your Static Web App → Configuration → Application settings
   - Add: Name: `MAPBOX_TOKEN`, Value: Your token from https://account.mapbox.com/

### Testing Locally

#### Frontend Only (Mock Data)
Simply open `index.html` in a browser. The app will use mock data when the API is unavailable.

#### With Azure Functions
```bash
# Install Azure Functions Core Tools
npm install -g azure-functions-core-tools@4

# Install dependencies
cd api
npm install

# Run functions locally
cd ..
func start --prefix api

# In another terminal, serve the frontend
python3 -m http.server 8080
```

Then open http://localhost:8080 in your browser.

### API Endpoint Configuration

The frontend will automatically use:
- Local development: `http://localhost:7071/api/getCFAFeed`
- Production: `/api/getCFAFeed` (served by Azure Static Web Apps)

You can modify the endpoint in `app.js`:

```javascript
const CONFIG = {
    apiEndpoint: '/api/getCFAFeed' // or full URL for different backend
};
```

### CFA Feed URL

The Azure Function fetches data from:
```
https://www.mazzanet.net.au/cfa/pager-cfa.php
```

If this URL changes, update it in `api/getCFAFeed/index.js`:

```javascript
const CFA_FEED_URL = 'https://www.mazzanet.net.au/cfa/pager-cfa.php';
```

### Security Notes

- The MapBox token is now loaded from the `MAPBOX_TOKEN` environment variable
- Set this environment variable in Azure Static Web App Configuration (Application settings)
- The token is served through a secure Azure Function endpoint
- MapBox free tier includes:
  - 50,000 map loads per month
  - 100,000 geocoding requests per month
- Monitor usage in your MapBox dashboard

### Troubleshooting

#### Map doesn't load
- Check browser console for errors
- Verify MapBox token is valid in Azure Configuration
- Check that the `MAPBOX_TOKEN` environment variable is set in Azure Static Web App settings
- Test the config endpoint: `/api/getConfig`
- Ensure you're not over rate limits

#### No alerts showing
- Check if CFA feed is accessible
- Look at Azure Function logs in Azure Portal
- Test the API endpoint directly: `/api/getCFAFeed`

#### CORS errors in local development
- Azure Functions include CORS headers
- For local testing, use the provided `func start` command
- Or disable CORS in browser for testing (not recommended for production)

### Environment Variables

You can use Azure App Settings to configure the application:

In Azure Portal → Static Web App → Configuration → Application settings:
- `MAPBOX_TOKEN`: **Required** - Your MapBox API token for map rendering and geocoding
- `CFA_FEED_URL`: Override the default CFA feed URL if needed
- Any other custom configuration needed

### Support

For issues, check:
1. Browser console (F12) for frontend errors
2. Azure Portal → Function logs for backend errors
3. GitHub Issues for known problems
