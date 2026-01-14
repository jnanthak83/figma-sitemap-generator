# Sitemap Generator

A visual sitemap generator for Figma. Captures full-page 4K screenshots of any website and creates a hierarchical sitemap layout in Figma.

![Sitemap Example](https://via.placeholder.com/800x400?text=Sitemap+Preview)

## Features

- **4K Screenshots** - Captures at 1920×2x = 3840px for crisp detail
- **Desktop + Mobile** - Side-by-side viewport comparison
- **Auto-Discovery** - Crawls navigation to find all pages
- **Hierarchy Detection** - Organizes pages by depth with connectors
- **Large Image Support** - Tiles images to handle any page height
- **Project Management** - Save and manage multiple captures

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone the repo
git clone https://github.com/jnanthak83/figma-sitemap-generator.git
cd figma-sitemap-generator

# Run with Docker Compose
docker-compose up -d

# Open http://localhost:3000
```

### Option 2: Local Install

```bash
# Clone the repo
git clone https://github.com/jnanthak83/figma-sitemap-generator.git
cd figma-sitemap-generator

# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium

# Start server
npm start

# Open http://localhost:3000
```

## Usage

### 1. Capture Website

1. Open http://localhost:3000
2. Enter a URL (e.g., `https://example.com`)
3. Set crawl depth and max pages
4. Click **Discover Pages** to find all navigation links
5. Review the page list, then click **Start Capture**
6. Wait for all pages to be captured

### 2. Import to Figma

1. Open Figma Desktop
2. Go to **Plugins > Development > Import plugin from manifest**
3. Select `manifest.json` from this repo
4. Run the plugin: **Plugins > Development > Sitemap Generator**
5. Select your project and display size
6. Click **Generate Sitemap**

## Configuration

### Capture Options

| Option | Default | Description |
|--------|---------|-------------|
| Max Depth | 3 | How deep to crawl navigation (1-5) |
| Max Pages | 50 | Maximum pages to capture |
| Desktop | ✓ | Capture at 1920px viewport |
| Mobile | ✓ | Capture at 390px viewport |
| Scroll Delay | 150ms | Wait time for lazy content |

### Figma Plugin Options

| Option | Default | Description |
|--------|---------|-------------|
| Display Size | 500px | Thumbnail width in Figma |
| Format | PNG | PNG (sharp) or JPEG (smaller) |

## Project Structure

```
figma-sitemap-generator/
├── app.js              # Capture server (Express + Playwright)
├── code.js             # Figma plugin logic
├── ui.html             # Figma plugin UI
├── manifest.json       # Figma plugin config
├── Dockerfile          # Docker build
├── docker-compose.yml  # Docker orchestration
├── captures/           # Screenshot output
└── SPEC.md             # Technical specification
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Web UI |
| GET | `/api/projects` | List saved projects |
| POST | `/api/discover` | Crawl site navigation |
| POST | `/api/capture` | Start screenshot capture |
| DELETE | `/api/projects/:id` | Delete a project |

## Technical Details

- **Viewport**: Desktop 1920×1080, Mobile 390×844
- **Scale**: 2x for retina/4K output
- **Wait Strategy**: `domcontentloaded` + 15s timeout
- **Image Format**: PNG for quality, JPEG optional
- **Tiling**: Large images split into 1000px tiles

## Requirements

- Node.js 18+
- Docker (optional, recommended)
- Figma Desktop (for plugin)

## Troubleshooting

**Plugin crashes with "Image too large"**
- Use a smaller display size (500px or 800px)
- The plugin tiles large images automatically

**Pages not loading correctly**
- Increase scroll delay for lazy-loaded sites
- Some sites may block automated browsers

**Docker build fails**
- Ensure Docker has enough memory (4GB+)
- Try `docker system prune` to free space

## License

MIT

## Contributing

Pull requests welcome! See [SPEC.md](SPEC.md) for technical details.
