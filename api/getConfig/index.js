/**
 * Azure Function to provide frontend configuration
 * This securely serves environment variables to the frontend
 */
module.exports = async function (context, req) {
    context.log('Configuration request received');

    try {
        // Get MapBox token from environment variable
        const mapboxToken = process.env.MAPBOX_TOKEN;

        // Return error if token is not configured
        if (!mapboxToken) {
            context.log.error('MAPBOX_TOKEN environment variable is not configured');
            
            context.res = {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Configuration error',
                    message: 'Server configuration is incomplete. Please contact the administrator.'
                })
            };
            return;
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
                'Cache-Control': 'private, max-age=300' // Private cache for 5 minutes
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
                message: 'An unexpected error occurred. Please try again later.'
            })
        };
    }
};
