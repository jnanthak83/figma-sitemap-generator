# Sitemap Analyzer - Technical Specification v2.0

## Overview

Evolution of Sitemap Generator into a **UX/Content Analysis Platform** with:
- Parallel scanning via worker pool
- AI-powered content/structure analysis
- Multi-site competitor comparison
- Annotated Figma output with insights

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
│                 │    │                 │    │                 │
│ - Screenshot    │    │ - LLM analysis  │    │ - Cross-page    │
│ - Extract HTML  │    │ - Structure     │    │ - Cross-site    │
│ - Extract text  │    │ - Content       │    │ - Recommendations│
│ - Extract meta  │    │ - UX signals    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ SCANNER WORKERS │    │ANALYZER WORKERS │    │   SYNTHESIZER   │
│ (4 parallel)    │    │ (2 parallel)    │    │   (1 worker)    │
│                 │    │                 │    │                 │
│ Playwright      │    │ Ollama (local)  │    │ Claude API or   │
│ browsers        │    │ or Claude API   │    │ Ollama          │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         RESULTS STORE                                │
│  /captures/{project_id}/                                             │
│  ├── manifest.json      # Project config, sites, status             │
│  ├── site_example.com/                                               │
│  │   ├── sitemap.json   # Pages + extracted content                 │
│  │   ├── analysis.json  # Per-page AI insights                      │
│  │   └── screenshots/   # PNG files                                  │
│  ├── site_rival1.com/                                                │
│  │   └── ...                                                         │
│  └── synthesis.json     # Cross-site comparison & recommendations   │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        FIGMA PLUGIN                                  │
│  - Annotated sitemap with insights per card                         │
│  - Color-coded status badges                                         │
│  - Competitor comparison view                                        │
│  - Expandable recommendation panels                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
figma-sitemap-plugin/
├── app.js                    # Express server (existing, to be updated)
├── code.js                   # Figma plugin (existing, to be updated)
├── ui.html                   # Figma plugin UI (existing, to be updated)
├── manifest.json             # Figma manifest
├── package.json
│
├── /workers                  # [NEW] Worker pool system
│   ├── pool.js               # Queue + worker management
│   ├── coordinator.js        # Job orchestration
│   ├── scanner.js            # Screenshot + content extraction
│   ├── analyzer.js           # LLM-powered page analysis
│   ├── synthesizer.js        # Cross-site comparison
│   └── llm.js                # LLM provider abstraction
│
├── /extractors               # [NEW] Content extraction
│   ├── content.js            # Text, headings, word count
│   ├── structure.js          # DOM structure analysis
│   ├── meta.js               # Meta tags, OG, etc.
│   └── components.js         # UI component detection
│
├── /prompts                  # [NEW] LLM prompts
│   ├── analyze-page.txt      # Single page analysis
│   ├── analyze-structure.txt # Structure analysis
│   ├── synthesize-site.txt   # Site-wide patterns
│   └── compare-sites.txt     # Competitor comparison
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
└── README.md
```

---

## Data Schemas

### manifest.json (Project Config)
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
    "scrollDelay": 150,
    "concurrency": 4,
    "llm": {
      "provider": "ollama",
      "model": "llama3.2",
      "endpoint": "http://localhost:11434"
    }
  },
  "sites": [
    {
      "url": "https://example.com",
      "role": "primary",
      "status": "complete",
      "pagesFound": 12,
      "pagesScanned": 12,
      "pagesAnalyzed": 12
    },
    {
      "url": "https://rival1.com",
      "role": "competitor",
      "status": "scanning",
      "pagesFound": 8,
      "pagesScanned": 5,
      "pagesAnalyzed": 3
    }
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

### sitemap.json (Per-Site, Enhanced)
```json
{
  "site": "example.com",
  "url": "https://example.com",
  "captured_at": "2025-01-14",
  "captured_at_time": "14:32",
  "pages": [
    {
      "id": "page_home",
      "slug": "home",
      "title": "Welcome to Example",
      "path": "/",
      "url": "https://example.com/",
      "parent": null,
      "depth": 0,
      "desktopFile": "screenshots/home_desktop.png",
      "mobileFile": "screenshots/home_mobile.png",
      "extracted": {
        "meta": {
          "title": "Example - Best Product Ever",
          "description": "We help you do amazing things.",
          "ogImage": "https://example.com/og.png",
          "canonical": "https://example.com/"
        },
        "headings": {
          "h1": ["Welcome to Example"],
          "h2": ["Features", "Pricing", "Testimonials"],
          "h3": ["Feature 1", "Feature 2", "Feature 3"]
        },
        "content": {
          "wordCount": 450,
          "paragraphs": 8,
          "readingTime": "2 min",
          "mainText": "Welcome to Example. We help you..."
        },
        "ctas": [
          { "text": "Get Started", "href": "/signup", "prominence": "primary" },
          { "text": "Learn More", "href": "/features", "prominence": "secondary" }
        ],
        "navigation": {
          "primary": ["Features", "Pricing", "About", "Contact"],
          "footer": ["Privacy", "Terms", "Blog"]
        },
        "images": [
          { "src": "/hero.jpg", "alt": "Hero image", "dimensions": "1920x1080" }
        ],
        "forms": [
          { "id": "newsletter", "fields": ["email"], "action": "/subscribe" }
        ],
        "components": {
          "hero": true,
          "testimonials": true,
          "pricing": false,
          "faq": false,
          "footer": true
        }
      }
    }
  ]
}
```

### analysis.json (Per-Site AI Insights)
```json
{
  "site": "example.com",
  "analyzed_at": "2025-01-14T14:45:00Z",
  "llm": {
    "provider": "ollama",
    "model": "llama3.2"
  },
  "pages": [
    {
      "id": "page_home",
      "path": "/",
      "scores": {
        "overall": 72,
        "content": 68,
        "structure": 80,
        "ux": 70,
        "seo": 72
      },
      "analysis": {
        "content": {
          "purpose": "awareness",
          "tone": "professional",
          "clarity": "good",
          "findings": ["Clear value proposition", "Good social proof"],
          "issues": ["H1 could be more specific", "Missing pain points"]
        },
        "structure": {
          "hierarchy": "good",
          "visualFlow": "top-to-bottom",
          "findings": ["Logical progression", "Clear hierarchy"],
          "issues": ["Too many CTAs", "Cluttered footer"]
        },
        "ux": {
          "ctaClarity": "medium",
          "cognitiveLoad": "low",
          "findings": ["Primary CTA visible", "Good whitespace"],
          "issues": ["Competing CTAs", "No sticky nav"]
        },
        "seo": {
          "titleOptimized": true,
          "metaDescription": true,
          "headingStructure": "good",
          "issues": ["Missing alt text", "No schema markup"]
        }
      },
      "recommendations": [
        {
          "priority": "high",
          "category": "content",
          "issue": "Weak primary CTA",
          "suggestion": "Change 'Get Started' to 'Start Free Trial'",
          "impact": "Likely +10-15% click-through"
        }
      ]
    }
  ],
  "siteWide": {
    "strengths": ["Consistent nav", "Good mobile", "Fast load"],
    "weaknesses": ["Inconsistent CTAs", "Missing trust signals"],
    "patterns": {
      "commonComponents": ["hero", "testimonials", "footer"],
      "missingComponents": ["faq", "comparison-table"]
    }
  }
}
```

### synthesis.json (Cross-Site Comparison)
```json
{
  "project_id": "proj_abc123",
  "synthesized_at": "2025-01-14T15:00:00Z",
  "sites": {
    "primary": "example.com",
    "competitors": ["rival1.com", "rival2.com"]
  },
  "comparison": {
    "byPageType": {
      "home": {
        "pages": [
          { "site": "example.com", "path": "/", "score": 72 },
          { "site": "rival1.com", "path": "/", "score": 85 },
          { "site": "rival2.com", "path": "/", "score": 78 }
        ],
        "insights": [
          "rival1.com uses video hero (you don't)",
          "rival2.com has more prominent trust badges"
        ],
        "opportunities": [
          "Add customer logos or trust badges",
          "Consider video or animated hero"
        ]
      }
    },
    "byFeature": {
      "trustSignals": {
        "example.com": ["testimonials"],
        "rival1.com": ["testimonials", "logos", "badges", "case-studies"],
        "rival2.com": ["testimonials", "logos", "badges"]
      }
    }
  },
  "recommendations": {
    "quickWins": [
      {
        "priority": 1,
        "effort": "low",
        "impact": "high",
        "action": "Add customer logos to homepage",
        "evidence": "Both competitors use this"
      }
    ],
    "majorImprovements": [
      {
        "priority": 3,
        "effort": "high",
        "impact": "high",
        "action": "Add pricing comparison table",
        "evidence": "rival1.com has this, scores 17 points higher"
      }
    ]
  },
  "summary": {
    "overallPosition": "middle",
    "biggestGap": "Trust signals and social proof",
    "biggestStrength": "Clean design and navigation",
    "topPriority": "Add trust signals to homepage"
  }
}
```

---

## Worker Pool Implementation

### Job Types
```javascript
const JOB_TYPES = {
  DISCOVER: 'discover',   // Find pages on a site
  SCAN: 'scan',           // Screenshot + extract content
  ANALYZE: 'analyze',     // LLM analysis of page
  SYNTHESIZE: 'synthesize' // Cross-site comparison
};
```

### Job Schema
```javascript
{
  id: 'job_abc123',
  type: 'scan',
  status: 'pending', // pending, running, complete, failed
  priority: 1,       // 1 = highest
  payload: {
    projectId: 'proj_abc123',
    site: 'example.com',
    page: { path: '/', url: 'https://example.com/' }
  },
  result: null,
  error: null,
  createdAt: '2025-01-14T10:30:00Z',
  startedAt: null,
  completedAt: null,
  retries: 0
}
```

### Worker Configuration
```javascript
const WORKER_CONFIG = {
  scan: {
    concurrency: 4,        // 4 parallel browser tabs
    timeout: 60000,        // 60s per page
    retries: 2
  },
  analyze: {
    concurrency: 2,        // 2 parallel LLM calls
    timeout: 120000,       // 120s per analysis
    retries: 1
  },
  synthesize: {
    concurrency: 1,        // 1 at a time
    timeout: 300000,       // 5 min for full synthesis
    retries: 1
  }
};
```

---

## LLM Integration

### Provider Abstraction
```javascript
// workers/llm.js
class LLMProvider {
  constructor(config) {
    this.provider = config.provider; // 'ollama' | 'claude' | 'openai'
    this.model = config.model;
    this.endpoint = config.endpoint;
  }

