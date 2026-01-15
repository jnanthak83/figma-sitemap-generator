# Implementation Guide

This document explains what has been built, how it works, and how to extend it.

---

## Current State (v2.0)

### What's Working

| Feature | Status | File(s) |
|---------|--------|---------|
| Parallel screenshot capture | ✅ | `app.js`, `workers/scanner.js` |
| Element position extraction | ✅ | `workers/scanner.js` |
| Custom rubric analysis | ✅ | `workers/analyzer.js`, `workers/llm.js` |
| Basic heuristic analysis (no LLM) | ✅ | `workers/analyzer.js` |
| Ollama/Claude/OpenAI integration | ✅ | `workers/llm.js` |
| Figma plugin (basic sitemap) | ✅ | `code.js`, `ui.html` |
| Project management | ✅ | `app.js` |

### What's Not Yet Working

| Feature | Status | Blocked By |
|---------|--------|------------|
| Web UI rubric input | ⬜ | Phase 3 |
| Figma hotspot annotations | ⬜ | Phase 4 |
| Analysis API endpoint | ⬜ | Phase 5 |
| Multi-site comparison | ⬜ | Future |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         WEB UI (app.js)                          │
│  localhost:3000                                                  │
│  - Enter URL, discover pages                                     │
│  - Configure capture options                                     │
│  - (TODO) Enter custom rubric                                    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WORKER POOL                                 │
│  workers/coordinator.js - Job queue management                   │
│  workers/pool.js - Concurrency control                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│    SCANNER      │   │    ANALYZER     │   │   SYNTHESIZER   │
│  scanner.js     │   │  analyzer.js    │   │  synthesizer.js │
│                 │   │                 │   │                 │
│ • Screenshot    │   │ • LLM analysis  │   │ • Site-wide     │
│ • Extract HTML  │   │ • Custom rubric │   │ • Cross-site    │
│ • Element boxes │   │ • Insights[]    │   │                 │
└────────┬────────┘   └────────┬────────┘   └─────────────────┘
         │                     │
         ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OUTPUT: captures/{projectId}/                 │
│  sitemap.json ─── pages[], elements[] per page                  │
│  analysis.json ── insights[], scores, recommendations           │
│  *.png ────────── screenshots                                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FIGMA PLUGIN                                │
│  code.js ─── Creates sitemap frames, (TODO) hotspot markers     │
│  ui.html ─── Project selector, generate button                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## File-by-File Guide

### `/workers/scanner.js`

**Purpose:** Capture screenshots and extract element positions.

**Key Functions:**

```javascript
// Main entry point - called by worker pool
async function scanPage(payload, job) {
  // payload: { projectId, site, page, options }
  // Returns: { screenshots, extracted, elements, timing }
}

// Extract bounding boxes for UI elements
async function extractElements(page, viewport) {
  // viewport: 'desktop' or 'mobile'
  // Returns: [{ id, type, text, selector, [viewport]: {x,y,width,height} }]
}

// Merge desktop + mobile element data
function mergeElements(desktopEls, mobileEls) {
  // Matches by selector+type+text
  // Returns: elements with both desktop and mobile positions
}

// Extract content (headings, CTAs, meta, etc.)
async function extractContent(page) {
  // Returns: { meta, headings, content, ctas, navigation, images, forms, components }
}
```

**Element Types Extracted:**
- `heading` - h1, h2, h3 with level
- `cta` - buttons and link buttons with prominence
- `form` - forms with field names
- `nav` - navigation with links
- `image` - significant images (>200px, above fold)
- `trust` - logos, badges, client sections

**Element Schema:**
```javascript
{
  id: "el_001",
  type: "cta",
  text: "Get Started",
  prominence: "primary",  // for CTAs
  selector: "button.hero-cta",
  desktop: { x: 540, y: 820, width: 180, height: 48 },
  mobile: { x: 20, y: 650, width: 350, height: 48 }
}
```

---

### `/workers/analyzer.js`

**Purpose:** Analyze pages using LLM or heuristics.

**Key Functions:**

