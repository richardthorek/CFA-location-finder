# CFA Location Finder - Master Plan

## Project Overview
This document tracks the architecture, design decisions, and development roadmap for the CFA Location Finder application.

## Recent Changes

### Radical Visual UI Uplift (January 2026)

**Overview:** Complete visual redesign of the CFA Location Finder application to create a modern, fun, and engaging user experience with a firefighter theme.

**Key Features Implemented:**
1. **Modern Design System**
   - Firefighter-themed color palette (flame red, ember orange, fire yellow)
   - Comprehensive CSS variable system for theming
   - Dark mode support with smooth transitions
   - Glassmorphism effects throughout
   - Modern shadows and depth system

2. **Animated Header**
   - Multi-layer gradient animation (flame colors)
   - Ember particle sparkle effect
   - Pulsing title animation
   - Theme toggle button with glassmorphism

3. **Enhanced Alert Cards**
   - Modern card designs with gradients
   - Shine effect animation on hover
   - Icon bounce animations
   - Enhanced warning badges with pulse effect for emergencies
   - Improved visual hierarchy

4. **Interactive Elements**
   - Button shine effects and lift animations
   - Icon rotation and bounce on interaction
   - Smooth transitions throughout (150ms-500ms)
   - Loading states with spinners
   - Error shake animations

5. **Map Enhancements**
   - Rounded corners and enhanced shadows
   - Dark/light mode map style switching
   - Animated markers with float effect
   - Glassmorphism popups
   - Enhanced user location marker with pulse

6. **Accessibility Improvements**
   - ARIA labels and roles throughout
   - Keyboard navigation (Enter/Space, Escape)
   - Focus-visible styles
   - Reduced motion support
   - High contrast mode support
   - Screen reader optimizations

7. **Responsive Design**
   - Enhanced breakpoints (1024px, 768px, 480px)
   - Touch-friendly button sizes
   - Mobile-optimized layouts
   - Fluid typography with clamp()

8. **Dark Mode**
   - One-click toggle in header
   - Persistent via localStorage
   - Complete UI adaptation
   - Automatic map style change

**Files Modified:**
- `styles.css`: Complete redesign with CSS variables, animations, dark mode
- `index.html`: Added theme toggle, ARIA attributes, semantic HTML
- `app.js`: Theme management, enhanced event listeners, accessibility
- `docs/current_state/images/BASELINE_DESIGN.md`: Documented original design
- `docs/current_state/images/NEW_DESIGN_OVERVIEW.md`: Comprehensive new design documentation

**Design Principles:**
- Visual transformation while maintaining usability
- Firefighter theme without overwhelming
- Modern patterns (glassmorphism, gradients, microinteractions)
- Accessibility-first approach
- Performance-conscious animations
- Mobile-first responsive design

**Benefits:**
- Dramatically improved visual appeal
- Enhanced user engagement through animations
- Better accessibility for all users
- Professional firefighter brand identity
- Dark mode for different viewing conditions
- Smooth, delightful user experience

### Card-to-Pin Association Fix (January 2026)

**Issue:** When selecting a card from the list on the right, the map sometimes zoomed to a different pin rather than the one corresponding to the selected card. Additionally, cards in right column stopped loading after filtering was applied.

**Root Cause:**
1. When `filterAndUpdateAlerts()` was called to show only nearby incidents, it updated the sidebar display but did NOT update the map markers
2. The `selectAlert()` function used array index-based lookup (`markers[index]`) which failed when the displayed cards were a filtered subset
3. Cards showed global alert indices but markers array was indexed differently, causing mismatch

**Solution Implemented:**
1. **Added `alertToMarkerMap`**: A Map data structure that maps each alert's global index to its marker object
2. **Updated `updateMap()`**: 
   - Now accepts `alertsToShow` parameter (can be filtered subset)
   - Clears `alertToMarkerMap` on each update
   - Finds global index for each alert using `alerts.indexOf(alert)`
   - Stores mapping in `alertToMarkerMap.set(globalIndex, marker)`
3. **Fixed `filterAndUpdateAlerts()`**: Now calls `updateMap(filteredAlerts)` to update map markers along with sidebar
4. **Enhanced `selectAlert()`**:
   - Uses `alertToMarkerMap.get(globalAlertIndex)` to find correct marker
   - Properly handles card selection by matching `data-alert-id` attribute
   - Added visual feedback with `marker-selected` CSS class
   - Only opens popup if not already open
5. **Added Visual Feedback**: CSS styles for `.marker-selected` class to highlight selected pins

**Files Modified:**
- `app.js`: Core logic changes for card-to-pin association
- `styles.css`: Visual feedback styles for selected markers

**Testing:**
- Created comprehensive test harness simulating the exact scenario
- Verified card selection works with both filtered and unfiltered alert lists
- Tested edge cases with multiple clicks and different alert indices

**Benefits:**
- Reliable card-to-pin association regardless of filtering state
- Visual feedback for selected pins improves user experience
- More maintainable code with explicit mapping structure
- No performance regression

## Architecture Decisions

### State Management
The application maintains several key state variables:
- `alerts`: Global array of all loaded alerts (up to 20 most recent)
- `markers`: Array of MapBox marker objects currently displayed on map
- `alertToMarkerMap`: Map from alert global index to marker object (ensures correct association)
- `userLocation`: Current user coordinates (if location services enabled)
- `selectedAlertId`: Currently selected alert's global index

### Filtering Flow
1. User enables location detection
2. `filterAndUpdateAlerts()` calculates distances for all alerts
3. Filters to closest 10 alerts within 100km
4. Updates BOTH sidebar display AND map markers (critical for consistency)
5. Adjusts map bounds to show user location and filtered alerts

### Selection Flow
1. User clicks card with `data-alert-id="${globalIndex}"`
2. `selectAlert(globalIndex)` is called
3. Function looks up marker using `alertToMarkerMap.get(globalIndex)`
4. Updates UI highlighting for both card and marker
5. Pans map to marker and shows popup
6. If user location available, displays route

## Development Guidelines

### When Adding New Features
1. Ensure any filtering or sorting maintains the global alert index reference
2. Use `alertToMarkerMap` for any marker lookups by alert
3. Keep sidebar and map state synchronized
4. Add visual feedback for user interactions

### Testing Card-Pin Association
When making changes that affect alerts, markers, or selection:
1. Test with full alert list (no filtering)
2. Test with location-based filtering active (closest 10)
3. Test rapid selection of multiple cards
4. Verify visual feedback appears correctly

## Future Improvements

### Potential Enhancements
- Add keyboard navigation for card selection
- Implement card grouping by region or severity
- Add animation when zooming to selected pin
- Support multi-select for route comparison
- Add accessibility improvements (ARIA labels, screen reader support)

### Performance Optimizations
- Consider virtual scrolling for large alert lists
- Implement debouncing for rapid location updates
- Cache geocoding results to reduce API calls

## Known Limitations
- MapBox API has rate limits (free tier: 50,000 map loads/month)
- Geolocation requires HTTPS in production
- Some CFA messages may not parse correctly if format changes
- Browser must support MapBox GL JS (requires WebGL)

## Maintenance Notes
- Alert data refreshes every 60 seconds automatically
- Markers are completely rebuilt on each update (not incremental)
- User location detection happens once on page load
- Mock data is used when API endpoint is unavailable