  async complete(prompt, options) { ... }
  async analyze(pageData) { ... }
  async synthesize(pagesData) { ... }
}
```

### Supported Providers

| Provider | Models | Use Case | Offline |
|----------|--------|----------|---------|
| Ollama | llama3.2, mistral, mixtral | Local analysis | ✅ Yes |
| Claude | claude-sonnet-4-20250514 | High-quality synthesis | ❌ No |
| OpenAI | gpt-4o | Alternative cloud | ❌ No |

### Configuration
```javascript
{
  "llm": {
    "provider": "ollama",
    "model": "llama3.2",
    "endpoint": "http://localhost:11434",
    "fallback": {
      "provider": "claude",
      "apiKey": "env:ANTHROPIC_API_KEY"
    }
  }
}
```

---

## API Endpoints

### Existing (To Be Modified)
| Method | Endpoint | Changes |
|--------|----------|---------|
| GET | `/api/projects` | Returns projects with analysis status |
| POST | `/api/discover` | Now queues DISCOVER jobs |
| POST | `/api/capture` | Now queues SCAN + ANALYZE jobs |

### New Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects` | Create project with multiple sites |
| GET | `/api/projects/:id/status` | Detailed progress |
| GET | `/api/projects/:id/analysis` | Get analysis results |
| GET | `/api/projects/:id/synthesis` | Get comparison |
| POST | `/api/projects/:id/sites` | Add competitor |
| DELETE | `/api/projects/:id/sites/:domain` | Remove site |
| GET | `/api/queue/status` | Worker pool status |
| POST | `/api/config/llm` | Configure LLM |

