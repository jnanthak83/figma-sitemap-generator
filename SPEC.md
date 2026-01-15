# Sitemap Analyzer - Technical Specification

## Overview

A UX/Content Analysis Platform that captures websites and provides AI-powered insights:
1. **Capture Server** - Node.js/Express with parallel Playwright scanning
2. **Worker Pool** - Concurrent job processing for scan, analyze, synthesize
3. **Figma Plugin** - Visual sitemap with annotated insights

---

## Current Status

**Version:** 2.0.0-dev

### Completed (v1.4.1)
- ✅ Basic scanning and capture (4K screenshots)
- ✅ Figma plugin with tile-by-tile loading
- ✅ Project management
- ✅ Connection state UI
- ✅ Docker support

### In Progress (v2.0)
- ✅ Worker pool foundation (`/workers/pool.js`)
- ✅ Job coordinator (`/workers/coordinator.js`)
- ✅ Scanner with extraction (`/workers/scanner.js`)
- ✅ LLM provider abstraction (`/workers/llm.js`)
- ✅ Analyzer worker (`/workers/analyzer.js`)
- ✅ Synthesizer worker (`/workers/synthesizer.js`)
- 🔲 Integration with app.js
- 🔲 Multi-site UI
- 🔲 Figma plugin analysis display

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                            WEB UI                                    │
│  - Add multiple sites (your site + competitors)                      │
│  - Configure analysis options                                        │
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
│ - Extract HTML  │    │ - Structure     │    │ - Cross-site    │
│ - Extract text  │    │ - Content       │    │ - Recommendations│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         RESULTS STORE                                │
│  /captures/{project_id}/                                             │
│  ├── manifest.json      # Project config, sites, status             │
│  ├── site_{domain}/                                                  │
│  │   ├── sitemap.json   # Pages + extracted content                 │
│  │   ├── analysis.json  # Per-page AI insights                      │
│  │   └── screenshots/   # PNG files                                  │
│  └── synthesis.json     # Cross-site comparison                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
figma-sitemap-plugin/
├── app.js                    # Express server + API endpoints
├── code.js                   # Figma plugin logic
├── ui.html                   # Figma plugin UI
├── manifest.json             # Figma plugin manifest
├── package.json
│
├── /workers                  # Worker pool system
│   ├── pool.js               # Job queue + concurrency control
│   ├── coordinator.js        # Job orchestration + phase transitions
│   ├── scanner.js            # Screenshot + content extraction
│   ├── analyzer.js           # LLM-powered page analysis
│   ├── synthesizer.js        # Site-wide + cross-site comparison
│   └── llm.js                # Provider abstraction (Ollama/Claude)
│
├── /captures                 # Output directory
│   └── {project_id}/
│       ├── manifest.json
│       ├── site_{domain}/
│       │   ├── sitemap.json
│       │   ├── analysis.json
│       │   └── screenshots/
│       └── synthesis.json
│
├── SPEC.md                   # This file
├── CHANGELOG.md
├── README.md
├── Dockerfile
└── docker-compose.yml
```

---

## API Endpoints

### Project Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Server status |
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create project with sites[] |
| GET | `/api/projects/:id` | Get project details |
| GET | `/api/projects/:id/status` | Job progress |
| DELETE | `/api/projects/:id` | Delete project |

### Capture & Analysis
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/:id/discover` | Discover pages on all sites |
| POST | `/api/projects/:id/scan` | Start scanning (queues jobs) |
| GET | `/api/projects/:id/analysis` | Get analysis results |
| GET | `/api/projects/:id/synthesis` | Get comparison results |

### Configuration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/queue/status` | Worker pool status |
| POST | `/api/config/llm` | Configure LLM provider |

### Legacy (v1 compatibility)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/discover` | Discover pages (single site) |
| POST | `/api/capture` | Capture pages (single site) |

---

## Data Schemas

### manifest.json
```json
{
  "id": "proj_abc123",
  "created_at": "2025-01-14T10:30:00Z",
  "status": "analyzing",
  "config": {
    "maxDepth": 3,
    "maxPagesPerSite": 50,
    "captureDesktop": true,
    "captureMobile": true,
    "concurrency": 4,
    "llm": { "provider": "ollama", "model": "llama3.2" }
  },
  "sites": [
    { "url": "https://example.com", "role": "primary", "status": "complete" },
    { "url": "https://rival.com", "role": "competitor", "status": "scanning" }
  ],
  "progress": {
    "phase": "analyzing",
    "scanComplete": 20,
    "scanTotal": 30,
    "analyzeComplete": 15,
    "analyzeTotal": 30
  }
}
```

