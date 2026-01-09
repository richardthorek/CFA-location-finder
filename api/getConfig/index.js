/**
 * Azure Function to return configuration values from environment variables
 * This allows the frontend to access server-side environment variables securely
 */
module.exports = async function (context, req) {
    context.log('Config request received');

    // Get the MAPBOX_TOKEN from environment variables
    // Falls back to a demo token if not set (for local development)
    const mapboxToken = process.env.MAPBOX_TOKEN || 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw';

    // Return configuration
    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        },
        body: JSON.stringify({
            mapboxToken: mapboxToken
        })
    };
};
