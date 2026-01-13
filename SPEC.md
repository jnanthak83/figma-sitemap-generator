# Figma Sitemap Generator

**Version:** 1.1.0  
**Author:** Jesh  
**Updated:** January 13, 2026

---

## Overview

A two-part tool for generating visual sitemaps in Figma:

1. **Desktop App** — Web-based UI that crawls sites and captures full-page screenshots
2. **Figma Plugin** — Imports screenshots and generates hierarchical sitemap layout

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Desktop App (http://localhost:3000)                    │
│  ───────────────────────────────────                    │
│  • Web UI for configuration                             │
│  • Input: URL                                           │
│  • Auto-crawls navigation links                         │
│  • Captures full-page screenshots (Playwright)          │
│  • Desktop + Mobile viewports                           │
│  • Configurable quality (0.5x to 2x)                    │
│  • Serves sitemap.json + images to Figma plugin         │
│  • Shows real-time progress                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Figma Plugin                                           │
│  ───────────────────────────────                        │
│  • Connects to desktop app                              │
│  • Fetches sitemap.json + screenshots                   │
│  • Resizes images client-side for Figma                 │
│  • Configurable thumbnail size (200-800px)              │
│  • Creates tree layout with connectors                  │
└─────────────────────────────────────────────────────────┘
```

---

## Screenshot Capture

Uses Playwright for high-quality full-page screenshots:

- **Scroll-and-stitch**: Playwright natively handles pages taller than viewport
- **Device emulation**: Accurate mobile rendering with touch events
- **Network idle wait**: Ensures all assets loaded before capture
- **Configurable DPI**: 0.5x (fast) to 2x (highest quality)

### Quality Settings

| Quality | Scale | Use Case |
|---------|-------|----------|
| Low | 0.5x | Quick preview, many pages |
| Medium | 1.0x | Balanced quality/speed |
| High | 1.5x | Presentation quality |
| Full | 2.0x | Print/zoom quality |

---

## Data Flow

```
User enters URL
       ↓
Desktop app crawls navigation
       ↓
sitemap.json generated with page hierarchy
       ↓
Playwright captures each page (desktop + mobile)
       ↓
Screenshots saved to /captures folder
       ↓
User opens Figma plugin
       ↓
Plugin fetches sitemap.json from localhost:3000
       ↓
Plugin downloads + resizes images in browser
       ↓
Plugin creates Figma frames with tree layout
```

---

## File Structure

```
figma-sitemap-plugin/
├── app.js              # Desktop app (Express + Playwright)
├── package.json        # Node dependencies
├── manifest.json       # Figma plugin config
├── code.js             # Figma plugin logic
├── ui.html             # Figma plugin UI
├── captures/           # Screenshot output directory
│   ├── sitemap.json
│   └── *.png
├── SPEC.md             # This document
└── README.md           # Quick start guide
```

---

## API Endpoints

### Desktop App

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web UI |
| `/api/status` | GET | Current capture session status |
| `/api/capture` | POST | Start new capture |
| `/sitemap.json` | GET | Sitemap data for Figma plugin |
| `/:filename` | GET | Serve screenshot files |

### POST /api/capture

```json
{
  "url": "https://example.com",
  "options": {
    "crawl": true,
    "desktop": true,
    "mobile": true,
    "quality": "high",
    "maxPages": 50
  }
}
```

---

## Figma Plugin Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Server URL | `http://localhost:3000` | Desktop app address |
| Image Size | 300px | Thumbnail width in Figma |

### Layout Constants (code.js)

| Constant | Value | Description |
|----------|-------|-------------|
| CARD_GAP | 80px | Horizontal gap between cards |
| LEVEL_GAP | 300px | Vertical gap between depth levels |
| CARD_PADDING | 24px | Internal card padding |
| SCREENSHOT_GAP | 16px | Gap between desktop/mobile |

---

## Usage

### 1. Install Dependencies

```bash
cd figma-sitemap-plugin
npm install
npx playwright install chromium
```

### 2. Start Desktop App

```bash
npm start
# Opens http://localhost:3000
```

### 3. Capture Screenshots

1. Enter URL in web UI
2. Configure options (quality, viewport, etc.)
3. Click "Start Capture"
4. Wait for completion

### 4. Generate Figma Sitemap

1. Open Figma
2. Plugins → Development → Sitemap Generator
3. Ensure server URL is correct
4. Select image quality
5. Click "Generate Sitemap"

---

## Roadmap

### v1.2 — Enhanced Crawling
- [ ] Deep crawl beyond navigation
- [ ] Respect robots.txt
- [ ] Handle infinite scroll pages
- [ ] Authentication support (cookies)

### v1.3 — Browser Mode
- [ ] Connect to real Chrome via CDP
- [ ] Capture authenticated pages
- [ ] Match GoFullPage scroll-and-stitch approach

### v2.0 — Electron App
- [ ] Native desktop application
- [ ] Menu bar integration
- [ ] System notifications
- [ ] Auto-update

### v2.1 — Advanced Features
- [ ] Diff mode (compare captures over time)
- [ ] Annotations in Figma
- [ ] Export sitemap as PDF
- [ ] Scheduled captures

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.18.2 | Web server |
| playwright | ^1.40.0 | Browser automation |
| cors | ^2.8.5 | Cross-origin requests |
| open | ^9.1.0 | Open browser |

---

## Limitations

- Figma image size limit requires client-side resizing
- Cannot capture pages requiring authentication (v1.x)
- Local server must be running during Figma import
- Some dynamic content may not render (SPAs with delayed loading)

---

## License

MIT