```javascript
// Main entry point
async function analyzePage(payload, job) {
  // payload: { projectId, site, page, extracted, elements, rubric }
  // Returns: { scores, insights, analysis, recommendations }
}

// Fallback when LLM unavailable
function createBasicAnalysis(pageData, options) {
  // options: { elements, rubric }
  // Generates insights using heuristics
}
```

**Insight Schema:**
```javascript
{
  id: "ins_001",
  elementRef: "el_001",       // Links to element ID (or null)
  severity: "warning",        // good | warning | issue
  category: "conversion",     // content | structure | ux | seo | conversion | trust
  message: "CTA uses generic text",
  suggestion: "Use action-specific text",
  rubricMatch: "Check CTA copy"  // Which rubric item (or null)
}
```

**Rubric Matching:**
The basic analyzer parses rubric lines starting with `-` and matches keywords:
- `cta` + `above the fold` → checks element Y position
- `trust` / `logo` / `badge` → checks for trust elements
- `mobile` / `navigation` → checks nav has mobile position
- `pricing` → checks for pricing component

---

### `/workers/llm.js`

**Purpose:** Abstract LLM providers and build prompts.

**Key Functions:**

```javascript
// LLM abstraction
class LLMProvider {
  async complete(prompt, options)  // Send to configured provider
  async isAvailable()              // Check if provider is reachable
}

// Build analysis prompt with rubric + elements
function buildAnalysisPrompt(pageData, options) {
  // options: { rubric, elements }
  // Returns: formatted prompt string
}

// Parse JSON from LLM response
function parseResponse(response) {
  // Strips markdown, parses JSON
}
```

**Supported Providers:**
- `ollama` - Local, endpoint: `http://localhost:11434`
- `claude` - Anthropic API, requires `ANTHROPIC_API_KEY`
- `openai` - OpenAI API, requires `OPENAI_API_KEY`

**Configuration:**
```javascript
setLLMConfig({
  provider: 'ollama',
  model: 'llama3.2',
  endpoint: 'http://localhost:11434'
});
```

---

### `/app.js`

**Purpose:** Express server with API endpoints.

**Key Endpoints:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | Web UI |
| GET | `/api/projects` | List all projects |
| POST | `/api/discover` | Discover pages on site |
| POST | `/api/capture` | Start parallel capture |
| GET | `/api/status` | Capture progress |
| DELETE | `/api/projects/:id` | Delete project |

**Capture Flow:**
1. `POST /api/discover` - Finds all pages via navigation
2. `POST /api/capture` - Queues pages to worker pool
3. Worker pool runs 4 parallel scanners
4. Each scanner: screenshot + extract content + extract elements
5. Results saved to `captures/{projectId}/sitemap.json`

---

### `/code.js` (Figma Plugin)

**Purpose:** Generate visual sitemap in Figma.

**Current Capabilities:**
- Fetches sitemap.json from server
- Creates card per page with title, URL, screenshots
- Arranges by depth level with connectors
- Handles large images via tiling

**Message Flow:**
```
ui.html                          code.js
────────                         ───────
start          ───────────►      Create main frame
               ◄───────────      ready

start-page     ───────────►      Create card frame
               ◄───────────      page-ready

add-tile       ───────────►      Add image tile
               ◄───────────      tile-added

finish-page    ───────────►      Assemble tiles
               ◄───────────      page-done

finalize       ───────────►      Position cards, draw connectors
               ◄───────────      done
```

---

## Data Schemas

### sitemap.json

```json
{
  "site": "example.com",
  "captured_at": "2025-01-15",
  "captured_at_time": "14:30",
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
  ],
  "timing": {
    "total": "12.5s",
    "mode": "parallel",
    "workers": 4
  }
}
```

### analysis.json

