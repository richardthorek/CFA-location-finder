# Backend Caching Deployment Guide

## Prerequisites

- Azure subscription with Static Web App already deployed
- Azure Storage Account (or create a new one)
- Access to Azure Portal or Azure CLI

## Step-by-Step Deployment

### 1. Create or Configure Azure Storage Account

#### Option A: Using Azure Portal

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your resource group
3. Click "Create" → Search for "Storage account"
4. Fill in details:
   - **Storage account name**: e.g., `cfastorage123` (must be globally unique)
   - **Performance**: Standard
   - **Redundancy**: LRS (Locally Redundant Storage) for cost savings
   - **Location**: Same region as your Static Web App
5. Click "Review + Create" then "Create"
6. Wait for deployment to complete

#### Option B: Using Azure CLI

```bash
# Set variables
RESOURCE_GROUP="your-resource-group"
STORAGE_ACCOUNT="cfastorage$(date +%s)"  # Unique name
LOCATION="australiaeast"  # Or your preferred location

# Create storage account
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --kind StorageV2

# Get connection string
az storage account show-connection-string \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --output tsv
```

### 2. Get Storage Connection String

#### Using Azure Portal

1. Navigate to your Storage Account
2. Go to "Security + networking" → "Access keys"
3. Click "Show keys"
4. Copy the "Connection string" under key1 or key2

It should look like:
```
DefaultEndpointsProtocol=https;AccountName=cfastorage123;AccountKey=abc123...==;EndpointSuffix=core.windows.net
```

#### Using Azure CLI

```bash
az storage account show-connection-string \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query connectionString \
  --output tsv
```

### 3. Configure Environment Variables

#### Using Azure Portal

1. Navigate to your Static Web App
2. Go to "Settings" → "Configuration"
3. Under "Application settings", click "New application setting"
4. Add the following settings:

| Name | Value |
|------|-------|
| `STORAGE_STRING` | `<your-storage-connection-string>` |
| `MAPBOX_TOKEN` | `<your-mapbox-token>` (if not already set) |

5. Click "Save" at the top

#### Using Azure CLI

```bash
# Set variables
STATIC_WEB_APP="your-static-web-app-name"
RESOURCE_GROUP="your-resource-group"
STORAGE_CONNECTION_STRING="<your-connection-string>"
MAPBOX_TOKEN="<your-mapbox-token>"

# Set application settings
az staticwebapp appsettings set \
  --name $STATIC_WEB_APP \
  --resource-group $RESOURCE_GROUP \
  --setting-names \
    STORAGE_STRING="$STORAGE_CONNECTION_STRING" \
    MAPBOX_TOKEN="$MAPBOX_TOKEN"
```

### 4. Deploy Code Changes

#### Option A: Automatic via GitHub Actions

If your repository is connected to Azure Static Web Apps, deployment happens automatically:

1. Push your changes to the main branch (or configured branch)
2. GitHub Actions workflow will trigger
3. Wait for deployment to complete (~3-5 minutes)
4. Check the Actions tab in GitHub for build status

#### Option B: Manual via Azure CLI

```bash
# Install Azure Static Web Apps CLI
npm install -g @azure/static-web-apps-cli

# Deploy from your local repository
swa deploy \
  --app-location "." \
  --api-location "api" \
  --output-location "." \
  --deployment-token $DEPLOYMENT_TOKEN
```

### 5. Verify Deployment

#### Test Cache Headers

```bash
# First request (cache miss)
curl -i https://your-app.azurewebsites.net/api/getCFAFeed

# Look for:
# X-Cache-Status: MISS
# (Takes 2-3 seconds)

# Second request (cache hit)
curl -i https://your-app.azurewebsites.net/api/getCFAFeed

# Look for:
# X-Cache-Status: HIT
# (Takes <100ms)
```

#### Check Azure Function Logs

1. Go to Azure Portal → Your Static Web App
2. Navigate to "Functions" section
3. Click on "getCFAFeed" or "getEmergencyFeed"
4. View "Monitor" → "Logs"
5. Look for cache-related messages:
   ```
   Feed CFA: Last fetch 15234ms ago, TTL 60000ms, should fetch: false
   Returning cached CFA feed with 25 alerts
   Using cached coordinates for BALLARAT
   ```

#### Verify Table Storage Creation

1. Go to Azure Portal → Your Storage Account
2. Navigate to "Data storage" → "Tables"
3. You should see three tables:
   - `FeedCache`
   - `EnrichedAlerts`
   - `FetchTracker`

**Note:** Tables are created automatically on first API call. If you don't see them, make a request to the API first.

#### Test in Browser

1. Open your application URL
2. Open browser DevTools (F12)
3. Go to Network tab
4. Click "Refresh Alerts"
5. Check response headers for `X-Cache-Status`
6. Verify alerts appear on map with coordinates
7. Check Console for cache-related messages

### 6. Monitor Performance

#### Azure Function Insights

1. Go to Azure Portal → Your Static Web App → Functions
2. View "Application Insights" (if enabled)
3. Check:
   - Request duration (should be <100ms for cache hits)
   - Request rate
   - Failure rate

#### Table Storage Metrics

1. Go to Azure Portal → Your Storage Account
2. Navigate to "Monitoring" → "Metrics"
3. Add charts for:
   - Transactions (should see steady read rate)
   - Ingress/Egress (data transferred)
   - Availability (should be ~100%)

#### Cost Monitoring

1. Go to Azure Portal → Your Storage Account
2. Navigate to "Cost Management" → "Cost analysis"
3. Monitor storage costs (should be very low, <$1/month for typical usage)

