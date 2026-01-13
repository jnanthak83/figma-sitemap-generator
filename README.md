# Sitemap Generator

Generate visual sitemaps in Figma from full-page website screenshots.

![Screenshot](https://via.placeholder.com/800x400?text=Sitemap+Generator)

## Quick Start

### 1. Install & Run Desktop App

```bash
git clone https://github.com/jnanthak83/figma-sitemap-generator.git
cd figma-sitemap-generator
npm install
npx playwright install chromium
npm start
```

Opens http://localhost:3000

### 2. Capture a Website

1. Enter website URL
2. Configure options (quality, max pages)
3. Click **Start Capture**
4. Wait for screenshots to complete

### 3. Install Figma Plugin

1. In Figma: **Plugins** → **Development** → **Import plugin from manifest...**
2. Select `manifest.json` from this folder

### 4. Generate Sitemap

1. Open any Figma file
2. **Plugins** → **Development** → **Sitemap Generator**
3. Select image quality (200-800px)
4. Click **Generate Sitemap**

## Features

- 🔍 **Auto-crawl** — Discovers pages from navigation links
- 📱 **Desktop + Mobile** — Captures both viewports
- 🎨 **Quality options** — Low to XL image sizes
- 🌲 **Tree layout** — Hierarchical sitemap with connectors
- ⚡ **Fast** — Parallel captures with smart timeouts

## Options

| Option | Default | Description |
|--------|---------|-------------|
| Desktop | ✓ | Capture 1920×1080 viewport |
| Mobile | ✓ | Capture 390×844 viewport |
| Auto-crawl | ✓ | Discover pages from nav |
| Quality | High | low/medium/high/full |
| Max Pages | 50 | Limit discovered pages |

## Requirements

- Node.js 18+
- Figma Desktop App

## License

MIT
