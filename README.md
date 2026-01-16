# Sitemap Analyzer

A Figma plugin that captures websites and provides AI-powered UX analysis with visual annotations. Captures full-page 4K screenshots using parallel processing, extracts UI elements, and generates insights that appear as hotspot markers in Figma.

## Features

- **4K Screenshots** - Captures at 1920x2x = 3840px for crisp detail
- **Desktop + Mobile** - Side-by-side viewport comparison
- **Auto-Discovery** - Crawls navigation to find all pages
- **Parallel Processing** - Captures 4 pages simultaneously (~4x faster)
- **Element Extraction** - Captures bounding boxes for CTAs, headings, forms, nav
- **AI Analysis** - LLM-powered insights with custom rubric support
- **Visual Annotations** - Numbered hotspot markers on screenshots linked to insights
- **Project Management** - Save and manage multiple captures

## Quick Start

### Option 1: Docker (Recommended)

```bash
git clone https://github.com/jnanthak83/figma-sitemap-generator.git
cd figma-sitemap-generator

docker compose build
docker compose up -d

# Open http://localhost:3000
```

### Option 2: Local Install

```bash
git clone https://github.com/jnanthak83/figma-sitemap-generator.git
cd figma-sitemap-generator

npm install
npx playwright install chromium
npm start

# Open http://localhost:3000
```

## Usage

### 1. Capture a Website

1. Open http://localhost:3000
2. Enter a URL (e.g., `https://example.com`)
3. Set crawl depth (1-5) and max pages
4. (Optional) Add analysis rubric or select a preset
5. Click **Discover Pages** to find all navigation links
6. Review the page list, then click **Start Capture**
7. Watch parallel capture progress (4 pages at once!)

### 2. Import to Figma

1. Open Figma Desktop
2. Go to **Plugins > Development > Import plugin from manifest**
3. Select `manifest.json` from this repo
4. Run the plugin and select your project
5. Click **Generate Sitemap**

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      WEB UI (localhost:3000)                     │
│  - Enter URL, configure options                                  │
│  - Add analysis rubric (custom or preset)                        │
│  - View progress                                                 │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXPRESS SERVER (app.js)                     │
│  - /api/discover — Find pages on site                           │
│  - /api/capture — Capture screenshots                           │
│  - /api/projects — List/manage projects                         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        WORKER POOL                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Scanner x4  │  │ Analyzer x2 │  │ Synthesizer │              │
│  │ (parallel)  │  │ (parallel)  │  │     x1      │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        OUTPUT FILES                              │
│  /captures/{project_id}/                                         │
│  ├── sitemap.json      # Pages + elements + extracted content   │
│  ├── analysis.json     # Insights per page                      │
│  └── *.png             # Screenshots                             │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       FIGMA PLUGIN                               │
│  - Loads sitemap.json from server                                │
│  - Creates visual sitemap with screenshots                       │
│  - Draws hotspot markers at element positions                    │
│  - Shows insight panel below each card                           │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
figma-sitemap-plugin/
├── app.js              # Express server + API endpoints
├── code.js             # Figma plugin logic
├── ui.html             # Figma plugin UI
├── manifest.json       # Figma plugin manifest
├── package.json
│
├── workers/            # Worker pool system
│   ├── pool.js         # Job queue with concurrency control
│   ├── coordinator.js  # Job orchestration
│   ├── scanner.js      # Screenshot + element extraction
│   ├── analyzer.js     # LLM analysis + rubric support
│   ├── synthesizer.js  # Site-wide synthesis
│   └── llm.js          # LLM provider abstraction
│
├── tests/              # Test suite
│   ├── setup.js        # Jest configuration
│   ├── unit/           # Unit tests (6 files)
│   └── integration/    # API tests
│
├── captures/           # Output directory (gitignored)
│
├── SPEC.md             # Technical specification
├── CHANGELOG.md        # Version history
├── Dockerfile
└── docker-compose.yml
```

## API Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Web UI |
| GET | `/api/status` | Server status |
| GET | `/api/projects` | List all projects |
| POST | `/api/discover` | Crawl site navigation |
| POST | `/api/capture` | Start parallel capture |
| DELETE | `/api/projects/:id` | Delete project |

### Extended API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects` | Create multi-site project |
| GET | `/api/projects/:id/status` | Detailed progress |
| GET | `/api/queue/status` | Worker pool status |
| POST | `/api/config/llm` | Configure LLM provider |

