# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2025-01-15

### Added
- **Phase 1: Element Position Extraction**
  - `extractElements()` in scanner.js captures bounding boxes during screenshot
  - Extracts: headings (h1-h3), CTAs, forms, navigation, images, trust signals
  - Each element has `{id, type, text, selector, desktop: {x,y,w,h}, mobile: {x,y,w,h}}`
  - `mergeElements()` combines desktop/mobile data into unified elements
  - Elements saved to `sitemap.json` per page

- **Phase 2: Custom Rubric Support**
  - `analyzePage()` accepts `rubric` and `elements` parameters
  - `buildAnalysisPrompt()` includes rubric criteria and element IDs in LLM prompt
  - Analysis output now includes `insights[]` array:
    - `{id, elementRef, severity, category, message, suggestion, rubricMatch}`
  - Basic rubric matching for: CTA position, trust signals, navigation, pricing
  - Fallback heuristic analysis generates element-referenced insights

### Changed
- LLM prompt restructured for insights-based output
- `createBasicAnalysis()` now generates 10-15 insights with element references
- Increased LLM token limit to 3000 for larger insight arrays

## [2.0.1] - 2025-01-14

### Added
- **Parallel Capture** - `/api/capture` now uses worker pool for 4x speedup
- **Test Suite** - 165 tests with 76% coverage
  - Unit tests for all worker modules
  - Integration tests for API endpoints
  - Jest configuration with coverage thresholds
- **Timer cleanup** in tests to prevent memory leaks

### Changed
- `runLegacyCapture()` replaced with `runParallelCapture()`
- Progress tracking via EventEmitter events
- Sitemap.json now includes timing info (mode, workers, total time)

### Fixed
- Analyzer now always includes `site` and `page` fields in results
- Synthesizer test assertions for array content matching

## [2.0.0] - 2025-01-14

### Added
- **Worker Pool Architecture** - Parallel job processing for faster scanning
  - `workers/pool.js` - Job queue with priority and concurrency control
  - `workers/coordinator.js` - Orchestrates discover → scan → analyze → synthesize
  - `workers/scanner.js` - Screenshot capture with content extraction
  - `workers/analyzer.js` - LLM-powered page analysis
  - `workers/synthesizer.js` - Site-wide and cross-site comparison
  - `workers/llm.js` - Provider abstraction (Ollama/Claude/OpenAI)

- **Content Extraction** - Automatically extracts during scan:
  - Headings (H1-H6 hierarchy)
  - Meta tags (title, description, OG)
  - CTAs with prominence detection
  - Navigation structure
  - Component detection (hero, testimonials, pricing, etc.)

- **LLM Integration** (prepared)
  - Ollama support for offline analysis
  - Claude API support for cloud analysis
  - Automatic fallback between providers

- **New API Endpoints**
  - `POST /api/projects` - Create project with multiple sites
  - `GET /api/projects/:id/status` - Detailed job progress
  - `GET /api/queue/status` - Worker pool status
  - `POST /api/config/llm` - Configure LLM provider

### Changed
- App renamed from "Sitemap Capture" to "Sitemap Analyzer"
- Web UI updated with new branding
- Projects now show v1/v2 badges

### Backward Compatible
- Legacy `/api/discover` and `/api/capture` endpoints still work
- Existing v1 projects still accessible

## [1.4.1] - 2025-01-14

### Changed
- Lighter Docker image using node:20-slim base
- Removed deprecated version from docker-compose.yml

## [1.4.0] - 2025-01-14

### Added
- Tile-by-tile image loading to prevent Figma memory crashes
- Connection state UI with server status indicator
- "Open Server UI" button when disconnected
- Quick start instructions in plugin
- Docker support with Dockerfile and docker-compose.yml

### Changed
- Always captures at max 4K resolution
- Display size options in Figma: 300/500/800/1200/1920px

## [1.3.1] - 2025-01-13

### Added
- 4K capture resolution (1920×1080 @ 2x = 3840px)
- Page discovery workflow
- Retina capture at 2x scale

## [1.3.0] - 2025-01-13

### Added
- Image tiling for large screenshots
- Project management with save/delete
- Warm-up scroll for lazy-loaded content

## [1.2.0] - 2025-01-12

### Added
- Capture size options
- Desktop/mobile viewport toggles
- Scroll delay configuration

## [1.1.0] - 2025-01-12

### Added
- Full-page screenshot capture
- Navigation crawling
- Depth-based hierarchy

## [1.0.0] - 2025-01-11

### Added
- Initial release
- Express server for screenshot capture
- Figma plugin for sitemap generation
