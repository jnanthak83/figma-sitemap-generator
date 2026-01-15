# Build Guide — Annotations & Rubric System

This document explains how to rebuild the annotation and custom rubric analysis system from scratch.

---

## Overview

The system captures websites, extracts UI element positions, and generates insights that can be displayed as hotspot markers in Figma.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Web UI    │ ──► │   Scanner   │ ──► │  Analyzer   │ ──► │   Figma     │
│ (rubric)    │     │ (elements)  │     │ (insights)  │     │ (hotspots)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

## Phase 1: Element Position Extraction

**File:** `/workers/scanner.js`

### What it does
During screenshot capture, extracts bounding boxes for UI elements so insights can point to specific locations.

### Key function: `extractElements(page, viewport)`

```javascript
async function extractElements(page, viewport) {
  return await page.evaluate((vp) => {
    const elements = [];
    
    // Extract headings (h1-h3)
    document.querySelectorAll('h1, h2, h3').forEach(el => {
      elements.push({
        id: getId(),
        type: 'heading',
        level: parseInt(el.tagName[1]),
        text: el.textContent.trim(),
        selector: getSelector(el),
        [vp]: getBoundingBox(el)  // 'desktop' or 'mobile'
      });
    });
    
    // Extract CTAs, forms, nav, images, trust signals...
    
    return elements;
  }, viewport);
}
```

### Element types extracted
| Type | Selector | Data |
|------|----------|------|
| `heading` | h1, h2, h3 | level, text |
| `cta` | button, a.btn, [role="button"] | text, prominence, href |
| `form` | form | fields[], action |
| `nav` | nav, [role="navigation"] | links[], location |
| `image` | img (>200px, in first 1000px) | alt, src |
| `trust` | [class*="logo"], [class*="badge"] | text |

### Element schema
```json
{
  "id": "el_001",
  "type": "cta",
  "text": "Get Started",
  "prominence": "primary",
  "selector": "button.hero-cta",
  "desktop": { "x": 540, "y": 820, "width": 180, "height": 48 },
  "mobile": { "x": 20, "y": 650, "width": 350, "height": 48 }
}
```

### Key function: `mergeElements(desktopEls, mobileEls)`

Combines desktop and mobile captures by matching `type|selector|text`:
- Desktop elements get `mobile` property added if match found
- Mobile-only elements get `el_mXXX` IDs

### Integration with scanPage()

```javascript
async function scanPage(payload, job) {
  // ... navigate and warm-up scroll ...
  
  // Desktop capture
  await page.setViewportSize(CONFIG.desktopViewport);
  desktopElements = await extractElements(page, 'desktop');
  await page.screenshot({ path: desktopPath, fullPage: true });
  
  // Mobile capture
  await page.setViewportSize(CONFIG.mobileViewport);
  mobileElements = await extractElements(page, 'mobile');
  await page.screenshot({ path: mobilePath, fullPage: true });
  
  // Merge
  results.elements = mergeElements(desktopElements, mobileElements);
  
  return results;
}
```

### Output location
Elements are saved to `sitemap.json` per page via `app.js`:
```javascript
if (job.result.elements && job.result.elements.length > 0) {
  page.elements = job.result.elements;
}
```

---

## Phase 2: Custom Rubric Analysis

**Files:** `/workers/analyzer.js`, `/workers/llm.js`

### What it does
Analyzes pages against custom evaluation criteria (rubric) and generates insights that reference specific elements.

### Rubric format
User-provided text, one criterion per line:
```
- Check if primary CTA is above the fold
- Evaluate trust signals (logos, testimonials, security badges)
- Assess mobile navigation accessibility
- Look for pricing transparency
```

### Key function: `buildAnalysisPrompt(pageData, options)`

```javascript
function buildAnalysisPrompt(pageData, options = {}) {
  const { rubric, elements } = options;
  
  // Summarize elements for LLM
  let elementsSection = '';
  if (elements && elements.length > 0) {
    const summary = elements.map(el => ({
      id: el.id,
      type: el.type,
      text: el.text?.substring(0, 50),
      prominence: el.prominence
    }));
    elementsSection = `
ELEMENTS DETECTED (reference by ID in insights):
${JSON.stringify(summary, null, 2)}
`;
  }
  
  // Add rubric instructions
  let rubricSection = '';
  if (rubric) {
    rubricSection = `
CUSTOM EVALUATION RUBRIC:
${rubric}

For each rubric item, generate an insight referencing relevant elements.
`;
  }
  
  return `Analyze this web page...
${elementsSection}${rubricSection}
Provide analysis in JSON format with insights[]...`;
}
```