---

## Figma Plugin Updates

### New Card Layout
```
┌─────────────────────────────────────────┐
│ Page Title                    [72/100]  │  ← Score badge
│ /path                                   │
├─────────────────────────────────────────┤
│ ┌─────────────┐  ┌─────────────┐        │
│ │   Desktop   │  │   Mobile    │        │
│ │   [img]     │  │   [img]     │        │
│ └─────────────┘  └─────────────┘        │
├─────────────────────────────────────────┤
│ ⚠️ Weak CTA copy                        │  ← Top issues
│ 🔴 Missing trust signals                │
│ ✅ Good heading structure               │
└─────────────────────────────────────────┘
```

### Comparison View
```
┌─────────────────────────────────────────────────────────────┐
│                    HOMEPAGE COMPARISON                       │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│ │ YOUR SITE   │  │ RIVAL 1     │  │ RIVAL 2     │          │
│ │   [72]      │  │   [85]      │  │   [78]      │          │
│ │   [img]     │  │   [img]     │  │   [img]     │          │
│ └─────────────┘  └─────────────┘  └─────────────┘          │
├─────────────────────────────────────────────────────────────┤
│ KEY DIFFERENCES:                                             │
│ • rival1 uses video hero                                    │
│ • rival2 has trust badges                                   │
├─────────────────────────────────────────────────────────────┤
│ RECOMMENDATIONS:                                             │
│ 1. Add customer logos [HIGH]                                │
│ 2. Make CTA action-specific [MEDIUM]                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Worker Pool Foundation ⬜ TODO
**Goal:** Parallel scanning infrastructure

**Files to create:**
- [ ] `/workers/pool.js` - Queue + worker management
- [ ] `/workers/coordinator.js` - Job orchestration
- [ ] `/workers/scanner.js` - Screenshot worker (refactor from app.js)

**Changes to existing:**
- [ ] `app.js` - Add queue endpoints, integrate coordinator
- [ ] `package.json` - Add any new dependencies

**Key Features:**
- [ ] In-memory job queue with priorities
- [ ] Configurable concurrency (1-8 workers)
- [ ] Job status tracking (pending/running/complete/failed)
- [ ] Progress events via polling endpoint
- [ ] Graceful error handling per job
- [ ] Browser instance reuse for efficiency

**API Endpoints:**
- [ ] `POST /api/projects` - Create project with sites[]
- [ ] `GET /api/projects/:id/status` - Job progress
- [ ] `GET /api/queue/status` - Pool status

**Acceptance Criteria:**
- [ ] Can scan 3 sites concurrently
- [ ] 4x speedup on single site (4 parallel tabs)
- [ ] Progress visible in real-time via API
- [ ] One page failure doesn't stop other pages
- [ ] All screenshots saved correctly

**Estimated Time:** 2-3 hours

---

### Phase 2: Content Extraction ⬜ TODO
**Goal:** Extract structured content during scan

**Files to create:**
- [ ] `/extractors/content.js` - Text, headings, word count
- [ ] `/extractors/meta.js` - Title, description, OG tags
- [ ] `/extractors/structure.js` - DOM analysis
- [ ] `/extractors/components.js` - Detect hero, footer, forms

**Changes to existing:**
- [ ] `/workers/scanner.js` - Run extractors after screenshot

**Key Features:**
- [ ] Heading hierarchy extraction (H1-H6)
- [ ] Main content text extraction
- [ ] CTA detection and classification (primary/secondary)
- [ ] Form detection (fields, purpose)
- [ ] Component pattern detection (hero, testimonials, etc.)
- [ ] Image inventory with alt text
- [ ] Navigation structure extraction

**Data Output:**
- [ ] `extracted` field in sitemap.json (see schema)

**Acceptance Criteria:**
- [ ] All extraction runs during scan (no separate pass)
- [ ] < 2s additional time per page
- [ ] Extracted data saved in sitemap.json
- [ ] Handles edge cases (no H1, multiple forms, etc.)

**Estimated Time:** 2-3 hours

---

### Phase 3: LLM Integration ⬜ TODO
**Goal:** AI-powered page analysis

**Files to create:**
- [ ] `/workers/llm.js` - Provider abstraction
- [ ] `/workers/analyzer.js` - Analysis worker
- [ ] `/prompts/analyze-page.txt` - Page analysis prompt
- [ ] `/prompts/analyze-structure.txt` - Structure prompt

**Changes to existing:**
- [ ] `app.js` - Add LLM config endpoint
- [ ] `/workers/coordinator.js` - Queue analyze jobs after scan

**Key Features:**
- [ ] Ollama integration (local/offline)
- [ ] Claude API integration (cloud)
- [ ] OpenAI integration (optional)
- [ ] Automatic fallback (Ollama → Claude)
- [ ] Rate limiting for cloud APIs
- [ ] Prompt templating with page data injection
- [ ] Response parsing and validation

**Configuration:**
```javascript
POST /api/config/llm
{
  "provider": "ollama",
  "model": "llama3.2",
  "endpoint": "http://localhost:11434"
}
```

**Acceptance Criteria:**
- [ ] Works fully offline with Ollama
- [ ] Works with Claude API when configured
- [ ] Analysis completes in < 30s per page (local)
- [ ] Results saved in analysis.json
- [ ] Handles LLM errors gracefully

**Estimated Time:** 3-4 hours

---

### Phase 4: Site Synthesis ⬜ TODO
**Goal:** Site-wide patterns and insights

**Files to create:**
- [ ] `/workers/synthesizer.js` - Synthesis worker
- [ ] `/prompts/synthesize-site.txt` - Site patterns prompt

**Key Features:**
- [ ] Aggregate all page analyses
- [ ] Identify site-wide patterns (consistent/inconsistent)
- [ ] Find cross-page issues
- [ ] Generate site-level recommendations
- [ ] Score overall site health
- [ ] Identify missing components/pages

**Acceptance Criteria:**
- [ ] Runs automatically when all pages analyzed
- [ ] Produces siteWide section in analysis.json
- [ ] Takes < 60s for full site synthesis
- [ ] Recommendations are actionable

**Estimated Time:** 2 hours

---

### Phase 5: Multi-Site Comparison ⬜ TODO
**Goal:** Competitor analysis

**Files to create:**
- [ ] `/workers/comparator.js` - Cross-site comparison
- [ ] `/prompts/compare-sites.txt` - Comparison prompt
- [ ] `/matchers/page-type.js` - Match similar pages

**Key Features:**
- [ ] Page type matching algorithm (Home↔Home, Pricing↔Pricing)
- [ ] Feature comparison matrix
- [ ] Competitive scoring per page type
- [ ] Gap analysis (what competitors have that you don't)
- [ ] Opportunity identification
- [ ] Priority ranking of improvements

**Page Type Matching Logic:**
```javascript
// Match by URL patterns, content, and structure
const PAGE_TYPES = {
  home: ['/', '/home', '/index'],
  pricing: ['/pricing', '/plans', '/packages'],
  features: ['/features', '/product', '/solutions'],
  about: ['/about', '/company', '/team'],
  contact: ['/contact', '/get-in-touch'],
  blog: ['/blog', '/news', '/articles']
};
```

**Data Output:**
- [ ] `synthesis.json` (see schema)

**Acceptance Criteria:**
- [ ] Correctly matches 80%+ of page types
- [ ] Produces actionable comparison
- [ ] Handles 1-5 competitor sites
- [ ] Clear recommendations with evidence

**Estimated Time:** 3-4 hours

---

### Phase 6: Figma Plugin Update ⬜ TODO
**Goal:** Annotated sitemap with insights

**Changes to existing:**
- [ ] `ui.html` - Add analysis display options
- [ ] `code.js` - Render insights on cards

**Key Features:**
- [ ] Score badges on cards (color-coded: green/yellow/red)
- [ ] Issue indicators (⚠️ 🔴 ✅ icons)
- [ ] Expandable insights panel per card
- [ ] Comparison view layout for multiple sites
- [ ] Recommendation sidebar/panel
- [ ] Toggle between simple/annotated view
- [ ] Export analysis data

**Acceptance Criteria:**
- [ ] Shows analysis data on existing sitemap cards
- [ ] Can toggle between simple/annotated view
- [ ] Comparison view works for 2-4 sites
- [ ] Insights are readable and actionable

**Estimated Time:** 3-4 hours

---

### Phase 7: Analysis Report (Future) ⬜ TODO
**Goal:** Standalone PDF/Markdown report

**Files to create:**
- [ ] `/reports/generator.js` - Report generation
- [ ] `/reports/templates/executive.md`
- [ ] `/reports/templates/detailed.md`

**Key Features:**
- [ ] Executive summary
- [ ] Page-by-page breakdown
- [ ] Competitor comparison tables
- [ ] Prioritized recommendations
- [ ] Export as PDF or Markdown

**Estimated Time:** 4-5 hours

---

## Environment Variables

```bash
# Optional - for Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Optional - custom Ollama endpoint
OLLAMA_ENDPOINT=http://localhost:11434