## Data Schemas

### sitemap.json

```json
{
  "site": "example.com",
  "captured_at": "2025-01-15",
  "timing": { "total": "45.2s", "mode": "parallel", "workers": 4 },
  "pages": [{
    "slug": "home",
    "path": "/",
    "title": "Home",
    "desktopFile": "example_home_desktop.png",
    "mobileFile": "example_home_mobile.png",
    "extracted": {
      "meta": { "title": "...", "description": "..." },
      "headings": { "h1": ["..."], "h2": ["..."] },
      "ctas": [{ "text": "Get Started", "prominence": "primary" }]
    },
    "elements": [{
      "id": "el_001",
      "type": "cta",
      "text": "Get Started",
      "desktop": { "x": 540, "y": 820, "width": 180, "height": 48 }
    }]
  }]
}
```

### analysis.json

```json
{
  "pages": [{
    "path": "/",
    "scores": { "overall": 72, "content": 68, "ux": 70, "seo": 75 },
    "insights": [{
      "id": "ins_001",
      "elementRef": "el_001",
      "severity": "warning",
      "category": "conversion",
      "message": "CTA uses generic text 'Get Started'",
      "suggestion": "Use action-specific text like 'Start Free Trial'"
    }]
  }]
}
```

## Analysis Rubrics

Custom rubrics let you evaluate pages against your own criteria. Enter one criterion per line:

```
- Check if primary CTA is above the fold
- Evaluate trust signals (logos, testimonials, security badges)
- Assess mobile navigation accessibility
- Look for pricing transparency
```

### Preset Rubrics

| Preset | Focus |
|--------|-------|
| UX Audit | Navigation, hierarchy, accessibility, mobile |
| Conversion | CTAs, trust signals, friction points, clarity |
| Accessibility | Contrast, labels, focus states, alt text |
| SEO | Headings, meta, content structure, links |

## AI Analysis Setup (Optional)

### Install Ollama (local LLM)

```bash
# macOS
brew install ollama
ollama pull llama3.2
ollama serve
```

### Or use Claude API

```bash
curl -X POST http://localhost:3000/api/config/llm \
  -H "Content-Type: application/json" \
  -d '{"provider": "claude", "apiKey": "your-key"}'
```

When no LLM is available, the analyzer uses heuristic fallback that still produces useful insights.

## Testing

```bash
# Run all tests
npm test

# With coverage report
npm run test:coverage

# Watch mode
npm run test:watch
```

Test suite: 165 tests, 76% coverage

## Configuration

### Worker Pool

```javascript
const coordinator = new Coordinator({
  poolConfig: {
    scan: { concurrency: 4, timeout: 60000, retries: 2 },
    analyze: { concurrency: 2, timeout: 120000, retries: 1 },
    synthesize: { concurrency: 1, timeout: 300000, retries: 1 }
  }
});
```

## Troubleshooting

**Capture is slow**
- Check worker pool status: `GET /api/queue/status`
- Ensure 4 scan workers are running
- Reduce scroll delay for faster sites

**Plugin shows "Server Not Running"**
- Start server: `npm start` or `docker compose up -d`
- Check http://localhost:3000 is accessible

**Analysis not working**
- Ensure Ollama is running: `ollama serve`
- Falls back to heuristic analysis if LLM unavailable

**Figma plugin not loading images**
- Ensure server is running on localhost:3000
- Check project exists in captures/ folder
- Try refreshing project list

## Requirements

- **Node.js** 18+
- **Docker** (recommended)
- **Figma Desktop** (for the plugin)
- **Ollama** (optional, for AI analysis)

## License

MIT
