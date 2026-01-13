# Sitemap Generator - Technical Specification

## Overview

A two-part system for generating visual sitemaps in Figma from full-page website screenshots:

1. **Desktop App** (Node.js) — Crawls sites and captures screenshots
2. **Figma Plugin** — Imports screenshots and creates visual sitemap layout

## Architecture

```
┌─────────────────────┐      ┌─────────────────────┐
│   Desktop App       │      │   Figma Plugin      │
│   localhost:3000    │◄────►│   ui.html + code.js │
├─────────────────────┤      ├─────────────────────┤
│ • Web UI            │      │ • Fetches sitemap   │
│ • Auto-crawl nav    │      │ • Resizes images    │
│ • Playwright capture│      │ • Tree layout       │
│ • Serve screenshots │      │ • Connector lines   │
└─────────────────────┘      └─────────────────────┘
```

## Desktop App (app.js)

### Features
- Web UI for URL input and configuration
- Auto-discovers pages by crawling navigation links
- Captures full-page screenshots (desktop + mobile)
- Configurable quality settings
- Real-time progress tracking
- Serves sitemap.json and images for Figma plugin

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web UI |
| `/api/status` | GET | Current capture session status |
| `/api/capture` | POST | Start new capture |
| `/sitemap.json` | GET | Sitemap data for Figma |
| `/:filename` | GET | Serve screenshot files |

### Capture Options

```javascript
{
  crawl: true,          // Auto-discover pages from navigation
  desktop: true,        // Capture desktop viewport
  mobile: true,         // Capture mobile viewport
  desktopWidth: 1920,   // Desktop viewport width
  desktopHeight: 1080,  // Desktop viewport height
  mobileWidth: 390,     // Mobile viewport width
  mobileHeight: 844,    // Mobile viewport height
  quality: 'high',      // low (0.5x), medium (1x), high (1.5x), full (2x)
  maxPages: 50          // Maximum pages to capture
}
```

### Screenshot Capture
- Uses Playwright with `domcontentloaded` wait (faster, more reliable)
- 15-second timeout per page
- Non-blocking errors (skips failed pages)
- Separate browser contexts for desktop/mobile
- Scale factor controls image quality

### Navigation Crawling
Discovers links from these selectors:
- `nav a[href]`
- `header a[href]`
- `[role="navigation"] a[href]`
- `.nav a[href]`, `.menu a[href]`, `.navigation a[href]`

### Sitemap Structure
```javascript
{
  site: "example.com",
  captured_at: "2024-01-15",
  pages: [
    {
      slug: "home",
      title: "Home",
      path: "/",
      parent: null,
      depth: 0,
      desktopFile: "example_home_desktop.png",
      mobileFile: "example_home_mobile.png"
    }
  ]
}
```

## Figma Plugin

### Files
- `manifest.json` — Plugin configuration
- `code.js` — Figma API logic (layout, connectors)
- `ui.html` — Plugin UI (fetch, resize, send to Figma)

### Image Processing
- Client-side resizing using canvas API
- Max height cap: 2500px (Figma limit)
- JPEG compression (0.85) for 500px+ sizes
- PNG for smaller sizes

### Quality Options
| Setting | Desktop Width | Mobile Width |
|---------|---------------|--------------|
| Small | 200px | 60px |
| Medium | 300px | 90px |
| Large | 500px | 150px |
| XL | 800px | 240px |

### Layout Algorithm
1. Group pages by depth level
2. Within each level, group by parent
3. Center children horizontally under parent
4. Fixed spacing: 80px horizontal, 300px vertical

### Layout Constants
```javascript
CARD_GAP = 80        // Horizontal gap between cards
LEVEL_GAP = 300      // Vertical gap between depth levels
CARD_PADDING = 24    // Padding inside cards
SCREENSHOT_GAP = 16  // Gap between desktop/mobile screenshots
```

### Card Structure
Each page card contains:
- Title (bold, 16px)
- URL path (gray, 12px)
- Desktop screenshot
- Mobile screenshot (side by side)

### Connector Lines
- 3-segment lines: vertical → horizontal → vertical
- Connect parent card bottom-center to child card top-center
- Gray stroke (#CCCCCC), 2px weight

## File Structure

```
figma-sitemap-plugin/
├── app.js              # Express server + Playwright capture
├── package.json        # Node dependencies
├── manifest.json       # Figma plugin manifest
├── code.js             # Figma plugin logic
├── ui.html             # Figma plugin UI
├── captures/           # Screenshot output folder
├── SPEC.md             # This file
└── README.md           # Quick start guide
```

## Dependencies

### Node.js (Desktop App)
- `express` — Web server
- `cors` — Cross-origin requests
- `playwright` — Browser automation

### Figma Plugin
- No external dependencies
- Uses Figma Plugin API
- Canvas API for image resizing

## Network Configuration

The Figma plugin requires network access to localhost:

```json
{
  "networkAccess": {
    "allowedDomains": ["none"],
    "devAllowedDomains": ["http://localhost:3000"]
  }
}
```

## Usage

### 1. Start Desktop App
```bash
cd figma-sitemap-plugin
npm install
npx playwright install chromium
npm start
```

### 2. Capture Website
1. Open http://localhost:3000
2. Enter website URL
3. Configure options (quality, viewports)
4. Click "Start Capture"
5. Wait for completion

### 3. Import to Figma
1. Open Figma file
2. Plugins → Development → Sitemap Generator
3. Verify server URL (http://localhost:3000)
4. Select image quality
5. Click "Generate Sitemap"

## Limitations

- Single domain only (no external links)
- Navigation-based discovery (won't find orphan pages)
- No authentication support (public pages only)
- Max image height: 2500px in Figma

## Future Enhancements

- [ ] Deep crawl mode (follow all internal links)
- [ ] Authentication support (cookies, login)
- [ ] Browser extension mode (use existing Chrome session)
- [ ] Diff mode (compare before/after)
- [ ] PDF export
- [ ] Scheduled captures
