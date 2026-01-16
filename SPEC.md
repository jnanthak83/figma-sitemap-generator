# Technical Specification

Detailed technical reference for the Sitemap Analyzer. For usage instructions, see [README.md](README.md).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                            WEB UI                                    │
│  - Add URL + analysis rubric                                         │
│  - Configure capture options                                         │
│  - Real-time progress dashboard                                      │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          COORDINATOR                                 │
│  /workers/coordinator.js                                             │
│  - Manages job queues (scan, analyze, synthesize)                   │
│  - Tracks progress across all sites                                  │
│  - Triggers synthesis when all jobs complete                        │
└─────────────────────────────────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SCAN QUEUE    │    │  ANALYZE QUEUE  │    │ SYNTHESIZE QUEUE│
│ (4 parallel)    │    │ (2 parallel)    │    │ (1 worker)      │
│                 │    │                 │    │                 │
│ - Screenshot    │    │ - LLM analysis  │    │ - Cross-page    │
│ - Extract HTML  │    │ - Element refs  │    │ - Cross-site    │
│ - Elements      │    │ - Insights      │    │ - Recommendations│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         RESULTS STORE                                │
│  /captures/{project_id}/                                             │
│  ├── sitemap.json      # Pages + elements + extracted content       │
│  ├── analysis.json     # Per-page AI insights                       │
│  └── *.png             # Screenshots                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Worker Modules

| Module | File | Purpose |
|--------|------|---------|
| Pool | `workers/pool.js` | Job queue with priority and concurrency control |
| Coordinator | `workers/coordinator.js` | Project orchestration, phase transitions |
| Scanner | `workers/scanner.js` | Playwright capture + element extraction |
| Analyzer | `workers/analyzer.js` | LLM analysis with rubric support |
| Synthesizer | `workers/synthesizer.js` | Site-wide pattern detection |
| LLM | `workers/llm.js` | Provider abstraction (Ollama/Claude/OpenAI) |

### Worker Configuration

```javascript
{
  scan: { concurrency: 4, timeout: 60000, retries: 2 },
  analyze: { concurrency: 2, timeout: 120000, retries: 1 },
  synthesize: { concurrency: 1, timeout: 300000, retries: 1 }
}
```

### Job Flow

```
discover → scan (parallel) → analyze (parallel) → synthesize
```

## Data Schemas

### sitemap.json

```json
{
  "site": "example.com",
  "captured_at": "2025-01-15",
  "captured_at_time": "14:30",
  "timing": {
    "total": "45.2s",
    "mode": "parallel",
    "workers": 4
  },
  "rubric": "- Check CTA visibility\n- Evaluate trust signals",
  "pages": [{
    "slug": "home",
    "path": "/",
    "title": "Home",
    "depth": 0,
    "parent": null,
    "desktopFile": "example_home_desktop.png",
    "mobileFile": "example_home_mobile.png",
    "extracted": {
      "meta": { "title": "...", "description": "..." },
      "headings": { "h1": ["..."], "h2": ["..."] },
      "ctas": [{ "text": "Get Started", "prominence": "primary" }],
      "components": { "hero": true, "testimonials": false }
    },
    "elements": [{
      "id": "el_001",
      "type": "cta",
      "text": "Get Started",
      "prominence": "primary",
      "selector": "button.hero-cta",
      "desktop": { "x": 540, "y": 820, "width": 180, "height": 48 },
      "mobile": { "x": 20, "y": 650, "width": 350, "height": 48 }
    }]
  }]
}
```

### analysis.json

```json
{
  "pages": [{
    "path": "/",
    "slug": "home",
    "site": "example.com",
    "scores": {
      "overall": 72,
      "content": 68,
      "structure": 75,
      "ux": 70,
      "seo": 75
    },
    "insights": [{
      "id": "ins_001",
      "elementRef": "el_001",
      "severity": "warning",
      "category": "conversion",
      "message": "CTA uses generic text 'Get Started'",
      "suggestion": "Use action-specific text like 'Start Free Trial'",
      "rubricMatch": "- Check if primary CTA is specific"
    }],
    "llm": {
      "provider": "ollama",
      "model": "llama3.2"
    }
  }]
}
```

