# Figma Sitemap Generator

Automatically generate visual sitemaps in Figma from full-page screenshots.

## Features

- 🌐 **Auto-crawl** — Discovers pages from navigation links
- 📸 **Full-page capture** — Desktop + mobile viewports
- 🎨 **Quality options** — From fast preview to print-ready
- 🌳 **Tree layout** — Hierarchical sitemap with connectors
- 🔗 **Real-time** — Progress tracking and live preview

## Quick Start

### 1. Install

```bash
cd figma-sitemap-plugin
npm install
npx playwright install chromium
```

### 2. Run Desktop App

```bash
npm start
```

Opens http://localhost:3000 — enter a URL and capture screenshots.

### 3. Import to Figma

1. **Plugins** → **Development** → **Import plugin from manifest**
2. Select `manifest.json`
3. Run: **Plugins** → **Development** → **Sitemap Generator**
4. Click **Generate Sitemap**

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Desktop App │ ──► │  Screenshots │ ──► │ Figma Plugin │
│  (localhost) │     │  + sitemap   │     │  (tree view) │
└──────────────┘     └──────────────┘     └──────────────┘
```

1. Desktop app crawls site navigation
2. Playwright captures full-page screenshots
3. Figma plugin imports and arranges in tree layout

## Documentation

See [SPEC.md](SPEC.md) for detailed architecture, API, and roadmap.

## License

MIT
