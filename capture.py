"""
Screenshot Capture Script
Captures full-page desktop and mobile screenshots using Playwright.

Usage:
    python capture.py <url> <output_dir>
    
Example:
    python capture.py https://example.com ./screenshots
"""

from playwright.sync_api import sync_playwright
from pathlib import Path
from urllib.parse import urlparse
import json
import sys

# Default viewports
VIEWPORTS = {
    "desktop": {"width": 1920, "height": 1080},
    "mobile": {"width": 390, "height": 844},
}

def slug_from_path(path: str) -> str:
    """Convert URL path to filename-safe slug."""
    if not path or path == "/":
        return "home"
    return path.strip("/").replace("/", "-")

def capture_pages(base_url: str, pages: list, output_dir: Path, site_slug: str):
    """Capture screenshots for all pages."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    with sync_playwright() as p:
        browser = p.chromium.launch()
        
        for viewport_name, viewport_size in VIEWPORTS.items():
            print(f"\n📱 Capturing {viewport_name} screenshots...")
            
            context = browser.new_context(
                viewport=viewport_size,
                device_scale_factor=2 if viewport_name == "mobile" else 1,
            )
            page = context.new_page()
            
            for page_info in pages:
                url = f"{base_url}{page_info['path']}"
                filename = f"{site_slug}_{page_info['slug']}_{viewport_name}.png"
                filepath = output_dir / filename
                
                print(f"  → {page_info['slug']}...", end=" ", flush=True)
                
                try:
                    page.goto(url, wait_until="networkidle", timeout=30000)
                    page.screenshot(path=str(filepath), full_page=True)
                    print("✓")
                except Exception as e:
                    print(f"✗ {e}")
            
            context.close()
        
        browser.close()

def main():
    if len(sys.argv) < 3:
        print("Usage: python capture.py <url> <output_dir>")
        print("Example: python capture.py https://example.com ./screenshots")
        sys.exit(1)
    
    base_url = sys.argv[1].rstrip("/")
    output_dir = Path(sys.argv[2])
    
    # Parse site slug from URL
    parsed = urlparse(base_url)
    site_slug = parsed.netloc.split(".")[0]
    
    # Load sitemap.json if exists, otherwise capture just homepage
    sitemap_path = output_dir / "sitemap.json"
    if sitemap_path.exists():
        with open(sitemap_path) as f:
            sitemap = json.load(f)
            pages = sitemap["pages"]
    else:
        pages = [{"slug": "home", "title": "Home", "path": "/", "parent": None, "depth": 0}]
    
    capture_pages(base_url, pages, output_dir, site_slug)
    print(f"\n✅ Done! Screenshots saved to {output_dir}")

if __name__ == "__main__":
    main()
