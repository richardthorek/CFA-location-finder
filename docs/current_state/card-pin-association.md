# Card-to-Pin Association Architecture

## Current State (Post-Fix)

### Problem Statement
Previously, when users clicked on alert cards in the sidebar, the map would sometimes zoom to the wrong pin. This was particularly problematic when the auto-zoom feature was enabled, which filters alerts to show only the closest 10 incidents.

### Root Cause Analysis
The issue stemmed from an index mismatch between the displayed cards and map markers:

1. **Global Alerts Array**: Contains all loaded alerts (up to 20)
2. **Filtered Display**: Shows only closest 10 alerts when location-based filtering is active
3. **Index Mismatch**: 
   - Cards displayed indices from filtered subset (0-9)
   - But stored global indices (could be any value 0-19)
   - Markers array was rebuilt but `selectAlert()` used wrong lookup method

### Solution Architecture

#### Data Structures

```javascript
// Global state
let alerts = [];              // All loaded alerts (max 20)
let markers = [];             // Currently displayed markers
let alertToMarkerMap = new Map(); // Global index -> Marker mapping
```

#### Key Functions

**`updateMap(alertsToShow)`**
- Accepts a subset of alerts (can be filtered)
- Rebuilds markers array from scratch
- For each alert:
  - Finds global index: `alerts.indexOf(alert)`
  - Creates marker with visual elements
  - Stores in map: `alertToMarkerMap.set(globalIndex, marker)`
  - Adds `data-alert-index` attribute to marker element

**`filterAndUpdateAlerts()`**
- Calculates distances for all alerts
- Filters to closest 10 within range
- Calls `displayAlerts(filteredAlerts)` for sidebar
- **NOW** calls `updateMap(filteredAlerts)` to sync map
- Adjusts map bounds to fit filtered results

**`selectAlert(globalAlertIndex)`**
- Receives global index of alert to select
- Updates card UI by matching `data-alert-id` attribute
- Looks up marker: `alertToMarkerMap.get(globalAlertIndex)`
- Applies visual selection styles
- Pans map and opens popup
- Displays route if user location available

#### Visual Feedback

Selected markers receive enhanced styling:
```css
.custom-marker.marker-selected {
    z-index: 1000 !important;
}
.custom-marker.marker-selected .marker-icon {
    transform: scale(1.3);
    filter: drop-shadow(0 0 8px rgba(211, 47, 47, 0.8));
}
```

### Data Flow Diagram

```
User Enables Location
    ↓
getUserLocation()
    ↓
filterAndUpdateAlerts()
    ├→ Calculate distances for all alerts
    ├→ Filter to closest 10
    ├→ displayAlerts(filtered)     [Updates sidebar]
    └→ updateMap(filtered)         [Updates map markers]
            ↓
    alertToMarkerMap.clear()
    For each alert in filtered:
        globalIdx = alerts.indexOf(alert)
        marker = create marker
        alertToMarkerMap.set(globalIdx, marker)

User Clicks Card
    ↓
selectAlert(globalIndex)
    ├→ Find card by data-alert-id={globalIndex}
    ├→ marker = alertToMarkerMap.get(globalIndex)
    ├→ Apply selection styles
    └→ Pan map to marker
```

### Edge Cases Handled

1. **Rapid Filtering Changes**: Map clears and rebuilds markers completely
2. **Cards with Same Location**: Each alert has unique global index
3. **Missing Coordinates**: Alerts without coordinates don't create markers
4. **Selection Persistence**: Previous selection cleared before new selection applied
5. **Popup State**: Checks if popup already open before toggling

### Performance Considerations

- `alertToMarkerMap` provides O(1) lookup time
- Map uses references to alert objects (no deep copying)
- Markers rebuilt on filter changes (not incremental updates)
- Visual DOM updates batched with CSS transitions

### Testing Approach

Created test harness that:
1. Simulates 20 alerts with known indices
2. Filters to closest 10
3. Tests card selection for various global indices
4. Verifies correct marker is highlighted each time
5. Logs success/failure for each selection

### Breaking Changes

None - this is a bug fix that maintains existing API surface.

### Future Considerations

If adding features that modify alerts:
- Always maintain global index references
- Use `alertToMarkerMap` for marker lookups
- Keep sidebar and map synchronized
- Test with both filtered and unfiltered states

### Files Involved

- **app.js**: Core logic (lines 12-20, 393-436, 559-700)
- **styles.css**: Visual feedback (lines 230-253)
- **index.html**: Unchanged (card structure supports data-alert-id)

### Verification

To verify the fix works:
1. Load application with alerts
2. Enable location detection (auto-zoom)
3. Click various cards in sidebar
4. Observe that correct pin is highlighted and zoomed to
5. Check console for any errors about missing markers
