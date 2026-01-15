# Implementation Guide

This document describes what's been built and how to rebuild/extend it.

---

## Overview

The Figma Sitemap Generator captures website screenshots and provides AI-powered UX analysis with visual annotations. The system consists of:

1. **Capture Server** (Node.js/Express) — Crawls sites, captures screenshots, extracts elements
2. **Worker Pool** — Parallel processing for scan, analyze, synthesize jobs
3. **Figma Plugin** — Displays sitemap with annotated insights

---

## What's Working (as of Phase 2)

### ✅ Screenshot Capture
- Full-page screenshots at desktop (1920px) and mobile (390px)
- Parallel capture using 4 workers (~4x faster)
- Lazy-load handling via scroll warm-up
- Image tiling for Figma's 4096px limit

### ✅ Element Extraction
- Captures bounding boxes for UI elements during screenshot
- Element types: headings, CTAs, forms, nav, images, trust signals
- Stores desktop and mobile positions per element
- Elements saved to `sitemap.json` per page

### ✅ Custom Rubric Analysis
- User-defined evaluation criteria
- LLM prompt includes rubric + elements
- Insights reference specific elements by ID
- Fallback heuristic analysis when LLM unavailable

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         WEB UI (localhost:3000)                  │
│  - Enter URL, configure options                                  │
│  - Add analysis rubric (Phase 3)                                 │
│  - View progress                                                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         EXPRESS SERVER (app.js)                  │
│  - /api/discover — Find pages on site                           │
│  - /api/capture — Capture screenshots                           │
│  - /api/projects — List/manage projects                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         WORKER POOL                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Scanner x4  │  │ Analyzer x2 │  │ Synthestic  │              │
│  │ (parallel)  │  │ (parallel)  │  │ x1          │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         OUTPUT FILES                             │
│  /captures/{project_id}/                                         │
│  ├── sitemap.json      # Pages + elements + extracted content   │
│  ├── analysis.json     # Insights per page (Phase 5)            │
│  └── *.png             # Screenshots                             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         FIGMA PLUGIN                             │
│  - Loads sitemap.json from server                                │
│  - Creates visual sitemap with screenshots                       │
│  - Draws hotspot markers (Phase 4)                               │
│  - Shows insight panel (Phase 4)                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
figma-sitemap-plugin/
├── app.js                 # Express server, API endpoints
├── code.js                # Figma plugin logic
├── ui.html                # Figma plugin UI
├── manifest.json          # Figma plugin manifest
├── package.json
│
├── /workers
│   ├── pool.js            # Job queue + concurrency control
│   ├── coordinator.js     # Job orchestration
│   ├── scanner.js         # Screenshot + element extraction ✅
│   ├── analyzer.js        # LLM analysis + rubric support ✅
│   ├── synthesizer.js     # Site-wide synthesis
│   └── llm.js             # LLM provider abstraction ✅
│
├── /captures              # Output directory
│   └── {project_id}/
│       ├── sitemap.json
│       └── *.png
│
├── SPEC.md                # Technical specification
├── IMPLEMENTATION.md      # This file
├── CHANGELOG.md
└── README.md
```

---

## Key Data Schemas

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
  "pages": [
    {
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
      "elements": [
        {
          "id": "el_001",
          "type": "cta",
          "text": "Get Started",
          "prominence": "primary",
          "selector": "button.hero-cta",
          "desktop": { "x": 540, "y": 820, "width": 180, "height": 48 },
          "mobile": { "x": 20, "y": 650, "width": 350, "height": 48 }
        }
      ]
    }
  ]
}
```

### analysis.json (generated by analyzer)

```json
{
  "pages": [
    {
      "path": "/",
      "site": "example.com",
      "scores": {
        "overall": 72,
        "content": 68,
        "structure": 75,
        "ux": 70,
        "seo": 75
      },
      "insights": [
        {
          "id": "ins_001",
          "elementRef": "el_001",
          "severity": "warning",
          "category": "conversion",
          "message": "CTA uses generic text",
          "suggestion": "Use action-specific text like 'Start Free Trial'",
          "rubricMatch": "- Check if primary CTA is specific"
        }
      ],
      "rubric": "- Check if primary CTA is above the fold\n- Evaluate trust signals",
      "llm": {
        "provider": "ollama",
        "model": "llama3.2"
      }
    }
  ]
}
```

