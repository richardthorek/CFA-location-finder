# CFA Location Finder

A real-time fire alert map for Victoria, Australia. This application displays Country Fire Authority (CFA) alerts on an interactive map using the MapBox API.

## Features

- 🗺️ Interactive map displaying fire alert locations
- 🔄 Real-time feed updates from CFA
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

3. Configure MapBox Token

Edit `app.js` and replace the MapBox token:
```javascript
const CONFIG = {
    mapboxToken: 'YOUR_MAPBOX_TOKEN_HERE',
    // ...
};
```

Get a free token at: https://account.mapbox.com/

4. Run locally

You can open `index.html` directly in a browser for frontend development. The app includes mock data that will be used when the API is not available.

To test with Azure Functions locally:
```bash
cd api
npm start
```

Then open `index.html` in a browser.

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

The app uses the following environment configuration:

- **API Endpoint**: Automatically configured as `/api/getCFAFeed` in production
- **MapBox Token**: Should be configured in `app.js`

### Environment Variables (Optional)

For the Azure Function, you can set environment variables in the Azure Portal:

- `CFA_FEED_URL`: Override the default CFA feed URL if needed

## Usage

1. Open the application in your browser
2. The map will automatically load with the Victoria region centered
3. Click "Refresh Alerts" to fetch the latest CFA alerts
4. Click on any alert in the sidebar to view it on the map
5. Click on map markers to see alert details in a popup

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