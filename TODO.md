# Sitemap Analyzer v2.0 - Development TODO

## Overview
Converting from sequential to parallel capture with AI-powered analysis.

---

## ✅ Completed

- [x] Worker pool architecture (pool.js, coordinator.js)
- [x] Scanner worker (scanner.js) 
- [x] Analyzer worker (analyzer.js)
- [x] Synthesizer worker (synthesizer.js)
- [x] LLM provider abstraction (llm.js)
- [x] Test suite - 165 tests passing (76% coverage)
- [x] Basic v2 API endpoints

### Task 1: Integrate Worker Pool with app.js ✅
**Status:** Complete  
**Commit:** v2.0.1

**Changes made:**
- [x] Replaced `runLegacyCapture()` with `runParallelCapture()`
- [x] Uses EventEmitter for progress tracking
- [x] Queues all pages at once for parallel processing
- [x] Waits via `coordinator.pool.waitForType()`
- [x] Sitemap.json includes timing info
- [x] Console shows parallel progress: `✓ [3/10] page-slug`

---

## 🚧 In Progress

### Task 2: Test Parallel Scanning Performance
**Status:** Ready to Test  
**Goal:** Verify 4x speedup with parallel workers

**Benchmarks to run:**
- [ ] 10-page site: measure total time
- [ ] Compare with sequential (disable parallel, measure)
- [ ] Document results

**How to test:**
```bash
# Start server
npm start

# Open http://localhost:3000
# Enter a URL with 10+ pages
# Click Discover → Start Capture
# Note the timing in sitemap.json
```

---

## ⬜ Not Started

### Task 3: Ollama Local LLM Setup (Optional)
**Status:** Not Started  
**Goal:** Enable AI analysis without cloud API

**Steps:**
- [ ] Install Ollama: `brew install ollama`
- [ ] Pull model: `ollama pull llama3.2`
- [ ] Start: `ollama serve`
- [ ] Configure: `POST /api/config/llm`
- [ ] Test analysis quality
- [ ] Document in README

---

### Task 4: Update Figma Plugin for Analysis
**Status:** Not Started  
**Goal:** Display analysis scores in sitemap

**UI Changes needed:**
- [ ] Add score badge to page nodes (colored circle)
- [ ] Color coding: green (>70), yellow (50-70), red (<50)
- [ ] Hover tooltip with category scores
- [ ] Analysis panel in plugin sidebar
- [ ] Show top recommendations

**Files to modify:**
- `code.js` - Add score rendering
- `ui.html` - Add analysis panel

---

## Quick Commands

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Start server
npm start

# Git commit
git add -A && git commit -m "message"

# Check worker pool status
curl http://localhost:3000/api/queue/status
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.1 | 2025-01-14 | Parallel capture, test suite |
| 2.0.0 | 2025-01-14 | Worker pool architecture |
| 1.4.1 | 2025-01-14 | Docker optimization |
| 1.4.0 | 2025-01-14 | Tile loading, Docker support |
