# CFA Location Finder - Visual Guide

**Version:** 2.0 - Radical Visual Uplift  
**Date:** January 9, 2026

This document describes the visual appearance of the redesigned CFA Location Finder interface. Screenshots should be captured to demonstrate these features.

## 🔥 Header - Animated Flame Gradient

**What to capture:**
- Full header with flame gradient (red → orange → yellow)
- Theme toggle button in top right (glassmorphism style)
- "🔥 CFA Location Finder" title with glow effect
- Subtitle: "Real-time fire alerts across Victoria, Australia"

**Visual features to note:**
- Animated gradient that shifts and moves
- Subtle sparkle/ember particle effect
- Pulsing glow on the title text
- Rounded, semi-transparent theme toggle button

**Screenshot names:**
- `header-light-mode.png`
- `header-dark-mode.png`
- `header-animation.gif` (if capturing animation)

---

## 🌙 Dark Mode Toggle

**What to capture:**
- Before: Light mode with theme toggle showing "🌙 Dark Mode"
- After: Dark mode with theme toggle showing "☀️ Light Mode"
- Show the complete interface transformation

**Visual changes in dark mode:**
- Background changes to dark blue-gray (#0F1419)
- Cards become semi-transparent with dark surfaces
- Text inverts to light colors
- Map switches to dark style
- Accent colors remain vibrant
- Shadows become more pronounced

**Screenshot names:**
- `light-mode-full.png`
- `dark-mode-full.png`
- `theme-toggle-interaction.gif`

---

## 📟 CFA Alert Cards (Blue)

**What to capture:**
- Several CFA pager alert cards in the sidebar
- Show hover state (card lifts, shadow increases, shine effect)
- Show selected state (enhanced glow, moved right, thicker border)
- Close-up of a single card showing all details

**Card features to highlight:**
- 📟 Pager icon (animated on hover)
- Location in blue (bold)
- Alert message
- Timestamp with 🕐 icon
- Distance indicator: "📍 X.X km away"
- Blue left border
- Subtle gradient background

**Screenshot names:**
- `cfa-alert-default.png`
- `cfa-alert-hover.png`
- `cfa-alert-selected.png`
- `cfa-alerts-list.png`

---

## ⚠️ Emergency Incident Cards (Color-Coded)

**What to capture:**
- Emergency incident cards showing all three warning levels:
  - **Advice** (Yellow triangle, yellow border)
  - **Watch and Act** (Orange triangle, orange border)
  - **Emergency Warning** (Red triangle, red border, pulsing)
- Show the warning level badge at top
- Show source badge (VIC or NSW)
- Show incident name if available

**Card features to highlight:**
- ▲ Colored triangle icon matching warning level
- Warning level badge with gradient
- Location in matching color
- Incident name (italic)
- Alert message
- Timestamp
- Distance indicator
- Source badge (VIC/NSW)

**Screenshot names:**
- `emergency-advice.png` (yellow)
- `emergency-watch-and-act.png` (orange)
- `emergency-warning.png` (red, pulsing)
- `emergency-list-mixed.png` (showing various levels)

---

## 🎛️ Control Buttons

**What to capture:**
- "📍 Auto-Zoom" button (blue gradient)
- "🔄 Refresh Alerts" button (red-orange gradient)
- Show hover states (lifted, glowing)
- Show loading state (spinning refresh icon)
- "Last updated" timestamp badge below buttons

**Button features:**
- Gradient backgrounds
- Icon + text layout
- Shine effect on hover
- Lift animation on hover
- Scale-down on click
- Shadow effects

**Screenshot names:**
- `buttons-default.png`
- `buttons-hover.png`
- `refresh-loading.png`
- `auto-zoom-disabled.png`

---

## 🗺️ Map View

**What to capture:**
- Full map with markers
- Rounded corners and shadow
- Multiple marker types visible
- User location marker (pulsing blue dot)

**Map features:**
- Rounded corners (16px radius)
- Enhanced drop shadow
- Custom markers:
  - 📟 CFA markers (blue info box)
  - ▲ Emergency markers (color-coded by severity)
  - Pulsing blue dot for user location
- Floating animation on markers
- MapBox navigation controls

**Screenshot names:**
- `map-overview-light.png`
- `map-overview-dark.png`
- `map-markers-closeup.png`
- `user-location-marker.png`

---

## 🔍 Map Markers - Custom Design

**What to capture:**
- CFA marker: 📟 icon + blue info box with location and time
- Emergency marker: ▲ colored triangle + info box (color matches warning level)
- User location: Pulsing blue dot with expanding ripple
- Hover state: Marker scales up
- Selected state: Pulsing animation + glow

**Marker features:**
- Floating animation (gentle up/down)
- Info box with glassmorphism
- Drop shadow for depth
- Hover: Scale to 1.25x
- Selected: Continuous pulse + colored glow

**Screenshot names:**
- `marker-cfa-default.png`
- `marker-cfa-selected.png`
- `marker-emergency-yellow.png`
- `marker-emergency-red.png`
- `marker-user-location.gif` (showing pulse)

---

## 💬 Map Popups - Glassmorphism

**What to capture:**
- Popup for CFA alert
- Popup for Emergency incident (with warning badge)
- Show the frosted glass effect

**Popup features:**
- Semi-transparent background with blur
- Rounded corners
- Colored warning badge for emergencies
- Bold location
- Message text
- Timestamp with icon
- Source information
- Enhanced shadows

**Screenshot names:**
- `popup-cfa.png`
- `popup-emergency-advice.png`
- `popup-emergency-warning.png`

---

## 📱 Mobile/Responsive Views

**What to capture:**
- Mobile view (< 768px): Stacked layout (map top, sidebar bottom)
- Tablet view (768px - 1024px): Side by side with narrower sidebar
- Show theme toggle adapts (icon only on small screens)

**Mobile features:**
- Map occupies top 55vh
- Sidebar occupies bottom 40vh
- Scrollable sidebar
- Larger touch targets
- Compact spacing
- Cards stack vertically on small screens

**Screenshot names:**
- `mobile-portrait.png`
- `tablet-landscape.png`
- `mobile-dark-mode.png`

---

## 🎨 Color Palette Reference

### Light Mode
```
Flame Red: #FF4444
Ember Orange: #FF6B35
Fire Yellow: #FFB84D
Sky Blue: #3498DB
Text Primary: #1A1F26
Background: Linear gradient #f5f7fa → #e9ecef
```

### Dark Mode
```
Background: Linear gradient #0F1419 → #1A1F26
Surface: #1E2732
Text: #E8EAED
Accent colors remain same (Flame Red, Sky Blue, etc.)
```

### Warning System Colors
```
Advice: #FBE032 (Yellow)
Watch and Act: #FF7900 (Orange)
Emergency: #D6001C (Red)
```

---

## ✨ Animations to Capture (GIF/Video)

1. **Header Animation**
   - Gradient shifting
   - Ember particle sparkle
   - Title pulse

2. **Card Interactions**
   - Hover: Lift + shine effect
   - Click: Selection with glow
   - Icon bounce animation

3. **Button Interactions**
   - Hover: Shine effect sweep
   - Refresh: Spinning icon
   - Locate: Icon bounce

4. **Marker Animations**
   - Floating motion
   - User location pulse
   - Selected marker pulse

5. **Theme Toggle**
   - Click: Smooth transition from light to dark
   - Icon change: Moon ↔ Sun
   - Map style change

6. **Emergency Badge Pulse**
   - Red emergency warning badge pulsing

---

## 📊 Comparison Views

**Suggested screenshot pairs:**

1. **Before/After Header**
   - Old: Plain red gradient with emoji
   - New: Animated flame gradient with particles

2. **Before/After Cards**
   - Old: Flat gray cards with simple borders
   - New: Glassmorphism cards with gradients and animations

3. **Before/After Dark Mode**
   - Old: No dark mode
   - New: Full dark mode support

4. **Before/After Buttons**
   - Old: Flat solid colors
   - New: Gradient backgrounds with shine effects

---

## 🎯 Key Features to Demonstrate

### Visual Impact
- ✅ Dramatic transformation from plain to modern
- ✅ Firefighter theme throughout (flames, embers, heat colors)
- ✅ Professional yet fun personality
- ✅ Consistent design language

### Interactivity
- ✅ Hover effects on all interactive elements
- ✅ Smooth transitions (150ms - 500ms)
- ✅ Microinteractions (bounce, rotate, float, pulse)
- ✅ Loading and error states

### Accessibility
- ✅ Clear focus indicators (3px outline)
- ✅ High contrast text
- ✅ Large touch targets (44px+)
- ✅ Keyboard navigation support

### Responsiveness
- ✅ Fluid layouts on all screen sizes
- ✅ Adaptive typography
- ✅ Mobile-optimized controls
- ✅ Touch-friendly interactions

---

## 📝 Screenshot Checklist

Use this checklist when capturing screenshots:

- [ ] Light mode - full interface
- [ ] Dark mode - full interface
- [ ] Header with theme toggle
- [ ] CFA alert cards (default, hover, selected)
- [ ] Emergency alert cards (all 3 warning levels)
- [ ] Control buttons (default, hover, loading)
- [ ] Map view with markers
- [ ] Custom markers close-up
- [ ] Map popups (CFA and Emergency)
- [ ] Mobile responsive view
- [ ] Tablet responsive view
- [ ] Animation GIFs (header, cards, buttons, markers)
- [ ] Before/After comparisons
- [ ] Dark mode animations

---

## 💡 Tips for Great Screenshots

1. **Use a real browser** (Chrome/Firefox) in incognito mode
2. **Ensure high resolution** (at least 1920x1080 for desktop)
3. **Capture at actual size** (don't scale down then back up)
4. **Include browser chrome** for context in some shots
5. **Use good lighting** (disable flux/night shift)
6. **Capture animations** as GIFs (use LICEcap or similar)
7. **Show real data** (not lorem ipsum)
8. **Capture both themes** for completeness
9. **Show interactions** (hover, selected states)
10. **Keep background clean** (close other tabs/windows)

---

## 🚀 Publishing Screenshots

Once captured, screenshots should be:
1. Optimized (compressed without quality loss)
2. Named according to this guide
3. Placed in `docs/current_state/images/`
4. Referenced in README.md and documentation
5. Included in PR description
6. Added to project website/landing page (if applicable)

---

**Last Updated:** January 9, 2026  
**Maintainer:** CFA Location Finder Team  
**Status:** Ready for screenshot capture
