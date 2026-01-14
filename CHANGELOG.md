# Changelog

All notable changes to this project will be documented in this file.

## [1.4.0] - 2025-01-14

### Added
- **Tile-by-tile image loading** - Sends one tile at a time to prevent Figma memory crashes
- **Project viewer** - "View" button opens captured files in browser with thumbnail gallery
- **Timestamp in project names** - Projects now show date + time for easy differentiation

### Changed
- Removed capture size option from web app - always captures at max 4K resolution
- Display size options in Figma plugin: 300 / 500 / 800 / 1200 / 1920px
- Plugin UI height increased to 480px

### Fixed
- Large image handling - properly tiles images >1000px to stay under Figma limits
- Refresh button now works correctly in Figma plugin

## [1.3.1] - 2025-01-13

### Added
- **4K capture resolution** - Desktop: 1920×1080 @ 2x = 3840px output
- **Page discovery workflow** - Separate crawl and capture phases
- **Per-page progress tracking** - Real-time status updates during capture
- **Retina capture** - All screenshots at 2x device scale for sharp text

### Changed
- Viewport changed from 1440 to 1920 for true 4K
- Format selector: PNG (sharp) or JPEG (smaller)

## [1.3.0] - 2025-01-13

### Added
- **Image tiling** - Insert Big Image-style tiling for images >4096px
- **Project management** - Desktop app saves to separate project folders
- **Warm-up scroll** - GoFullPage-style pre-capture scroll for lazy-loaded images
- **JPEG compression** - Optional compression for large thumbnails

### Changed
- Wait strategy changed from `networkidle` to `domcontentloaded` with 15s timeout
- Max height cap of 2500px for Figma imports

## [1.2.0] - 2025-01-12

### Added
- Capture size options (200-1440px)
- Desktop and mobile viewport toggles
- Scroll delay configuration

### Fixed
- Plugin regex syntax errors
- Image quality at larger sizes

## [1.1.0] - 2025-01-12

### Added
- Full-page screenshot capture with Playwright
- Navigation crawling to discover site pages
- Depth-based page hierarchy detection
- Visual sitemap layout with connectors

## [1.0.0] - 2025-01-11

### Added
- Initial release
- Express server for screenshot capture
- Figma plugin for sitemap generation
- Basic card layout with desktop/mobile screenshots
