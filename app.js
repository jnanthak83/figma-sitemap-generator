/**
 * Sitemap Capture Server
 * Desktop app for capturing full-page screenshots
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const OUTPUT_DIR = path.join(__dirname, 'captures');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

let captureSession = {
  site: null,
  pages: [],
  status: 'idle',
  progress: 0,
  error: null
};

app.use('/captures', express.static(OUTPUT_DIR));

app.get('/', (req, res) => {
  res.send(getWebUI());
});

app.get('/api/status', (req, res) => {
  res.json(captureSession);
});

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

app.get('/:filename', (req, res) => {
  const filepath = path.join(OUTPUT_DIR, req.params.filename);
  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).send('Not found');
  }
});

app.post('/api/capture', async (req, res) => {
  const { url, options = {} } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  const config = {
    crawl: options.crawl !== false,
    desktop: options.desktop !== false,
    mobile: options.mobile !== false,
    desktopWidth: options.desktopWidth || 1920,
    desktopHeight: options.desktopHeight || 1080,
    mobileWidth: options.mobileWidth || 390,
    mobileHeight: options.mobileHeight || 844,
    quality: options.quality || 'high',
    maxPages: options.maxPages || 50,
    ...options
  };
  
  captureSession = {
    site: new URL(url).hostname,
    pages: [],
    status: 'starting',
    progress: 0,
    error: null,
    config
  };
  
  res.json({ status: 'started', config });
  
  runCapture(url, config).catch(err => {
    captureSession.status = 'error';
    captureSession.error = err.message;
    console.error('Capture error:', err);
  });
});

async function runCapture(startUrl, config) {
  const browser = await chromium.launch();
  const baseUrl = new URL(startUrl).origin;
  const siteSlug = new URL(startUrl).hostname.split('.')[0];
  
  try {
    captureSession.status = 'crawling';
    const pages = await crawlNavigation(browser, startUrl, baseUrl, config.maxPages);
    captureSession.pages = pages;
    
    captureSession.status = 'capturing';
    const totalCaptures = pages.length * ((config.desktop ? 1 : 0) + (config.mobile ? 1 : 0));
    let completed = 0;
    
    const scaleFactors = { low: 0.5, medium: 1, high: 1.5, full: 2 };
    const scale = scaleFactors[config.quality] || 1;
    
    for (const page of pages) {
      const pageUrl = `${baseUrl}${page.path}`;
      
      // Desktop
      if (config.desktop) {
        const filename = `${siteSlug}_${page.slug}_desktop.png`;
        const success = await captureScreenshot(browser, {
          url: pageUrl,
          viewport: { width: config.desktopWidth, height: config.desktopHeight },
          scale,
          isMobile: false,
          outputPath: path.join(OUTPUT_DIR, filename)
        });
        
        if (success) {
          page.desktopFile = filename;
          console.log(`✓ ${page.slug} desktop`);
        } else {
          console.log(`✗ ${page.slug} desktop (skipped)`);
        }
        
        completed++;
        captureSession.progress = Math.round((completed / totalCaptures) * 100);
      }
      
      // Mobile
      if (config.mobile) {
        const filename = `${siteSlug}_${page.slug}_mobile.png`;
        const success = await captureScreenshot(browser, {
          url: pageUrl,
          viewport: { width: config.mobileWidth, height: config.mobileHeight },
          scale: scale * 2,
          isMobile: true,
          outputPath: path.join(OUTPUT_DIR, filename)
        });
        
        if (success) {
          page.mobileFile = filename;
          console.log(`✓ ${page.slug} mobile`);
        } else {
          console.log(`✗ ${page.slug} mobile (skipped)`);
        }
        
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

// Capture single screenshot with timeout handling
async function captureScreenshot(browser, { url, viewport, scale, isMobile, outputPath }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    isMobile
  });
  
  const page = await context.newPage();
  
  try {
    // Use domcontentloaded instead of networkidle (faster, more reliable)
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    
    // Wait a bit for images/CSS to load
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await page.screenshot({
      path: outputPath,
      fullPage: true
    });
    
    return true;
    
  } catch (err) {
    console.error(`Error on ${url}: ${err.message}`);
    return false;
  } finally {
    await context.close();
  }
}

async function crawlNavigation(browser, startUrl, baseUrl, maxPages) {
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  
  const links = await page.evaluate((baseUrl) => {
    const navLinks = [];
    const seen = new Set();
    
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
          
          if (url.origin !== baseUrl) return;
          if (url.pathname === '' || href.startsWith('javascript:')) return;
          
          const path = url.pathname;
          if (seen.has(path)) return;
          seen.add(path);
          
          const title = a.textContent.trim() || path;
          navLinks.push({ path, title });
        } catch (e) {}
      });
    }
    
    return navLinks;
  }, baseUrl);
  
  await context.close();
  
  const pages = [];
  const slugMap = new Map();
  
  pages.push({ slug: 'home', title: 'Home', path: '/', parent: null, depth: 0 });
  slugMap.set('/', 'home');
  
  for (const link of links.slice(0, maxPages - 1)) {
    if (link.path === '/') continue;
    
    const pathParts = link.path.split('/').filter(Boolean);
    const slug = pathParts.join('-') || link.path.replace(/[^a-z0-9]/gi, '-');
    const depth = pathParts.length;
    
    let parent = 'home';
    if (depth > 1) {
      const parentPath = '/' + pathParts.slice(0, -1).join('/');
      parent = slugMap.get(parentPath) || 'home';
    }
    
    if (!slugMap.has(link.path)) {
      slugMap.set(link.path, slug);
      pages.push({ slug, title: link.title, path: link.path, parent, depth });
    }
  }
  
  return pages;
}

function getWebUI() {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Sitemap Capture</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f5f5; min-height: 100vh; padding: 40px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    .subtitle { color: #666; margin-bottom: 32px; }
    .card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .card h2 { font-size: 16px; margin-bottom: 16px; color: #333; }
    label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: #555; }
    input[type="text"], input[type="number"], select { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; margin-bottom: 16px; }
    input:focus, select:focus { outline: none; border-color: #007AFF; }
    .row { display: flex; gap: 16px; }
    .row > * { flex: 1; }
    .checkbox-row { display: flex; gap: 24px; margin-bottom: 16px; }
    .checkbox-row label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .checkbox-row input { width: 18px; height: 18px; }
    button { background: #007AFF; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; width: 100%; }
    button:hover { background: #0066DD; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .progress-bar { height: 8px; background: #eee; border-radius: 4px; overflow: hidden; margin-bottom: 12px; }
    .progress-fill { height: 100%; background: #007AFF; transition: width 0.3s; }
    .status { font-size: 14px; color: #666; }
    .status.done { color: #28a745; }
    .status.error { color: #dc3545; }
    .pages-list { max-height: 300px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; }
    .page-item { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; display: flex; justify-content: space-between; }
    .page-item:last-child { border-bottom: none; }
    .figma-section { background: #f0f7ff; border: 1px solid #007AFF33; }
    code { background: #eee; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📸 Sitemap Capture</h1>
    <p class="subtitle">Capture full-page screenshots for Figma sitemap generation</p>
    
    <div class="card">
      <h2>1. Enter URL</h2>
      <label>Website URL</label>
      <input type="text" id="url" placeholder="https://example.com">
    </div>
    
    <div class="card">
      <h2>2. Configure Options</h2>
      <div class="checkbox-row">
        <label><input type="checkbox" id="desktop" checked> Desktop</label>
        <label><input type="checkbox" id="mobile" checked> Mobile</label>
        <label><input type="checkbox" id="crawl" checked> Auto-crawl</label>
      </div>
      <div class="row">
        <div>
          <label>Quality</label>
          <select id="quality">
            <option value="low">Low (0.5x)</option>
            <option value="medium">Medium (1x)</option>
            <option value="high" selected>High (1.5x)</option>
            <option value="full">Full (2x)</option>
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
      <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width: 0%"></div></div>
      <p class="status" id="statusText">Starting...</p>
    </div>
    
    <div class="card" id="pagesCard" style="display: none;">
      <h2>Discovered Pages</h2>
      <div class="pages-list" id="pagesList"></div>
    </div>
    
    <div class="card figma-section" id="figmaCard" style="display: none;">
      <h2>4. Import to Figma</h2>
      <p style="margin-bottom: 12px; font-size: 14px;">Screenshots ready! Use this URL in the Figma plugin:</p>
      <code>http://localhost:3000</code>
    </div>
  </div>
  
  <script>
    let pollInterval;
    async function startCapture() {
      const url = document.getElementById('url').value.trim();
      if (!url) { alert('Please enter a URL'); return; }
      
      document.getElementById('startBtn').disabled = true;
      document.getElementById('progressCard').style.display = 'block';
      document.getElementById('figmaCard').style.display = 'none';
      
      await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url, 
          options: {
            desktop: document.getElementById('desktop').checked,
            mobile: document.getElementById('mobile').checked,
            crawl: document.getElementById('crawl').checked,
            quality: document.getElementById('quality').value,
            maxPages: parseInt(document.getElementById('maxPages').value)
          }
        })
      });
      
      pollInterval = setInterval(pollStatus, 500);
    }
    
    async function pollStatus() {
      const res = await fetch('/api/status');
      const data = await res.json();
      
      document.getElementById('progressFill').style.width = data.progress + '%';
      const statusEl = document.getElementById('statusText');
      statusEl.className = 'status ' + data.status;
      
      if (data.status === 'crawling') statusEl.textContent = 'Discovering pages...';
      else if (data.status === 'capturing') statusEl.textContent = 'Capturing... ' + data.progress + '%';
      else if (data.status === 'done') {
        statusEl.textContent = '✓ Done! ' + data.pages.length + ' pages';
        clearInterval(pollInterval);
        document.getElementById('startBtn').disabled = false;
        document.getElementById('figmaCard').style.display = 'block';
      } else if (data.status === 'error') {
        statusEl.textContent = '✗ ' + data.error;
        clearInterval(pollInterval);
        document.getElementById('startBtn').disabled = false;
      }
      
      if (data.pages?.length) {
        document.getElementById('pagesCard').style.display = 'block';
        document.getElementById('pagesList').innerHTML = data.pages.map(p => 
          '<div class="page-item"><span>' + p.title + '</span><span style="color:#888">' + p.path + '</span></div>'
        ).join('');
      }
    }
  </script>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log('\\n🚀 Sitemap Capture Server running at http://localhost:' + PORT + '\\n');
});