### sitemap.json (per site)
```json
{
  "site": "example.com",
  "pages": [{
    "slug": "home",
    "path": "/",
    "title": "Home",
    "depth": 0,
    "desktopFile": "screenshots/home_desktop.png",
    "extracted": {
      "meta": { "title": "...", "description": "..." },
      "headings": { "h1": ["..."], "h2": ["..."] },
      "ctas": [{ "text": "Get Started", "prominence": "primary" }],
      "components": { "hero": true, "testimonials": true }
    }
  }]
}
```

### analysis.json (per site)
```json
{
  "pages": [{
    "path": "/",
    "scores": { "overall": 72, "content": 68, "ux": 70, "seo": 75 },
    "recommendations": [{
      "priority": "high",
      "issue": "Weak CTA",
      "suggestion": "Change to action-specific text"
    }]
  }],
  "siteWide": {
    "strengths": ["Consistent navigation"],
    "weaknesses": ["Missing trust signals"],
    "topPriority": "Add customer logos"
  }
}
```

### synthesis.json (cross-site)
```json
{
  "sites": { "primary": "example.com", "competitors": ["rival.com"] },
  "comparison": {
    "insights": ["rival.com uses video hero", "Missing trust badges"]
  },
  "recommendations": {
    "quickWins": [{ "action": "Add customer logos", "impact": "high" }]
  },
  "summary": {
    "overallPosition": "middle",
    "topPriority": "Add trust signals"
  }
}
```

---

## Worker Pool

### Job Types
- `discover` - Find pages on a site
- `scan` - Screenshot + extract content
- `analyze` - LLM analysis of page
- `synthesize` - Cross-site comparison

### Configuration
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

---

## LLM Integration

### Providers
| Provider | Use Case | Offline |
|----------|----------|---------|
| Ollama | Local analysis | ✅ |
| Claude | High-quality synthesis | ❌ |
| OpenAI | Alternative | ❌ |

### Configuration
```bash
# Environment variables
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_ENDPOINT=http://localhost:11434
```

---

## Implementation Phases

### Phase 1: Worker Pool Integration ⬜ IN PROGRESS
- [x] Create pool.js, coordinator.js, scanner.js
- [x] Create llm.js, analyzer.js, synthesizer.js
- [ ] Integrate coordinator with app.js
- [ ] Add new API endpoints
- [ ] Update web UI for multi-site

### Phase 2: Content Extraction ✅ DONE
- [x] Extract headings, CTAs, components during scan
- [x] Save extracted data in sitemap.json

### Phase 3: LLM Analysis ✅ DONE (workers ready)
- [x] Ollama integration
- [x] Claude API integration
- [x] Basic analysis without LLM (fallback)
- [ ] Test with real sites

### Phase 4: Site Synthesis ✅ DONE (workers ready)
- [x] Site-wide pattern detection
- [x] Cross-site comparison
- [ ] Test with multiple sites

### Phase 5: Figma Plugin Update ⬜ TODO
- [ ] Score badges on cards
- [ ] Comparison view layout
- [ ] Recommendation panel

---

## Commands

```bash
# Development
cd /Users/jesh/Documents/Projects/figma-sitemap-plugin
npm start

# Docker
docker compose up -d
docker compose logs -f
docker compose down

# Test Ollama
curl http://localhost:11434/api/tags
```

---

## Annotations & Rubric System

### Overview

Visual annotation system that highlights specific UI elements on screenshots with numbered hotspot markers, linked to insights in a collapsible side panel. Users can provide custom analysis rubrics to evaluate pages against their own criteria.

### User Flow

```
1. User enters URL + custom rubric in Web UI
2. Scanner captures screenshot + extracts element positions
3. Analyzer evaluates page against rubric, references specific elements
4. Figma plugin displays:
   - Screenshot with numbered hotspot markers
   - Side panel with insights linked to markers
   - Color-coded severity (🟢 good, 🟡 warning, 🔴 issue)
```

### Data Flow

```
Scanner                    Analyzer                   Figma Plugin
────────                   ────────                   ────────────
elements[] ──────────────► insights[] ──────────────► hotspots[]
(positions)                (elementRef)               (markers + panel)
```

### Element Schema (sitemap.json)

