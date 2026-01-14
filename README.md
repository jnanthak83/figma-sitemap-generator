# Sitemap Generator

A visual sitemap generator for Figma. Captures full-page 4K screenshots of any website and creates a hierarchical sitemap layout in Figma.

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

# Build and run
docker compose build
docker compose up -d

# Open http://localhost:3000
```

**Docker Commands:**
```bash
docker compose up -d      # Start in background
docker compose down       # Stop
docker compose logs -f    # View logs
docker compose restart    # Restart
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

### 1. Capture a Website

1. Open http://localhost:3000
2. Enter a URL (e.g., `https://example.com`)
3. Set crawl depth (1-5) and max pages
4. Click **Discover Pages** to find all navigation links
5. Review the page list, then click **Start Capture**
6. Wait for all pages to be captured (progress shown in real-time)

### 2. Import to Figma

1. Open Figma Desktop
2. Go to **Plugins → Development → Import plugin from manifest**
3. Select `manifest.json` from this repo
4. Run the plugin: **Plugins → Development → Sitemap Generator**
5. If server is running, you'll see your projects
6. Select project, display size, and format
7. Click **Generate Sitemap**

### Plugin Connection States

The Figma plugin shows server status:
- 🟢 **Connected** - Server running, ready to import
- 🔴 **Disconnected** - Click "Open Server UI" or "Retry Connection"

## Configuration

### Capture Options (Web UI)

| Option | Default | Description |
|--------|---------|-------------|
| Max Depth | 3 | How deep to crawl navigation (1-5) |
| Max Pages | 50 | Maximum pages to capture |
| Desktop | ✓ | Capture at 1920px viewport (outputs 3840px) |
| Mobile | ✓ | Capture at 390px viewport (outputs 780px) |
| Scroll Delay | 150ms | Wait time for lazy-loaded content |

### Figma Plugin Options

| Option | Default | Description |
|--------|---------|-------------|
| Display Size | 500px | Thumbnail width in Figma (300-1920px) |
| Format | PNG | PNG (sharp text) or JPEG (smaller files) |

## Project Structure

```
figma-sitemap-generator/
├── app.js              # Capture server (Express + Playwright)
├── code.js             # Figma plugin logic
├── ui.html             # Figma plugin UI
├── manifest.json       # Figma plugin manifest
├── package.json        # Node dependencies
├── Dockerfile          # Docker build
├── docker-compose.yml  # Docker orchestration
├── captures/           # Screenshot output (gitignored)
├── CHANGELOG.md        # Version history
└── SPEC.md             # Technical specification
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Web UI |
| GET | `/api/status` | Server status |
| GET | `/api/projects` | List saved projects |
| GET | `/api/projects/:id/sitemap.json` | Get project metadata |
| GET | `/captures/:id/` | Browse project files |
| POST | `/api/discover` | Crawl site navigation |
| POST | `/api/capture` | Start screenshot capture |
| DELETE | `/api/projects/:id` | Delete a project |

## Technical Details

- **Viewport**: Desktop 1920×1080, Mobile 390×844
- **Scale**: 2x for retina/4K output
- **Wait Strategy**: `domcontentloaded` + 15s timeout
- **Image Tiling**: Large images split into 1000px tiles for Figma compatibility

## Requirements

- **Docker** (recommended) OR Node.js 18+
- **Figma Desktop** (for the plugin)

## Troubleshooting

### Plugin shows "Server Not Running"
- Start the server: `npm start` or `docker compose up -d`
- Check the server URL in plugin settings
- Click "Retry Connection"

### Plugin crashes with "Image too large"
- Use a smaller display size (500px or 800px)
- The plugin automatically tiles large images, but very tall pages may still cause issues

### Pages not loading correctly
- Increase scroll delay for sites with lazy-loaded content
- Some sites may block automated browsers

### Docker build fails
- Ensure Docker Desktop is running
- Try `docker system prune` to free space
- Check you have at least 4GB of disk space

## License

MIT

## Contributing

Pull requests welcome! See [SPEC.md](SPEC.md) for technical details and [CHANGELOG.md](CHANGELOG.md) for version history.