### Element Types

| Type | Selector | Data |
|------|----------|------|
| `heading` | h1, h2, h3 | level, text |
| `cta` | button, a.btn, [role="button"] | text, prominence, href |
| `form` | form | fields[], action |
| `nav` | nav, [role="navigation"] | links[], location |
| `image` | img (>200px, in first 1000px) | alt, src |
| `trust` | [class*="logo"], [class*="badge"] | text |

### Insight Severity Levels

| Severity | Color | Meaning |
|----------|-------|---------|
| `good` | 🟢 Green | Positive finding |
| `warning` | 🟡 Yellow | Minor issue or improvement |
| `issue` | 🔴 Red | Problem that needs fixing |

## API Reference

### Project Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Server status |
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project details |
| DELETE | `/api/projects/:id` | Delete project |

### Capture & Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/discover` | Discover pages on site |
| POST | `/api/capture` | Start parallel capture |
| GET | `/api/projects/:id/status` | Job progress |
| GET | `/api/projects/:id/analysis.json` | Get analysis results |
| POST | `/api/projects/:id/analyze` | Trigger analysis with optional rubric |
| GET | `/api/queue/status` | Worker pool status |

### Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/config/llm` | Configure LLM provider |

## LLM Integration

### Providers

| Provider | Use Case | Offline |
|----------|----------|---------|
| Ollama | Local analysis | Yes |
| Claude | High-quality synthesis | No |
| OpenAI | Alternative | No |

### Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_ENDPOINT=http://localhost:11434
```

### Fallback Behavior

When no LLM is available, `createBasicAnalysis()` generates insights using heuristics:
- SEO checks (title length, meta description, headings)
- Element-referenced insights (CTA count, H1 presence)
- Rubric keyword matching (trust, CTA, navigation)

## Annotation System

### Data Flow

```
Scanner                    Analyzer                   Figma Plugin
────────                   ────────                   ────────────
elements[] ──────────────► insights[] ──────────────► hotspots[]
(positions)                (elementRef)               (markers + panel)
```

### Figma Plugin Rendering

1. Fetch `sitemap.json` and `analysis.json` from server
2. For each page card:
   - Draw screenshot as image fill
   - For each insight with `elementRef`:
     - Find matching element in `elements[]`
     - Draw numbered circle at element's top-right corner
     - Color by severity (green/yellow/red)
   - Draw insights panel below card
     - Number badge + category tag + message
     - Max 5 insights per card

## Preset Rubrics

### UX Audit
```
- Check navigation accessibility and clarity
- Evaluate visual hierarchy and content flow
- Assess mobile responsiveness
- Look for consistent interaction patterns
- Check form usability and error handling
```

### Conversion
```
- Check if primary CTA is above the fold
- Evaluate trust signals (logos, testimonials, badges)
- Assess pricing transparency and clarity
- Look for friction points in user journey
- Check urgency and scarcity elements
```

### Accessibility
```
- Check color contrast ratios
- Evaluate form label associations
- Assess keyboard navigation support
- Look for alt text on images
- Check focus state visibility
```

### SEO
```
- Check H1 presence and uniqueness
- Evaluate meta title and description
- Assess heading hierarchy (H1-H6)
- Look for internal linking structure
- Check image optimization
```

## Development Status

### Completed
- Worker pool system (pool, coordinator, scanner, analyzer, synthesizer, llm)
- Element position extraction during capture
- Custom rubric support in analyzer
- Web UI with rubric input and presets
- Figma plugin with hotspot markers and insights panel
- Heuristic fallback when LLM unavailable
- Test suite (165 tests, 76% coverage)
- Analysis API endpoints (`GET /analysis.json`, `POST /analyze`)

### TODO
- Click hotspot → highlight insight in panel
- Multi-site comparison synthesis
- Competitor side-by-side view in Figma

## Commands

```bash
# Development
npm start                    # Start server on localhost:3000
npm test                     # Run test suite
npm run test:coverage        # Run with coverage report

# Docker
docker compose up -d         # Start in background
docker compose logs -f       # View logs
docker compose down          # Stop

# Test Ollama
curl http://localhost:11434/api/tags
```