```json
{
  "pages": [{
    "slug": "home",
    "elements": [
      {
        "id": "el_001",
        "type": "cta",
        "text": "Get Started",
        "selector": "button.hero-cta",
        "desktop": { "x": 540, "y": 820, "width": 180, "height": 48 },
        "mobile": { "x": 20, "y": 650, "width": 350, "height": 48 }
      },
      {
        "id": "el_002",
        "type": "heading",
        "level": 1,
        "text": "Welcome to Example",
        "desktop": { "x": 400, "y": 200, "width": 400, "height": 60 },
        "mobile": { "x": 20, "y": 150, "width": 350, "height": 80 }
      }
    ]
  }]
}
```

### Insight Schema (analysis.json)

```json
{
  "pages": [{
    "path": "/",
    "insights": [
      {
        "id": "ins_001",
        "elementRef": "el_001",
        "severity": "warning",
        "category": "conversion",
        "message": "CTA uses generic text 'Get Started'",
        "suggestion": "Use action-specific text like 'Start Free Trial'",
        "rubricMatch": "Check if primary CTA is specific and action-oriented"
      },
      {
        "id": "ins_002",
        "elementRef": null,
        "severity": "issue",
        "category": "trust",
        "message": "No trust signals found above the fold",
        "suggestion": "Add customer logos or security badges near hero",
        "rubricMatch": "Evaluate trust signals presence"
      }
    ]
  }]
}
```

### Rubric Format

User-provided text, one criterion per line:

```
- Check if primary CTA is above the fold
- Evaluate trust signals (logos, testimonials, security badges)
- Assess mobile navigation accessibility
- Look for pricing transparency
- Check form field labels and error states
- Verify consistent visual hierarchy
```

### Preset Rubrics

| Preset | Focus |
|--------|-------|
| UX Audit | Navigation, hierarchy, accessibility, mobile |
| Conversion | CTAs, trust signals, friction points, clarity |
| Accessibility | Contrast, labels, focus states, alt text |
| SEO | Headings, meta, content structure, links |

---

## Implementation TODO

### Phase 1: Scanner — Extract Element Positions ✅ DONE
- [x] Update `/workers/scanner.js` to extract bounding boxes during capture
- [x] Capture positions for: CTAs, headings (h1-h3), forms, images, nav items
- [x] Store as `elements[]` array in sitemap.json with `{type, text, x, y, width, height, viewport}`
- [x] Normalize coordinates relative to full-page screenshot dimensions

### Phase 2: Analyzer — Custom Rubric Support ✅ DONE
- [x] Add `rubric` field to analysis config
- [x] Update `/workers/analyzer.js` to include rubric in LLM prompt
- [x] Generate insights that reference specific elements by ID
- [x] Output: `insights[]` with `{id, elementRef, severity, message, suggestion}`

### Phase 3: Web UI — Rubric Input & Competitor Field ✅ DONE
- [x] Add "Analysis Rubric" textarea to capture form
- [x] Add preset buttons (UX Audit, Conversion, Accessibility, SEO) that populate rubric
- [x] Add "Add Competitor" input field (disabled/placeholder for now)
- [x] Save rubric to project config (sitemap.json)

### Phase 4: Figma Plugin — Annotation Panel ✅ DONE
- [x] Update `code.js` to fetch `analysis.json` alongside `sitemap.json`
- [x] Draw numbered hotspot markers on screenshots at element positions
- [x] Color-code markers by severity (🟢 good, 🟡 warning, 🔴 issue)
- [x] Auto-run analysis after capture when rubric or elements present
- [ ] Create collapsible side panel per card showing insights list
- [ ] Click hotspot → highlight corresponding insight in panel

### Phase 5: API Updates ⬜ TODO
- [ ] `POST /api/projects/:id/analyze` — trigger analysis with rubric
- [ ] `GET /api/projects/:id/analysis.json` — fetch results for Figma

---

## Future (Out of Scope)

- [ ] Multi-site comparison synthesis
- [ ] Competitor side-by-side view in Figma
- [ ] Rubric templates library
- [ ] Export annotations as PDF report
- [ ] Version comparison (before/after)

---

## Next Steps

1. **Phase 1** - Update scanner to extract element positions
2. **Phase 2** - Add rubric support to analyzer
3. **Phase 3** - Web UI for rubric input
4. **Phase 4** - Figma plugin annotations
5. **Phase 5** - API endpoints
