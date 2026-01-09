# Baseline Design Documentation

**Date:** January 9, 2026  
**Purpose:** Document the current UI state before radical visual uplift

## Current UI Characteristics

### Color Scheme
- **Primary Red:** #d32f2f (header, buttons, alerts)
- **Secondary Red:** #c62828 (gradients, hover states)
- **Blue:** #1976d2, #2196F3 (CFA alerts, locate button)
- **Background:** #f5f5f5 (light gray)
- **White:** #fff (sidebar, cards)
- **Text:** #333 (primary), #666 (secondary), #999 (tertiary)

### Typography
- **Font Family:** System fonts (-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto)
- **Header H1:** 2em
- **Body:** 1em
- **Small text:** 0.8-0.9em

### Layout
- **Structure:** Vertical header + horizontal split (map + sidebar)
- **Sidebar Width:** 400px fixed
- **Map:** Flex: 1 (fills remaining space)
- **Mobile:** Stacked layout (map top, sidebar bottom)

### Components

#### Header
- Linear gradient background (135deg, red to darker red)
- Centered text with emoji icon (📟)
- Simple subtitle
- Box shadow for depth

#### Buttons
- Solid color backgrounds (red/blue)
- 12px padding, 4px border-radius
- Hover: Darker shade
- Active: scale(0.98)
- Loading: spinning icon

#### Alert Cards
- Light gray background (#f9f9f9)
- 4px left border (colored by type)
- 15px padding
- Hover: white background + box shadow + translateX(4px)
- Selected: colored background + enhanced shadow

#### Map Markers
- Emoji icons (📟 for CFA, ▲ for emergencies)
- Text info box below icon
- Hover: scale(1.2)
- Selected: scale(1.3) + glow effect

#### Warning Badges
- Australian Warning System colors (Yellow/Orange/Red)
- Small uppercase text
- Black border
- Inline padding

### Visual Characteristics
- **Style:** Clean, functional, traditional
- **Shadows:** Minimal (0 2px 4px rgba(0,0,0,0.1))
- **Borders:** Simple, solid colors
- **Animations:** Basic (spin, scale, translate)
- **Visual Interest:** LOW - primarily functional
- **Personality:** Serious, professional, utilitarian

### What's Missing
- No dark mode
- Limited animations/microinteractions
- No loading skeletons
- Minimal visual personality
- No fire/ember theme elements
- Basic color palette
- Standard shadows
- No glassmorphism or modern effects
- Limited visual feedback
- Static, not engaging

## Design Goals for Uplift

### Transform Into:
1. **Modern & Fresh** - Contemporary design patterns, gradients, depth
2. **Fun & Engaging** - Playful elements, animations, personality
3. **Firefighter Theme** - Ember colors, flame effects, relevant metaphors
4. **Accessible** - Strong contrast, keyboard nav, ARIA labels
5. **Responsive** - Fluid layouts, larger touch targets
6. **Delightful** - Microinteractions, smooth animations

### Key Inspiration
- Modern dashboard UIs (Firebase, Vercel, Linear)
- Emergency alert apps (with personality)
- Material Design motion principles
- Firefighter color palette (embers, flames, smoke)
