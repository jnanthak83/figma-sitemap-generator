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
const BASE_DIR = path.join(__dirname, 'captures');

if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

let captureSession = {
  project: null,
  site: null,
  pages: [],
  status: 'idle',
  progress: 0,
  currentPage: null,
  currentViewport: null,
  error: null
};

app.use('/captures', express.static(BASE_DIR));

// Directory listing for captures
app.get('/captures/:projectId/', (req, res) => {
  const projectDir = path.join(BASE_DIR, req.params.projectId);
  if (!fs.existsSync(projectDir)) {
    return res.status(404).send('Project not found');
  }
  
  const files = fs.readdirSync(projectDir);
  const html = `<!DOCTYPE html>
<html><head><title>${req.params.projectId}</title>
<style>
  body { font-family: -apple-system, sans-serif; padding: 40px; background: #f5f5f5; }
  h1 { font-size: 20px; margin-bottom: 20px; }
  .files { background: white; border-radius: 8px; overflow: hidden; }
  a { display: block; padding: 12px 16px; border-bottom: 1px solid #eee; color: #007AFF; text-decoration: none; }
  a:hover { background: #f9f9f9; }
  a:last-child { border-bottom: none; }
  img { max-width: 200px; margin: 10px; border: 1px solid #ddd; }
  .gallery { display: flex; flex-wrap: wrap; background: white; border-radius: 8px; padding: 10px; margin-top: 20px; }
</style></head><body>
<h1>📁 ${req.params.projectId}</h1>
<div class="files">
${files.map(f => '<a href="/captures/' + req.params.projectId + '/' + f + '" target="_blank">' + f + '</a>').join('')}
</div>
<h2 style="margin-top:30px;font-size:16px;">Preview</h2>
<div class="gallery">
${files.filter(f => f.endsWith('.png')).map(f => '<a href="/captures/' + req.params.projectId + '/' + f + '" target="_blank"><img src="/captures/' + req.params.projectId + '/' + f + '"></a>').join('')}
</div>
</body></html>`;
  res.send(html);
});

app.get('/', (req, res) => {
  res.send(getWebUI());
});

app.get('/api/status', (req, res) => {
  res.json(captureSession);
});

app.get('/api/projects', (req, res) => {
  const projects = [];
  
  if (fs.existsSync(BASE_DIR)) {
    const folders = fs.readdirSync(BASE_DIR, { withFileTypes: true });
    
    for (const folder of folders) {
      if (folder.isDirectory()) {
        const sitemapPath = path.join(BASE_DIR, folder.name, 'sitemap.json');
        if (fs.existsSync(sitemapPath)) {
          try {
            const sitemap = JSON.parse(fs.readFileSync(sitemapPath, 'utf8'));
            projects.push({
              id: folder.name,
              site: sitemap.site,
              captured_at: sitemap.captured_at,
              captured_at_time: sitemap.captured_at_time || '',
              pageCount: sitemap.pages.length,
              captureSize: sitemap.captureSize || 'unknown'
            });
          } catch (e) {}
        }
      }
    }
  }
  
  projects.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
  res.json(projects);
});

