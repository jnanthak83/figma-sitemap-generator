# Sitemap Analyzer v2.0

A visual sitemap generator for Figma with AI-powered UX analysis. Captures full-page 4K screenshots using **parallel processing** and optionally analyzes pages for SEO, content quality, and UX issues.

## What's New in v2.0

- 🚀 **Parallel Capture** - 4x faster with worker pool (4 concurrent browsers)
- 🤖 **AI Analysis** - Optional LLM-powered UX/SEO analysis
- 📊 **Competitor Comparison** - Analyze multiple sites side-by-side
- ✅ **Test Suite** - 165 tests with 76% coverage

## Features

- **4K Screenshots** - Captures at 1920×2x = 3840px for crisp detail
- **Desktop + Mobile** - Side-by-side viewport comparison
- **Auto-Discovery** - Crawls navigation to find all pages
- **Hierarchy Detection** - Organizes pages by depth with connectors
- **Parallel Processing** - Captures 4 pages simultaneously
- **AI Analysis** - SEO, content, UX, and structure scoring
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
4. Click **Discover Pages** to find all navigation links
5. Review the page list, then click **Start Capture**
6. Watch parallel capture progress (4 pages at once!)

### 2. Import to Figma

1. Open Figma Desktop
2. Go to **Plugins → Development → Import plugin from manifest**
3. Select `manifest.json` from this repo
4. Run the plugin and select your project
5. Click **Generate Sitemap**

## Architecture (v2.0)

```
┌─────────────────────────────────────────────────────────┐
│                     app.js (Express)                     │
├─────────────────────────────────────────────────────────┤
│                    Coordinator                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Worker Pool                         │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐│    │
│  │  │ Scanner │ │ Scanner │ │ Scanner │ │Scanner ││    │
│  │  │   (1)   │ │   (2)   │ │   (3)   │ │  (4)  ││    │
│  │  └─────────┘ └─────────┘ └─────────┘ └────────┘│    │
│  │  ┌─────────┐ ┌─────────┐ ┌────────────────────┐│    │
│  │  │Analyzer │ │Analyzer │ │    Synthesizer     ││    │
│  │  │   (1)   │ │   (2)   │ │        (1)         ││    │
│  │  └─────────┘ └─────────┘ └────────────────────┘│    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Worker Modules

| Module | File | Purpose |
|--------|------|---------|
| Pool | `workers/pool.js` | Job queue with concurrency control |
| Coordinator | `workers/coordinator.js` | Project orchestration |
| Scanner | `workers/scanner.js` | Playwright page capture |
| Analyzer | `workers/analyzer.js` | LLM-powered analysis |
| Synthesizer | `workers/synthesizer.js` | Site-wide insights |
| LLM | `workers/llm.js` | Ollama/Claude abstraction |

## API Endpoints

### Legacy (v1 compatible)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Web UI |
| GET | `/api/status` | Capture session status |
| GET | `/api/projects` | List all projects |
| POST | `/api/discover` | Crawl site navigation |
| POST | `/api/capture` | Start parallel capture |
| DELETE | `/api/projects/:id` | Delete project |

### New v2 API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects` | Create multi-site project |
| GET | `/api/projects/:id/status` | Detailed progress |
| POST | `/api/projects/:id/discover` | Start discovery phase |
| GET | `/api/queue/status` | Worker pool status |
| POST | `/api/config/llm` | Configure LLM provider |

## Testing

```bash
# Run all tests
npm test

# With coverage report
npm run test:coverage

# Watch mode
npm run test:watch

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration
```

**Test Coverage:**
- 165 tests across 7 suites
- 76% line coverage
- Key modules: pool, coordinator, analyzer, synthesizer

## Configuration

### Worker Pool (in app.js)
```javascript
const coordinator = new Coordinator({
  capturesDir: BASE_DIR,
  poolConfig: {
    scan: { concurrency: 4, timeout: 60000, retries: 2 },
    analyze: { concurrency: 2, timeout: 120000, retries: 1 },
    synthesize: { concurrency: 1, timeout: 300000, retries: 1 },
    discover: { concurrency: 2, timeout: 30000, retries: 1 }
  }
});
```

### LLM Configuration (optional)
```bash
# Via API
curl -X POST http://localhost:3000/api/config/llm \
  -H "Content-Type: application/json" \
  -d '{"provider": "ollama", "model": "llama3.2"}'
```

## AI Analysis Setup (Optional)

### Install Ollama (local LLM)
```bash
# macOS
brew install ollama
ollama pull llama3.2

# Start Ollama
ollama serve
```

### Or use Claude API
```bash
curl -X POST http://localhost:3000/api/config/llm \
  -d '{"provider": "claude", "apiKey": "your-key"}'
```

## Project Structure

```
figma-sitemap-generator/
├── app.js              # Express server + API
├── workers/
│   ├── pool.js         # Worker pool engine
│   ├── coordinator.js  # Project orchestration
│   ├── scanner.js      # Playwright capture
│   ├── analyzer.js     # Page analysis
│   ├── synthesizer.js  # Site synthesis
│   └── llm.js          # LLM providers
├── tests/
│   ├── setup.js        # Jest configuration
│   ├── unit/           # Unit tests
│   └── integration/    # API tests
├── code.js             # Figma plugin
├── ui.html             # Plugin UI
├── manifest.json       # Figma manifest
├── package.json        # Dependencies
├── SPEC.md             # Technical spec
├── CHANGELOG.md        # Version history
└── TODO.md             # Development roadmap
```

## Requirements

- **Node.js** 18+ (for local install)
- **Docker** (recommended for easy setup)
- **Figma Desktop** (for the plugin)
- **Ollama** (optional, for AI analysis)

## Troubleshooting

### Capture is slow
- Check worker pool status: `GET /api/queue/status`
- Ensure 4 scan workers are running
- Reduce scroll delay for faster sites

### Plugin shows "Server Not Running"
- Start server: `npm start` or `docker compose up -d`
- Check http://localhost:3000 is accessible

### Analysis not working
- Ensure Ollama is running: `ollama serve`
- Check LLM config: `GET /api/config/llm`
- Falls back to heuristic analysis if LLM unavailable

## License

MIT

## Contributing

See [SPEC.md](SPEC.md) for technical details, [TODO.md](TODO.md) for roadmap, and [CHANGELOG.md](CHANGELOG.md) for version history.
