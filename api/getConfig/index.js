/**
 * Azure Function to provide frontend configuration
 * This securely serves environment variables to the frontend
 */
module.exports = async function (context, req) {
    context.log('Configuration request received');

    try {
        // Get MapBox token from environment variable
        // Falls back to a placeholder if not configured
        const mapboxToken = process.env.MAPBOX_TOKEN || 'MAPBOX_TOKEN_NOT_CONFIGURED';

        // Validate that token is configured
        if (mapboxToken === 'MAPBOX_TOKEN_NOT_CONFIGURED') {
            context.log.warn('MAPBOX_TOKEN environment variable is not configured');
        }

        // Return configuration object
        const config = {
            mapboxToken: mapboxToken,
            mapCenter: [144.9631, -37.8136], // Victoria, Australia
            mapZoom: 7,
            apiEndpoint: '/api/getCFAFeed',
            refreshInterval: 60000 // 1 minute
        };

        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
            },
            body: JSON.stringify(config)
        };

    } catch (error) {
        context.log.error('Error providing configuration:', error);
        
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Failed to load configuration',
                message: error.message
            })
        };
    }
};
