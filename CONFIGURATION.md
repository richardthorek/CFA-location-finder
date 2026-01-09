# CFA Location Finder - Configuration Guide

## MapBox API Setup

The application uses MapBox for displaying maps and geocoding locations. You'll need a free MapBox account and API token.

### Getting a MapBox Token

1. Go to [MapBox Account](https://account.mapbox.com/)
2. Sign up for a free account
3. Navigate to "Access Tokens"
4. Copy your default public token or create a new one

### Configuring the Token

Edit `app.js` and replace the token in the CONFIG object:

```javascript
const CONFIG = {
    mapboxToken: 'YOUR_MAPBOX_TOKEN_HERE', // Replace with your token
    mapCenter: [144.9631, -37.8136],
    mapZoom: 7,
    apiEndpoint: '/api/getCFAFeed'
};
```

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
   - The deployment action needs `AZURE_STATIC_WEB_APPS_API_TOKEN_ZEALOUS_POND_09CBFB91E`
   - This is automatically created when you set up the Static Web App
   - Available in your Azure resource under "Deployment token"

3. **Update MapBox Token**:
   - After deployment, update the token in `app.js`
   - Commit and push to trigger redeployment

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

- The default MapBox token in the code is public and limited
- Replace it with your own token for production use
- MapBox free tier includes:
  - 50,000 map loads per month
  - 100,000 geocoding requests per month
- Monitor usage in your MapBox dashboard

### Troubleshooting

#### Map doesn't load
- Check browser console for errors
- Verify MapBox token is valid
- Ensure you're not over rate limits

#### No alerts showing
- Check if CFA feed is accessible
- Look at Azure Function logs in Azure Portal
- Test the API endpoint directly: `/api/getCFAFeed`

#### CORS errors in local development
- Azure Functions include CORS headers
- For local testing, use the provided `func start` command
- Or disable CORS in browser for testing (not recommended for production)

### Environment Variables (Optional)

You can use Azure App Settings to configure the API:

In Azure Portal → Static Web App → Configuration:
- `CFA_FEED_URL`: Override the default CFA feed URL
- Any other custom configuration needed

### Support

For issues, check:
1. Browser console (F12) for frontend errors
2. Azure Portal → Function logs for backend errors
3. GitHub Issues for known problems
