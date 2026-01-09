# CFA Location Finder

A real-time fire alert map for Victoria, Australia. This application displays Country Fire Authority (CFA) alerts on an interactive map using the MapBox API.

## Features

- 🗺️ Interactive map displaying fire alert locations
- 📍 **User location detection** - Detect and center on your current location
- 🎯 **Smart filtering** - Automatically show incidents within 100km radius
- 📏 **Distance calculation** - See how far each incident is from your location
- 🛣️ **Route display** - View driving routes and travel times to selected incidents
- 🔄 Real-time feed updates from CFA
- ⏱️ Auto-refresh every 1 minute
- 📍 Automatic location parsing and geocoding
- 🚒 Alert details with timestamps
- 📱 Responsive design for mobile and desktop

## Architecture

This is a static web application designed to deploy on Azure Static Web Apps with an Azure Function backend:

- **Frontend**: Pure HTML, CSS, and JavaScript (no frameworks)
- **Backend**: Azure Function to proxy CFA feed and avoid CORS issues
- **Map**: MapBox GL JS for interactive mapping
- **Geocoding**: MapBox Geocoding API for location lookups

## Local Development

### Prerequisites

- Node.js 18+ (for Azure Functions)
- Azure Functions Core Tools (optional, for local testing)
- MapBox API token (free tier available)

### Setup

1. Clone the repository
```bash
git clone https://github.com/richardthorek/CFA-location-finder.git
cd CFA-location-finder
```

2. Install Azure Function dependencies
```bash
cd api
npm install
cd ..
```

3. Configure Environment Variables

For local development, create a `local.settings.json` file in the `api` directory:
```bash
cd api
cat > local.settings.json << 'EOF'
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "MAPBOX_TOKEN": "YOUR_MAPBOX_TOKEN_HERE"
  }
}
EOF
cd ..
```

Get a free MapBox token at: https://account.mapbox.com/access-tokens/

**Note**: `local.settings.json` is gitignored and should never be committed to the repository.

4. Run locally

To test with Azure Functions locally:
```bash
cd api
npm start
```

Then open `index.html` in a browser. The app will fetch the configuration including the MapBox token from the API.

## Environment Variables

This application uses the following environment variables and configuration:

### Required Variables

#### MAPBOX_TOKEN (Backend Environment Variable)

**Purpose**: API token for MapBox mapping and geocoding services

**How to configure**:

**Local Development:**
1. Get a free token at: https://account.mapbox.com/access-tokens/
2. Create `api/local.settings.json` (this file is gitignored):
   ```json
   {
     "IsEncrypted": false,
     "Values": {
       "AzureWebJobsStorage": "",
       "FUNCTIONS_WORKER_RUNTIME": "node",
       "MAPBOX_TOKEN": "YOUR_MAPBOX_TOKEN_HERE"
     }
   }
   ```

**Azure Production:**
1. In Azure Portal, navigate to your Static Web App
2. Go to Configuration → Application settings
3. Add a new setting:
   - Name: `MAPBOX_TOKEN`
   - Value: Your MapBox token from https://account.mapbox.com/access-tokens/

**Security**: The token is now securely stored as an environment variable and served through the `/api/getConfig` endpoint. It is never hardcoded in the frontend code.

**MapBox Free Tier Limits**:
- 50,000 map loads per month
- 100,000 geocoding requests per month

### Optional Variables

#### CFA_FEED_URL (Azure Function Environment Variable)

**Purpose**: Override the default CFA feed URL if needed

**How to configure**:
1. In Azure Portal, navigate to your Static Web App
2. Go to Configuration → Application settings
3. Add a new setting:
   - Name: `CFA_FEED_URL`
   - Value: Your custom CFA feed URL

**Default**: `https://www.mazzanet.net.au/cfa/pager-cfa.php`

**When to use**: Only needed if the default CFA feed URL changes or you want to use a different data source.

### Deployment Variables

#### AZURE_STATIC_WEB_APPS_API_TOKEN (GitHub Actions Secret)

**Purpose**: Authentication token for deploying to Azure Static Web Apps

**How to configure**:
1. This is automatically created when you set up Azure Static Web Apps with GitHub
2. Find it in Azure Portal → Your Static Web App → Manage deployment token
3. It's automatically added to your GitHub repository secrets as `AZURE_STATIC_WEB_APPS_API_TOKEN`

**When to use**: Required for CI/CD deployment via GitHub Actions. Do not modify unless you're recreating the Azure Static Web App.

## Deployment to Azure

### Azure Static Web Apps

1. Create an Azure Static Web App in the Azure Portal
2. Connect it to your GitHub repository
3. Configure the build settings:
   - **App location**: `/`
   - **API location**: `api`
   - **Output location**: `` (leave empty for static sites)

4. The GitHub Actions workflow will automatically deploy your app

### Configuration

See the [Environment Variables](#environment-variables) section above for detailed configuration instructions, including:
- MapBox API token setup (required)
- Optional CFA feed URL override
- Azure deployment credentials

## Usage

1. Open the application in your browser
2. The map will automatically load with the Victoria region centered
3. **Click "Locate Me"** to detect your current location and filter nearby incidents
4. When location is detected:
   - Map centers on your location with a blue marker
   - Only incidents within 100km are shown
   - Distances are displayed for each alert
   - Alerts are sorted by distance (nearest first)
5. Alerts automatically refresh every 1 minute
6. Click "Refresh Alerts" to manually fetch the latest CFA alerts
7. Click on any alert in the sidebar to view it on the map
8. When an alert is selected and you've enabled location:
   - A blue route line shows the driving path from your location
   - Distance and estimated travel time are displayed
9. Click on map markers to see alert details in a popup

## Feed Format

The application expects the CFA feed to provide alert messages. It will:

1. Parse messages to extract location information
2. Use MapBox geocoding to find coordinates for Victoria locations
3. Display alerts on the map with markers

Common CFA message formats supported:
- "GRASS FIRE AT [LOCATION] VIC"
- "STRUCTURE FIRE NR [LOCATION] VICTORIA"
- "VEHICLE FIRE IN [LOCATION] VIC"

## Customization

### Styling

Edit `styles.css` to customize the appearance:
- Colors: Modify the CSS variables
- Layout: Adjust the flexbox layout
- Responsive breakpoints: Edit media queries

### Map Configuration

Edit `app.js` to configure:
- Initial map center and zoom
- Map style (change MapBox style)
- Marker colors and popups
- Auto-refresh interval (default: 60000ms = 1 minute)

### Alert Parsing

Modify the `parseLocation()` function in `app.js` to handle different message formats.

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

For issues or questions, please open an issue on GitHub.

## Acknowledgments

- CFA Victoria for providing the alert feed
- MapBox for mapping and geocoding services
- Azure Static Web Apps for hosting