## Troubleshooting

### Problem: X-Cache-Status always shows MISS

**Possible Causes:**
- STORAGE_STRING not configured correctly
- Storage account access key changed
- Table Storage not accessible from Function

**Solutions:**
1. Verify STORAGE_STRING in Application Settings
2. Check Azure Function logs for connection errors
3. Test connection string:
   ```bash
   az storage table list --connection-string "<your-connection-string>"
   ```

### Problem: Alerts have no coordinates

**Possible Causes:**
- MAPBOX_TOKEN not set in backend
- Geocoding failing
- Network issues

**Solutions:**
1. Verify MAPBOX_TOKEN in Application Settings
2. Check Azure Function logs for geocoding errors
3. Test Mapbox token:
   ```bash
   curl "https://api.mapbox.com/geocoding/v5/mapbox.places/Ballarat.json?access_token=<your-token>"
   ```

### Problem: "Table not found" errors

**Possible Causes:**
- Tables not created yet
- Storage account not accessible
- Permission issues

**Solutions:**
1. Make at least one API call to trigger table creation
2. Verify storage account connection string
3. Check storage account firewall settings (should allow Azure services)

### Problem: High storage costs

**Possible Causes:**
- Unexpected write volume
- Large cached payloads
- Retention policy issues

**Solutions:**
1. Check Table Storage metrics for transaction volume
2. Review cache TTL settings (default 60 seconds)
3. Consider implementing data retention policy
4. Monitor alert count and size

### Problem: Stale data being served

**Possible Causes:**
- Cache not expiring (bug in code)
- Fetch errors falling back to stale cache
- Clock drift

**Solutions:**
1. Check X-Cache-Status header (STALE indicates fetch error)
2. Review Azure Function logs for fetch errors
3. Verify source feed URLs are accessible
4. Check timestamp in FetchTracker table

## Rollback Procedure

If caching causes issues, you can quickly rollback:

### Option 1: Disable caching (keep code)

1. Remove `STORAGE_STRING` from Application Settings
2. Code will gracefully degrade to non-cached mode
3. Still benefits from backend geocoding

### Option 2: Full rollback

1. Checkout previous git commit before caching changes
2. Push to trigger redeployment
3. Remove `STORAGE_STRING` from Application Settings
4. Delete Table Storage tables (optional)

### Emergency Rollback Command

```bash
# Remove STORAGE_STRING
az staticwebapp appsettings delete \
  --name $STATIC_WEB_APP \
  --resource-group $RESOURCE_GROUP \
  --setting-names STORAGE_STRING

# Redeploy previous version (if needed)
git revert HEAD
git push
```

## Security Best Practices

### 1. Rotate Access Keys Periodically

```bash
# Regenerate key1
az storage account keys renew \
  --account-name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --key primary

# Get new connection string
az storage account show-connection-string \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP

# Update application settings with new connection string
```

### 2. Use Key Vault (Recommended for Production)

```bash
# Create Key Vault
az keyvault create \
  --name "cfa-keyvault" \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Store connection string in Key Vault
az keyvault secret set \
  --vault-name "cfa-keyvault" \
  --name "StorageConnectionString" \
  --value "$STORAGE_CONNECTION_STRING"

# Reference in Static Web App
# Use @Microsoft.KeyVault(SecretUri=...) syntax in Application Settings
```

### 3. Enable Firewall Rules

```bash
# Allow only Azure services
az storage account update \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --default-action Deny \
  --bypass AzureServices
```

### 4. Monitor Access Logs

1. Enable Storage Analytics logging
2. Review logs periodically for suspicious activity
3. Set up alerts for unusual patterns

## Performance Tuning

### Adjust Cache TTL

If you need different cache behavior, modify `api/shared/storageService.js`:

```javascript
// Default: 60 seconds
const CACHE_TTL_MS = 60 * 1000;

// For slower updates (5 minutes):
const CACHE_TTL_MS = 5 * 60 * 1000;

// For faster updates (30 seconds):
const CACHE_TTL_MS = 30 * 1000;
```

### Pre-warm Cache

Add an Azure Timer Trigger to refresh cache proactively:

```javascript
// api/preWarmCache/function.json
{
  "bindings": [
    {
      "name": "myTimer",
      "type": "timerTrigger",
      "direction": "in",
      "schedule": "0 */1 * * * *"  // Every minute
    }
  ]
}

// api/preWarmCache/index.js
// Call getCFAFeed and getEmergencyFeed internally
```

## Success Metrics

After deployment, you should see:

- **Cache Hit Rate**: 90%+ (check X-Cache-Status headers)
- **API Latency**: <100ms for cache hits, <3s for misses
- **Mapbox API Calls**: <5,000/month (down from 100,000+)
- **Storage Costs**: <$1/month
- **User Experience**: Instant load times after first user fetch

## Support Contacts

- **Azure Storage Issues**: Check [Azure Status](https://status.azure.com/)
- **Mapbox API Issues**: [Mapbox Support](https://support.mapbox.com/)
- **Application Issues**: Check Azure Function logs and GitHub Issues

## Next Steps

1. ✅ Deploy storage account and configure STORAGE_STRING
2. ✅ Deploy code changes via GitHub Actions
3. ✅ Verify cache is working with curl tests
4. ✅ Monitor performance for 24-48 hours
5. ⏳ Set up alerts for failures or high costs
6. ⏳ Document any custom tuning or configuration
7. ⏳ Consider enabling Application Insights for detailed telemetry
