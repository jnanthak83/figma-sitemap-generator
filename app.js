/**
 * Sitemap Capture Server
 * Desktop app for capturing full-page screenshots
 * 
 * Features:
 * - Web UI for configuration
 * - Auto-crawl navigation links
 * - Full-page screenshots (desktop + mobile)
 * - Configurable quality/resolution
 * - Serves images to Figma plugin
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const app = express();
app.use(cors());
app.use(express.json());

// Config
const PORT = 3000;
const OUTPUT_DIR = path.join(__dirname, 'captures');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Store for current capture session
let captureSession = {
  site: null,
  pages: [],
  status: 'idle', // idle, crawling, capturing, done, error
  progress: 0,
  error: null
};

// Serve static files from captures directory
app.use('/captures', express.static(OUTPUT_DIR));

// Serve the web UI
app.get('/', (req, res) => {
  res.send(getWebUI());
});

// Get current session status
app.get('/api/status', (req, res) => {
  res.json(captureSession);
});

// Get sitemap.json for Figma plugin
app.get('/sitemap.json', (req, res) => {
  if (!captureSession.site) {
    return res.status(404).json({ error: 'No capture session' });
  }
  res.json({
    site: captureSession.site,
    captured_at: new Date().toISOString().split('T')[0],
    pages: captureSession.pages
  });
});

// Serve screenshots
app.get('/:filename', (req, res) => {
  const filepath = path.join(OUTPUT_DIR, req.params.filename);
  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).send('Not found');
  }
});

// Start a new capture session
app.post('/api/capture', async (req, res) => {
  const { url, options = {} } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  // Default options
  const config = {
    crawl: options.crawl !== false,
    desktop: options.desktop !== false,
    mobile: options.mobile !== false,
    desktopWidth: options.desktopWidth || 1920,
    desktopHeight: options.desktopHeight || 1080,
    mobileWidth: options.mobileWidth || 390,
    mobileHeight: options.mobileHeight || 844,
    quality: options.quality || 'high', // low, medium, high, full
    maxPages: options.maxPages || 50,
    ...options
  };
  
  // Reset session
  captureSession = {
    site: new URL(url).hostname,
    pages: [],
    status: 'starting',
    progress: 0,
    error: null,
    config
  };
  
  res.json({ status: 'started', config });
  
  // Run capture in background
  runCapture(url, config).catch(err => {
    captureSession.status = 'error';
    captureSession.error = err.message;
  });
});

// Main capture function
async function runCapture(startUrl, config) {
  const browser = await chromium.launch();
  const baseUrl = new URL(startUrl).origin;
  const siteSlug = new URL(startUrl).hostname.split('.')[0];
  
  try {
    // Step 1: Crawl to discover pages
    captureSession.status = 'crawling';
    const pages = await crawlNavigation(browser, startUrl, baseUrl, config.maxPages);
    captureSession.pages = pages;
    
    // Step 2: Capture screenshots
    captureSession.status = 'capturing';
    const totalCaptures = pages.length * (config.desktop && config.mobile ? 2 : 1);
    let completed = 0;
    
    // Quality settings
    const scaleFactors = {
      low: 0.5,
      medium: 1,
      high: 1.5,
      full: 2
    };
    const scale = scaleFactors[config.quality] || 1;
    
    for (const page of pages) {
      // Desktop
      if (config.desktop) {
        const context = await browser.newContext({
          viewport: { width: config.desktopWidth, height: config.desktopHeight },
          deviceScaleFactor: scale
        });
        const browserPage = await context.newPage();
        
        try {
          await browserPage.goto(`${baseUrl}${page.path}`, { 
            waitUntil: 'networkidle',
            timeout: 30000 
          });
          
          const filename = `${siteSlug}_${page.slug}_desktop.png`;
          await browserPage.screenshot({
            path: path.join(OUTPUT_DIR, filename),
            fullPage: true
          });
          
          page.desktopFile = filename;
        } catch (err) {
          console.error(`Error capturing ${page.slug} desktop:`, err.message);
        }
        
        await context.close();
        completed++;
        captureSession.progress = Math.round((completed / totalCaptures) * 100);
      }
      
      // Mobile
      if (config.mobile) {
        const context = await browser.newContext({
          viewport: { width: config.mobileWidth, height: config.mobileHeight },
          deviceScaleFactor: scale * 2, // Higher DPI for mobile
          isMobile: true
        });
        const browserPage = await context.newPage();
        
        try {
          await browserPage.goto(`${baseUrl}${page.path}`, { 
            waitUntil: 'networkidle',
            timeout: 30000 
          });
          
          const filename = `${siteSlug}_${page.slug}_mobile.png`;
          await browserPage.screenshot({
            path: path.join(OUTPUT_DIR, filename),
            fullPage: true
          });
          
          page.mobileFile = filename;
        } catch (err) {
          console.error(`Error capturing ${page.slug} mobile:`, err.message);
        }
        
        await context.close();
        completed++;
        captureSession.progress = Math.round((completed / totalCaptures) * 100);
      }
    }
    
    captureSession.status = 'done';
    captureSession.progress = 100;
    
  } finally {
    await browser.close();
  }
}

// Crawl navigation links to build sitemap
async function crawlNavigation(browser, startUrl, baseUrl, maxPages) {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto(startUrl, { waitUntil: 'networkidle' });
  
  // Extract navigation links
  const links = await page.evaluate((baseUrl) => {
    const navLinks = [];
    const seen = new Set();
    
    // Find nav elements
    const navSelectors = [
      'nav a[href]',
      'header a[href]',
      '[role="navigation"] a[href]',
      '.nav a[href]',
      '.menu a[href]',
      '.navigation a[href]'
    ];
    
    for (const selector of navSelectors) {
      document.querySelectorAll(selector).forEach(a => {
        try {
          const href = a.href;
          const url = new URL(href);
          
          // Only same-origin links
          if (url.origin !== baseUrl) return;
          
          // Skip anchors, javascript, etc
          if (url.pathname === '' || href.startsWith('javascript:')) return;
          
          const path = url.pathname;
          if (seen.has(path)) return;
          seen.add(path);
          
          // Get link text for title
          const title = a.textContent.trim() || path;
          
          navLinks.push({
            path,
            title,
            text: a.textContent.trim()
          });
        } catch (e) {}
      });
    }
    
    return navLinks;
  }, baseUrl);
  
  await context.close();
  
  // Build hierarchy
  const pages = [];
  const slugMap = new Map();
  
  // Always include home
  pages.push({
    slug: 'home',
    title: 'Home',
    path: '/',
    parent: null,
    depth: 0
  });
  slugMap.set('/', 'home');
  
  // Process links
  for (const link of links.slice(0, maxPages - 1)) {
    if (link.path === '/') continue;
    
    const pathParts = link.path.split('/').filter(Boolean);
    const slug = pathParts.join('-') || link.path.replace(/[^a-z0-9]/gi, '-');
    const depth = pathParts.length;
    
    // Find parent
    let parent = 'home';
    if (depth > 1) {
      const parentPath = '/' + pathParts.slice(0, -1).join('/');
      parent = slugMap.get(parentPath) || 'home';
    }
    
    if (!slugMap.has(link.path)) {
      slugMap.set(link.path, slug);
      pages.push({
        slug,
        title: link.title,
        path: link.path,
        parent,
        depth
      });
    }
  }
  
  return pages;
}

// Web UI HTML
function getWebUI() {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Sitemap Capture</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      padding: 40px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      font-size: 28px;
      margin-bottom: 8px;
    }
    .subtitle {
      color: #666;
      margin-bottom: 32px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .card h2 {
      font-size: 16px;
      margin-bottom: 16px;
      color: #333;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
      color: #555;
    }
    input[type="text"], input[type="number"], select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      margin-bottom: 16px;
    }
    input[type="text"]:focus, select:focus {
      outline: none;
      border-color: #007AFF;
    }
    .row {
      display: flex;
      gap: 16px;
    }
    .row > * {
      flex: 1;
    }
    .checkbox-row {
      display: flex;
      gap: 24px;
      margin-bottom: 16px;
    }
    .checkbox-row label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .checkbox-row input {
      width: 18px;
      height: 18px;
    }
    button {
      background: #007AFF;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
    }
    button:hover {
      background: #0066DD;
    }
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .progress-bar {
      height: 8px;
      background: #eee;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
    }
    .progress-fill {
      height: 100%;
      background: #007AFF;
      transition: width 0.3s;
    }
    .status {
      font-size: 14px;
      color: #666;
    }
    .status.done {
      color: #28a745;
    }
    .status.error {
      color: #dc3545;
    }
    .pages-list {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #eee;
      border-radius: 6px;
    }
    .page-item {
      padding: 10px 12px;
      border-bottom: 1px solid #eee;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
    }
    .page-item:last-child {
      border-bottom: none;
    }
    .page-title {
      font-weight: 500;
    }
    .page-path {
      color: #888;
      font-size: 12px;
    }
    .figma-section {
      background: #f0f7ff;
      border: 1px solid #007AFF33;
    }
    code {
      background: #eee;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📸 Sitemap Capture</h1>
    <p class="subtitle">Capture full-page screenshots for Figma sitemap generation</p>
    
    <div class="card">
      <h2>1. Enter URL</h2>
      <label>Website URL</label>
      <input type="text" id="url" placeholder="https://example.com" value="">
    </div>
    
    <div class="card">
      <h2>2. Configure Options</h2>
      
      <div class="checkbox-row">
        <label><input type="checkbox" id="desktop" checked> Desktop</label>
        <label><input type="checkbox" id="mobile" checked> Mobile</label>
        <label><input type="checkbox" id="crawl" checked> Auto-crawl navigation</label>
      </div>
      
      <div class="row">
        <div>
          <label>Quality</label>
          <select id="quality">
            <option value="low">Low (0.5x) - Fast</option>
            <option value="medium">Medium (1x)</option>
            <option value="high" selected>High (1.5x)</option>
            <option value="full">Full (2x) - Best quality</option>
          </select>
        </div>
        <div>
          <label>Max Pages</label>
          <input type="number" id="maxPages" value="50" min="1" max="100">
        </div>
      </div>
      
      <button id="startBtn" onclick="startCapture()">Start Capture</button>
    </div>
    
    <div class="card" id="progressCard" style="display: none;">
      <h2>3. Progress</h2>
      <div class="progress-bar">
        <div class="progress-fill" id="progressFill" style="width: 0%"></div>
      </div>
      <p class="status" id="statusText">Starting...</p>
    </div>
    
    <div class="card" id="pagesCard" style="display: none;">
      <h2>Discovered Pages</h2>
      <div class="pages-list" id="pagesList"></div>
    </div>
    
    <div class="card figma-section" id="figmaCard" style="display: none;">
      <h2>4. Import to Figma</h2>
      <p style="margin-bottom: 12px; font-size: 14px;">
        Screenshots ready! Open the Figma plugin and use this server URL:
      </p>
      <code id="serverUrl">http://localhost:3000</code>
      <p style="margin-top: 12px; font-size: 13px; color: #666;">
        Make sure this server is running when you click "Generate Sitemap" in Figma.
      </p>
    </div>
  </div>
  
  <script>
    let pollInterval;
    
    async function startCapture() {
      const url = document.getElementById('url').value.trim();
      if (!url) {
        alert('Please enter a URL');
        return;
      }
      
      const options = {
        desktop: document.getElementById('desktop').checked,
        mobile: document.getElementById('mobile').checked,
        crawl: document.getElementById('crawl').checked,
        quality: document.getElementById('quality').value,
        maxPages: parseInt(document.getElementById('maxPages').value)
      };
      
      document.getElementById('startBtn').disabled = true;
      document.getElementById('progressCard').style.display = 'block';
      document.getElementById('figmaCard').style.display = 'none';
      
      try {
        await fetch('/api/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, options })
        });
        
        // Poll for status
        pollInterval = setInterval(pollStatus, 500);
      } catch (err) {
        alert('Error: ' + err.message);
        document.getElementById('startBtn').disabled = false;
      }
    }
    
    async function pollStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        document.getElementById('progressFill').style.width = data.progress + '%';
        
        const statusEl = document.getElementById('statusText');
        statusEl.className = 'status ' + data.status;
        
        switch (data.status) {
          case 'crawling':
            statusEl.textContent = 'Discovering pages...';
            break;
          case 'capturing':
            statusEl.textContent = 'Capturing screenshots... ' + data.progress + '%';
            break;
          case 'done':
            statusEl.textContent = '✓ Complete! ' + data.pages.length + ' pages captured';
            clearInterval(pollInterval);
            document.getElementById('startBtn').disabled = false;
            document.getElementById('figmaCard').style.display = 'block';
            break;
          case 'error':
            statusEl.textContent = '✗ Error: ' + data.error;
            clearInterval(pollInterval);
            document.getElementById('startBtn').disabled = false;
            break;
        }
        
        // Show pages list
        if (data.pages && data.pages.length > 0) {
          document.getElementById('pagesCard').style.display = 'block';
          document.getElementById('pagesList').innerHTML = data.pages.map(p => 
            '<div class="page-item">' +
              '<span class="page-title">' + p.title + '</span>' +
              '<span class="page-path">' + p.path + '</span>' +
            '</div>'
          ).join('');
        }
        
      } catch (err) {
        console.error('Poll error:', err);
      }
    }
  </script>
</body>
</html>`;
}

// Start server
app.listen(PORT, () => {
  console.log('\\n🚀 Sitemap Capture Server running at http://localhost:' + PORT);
  console.log('\\nOpen this URL in your browser to start capturing.\\n');
  
  // Auto-open browser if --open flag
  if (process.argv.includes('--open')) {
    import('open').then(open => open.default('http://localhost:' + PORT));
  }
});