### Insight schema
```json
{
  "id": "ins_001",
  "elementRef": "el_001",
  "severity": "warning",
  "category": "conversion",
  "message": "CTA uses generic text 'Get Started'",
  "suggestion": "Use action-specific text like 'Start Free Trial'",
  "rubricMatch": "- Check if primary CTA is specific"
}
```

### Severity levels
| Severity | Color | Meaning |
|----------|-------|---------|
| `good` | 🟢 | Positive finding |
| `warning` | 🟡 | Minor issue or improvement |
| `issue` | 🔴 | Problem that needs fixing |

### Basic analysis fallback

When LLM is unavailable, `createBasicAnalysis()` generates insights using heuristics:

```javascript
function createBasicAnalysis(pageData, options = {}) {
  const { elements, rubric } = options;
  const insights = [];
  
  // SEO insights
  if (meta.title && meta.title.length > 10 && meta.title.length < 60) {
    addInsight('good', 'seo', 'Page title is well-optimized', ...);
  }
  
  // Element-referenced insights
  if (elements) {
    const h1Elements = elements.filter(el => el.type === 'heading' && el.level === 1);
    if (h1Elements.length === 1) {
      addInsight('good', 'structure', 'Single H1 heading', ..., h1Elements[0].id);
    }
  }
  
  // Rubric matching (keyword-based)
  if (rubric) {
    rubric.split('\n').forEach(line => {
      if (line.includes('trust')) {
        // Generate trust-related insight
      }
    });
  }
  
  return { insights, scores, ... };
}
```

---

## Phase 3: Web UI (TODO)

**File:** `app.js` (getWebUI function)

### Planned features
- Textarea for custom rubric input
- Preset buttons: UX Audit, Conversion, Accessibility, SEO
- "Add Competitor" field (disabled initially)
- Rubric saved to project config

### Preset rubrics

**UX Audit:**
```
- Check navigation accessibility and clarity
- Evaluate visual hierarchy and content flow
- Assess mobile responsiveness
- Look for consistent interaction patterns
- Check form usability and error handling
```

**Conversion:**
```
- Check if primary CTA is above the fold
- Evaluate trust signals (logos, testimonials, badges)
- Assess pricing transparency and clarity
- Look for friction points in user journey
- Check urgency and scarcity elements
```

---

## Phase 4: Figma Plugin (TODO)

**Files:** `code.js`, `ui.html`

### Planned features
1. Fetch `analysis.json` alongside `sitemap.json`
2. Draw numbered hotspot markers at element positions
3. Create collapsible insight panel per card
4. Click hotspot → highlight insight in panel
5. Color-code by severity

### Hotspot rendering logic
```javascript
// For each insight with elementRef
const element = elements.find(el => el.id === insight.elementRef);
if (element && element.desktop) {
  const marker = figma.createEllipse();
  marker.x = element.desktop.x + element.desktop.width - 12;
  marker.y = element.desktop.y;
  marker.resize(24, 24);
  marker.fills = [{ type: 'SOLID', color: severityColors[insight.severity] }];
  // Add number text...
}
```

---

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- workers/scanner.test.js

# Run with coverage
npm test -- --coverage
```

### Test element extraction
```javascript
test('extractElements captures CTAs with positions', async () => {
  const elements = await extractElements(page, 'desktop');
  const cta = elements.find(el => el.type === 'cta');
  expect(cta).toBeDefined();
  expect(cta.desktop).toHaveProperty('x');
  expect(cta.desktop).toHaveProperty('y');
});
```

---

## Quick Start

```bash
# Install
cd figma-sitemap-plugin
npm install
npx playwright install chromium

# Run server
npm start

# Capture a site (elements will be extracted)
# 1. Go to http://localhost:3000
# 2. Enter URL and click Discover
# 3. Click Start Capture
# 4. Check captures/{project}/sitemap.json for elements[]

# Test analysis with rubric (when API endpoint is ready)
curl -X POST http://localhost:3000/api/projects/{id}/analyze \
  -H "Content-Type: application/json" \
  -d '{"rubric": "- Check CTA visibility\n- Evaluate trust signals"}'
```

---

## File Reference

| File | Purpose |
|------|---------|
| `workers/scanner.js` | Screenshot capture + element extraction |
| `workers/analyzer.js` | LLM analysis with rubric support |
| `workers/llm.js` | LLM provider abstraction + prompt templates |
| `app.js` | Express server + API endpoints |
| `code.js` | Figma plugin logic |
| `ui.html` | Figma plugin UI |
| `SPEC.md` | Full technical specification |
| `CHANGELOG.md` | Version history |
