# Figma Sitemap Generator

Automatically generate visual sitemaps in Figma from full-page screenshots.

![Sitemap Example](screenshots/example.png)

## Features

- 📸 Full-page screenshot capture (desktop + mobile)
- 🌳 Hierarchical tree layout
- 🔗 Auto-generated connector lines
- 📱 Side-by-side desktop/mobile views
- 🏷️ Page titles and URL labels

## Quick Start

### 1. Install dependencies

```bash
# Python (for screenshot capture)
pip3 install playwright
playwright install chromium
```

### 2. Capture screenshots

```bash
# Create sitemap.json first (see SPEC.md for format)
# Then run:
python capture.py https://yoursite.com ./screenshots
```

### 3. Start the local server

```bash
node server.js ./screenshots
```

### 4. Run the Figma plugin

1. Open Figma Desktop
2. **Plugins** → **Development** → **Import plugin from manifest...**
3. Select `manifest.json` from this folder
4. **Plugins** → **Development** → **Sitemap Generator**
5. Click **Generate Sitemap**

## Documentation

See [SPEC.md](SPEC.md) for detailed architecture, configuration, and roadmap.

## License

MIT
