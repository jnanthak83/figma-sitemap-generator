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

// Ensure base directory exists
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

let captureSession = {
  project: null,
  site: null,
  pages: [],
  status: 'idle',
  progress: 0,
  error: null
};

// Serve static files from project folders
app.use('/captures', express.static(BASE_DIR));

app.get('/', (req, res) => {
  res.send(getWebUI());
});

app.get('/api/status', (req, res) => {
  res.json(captureSession);
});

// List all saved projects
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
              pageCount: sitemap.pages.length
            });
          } catch (e) {
            // Skip invalid projects
          }
        }
      }
    }
  }
  
  // Sort by date, newest first
  projects.sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));
  res.json(projects);
});

// Get sitemap for a specific project
app.get('/api/projects/:projectId/sitemap.json', (req, res) => {
  const sitemapPath = path.join(BASE_DIR, req.params.projectId, 'sitemap.json');
  if (fs.existsSync(sitemapPath)) {
    res.sendFile(sitemapPath);
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

// Serve image from a project
app.get('/api/projects/:projectId/:filename', (req, res) => {
  const filepath = path.join(BASE_DIR, req.params.projectId, req.params.filename);
  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).send('Not found');
  }
});

// Delete a project
app.delete('/api/projects/:projectId', (req, res) => {
  const projectPath = path.join(BASE_DIR, req.params.projectId);
  if (fs.existsSync(projectPath)) {
    fs.rmSync(projectPath, { recursive: true, force: true });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

// Legacy endpoint for current session
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

// Legacy endpoint for current session images
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

app.post('/api/capture', async (req, res) => {
  const { url, options = {} } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  const hostname = new URL(url).hostname;
  const timestamp = new Date().toISOString().split('T')[0];
  const projectId = `${hostname.replace(/\./g, '-')}_${timestamp}_${Date.now()}`;
  const projectDir = path.join(BASE_DIR, projectId);
  
  // Create project directory
  fs.mkdirSync(projectDir, { recursive: true });
  
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
    scrollDelay: options.scrollDelay || 150,
    ...options
  };
  
  captureSession = {
    project: projectId,
    site: hostname,
    pages: [],
    status: 'starting',
    progress: 0,
    error: null,
    config
  };
  
  res.json({ status: 'started', projectId, config });
  
  runCapture(url, config, projectId, projectDir).catch(err => {
    captureSession.status = 'error';
    captureSession.error = err.message;
    console.error('Capture error:', err);
  });
});

async function runCapture(startUrl, config, projectId, projectDir) {
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
        const filename = `${siteSlug}_${page.slug}_mobile.png`;
        const success = await captureScreenshot(browser, {
          url: pageUrl,
          viewport: { width: config.mobileWidth, height: config.mobileHeight },
          scale: scale * 2,
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
    }
    
    // Save sitemap.json to project folder
    const sitemap = {
      site: captureSession.site,
      captured_at: new Date().toISOString().split('T')[0],
      pages: pages
    };
    fs.writeFileSync(path.join(projectDir, 'sitemap.json'), JSON.stringify(sitemap, null, 2));
    
    captureSession.status = 'done';
    captureSession.progress = 100;
    
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
    .btn-small { padding: 6px 12px; font-size: 12px; }
    .progress-bar { height: 8px; background: #eee; border-radius: 4px; overflow: hidden; margin-bottom: 12px; }
    .progress-fill { height: 100%; background: #007AFF; transition: width 0.3s; }
    .status { font-size: 14px; color: #666; }
    .status.done { color: #28a745; }
    .status.error { color: #dc3545; }
    .pages-list { max-height: 200px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; }
    .page-item { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; display: flex; justify-content: space-between; }
    .page-item:last-child { border-bottom: none; }
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
        <div class="row">
          <div>
            <label>Scroll Delay (ms)</label>
            <input type="number" id="scrollDelay" value="150" min="50" max="500">
            <p class="hint">Time to wait for lazy-loaded content</p>
          </div>
        </div>
        <button id="startBtn" onclick="startCapture()" style="width: 100%;">Start Capture</button>
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
        container.innerHTML = '<div class="empty-state">No saved projects yet. Capture a website to get started.</div>';
        return;
      }
      
      container.innerHTML = projects.map(p => 
        '<div class="project-item">' +
          '<div class="project-info">' +
            '<h3>' + p.site + '</h3>' +
            '<p>' + p.pageCount + ' pages • ' + p.captured_at + '</p>' +
          '</div>' +
          '<div class="project-actions">' +
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
            maxPages: parseInt(document.getElementById('maxPages').value),
            scrollDelay: parseInt(document.getElementById('scrollDelay').value)
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
        statusEl.textContent = '✓ Done! ' + data.pages.length + ' pages saved';
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
    
    // Load projects on page load
    loadProjects();
  </script>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log('\\n🚀 Sitemap Capture Server running at http://localhost:' + PORT + '\\n');
});