# Optional - OpenAI
OPENAI_API_KEY=sk-...
```

---

## Testing Checklist

### Phase 1 Tests
- [ ] Create project with 1 site - works
- [ ] Create project with 3 sites - all scan concurrently
- [ ] 4 workers process scan queue
- [ ] Progress endpoint returns accurate counts
- [ ] Single page failure logged, others continue
- [ ] All screenshots saved to correct paths

### Phase 2 Tests
- [ ] Headings extracted correctly (H1-H6)
- [ ] CTAs detected with correct prominence
- [ ] Forms detected with field list
- [ ] Component detection (hero, footer, etc.)
- [ ] Extraction adds < 2s per page

### Phase 3 Tests
- [ ] Ollama connection works
- [ ] Analysis produces valid JSON
- [ ] Claude fallback works when Ollama fails
- [ ] Rate limiting prevents API errors
- [ ] Analysis saved to analysis.json

### Phase 4 Tests
- [ ] Synthesis runs after all pages complete
- [ ] Site-wide patterns identified
- [ ] Recommendations are specific

### Phase 5 Tests
- [ ] Page types matched correctly
- [ ] Comparison shows differences
- [ ] Gap analysis identifies missing features

### Phase 6 Tests
- [ ] Scores display on cards
- [ ] Color coding correct (72 = yellow, 85 = green)
- [ ] Comparison view renders 3 sites side-by-side

---

## Dependencies

### Current
```json
{
  "express": "^4.18.2",
  "playwright": "^1.40.0",
  "cors": "^2.8.5"
}
```

### To Add (Phase 3)
```json
{
  "ollama": "^0.5.0"
}
```

Note: Claude API uses native `fetch`, no SDK needed.

---

## Current Status

**Version:** 1.4.1

**Completed:**
- ✅ Basic scanning and capture
- ✅ Figma plugin with tile support
- ✅ Project management
- ✅ Connection state UI
- ✅ Docker support

**Next Up:** Phase 1 - Worker Pool Foundation

---

## How to Continue This Work

If you're picking this up in a new session:

1. **Read this SPEC.md** - Contains all architecture and schemas
2. **Check current phase** - See "Current Status" above
3. **Review existing code:**
   - `app.js` - Current server implementation
   - `code.js` + `ui.html` - Figma plugin
4. **Start with the next incomplete phase**
5. **Update this SPEC.md** as you complete items

### Key Files to Reference
- `app.js` - Has existing capture logic to refactor into scanner.js
- `CHANGELOG.md` - Version history
- `README.md` - User documentation

### Commands
```bash
cd /Users/jesh/Documents/Projects/figma-sitemap-plugin
npm start          # Run server locally
npm run docker:run # Run via Docker
```