---

## How to Rebuild

### 1. Scanner Element Extraction

The scanner (`/workers/scanner.js`) extracts element positions during capture:

```javascript
// Key function: extractElements(page, viewport)
// Called twice: once for desktop, once for mobile
// Returns array of elements with bounding boxes

const desktopElements = await extractElements(page, 'desktop');
// Captures: headings, CTAs, forms, nav, images, trust signals

const mobileElements = await extractElements(page, 'mobile');

// Merge into single array with both viewport positions
results.elements = mergeElements(desktopElements, mobileElements);
```

**Element types extracted:**
- `heading` — h1, h2, h3 with level
- `cta` — buttons, link buttons with prominence
- `form` — forms with field names
- `nav` — navigation with links
- `image` — significant images (>200px, in first 1000px)
- `trust` — logos, badges, client sections

### 2. Rubric-Based Analysis

The analyzer (`/workers/analyzer.js`) evaluates pages against custom criteria:

```javascript
// Rubric is passed in payload
const result = await analyzePage({
  projectId: 'proj_123',
  site: 'https://example.com',
  page: { url: '...', path: '/', title: 'Home' },
  extracted: { /* content extraction */ },
  elements: [ /* element positions */ ],
  rubric: `
- Check if primary CTA is above the fold
- Evaluate trust signals (logos, testimonials)
- Assess mobile navigation accessibility
  `
});

// Result includes insights referencing elements
result.insights = [
  {
    id: 'ins_001',
    elementRef: 'el_001',  // Links to element in sitemap.json
    severity: 'warning',
    category: 'conversion',
    message: 'CTA may not be above the fold',
    suggestion: 'Move main CTA higher on page',
    rubricMatch: '- Check if primary CTA is above the fold'
  }
];
```

### 3. LLM Prompt Structure

The prompt (`/workers/llm.js`) includes:

1. Page metadata (URL, title, description)
2. Headings structure
3. Content stats (word count, reading time)
4. CTAs found
5. Components detected
6. **Elements list** (id, type, text) — for referencing
7. **Custom rubric** — evaluation criteria

```javascript
const prompt = buildAnalysisPrompt(pageData, {
  rubric: '- Check CTA position\n- Evaluate trust signals',
  elements: [{ id: 'el_001', type: 'cta', text: 'Get Started' }]
});
```

---

## Commands

```bash
# Start server
cd /Users/jesh/Documents/Projects/figma-sitemap-plugin
npm start
# Opens http://localhost:3000

# Test capture
# 1. Enter URL in web UI
# 2. Click "Discover Pages"
# 3. Click "Start Capture"
# 4. Check captures/ folder for output

# Run Figma plugin
# 1. Figma → Plugins → Development → Import plugin from manifest
# 2. Select manifest.json
# 3. Run: Plugins → Development → Sitemap Generator
```

---

## Remaining Phases

### Phase 3: Web UI (next)
- Add rubric textarea to capture form
- Preset buttons (UX Audit, Conversion, Accessibility)
- Competitor URL field (placeholder)

### Phase 4: Figma Plugin
- Draw numbered hotspot markers on screenshots
- Create collapsible insight panel per card
- Color-code by severity (🟢/🟡/🔴)

### Phase 5: API
- `POST /api/projects/:id/analyze` — trigger analysis
- `GET /api/projects/:id/analysis.json` — fetch results

---

## Troubleshooting

**Scanner not extracting elements:**
- Check browser console for errors
- Ensure page fully loads before extraction
- Some SPAs may need longer scroll delay

**LLM not responding:**
- Check Ollama is running: `curl http://localhost:11434/api/tags`
- Falls back to heuristic analysis if unavailable

**Figma plugin not loading images:**
- Ensure server is running on localhost:3000
- Check project exists in captures/ folder
- Try refreshing project list

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.18.2 | Web server |
| playwright | ^1.40.0 | Browser automation |
| cors | ^2.8.5 | Cross-origin requests |

LLM Providers (optional):
- Ollama (local) — Free, offline
- Claude API — High quality, requires API key
- OpenAI API — Alternative, requires API key
