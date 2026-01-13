# Figma Sitemap Generator

**Version:** 1.0.0  
**Author:** Jesh  
**Created:** January 13, 2026

---

## Overview

A tool that automatically generates visual sitemaps in Figma from full-page screenshots. It captures both desktop and mobile views of each page, arranges them in a hierarchical tree layout, and connects parent-child relationships with connector lines.

---

## Problem Statement

Designers and stakeholders need visual sitemaps to understand site structure, but manually creating them is tedious:
- Capturing screenshots of every page
- Resizing and organizing them in Figma
- Maintaining hierarchy and relationships
- Keeping them updated as sites evolve

---

## Solution

An automated pipeline that:
1. Crawls a site's navigation structure
2. Captures full-page screenshots (desktop + mobile)
3. Generates a Figma layout with hierarchy and connectors

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Screenshot Capture (Playwright)                        │
│  ───────────────────────────────                        │
│  • Input: Site URL                                      │
│  • Crawls main navigation links                         │
│  • Captures full-page desktop + mobile screenshots      │
│  • Outputs: /screenshots/*.png + sitemap.json           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Local Server (Node.js)                                 │
│  ───────────────────────────────                        │
│  • Serves screenshots + sitemap.json                    │
│  • CORS enabled for Figma plugin access                 │
│  • Runs on http://localhost:3000                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Figma Plugin                                           │
│  ───────────────────────────────                        │
│  • Fetches sitemap.json + images from local server      │
│  • Resizes images client-side (canvas)                  │
│  • Creates tree layout in Figma:                        │
│    - Frame per page (desktop | mobile side-by-side)     │
│    - Title + URL labels                                 │
│    - Connector lines based on parent/child              │
└─────────────────────────────────────────────────────────┘
```

---

## Data Structures

### sitemap.json

```json
{
  "site": "example.com",
  "captured_at": "2026-01-13",
  "viewports": {
    "desktop": { "width": 1920, "height": 1080 },
    "mobile": { "width": 390, "height": 844 }
  },
  "pages": [
    {
      "slug": "home",
      "title": "Home",
      "path": "/",
      "parent": null,
      "depth": 0
    },
    {
      "slug": "about",
      "title": "About",
      "path": "/about",
      "parent": "home",
      "depth": 1
    }
  ]
}
```

### Screenshot Naming Convention

```
{site}_{slug}_{viewport}.png

Examples:
- regent_home_desktop.png
- regent_home_mobile.png
- regent_about_desktop.png
```

---

## File Structure

```
figma-sitemap-plugin/
├── manifest.json       # Figma plugin configuration
├── code.js             # Plugin main logic (tree layout, connectors)
├── ui.html             # Plugin UI (server URL, thumbnail size)
├── server.js           # Local file server for screenshots
├── capture.py          # Playwright screenshot script
├── SPEC.md             # This document
└── README.md           # Quick start guide
```

---

## Configuration

### Plugin Settings (ui.html)

| Setting | Default | Description |
|---------|---------|-------------|
| Server URL | `http://localhost:3000` | Local server address |
| Thumbnail Width | `300px` | Desktop thumbnail width (mobile = 30% of this) |

### Layout Constants (code.js)

| Constant | Value | Description |
|----------|-------|-------------|
| CARD_GAP | 80px | Horizontal gap between cards |
| LEVEL_GAP | 300px | Vertical gap between depth levels |
| CARD_PADDING | 24px | Internal card padding |
| SCREENSHOT_GAP | 16px | Gap between desktop/mobile screenshots |

---

## Usage

### 1. Capture Screenshots

```bash
# Install Playwright
pip3 install playwright
playwright install chromium

# Run capture script
python3 capture.py
```

### 2. Start Local Server

```bash
node server.js /path/to/screenshots
```

### 3. Run Figma Plugin

1. Figma → Plugins → Development → Import plugin from manifest
2. Select `manifest.json`
3. Run: Plugins → Development → Sitemap Generator
4. Click "Generate Sitemap"

---

## Roadmap

### v1.1 — Polish
- [ ] Rounded connector corners
- [ ] Drop shadows on cards
- [ ] Better centering of child nodes
- [ ] Progress bar in UI

### v1.2 — Auto-Crawl
- [ ] Input URL, auto-discover navigation links
- [ ] Generate sitemap.json automatically
- [ ] Detect page titles from `<title>` tags

### v1.3 — Figma Plugin Distribution
- [ ] Publish to Figma Community
- [ ] Cloud-hosted capture service (no local server needed)
- [ ] URL input directly in plugin UI

### v2.0 — Advanced Features
- [ ] Diff mode: highlight changed pages
- [ ] Annotations: add notes to pages
- [ ] Export: PDF, PNG of full sitemap
- [ ] Scheduled captures: track site evolution

---

## Dependencies

| Tool | Version | Purpose |
|------|---------|---------|
| Playwright | 1.57+ | Screenshot capture |
| Node.js | 18+ | Local server |
| Figma Plugin API | 1.0.0 | Figma integration |
| Python | 3.9+ | Capture script |

---

## Limitations

- Figma image size limit (~4096px) requires thumbnail resizing
- Local server required (Figma plugins can't read local files)
- Manual sitemap.json creation for complex navigation structures
- No authentication support for password-protected pages

---

## License

MIT
