# Sitemap Generator - Technical Specification

## Overview

A two-part system for generating visual sitemaps in Figma from automated website screenshots:
1. **Capture Server** - Node.js/Express app with Playwright for full-page screenshots
2. **Figma Plugin** - Imports screenshots and creates hierarchical sitemap layout

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Web UI (Browser)  │────▶│  Capture Server  │────▶│  Target Website │
│   localhost:3000    │     │  Express + API   │     │                 │
└─────────────────────┘     └──────────────────┘     └─────────────────┘
         │                           │
         │                           ▼
         │                  ┌──────────────────┐
         │                  │  captures/       │
         │                  │  {project}/      │
         │                  │  - sitemap.json  │
         │                  │  - *.png files   │
         │                  └──────────────────┘
         │                           │
         ▼                           │
┌─────────────────────┐              │
│   Figma Plugin      │◀─────────────┘
│   (ui.html + code)  │   Fetches images via API
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│   Figma Canvas      │
│   Visual Sitemap    │
└─────────────────────┘
```

## Components

### 1. Capture Server (`app.js`)

**Port:** 3000

**Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Web UI for capture management |
| GET | `/api/status` | Current capture session status |
| GET | `/api/projects` | List all saved projects |
| GET | `/api/projects/:id/sitemap.json` | Get project sitemap |
| GET | `/api/projects/:id/:filename` | Get captured image |
| GET | `/captures/:id/` | Directory listing with previews |
| DELETE | `/api/projects/:id` | Delete a project |
| POST | `/api/discover` | Crawl site navigation (no capture) |
| POST | `/api/capture` | Start capture (uses discovered pages) |

**Capture Configuration:**
- Desktop viewport: 1920×1080 @ 2x scale = 3840px output
- Mobile viewport: 390×844 @ 2x scale = 780px output
- Wait strategy: `domcontentloaded` + 15s timeout
- Warm-up scroll for lazy-loaded content
- PNG format for maximum quality

**Project Structure:**
```
captures/
└── {hostname}_{date}_{timestamp}/
    ├── sitemap.json
    ├── {site}_{slug}_desktop.png
    └── {site}_{slug}_mobile.png
```

**sitemap.json Schema:**
```json
{
  "site": "example.com",
  "captured_at": "2025-01-14",
  "captured_at_time": "14:32",
  "pages": [
    {
      "slug": "home",
      "title": "Home",
      "path": "/",
      "parent": null,
      "depth": 0,
      "desktopFile": "example_home_desktop.png",
      "mobileFile": "example_home_mobile.png"
    }
  ]
}
```

### 2. Figma Plugin

**Files:**
- `manifest.json` - Plugin metadata
- `code.js` - Figma API logic (runs in Figma sandbox)
- `ui.html` - Plugin UI (runs in iframe)

**Message Protocol (UI ↔ Plugin):**

| Message | Direction | Purpose |
|---------|-----------|---------|
| `start` | UI → Plugin | Initialize sitemap frame |
| `ready` | Plugin → UI | Frame ready, request pages |
| `start-page` | UI → Plugin | Begin new page card |
| `page-ready` | Plugin → UI | Card created, request tiles |
| `add-tile` | UI → Plugin | Add single image tile |
| `tile-added` | Plugin → UI | Tile added, request next |
| `finish-page` | UI → Plugin | Assemble tiles into card |
| `page-done` | Plugin → UI | Card complete, next page |
| `finalize` | UI → Plugin | Reposition cards, add connectors |
| `done` | Plugin → UI | Complete |
| `error` | Plugin → UI | Error occurred |

**Tile-by-Tile Loading:**
- Max tile size: 1000×1000px
- Images split into grid of tiles
- Each tile sent as separate message
- Tiles assembled into groups in Figma

**Layout Constants:**
```javascript
CARD_GAP = 80        // Horizontal gap between cards
LEVEL_GAP = 300      // Vertical gap between depth levels
CARD_PADDING = 24    // Internal card padding
SCREENSHOT_GAP = 16  // Gap between desktop/mobile
```

## Data Flow

### Discovery Phase
1. User enters URL in web UI
2. POST `/api/discover` with `{ url, options: { maxDepth, maxPages } }`
3. Server launches Playwright, navigates to URL
4. Extracts links from nav/header elements
5. Returns page list with depth/parent relationships
6. UI displays summary by depth level

### Capture Phase
1. User clicks "Start Capture"
2. POST `/api/capture` with viewport options
3. Server iterates through discovered pages
4. For each page:
   - Warm-up scroll to trigger lazy content
   - Desktop screenshot at 3840px width
   - Mobile screenshot at 780px width
5. Saves images + sitemap.json to project folder
6. Real-time progress via `/api/status` polling

### Import Phase
1. Plugin fetches sitemap.json
2. For each page:
   - Fetch desktop/mobile images
   - Split into ≤1000px tiles
   - Send tiles one-by-one to Figma
   - Assemble into card
3. Reposition cards by depth (tree layout)
4. Draw connector lines between parent/child

## Configuration Options

### Web UI
| Option | Default | Description |
|--------|---------|-------------|
| Max Depth | 3 | Navigation crawl depth (1-5) |
| Max Pages | 50 | Maximum pages to discover |
| Desktop | ✓ | Capture desktop viewport |
| Mobile | ✓ | Capture mobile viewport |
| Scroll Delay | 150ms | Delay between scroll steps |

### Figma Plugin
| Option | Default | Description |
|--------|---------|-------------|
| Display Size | 500px | Thumbnail width in Figma |
| Format | PNG | Output format (PNG/JPEG) |

## Technical Constraints

### Figma Limits
- Max image dimension: ~4096px (but memory limit lower)
- Max message size: ~10MB
- Solution: Tile images into 1000×1000 chunks

### Playwright
- Requires Chromium browser
- Docker: Use `mcr.microsoft.com/playwright:v1.40.0-focal`
- Local: `npx playwright install chromium`

## File Structure

```
figma-sitemap-plugin/
├── app.js              # Express server + Playwright capture
├── code.js             # Figma plugin logic
├── ui.html             # Figma plugin UI
├── manifest.json       # Figma plugin manifest
├── package.json        # Node dependencies
├── Dockerfile          # Docker build
├── docker-compose.yml  # Docker orchestration
├── CHANGELOG.md        # Version history
├── SPEC.md             # This file
├── README.md           # User documentation
└── captures/           # Screenshot output (gitignored)
```

## Future Enhancements

- [ ] Authentication support for protected pages
- [ ] Deep crawl mode (follow all links)
- [ ] Custom CSS injection for capture
- [ ] Browser extension mode (use existing session)
- [ ] Export to PDF/image
- [ ] Figma component library integration