app.get('/api/projects/:projectId/sitemap.json', (req, res) => {
  const sitemapPath = path.join(BASE_DIR, req.params.projectId, 'sitemap.json');
  if (fs.existsSync(sitemapPath)) {
    res.sendFile(sitemapPath);
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

app.get('/api/projects/:projectId/:filename', (req, res) => {
  const filepath = path.join(BASE_DIR, req.params.projectId, req.params.filename);
  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).send('Not found');
  }
});

app.delete('/api/projects/:projectId', (req, res) => {
  const projectPath = path.join(BASE_DIR, req.params.projectId);
  if (fs.existsSync(projectPath)) {
    fs.rmSync(projectPath, { recursive: true, force: true });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

app.get('/sitemap.json', (req, res) => {
  if (!captureSession.project) {
    return res.status(404).json({ error: 'No capture session' });
  }
  const sitemapPath = path.join(BASE_DIR, captureSession.project, 'sitemap.json');
  if (fs.existsSync(sitemapPath)) {
    res.sendFile(sitemapPath);
  } else {
    res.status(404).json({ error: 'No sitemap found' });
  }
});

app.get('/:filename', (req, res) => {
  if (!captureSession.project) {
    return res.status(404).send('No capture session');
  }
  const filepath = path.join(BASE_DIR, captureSession.project, req.params.filename);
  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).send('Not found');
  }
});

// Discover pages (crawl only, no capture)
app.post('/api/discover', async (req, res) => {
  const { url, options = {} } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  const hostname = new URL(url).hostname;
  const maxDepth = options.maxDepth || 3;
  const maxPages = options.maxPages || 50;
  
  captureSession = {
    project: null,
    site: hostname,
    baseUrl: new URL(url).origin,
    pages: [],
    status: 'crawling',
    progress: 0,
    error: null
  };
  
  try {
    const browser = await chromium.launch();
    const pages = await crawlNavigation(browser, url, new URL(url).origin, maxPages, maxDepth);
    await browser.close();
    
    captureSession.pages = pages;
    captureSession.status = 'discovered';
    
    res.json({ success: true, pages });
  } catch (err) {
    captureSession.status = 'error';
    captureSession.error = err.message;
    res.status(500).json({ error: err.message });
  }
});

// Start capture (after discovery)
app.post('/api/capture', async (req, res) => {
  const { url, options = {} } = req.body;
  
  // If pages already discovered, use those
  const useDiscovered = captureSession.status === 'discovered' && captureSession.pages.length > 0;
  
  if (!url && !useDiscovered) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  const hostname = useDiscovered ? captureSession.site : new URL(url).hostname;
  const baseUrl = useDiscovered ? captureSession.baseUrl : new URL(url).origin;
  const timestamp = new Date().toISOString().split('T')[0];
  const projectId = `${hostname.replace(/\./g, '-')}_${timestamp}_${Date.now()}`;
  const projectDir = path.join(BASE_DIR, projectId);
  
  fs.mkdirSync(projectDir, { recursive: true });
  
  const captureSize = options.captureSize || 500;
  
  const config = {
    desktop: options.desktop !== false,
    mobile: options.mobile !== false,
    captureSize: captureSize,
    scrollDelay: options.scrollDelay || 150,
    ...options
  };
  
  // Mark all pages as pending
  const pages = useDiscovered ? captureSession.pages : [];
  pages.forEach(p => { p.status = 'pending'; });
  
  captureSession = {
    ...captureSession,
    project: projectId,
    site: hostname,
    baseUrl: baseUrl,
    pages: pages,
    status: 'capturing',
    progress: 0,
    currentPage: null,
    currentViewport: null,
    error: null,
    config
  };
  
  res.json({ status: 'started', projectId, config });
  
  runCapture(baseUrl, config, projectId, projectDir).catch(err => {
    captureSession.status = 'error';
    captureSession.error = err.message;
    console.error('Capture error:', err);
  });
});

async function runCapture(baseUrl, config, projectId, projectDir) {
  const browser = await chromium.launch();
  const siteSlug = new URL(baseUrl).hostname.split('.')[0];
  
  try {
    const pages = captureSession.pages;
    const totalCaptures = pages.length * ((config.desktop ? 1 : 0) + (config.mobile ? 1 : 0));
    let completed = 0;
    
    // Capture at 4K (1920 viewport × 2x scale = 3840px output)
    const desktopViewport = 1920;
    const mobileViewport = 390;
    const deviceScale = 2;
    
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageUrl = `${baseUrl}${page.path}`;
      
      page.status = 'capturing';
      captureSession.currentPage = page.slug;
      
      // Desktop
      if (config.desktop) {
        captureSession.currentViewport = 'desktop';
        const filename = `${siteSlug}_${page.slug}_desktop.png`;
        const success = await captureScreenshot(browser, {
          url: pageUrl,
          viewport: { width: desktopViewport, height: 1080 },
          scale: deviceScale,
          isMobile: false,
          outputPath: path.join(projectDir, filename),
          scrollDelay: config.scrollDelay
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
        captureSession.currentViewport = 'mobile';
        const filename = `${siteSlug}_${page.slug}_mobile.png`;
        const success = await captureScreenshot(browser, {
          url: pageUrl,
          viewport: { width: mobileViewport, height: 844 },
          scale: deviceScale,
          isMobile: true,
          outputPath: path.join(projectDir, filename),
          scrollDelay: config.scrollDelay
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
      
      page.status = 'done';
    }
    
    // Save sitemap.json
    const now = new Date();
    const sitemap = {
      site: captureSession.site,
      captured_at: now.toISOString().split('T')[0],
      captured_at_time: now.toTimeString().slice(0, 5),
      captureSize: config.captureSize,
      pages: pages
    };
    fs.writeFileSync(path.join(projectDir, 'sitemap.json'), JSON.stringify(sitemap, null, 2));
    
    captureSession.status = 'done';
    captureSession.progress = 100;
    captureSession.currentPage = null;
    captureSession.currentViewport = null;
    
  } finally {
    await browser.close();
  }
}

async function warmUpScroll(page, scrollDelay) {
  await page.evaluate(async (delay) => {
    const scrollHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    const viewportHeight = window.innerHeight;
    const scrollStep = viewportHeight - 200;
    
    let currentPos = 0;
    while (currentPos < scrollHeight) {
      window.scrollTo(0, currentPos);
      await new Promise(r => setTimeout(r, delay));
      currentPos += scrollStep;
    }
    
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, delay));
  }, scrollDelay);
}

async function captureScreenshot(browser, { url, viewport, scale, isMobile, outputPath, scrollDelay }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    isMobile
  });
  
  const page = await context.newPage();
  
  try {
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    
    await page.waitForTimeout(500);
    await warmUpScroll(page, scrollDelay);
    await page.waitForTimeout(300);
    
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

async function crawlNavigation(browser, startUrl, baseUrl, maxPages, maxDepth) {
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
  
  pages.push({ slug: 'home', title: 'Home', path: '/', parent: null, depth: 0, status: 'pending' });
  slugMap.set('/', 'home');
  
  for (const link of links.slice(0, maxPages - 1)) {
    if (link.path === '/') continue;
    
    const pathParts = link.path.split('/').filter(Boolean);
    const slug = pathParts.join('-') || link.path.replace(/[^a-z0-9]/gi, '-');
    const depth = pathParts.length;
    
    // Filter by maxDepth
    if (depth > maxDepth) continue;
    
    let parent = 'home';
    if (depth > 1) {
      const parentPath = '/' + pathParts.slice(0, -1).join('/');
      parent = slugMap.get(parentPath) || 'home';
    }
    
    if (!slugMap.has(link.path)) {
      slugMap.set(link.path, slug);
      pages.push({ slug, title: link.title, path: link.path, parent, depth, status: 'pending' });
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
    .container { max-width: 900px; margin: 0 auto; }
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
    button { background: #007AFF; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
    button:hover { background: #0066DD; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .btn-secondary { background: #f0f0f0; color: #333; }
    .btn-secondary:hover { background: #e0e0e0; }
    .btn-danger { background: #dc3545; }
    .btn-danger:hover { background: #c82333; }
    .btn-small { padding: 6px 12px; font-size: 12px; text-decoration: none; border-radius: 6px; }
    .btn-row { display: flex; gap: 12px; }
    .btn-row button { flex: 1; }
    .progress-bar { height: 8px; background: #eee; border-radius: 4px; overflow: hidden; margin-bottom: 12px; }
    .progress-fill { height: 100%; background: #007AFF; transition: width 0.3s; }
    .status { font-size: 14px; color: #666; }
    .status.done { color: #28a745; }
    .status.error { color: #dc3545; }
    .pages-list { max-height: 400px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; }
    .page-item { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; display: flex; align-items: center; gap: 12px; }
    .page-item:last-child { border-bottom: none; }
    .page-item.capturing { background: #fff3cd; }
    .page-item.done { background: #d4edda; }
    .page-depth { background: #eee; padding: 2px 8px; border-radius: 10px; font-size: 11px; color: #666; min-width: 20px; text-align: center; }
    .page-title { flex: 1; font-weight: 500; }
    .page-path { color: #888; font-size: 12px; }
    .page-status { font-size: 11px; min-width: 80px; text-align: right; }
    .page-status.pending { color: #888; }
    .page-status.capturing { color: #856404; font-weight: 500; }
    .page-status.done { color: #28a745; }
    .figma-section { background: #f0f7ff; border: 1px solid #007AFF33; }
    code { background: #eee; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .hint { font-size: 11px; color: #888; margin-top: -12px; margin-bottom: 16px; }
    .projects-list { border: 1px solid #eee; border-radius: 6px; max-height: 300px; overflow-y: auto; }
    .project-item { padding: 12px 16px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
    .project-item:last-child { border-bottom: none; }
    .project-item:hover { background: #f9f9f9; }
    .project-info h3 { font-size: 14px; margin-bottom: 4px; }
    .project-info p { font-size: 12px; color: #888; }
    .project-actions { display: flex; gap: 8px; }
    .empty-state { padding: 40px; text-align: center; color: #888; }
    .tabs { display: flex; gap: 0; margin-bottom: 24px; }
    .tab { padding: 12px 24px; background: #f0f0f0; border: none; cursor: pointer; font-size: 14px; font-weight: 500; }
    .tab:first-child { border-radius: 8px 0 0 8px; }
    .tab:last-child { border-radius: 0 8px 8px 0; }
    .tab.active { background: #007AFF; color: white; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .summary { background: #f9f9f9; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
    .summary strong { color: #333; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📸 Sitemap Capture</h1>
    <p class="subtitle">Capture full-page screenshots for Figma sitemap generation</p>
    
    <div class="tabs">
      <button class="tab active" onclick="showTab('capture')">New Capture</button>
      <button class="tab" onclick="showTab('projects')">Saved Projects</button>
    </div>
    
    <div id="capture-tab" class="tab-content active">
      <div class="card">
        <h2>1. Enter URL & Discover Pages</h2>
        <label>Website URL</label>
        <input type="text" id="url" placeholder="https://example.com">
        <div class="row">
          <div>
            <label>Max Depth</label>
            <select id="maxDepth">
              <option value="1">1 level</option>
              <option value="2">2 levels</option>
              <option value="3" selected>3 levels</option>
              <option value="4">4 levels</option>
              <option value="5">5 levels</option>
            </select>
          </div>
          <div>
            <label>Max Pages</label>
            <input type="number" id="maxPages" value="50" min="1" max="100">
          </div>
        </div>
        <button id="discoverBtn" onclick="discoverPages()" style="width: 100%;">🔍 Discover Pages</button>
      </div>
      
      <div class="card" id="pagesCard" style="display: none;">
        <h2>2. Review Discovered Pages</h2>
        <div id="pagesSummary" class="summary"></div>
        <div class="pages-list" id="pagesList"></div>
      </div>
      
      <div class="card" id="captureCard" style="display: none;">
        <h2>3. Configure & Capture</h2>
        <div class="checkbox-row">
          <label><input type="checkbox" id="desktop" checked> Desktop (1920×2x = 3840px)</label>
          <label><input type="checkbox" id="mobile" checked> Mobile (390×2x = 780px)</label>
        </div>
        <div class="row">
          <div>
            <label>Scroll Delay (ms)</label>
            <input type="number" id="scrollDelay" value="150" min="50" max="500">
            <p class="hint">Time to wait for lazy-loaded content</p>
          </div>
        </div>
        <div class="btn-row">
          <button id="captureBtn" onclick="startCapture()">📸 Start Capture</button>
        </div>
      </div>
      
      <div class="card" id="progressCard" style="display: none;">
        <h2>Progress</h2>
        <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width: 0%"></div></div>
        <p class="status" id="statusText">Starting...</p>
      </div>
      
      <div class="card figma-section" id="figmaCard" style="display: none;">
        <h2>4. Import to Figma</h2>
        <p style="margin-bottom: 12px; font-size: 14px;">Screenshots saved! Open the Figma plugin and select this project.</p>
      </div>
    </div>
    
    <div id="projects-tab" class="tab-content">
      <div class="card">
        <h2>Saved Projects</h2>
        <div id="projectsList" class="projects-list">
          <div class="empty-state">Loading projects...</div>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    let pollInterval;
    let discoveredPages = [];
    
    function showTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.tab[onclick*="' + tab + '"]').classList.add('active');
      document.getElementById(tab + '-tab').classList.add('active');
      
      if (tab === 'projects') loadProjects();
    }
    
    async function loadProjects() {
      const res = await fetch('/api/projects');
      const projects = await res.json();
      
      const container = document.getElementById('projectsList');
      
      if (projects.length === 0) {
        container.innerHTML = '<div class="empty-state">No saved projects yet.</div>';
        return;
      }
      
      container.innerHTML = projects.map(p => 
        '<div class="project-item">' +
          '<div class="project-info">' +
            '<h3>' + p.site + '</h3>' +
            '<p>' + p.pageCount + ' pages • ' + p.captured_at + ' ' + (p.captured_at_time || '') + '</p>' +
          '</div>' +
          '<div class="project-actions">' +
            '<a class="btn-small btn-secondary" href="/captures/' + p.id + '/" target="_blank">View</a>' +
            '<button class="btn-small btn-danger" onclick="deleteProject(\\'' + p.id + '\\')">Delete</button>' +
          '</div>' +
        '</div>'
      ).join('');
    }
    
    async function deleteProject(id) {
      if (!confirm('Delete this project?')) return;
      await fetch('/api/projects/' + id, { method: 'DELETE' });
      loadProjects();
    }
    
    async function discoverPages() {
      const url = document.getElementById('url').value.trim();
      if (!url) { alert('Please enter a URL'); return; }
      
      document.getElementById('discoverBtn').disabled = true;
      document.getElementById('discoverBtn').textContent = '🔍 Discovering...';
      document.getElementById('pagesCard').style.display = 'none';
      document.getElementById('captureCard').style.display = 'none';
      
      try {
        const res = await fetch('/api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            url, 
            options: {
              maxDepth: parseInt(document.getElementById('maxDepth').value),
              maxPages: parseInt(document.getElementById('maxPages').value)
            }
          })
        });
        
        const data = await res.json();
        
        if (data.pages) {
          discoveredPages = data.pages;
          renderPagesList(discoveredPages);
          document.getElementById('pagesCard').style.display = 'block';
          document.getElementById('captureCard').style.display = 'block';
          
          // Summary by depth
          const byDepth = {};
          discoveredPages.forEach(p => {
            byDepth[p.depth] = (byDepth[p.depth] || 0) + 1;
          });
          const summary = Object.entries(byDepth)
            .sort((a, b) => a[0] - b[0])
            .map(([d, c]) => '<strong>Level ' + d + ':</strong> ' + c + ' pages')
            .join(' &nbsp;•&nbsp; ');
          document.getElementById('pagesSummary').innerHTML = 
            '<strong>Total:</strong> ' + discoveredPages.length + ' pages &nbsp;|&nbsp; ' + summary;
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
      
      document.getElementById('discoverBtn').disabled = false;
      document.getElementById('discoverBtn').textContent = '🔍 Discover Pages';
    }
    
    function renderPagesList(pages) {
      const list = document.getElementById('pagesList');
      list.innerHTML = pages.map(p => 
        '<div class="page-item ' + (p.status || 'pending') + '" data-slug="' + p.slug + '">' +
          '<span class="page-depth">' + p.depth + '</span>' +
          '<span class="page-title">' + escapeHtml(p.title) + '</span>' +
          '<span class="page-path">' + p.path + '</span>' +
          '<span class="page-status ' + (p.status || 'pending') + '">' + getStatusText(p) + '</span>' +
        '</div>'
      ).join('');
    }
    
    function getStatusText(page) {
      if (page.status === 'capturing') return '⏳ Capturing...';
      if (page.status === 'done') return '✓ Done';
      return 'Pending';
    }
    
    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    
    async function startCapture() {
      document.getElementById('captureBtn').disabled = true;
      document.getElementById('progressCard').style.display = 'block';
      document.getElementById('figmaCard').style.display = 'none';
      
      const url = document.getElementById('url').value.trim();
      
      await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url, 
          options: {
            desktop: document.getElementById('desktop').checked,
            mobile: document.getElementById('mobile').checked,
            scrollDelay: parseInt(document.getElementById('scrollDelay').value)
          }
        })
      });
      
      pollInterval = setInterval(pollStatus, 300);
    }
    
    async function pollStatus() {
      const res = await fetch('/api/status');
      const data = await res.json();
      
      document.getElementById('progressFill').style.width = data.progress + '%';
      const statusEl = document.getElementById('statusText');
      statusEl.className = 'status ' + data.status;
      
      if (data.status === 'capturing') {
        let text = 'Capturing... ' + data.progress + '%';
        if (data.currentPage) {
          text += ' — ' + data.currentPage + ' (' + data.currentViewport + ')';
        }
        statusEl.textContent = text;
      } else if (data.status === 'done') {
        statusEl.textContent = '✓ Done! ' + data.pages.length + ' pages saved';
        clearInterval(pollInterval);
        document.getElementById('captureBtn').disabled = false;
        document.getElementById('figmaCard').style.display = 'block';
      } else if (data.status === 'error') {
        statusEl.textContent = '✗ ' + data.error;
        clearInterval(pollInterval);
        document.getElementById('captureBtn').disabled = false;
      }
      
      // Update pages list with status
      if (data.pages?.length) {
        renderPagesList(data.pages);
      }
    }
    
    loadProjects();
  </script>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log('\\n🚀 Sitemap Capture Server running at http://localhost:' + PORT + '\\n');
});