```json
{
  "pages": [
    {
      "path": "/",
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
          "message": "CTA uses generic text 'Get Started'",
          "suggestion": "Use action-specific text like 'Start Free Trial'",
          "rubricMatch": "Check CTA specificity"
        }
      ],
      "recommendations": [
        {
          "priority": "high",
          "category": "conversion",
          "issue": "Weak CTA copy",
          "suggestion": "Change to action-specific text",
          "impact": "Improved click-through rate"
        }
      ]
    }
  ],
  "rubric": "- Check CTA specificity\n- Evaluate trust signals",
  "llm": {
    "provider": "ollama",
    "model": "llama3.2"
  }
}
```

---

## How to Extend

### Adding a New Element Type

1. **Scanner** - Add extraction in `extractElements()`:
```javascript
// In extractElements(), add:
document.querySelectorAll('.your-selector').forEach(el => {
  if (!isVisible(el)) return;
  elements.push({
    id: getId(),
    type: 'your-type',
    text: getText(el),
    selector: getSelector(el),
    [vp]: getBox(el)
  });
});
```

2. **Analyzer** - Add insight generation:
```javascript
// In createBasicAnalysis(), add:
const yourElements = elements.filter(el => el.type === 'your-type');
if (yourElements.length > 0) {
  addInsight('good', 'category', 'Found your elements', 'Suggestion', yourElements[0].id);
}
```

### Adding a New Rubric Criterion

In `createBasicAnalysis()`, add pattern matching:
```javascript
if (criterion.includes('your-keyword')) {
  const relevantEl = elements?.find(el => el.type === 'relevant-type');
  if (/* condition */) {
    addInsight('good', 'category', 'Criterion met', 'Keep it up', relevantEl?.id, line.trim());
  } else {
    addInsight('issue', 'category', 'Criterion not met', 'Fix suggestion', null, line.trim());
  }
}
```

### Adding a New LLM Provider

In `llm.js`, add a new method:
```javascript
async completeYourProvider(prompt, options = {}) {
  const response = await fetch('https://your-api.com/complete', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${this.apiKey}` },
    body: JSON.stringify({ prompt, ...options })
  });
  const data = await response.json();
  return data.text;
}
```

Then add to the switch in `complete()`:
```javascript
case 'your-provider':
  return await this.completeYourProvider(prompt, options);
```

---

## Testing

### Manual Testing

```bash
# Start server
cd /Users/jesh/Documents/Projects/figma-sitemap-plugin
npm start

# Test discovery
curl -X POST http://localhost:3000/api/discover \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Test capture (after discovery)
curl -X POST http://localhost:3000/api/capture \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Check status
curl http://localhost:3000/api/status

# View project
open http://localhost:3000/captures/{projectId}/
```

### Verifying Element Extraction

After capture, check `sitemap.json`:
```bash
cat captures/{projectId}/sitemap.json | jq '.pages[0].elements'
```

Should see array with elements like:
```json
[
  {"id": "el_001", "type": "heading", "level": 1, "text": "...", "desktop": {...}},
  {"id": "el_002", "type": "cta", "text": "...", "prominence": "primary", ...}
]
```

---

## Troubleshooting

### Scanner Issues

**No elements extracted:**
- Check if page uses shadow DOM (not supported)
- Check if elements are dynamically loaded after scroll
- Increase `scrollDelay` in options

**Screenshots missing content:**
- Increase scroll delay for lazy-loaded content
- Check if content requires authentication

### Analyzer Issues

**LLM not available:**
- For Ollama: `curl http://localhost:11434/api/tags`
- For Claude: Check `ANTHROPIC_API_KEY` env var
- Falls back to basic heuristic analysis

**Invalid JSON from LLM:**
- Check model supports JSON output
- Lower temperature (0.2-0.3)
- Increase maxTokens if response truncated

### Figma Plugin Issues

**Server not connected:**
- Ensure `npm start` is running
- Check port 3000 is not blocked
- Try `http://127.0.0.1:3000` instead of localhost

**Images not loading:**
- Check CORS settings in app.js
- Verify screenshot files exist in project folder

---

## Next Steps

See `SPEC.md` for implementation phases:
- Phase 3: Web UI rubric input
- Phase 4: Figma hotspot annotations
- Phase 5: Analysis API endpoint
