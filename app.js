/**
 * Sitemap Analyzer Server v2.0
 * Parallel capture + AI analysis with worker pool
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Worker pool imports
const { Coordinator } = require('./workers/coordinator');
const { scanPage, discoverPages, closeBrowser } = require('./workers/scanner');
const { analyzePage, setLLMConfig, getLLMConfig } = require('./workers/analyzer');
const { synthesize } = require('./workers/synthesizer');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const BASE_DIR = path.join(__dirname, 'captures');

if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

// Initialize coordinator
const coordinator = new Coordinator({
  capturesDir: BASE_DIR,
  poolConfig: {
    scan: { concurrency: 4, timeout: 60000, retries: 2 },
    analyze: { concurrency: 2, timeout: 120000, retries: 1 },
    synthesize: { concurrency: 1, timeout: 300000, retries: 1 },
    discover: { concurrency: 2, timeout: 30000, retries: 1 }
  }
});

// Register worker handlers
coordinator.registerHandlers({
  discover: discoverPages,
  scan: scanPage,
  analyze: analyzePage,
  synthesize: synthesize
});

// Legacy session for backward compatibility
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

// Static files
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

// Web UI
app.get('/', (req, res) => {
  res.send(getWebUI());
});

// ============================================
// NEW v2.0 API ENDPOINTS
// ============================================

// Create project with multiple sites
app.post('/api/projects', async (req, res) => {
  try {
    const { sites, config = {} } = req.body;
    
    if (!sites || !Array.isArray(sites) || sites.length === 0) {
      return res.status(400).json({ error: 'sites[] required' });
    }
    
    const sitesList = sites.map(s => typeof s === 'string' ? { url: s } : s);
    
    const project = await coordinator.createProject({
      sites: sitesList,
      ...config
    });
    
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get project status with detailed progress
app.get('/api/projects/:projectId/status', (req, res) => {
  const status = coordinator.getProjectStatus(req.params.projectId);
  if (!status) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(status);
});

// Start discovery for project
app.post('/api/projects/:projectId/discover', async (req, res) => {
  try {
    const project = await coordinator.startDiscovery(req.params.projectId);
    res.json({ status: 'started', project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get worker pool status
app.get('/api/queue/status', (req, res) => {
  res.json(coordinator.getPoolStatus());
});

// Configure LLM
app.post('/api/config/llm', (req, res) => {
  const { provider, model, endpoint, apiKey } = req.body;
  setLLMConfig({ provider, model, endpoint, apiKey });
  res.json(getLLMConfig());
});

app.get('/api/config/llm', (req, res) => {
  res.json(getLLMConfig());
});

// ============================================
// LEGACY v1.x API ENDPOINTS (backward compatible)
// ============================================

app.get('/api/status', (req, res) => {
  res.json(captureSession);
});

app.get('/api/projects', async (req, res) => {
  const projects = await coordinator.getAllProjects();
  
  // Also check old-style projects
  const legacyProjects = [];
  if (fs.existsSync(BASE_DIR)) {
    const folders = fs.readdirSync(BASE_DIR, { withFileTypes: true });
    
    for (const folder of folders) {
      if (folder.isDirectory() && !folder.name.startsWith('proj_')) {
        const sitemapPath = path.join(BASE_DIR, folder.name, 'sitemap.json');
        if (fs.existsSync(sitemapPath)) {
          try {
            const sitemap = JSON.parse(fs.readFileSync(sitemapPath, 'utf8'));
            legacyProjects.push({
              id: folder.name,
              site: sitemap.site,
              captured_at: sitemap.captured_at,
              captured_at_time: sitemap.captured_at_time || '',
              pageCount: sitemap.pages.length,
              version: 'v1'
            });
          } catch (e) {}
        }
      }
    }
  }
  
  // Merge and format
  const allProjects = [
    ...projects.map(p => ({
      id: p.id,
      site: p.sites?.[0]?.url || 'Unknown',
      captured_at: p.created_at?.split('T')[0],
      captured_at_time: p.created_at?.split('T')[1]?.slice(0, 5) || '',
      pageCount: p.sites?.reduce((sum, s) => sum + (s.pagesFound || 0), 0) || 0,
      status: p.status,
      version: 'v2'
    })),
    ...legacyProjects
  ];
  
  // Sort by date + time (most recent first)
  allProjects.sort((a, b) => {
    const dateA = new Date(`${a.captured_at}T${a.captured_at_time || '00:00'}`);
    const dateB = new Date(`${b.captured_at}T${b.captured_at_time || '00:00'}`);
    return dateB - dateA;
  });
  res.json(allProjects);
});

app.get('/api/projects/:projectId/sitemap.json', (req, res) => {
  // Check for v2 project first
  const projectDir = path.join(BASE_DIR, req.params.projectId);
  
  // Try v2 structure (with site subdirectories)
  if (fs.existsSync(projectDir)) {
    const subdirs = fs.readdirSync(projectDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith('site_'));
    
    if (subdirs.length > 0) {
      // Return first site's sitemap (primary)
      const sitemapPath = path.join(projectDir, subdirs[0].name, 'sitemap.json');
      if (fs.existsSync(sitemapPath)) {
        return res.sendFile(sitemapPath);
      }
    }
  }
  
  // Legacy v1 structure
  const sitemapPath = path.join(BASE_DIR, req.params.projectId, 'sitemap.json');
  if (fs.existsSync(sitemapPath)) {
    res.sendFile(sitemapPath);
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

// Get analysis.json for a project
app.get('/api/projects/:projectId/analysis.json', (req, res) => {
  const projectDir = path.join(BASE_DIR, req.params.projectId);

  // Try v2 structure (with site subdirectories)
  if (fs.existsSync(projectDir)) {
    const subdirs = fs.readdirSync(projectDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith('site_'));

    if (subdirs.length > 0) {
      const analysisPath = path.join(projectDir, subdirs[0].name, 'analysis.json');
      if (fs.existsSync(analysisPath)) {
        return res.sendFile(analysisPath);
      }
    }
  }

  // Legacy v1 structure
  const analysisPath = path.join(BASE_DIR, req.params.projectId, 'analysis.json');
  if (fs.existsSync(analysisPath)) {
    res.sendFile(analysisPath);
  } else {
    res.status(404).json({ error: 'Analysis not found. Run POST /api/projects/:id/analyze first.' });
  }
});

// Trigger analysis on an existing project
app.post('/api/projects/:projectId/analyze', async (req, res) => {
  const { rubric } = req.body;
  const projectDir = path.join(BASE_DIR, req.params.projectId);

  if (!fs.existsSync(projectDir)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Load sitemap.json
  const sitemapPath = path.join(projectDir, 'sitemap.json');
  if (!fs.existsSync(sitemapPath)) {
    return res.status(404).json({ error: 'No sitemap.json found in project' });
  }

  const sitemap = JSON.parse(fs.readFileSync(sitemapPath, 'utf8'));
  const pages = sitemap.pages || [];
  const site = sitemap.site;
  const effectiveRubric = rubric || sitemap.rubric || null;

  res.json({ status: 'analyzing', pages: pages.length, rubric: effectiveRubric });

  // Run analysis in background
  try {
    console.log(`\n🔍 Running analysis for ${req.params.projectId}...`);
    await runAnalysis(projectDir, pages, effectiveRubric, site);
    console.log('✓ Analysis complete\n');
  } catch (err) {
    console.error('Analysis error:', err.message);
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

// Flush all captures (clear cache)
app.delete('/api/captures', (req, res) => {
  if (!fs.existsSync(BASE_DIR)) {
    return res.json({ success: true, deleted: 0 });
  }

  const items = fs.readdirSync(BASE_DIR);
  let deleted = 0;

  for (const item of items) {
    const itemPath = path.join(BASE_DIR, item);
    fs.rmSync(itemPath, { recursive: true, force: true });
    deleted++;
  }

  res.json({ success: true, deleted });
});

// Legacy discover (single site)
app.post('/api/discover', async (req, res) => {
  const { url, options = {} } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  const hostname = new URL(url).hostname;
  
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
    const result = await discoverPages({
      site: url,
      options: {
        maxDepth: options.maxDepth || 3,
        maxPages: options.maxPages || 50
      }
    });
    
    captureSession.pages = result.pages;
    captureSession.status = 'discovered';
    
    res.json({ success: true, pages: result.pages });
  } catch (err) {
    captureSession.status = 'error';
    captureSession.error = err.message;
    res.status(500).json({ error: err.message });
  }
});

// Capture endpoint - now uses PARALLEL worker pool
app.post('/api/capture', async (req, res) => {
  const { url, options = {} } = req.body;
  
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
  
  const config = {
    desktop: options.desktop !== false,
    mobile: options.mobile !== false,
    scrollDelay: options.scrollDelay || 150,
    rubric: options.rubric || null
  };
  
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
  
  // Run PARALLEL capture using worker pool
  runParallelCapture(baseUrl, config, projectId, projectDir).catch(err => {
    captureSession.status = 'error';
    captureSession.error = err.message;
    console.error('Capture error:', err);
  });
});

// Parallel capture using worker pool (4x faster than sequential)
async function runParallelCapture(baseUrl, config, projectId, projectDir) {
  const startTime = Date.now();
  const siteSlug = new URL(baseUrl).hostname.split('.')[0];
  const pages = captureSession.pages;
  const totalPages = pages.length;
  let completedJobs = 0;
  
  console.log(`\n🚀 Parallel capture: ${totalPages} pages with ${coordinator.pool.config.scan.concurrency} workers`);
  
  // Track job results
  const jobResults = new Map();
  
  // Event handlers for progress tracking
  const onComplete = (job) => {
    if (job.payload?.projectId !== projectId || job.type !== 'scan') return;
    
    completedJobs++;
    const pagePath = job.payload.page.path;
    jobResults.set(pagePath, job.result);
    
    // Find and update page
    const page = pages.find(p => p.path === pagePath);
    if (page && job.result) {
      page.status = 'done';
      
      // Copy screenshots to project directory
      if (job.result.screenshots?.desktop) {
        const filename = `${siteSlug}_${page.slug}_desktop.png`;
        try {
          fs.copyFileSync(job.result.screenshots.desktop, path.join(projectDir, filename));
          page.desktopFile = filename;
        } catch (e) { console.error(`Copy error: ${e.message}`); }
      }
      
      if (job.result.screenshots?.mobile) {
        const filename = `${siteSlug}_${page.slug}_mobile.png`;
        try {
          fs.copyFileSync(job.result.screenshots.mobile, path.join(projectDir, filename));
          page.mobileFile = filename;
        } catch (e) { console.error(`Copy error: ${e.message}`); }
      }
      
      if (job.result.extracted) {
        page.extracted = job.result.extracted;
      }
      
      // Save element positions for annotations
      if (job.result.elements && job.result.elements.length > 0) {
        page.elements = job.result.elements;
      }
      
      console.log(`✓ [${completedJobs}/${totalPages}] ${page.slug} (${job.result.elements?.length || 0} elements)`);
    }
    
    // Update progress
    captureSession.progress = Math.round((completedJobs / totalPages) * 100);
    captureSession.currentPage = page?.slug;
  };
  
  const onFailed = (job, error) => {
    if (job.payload?.projectId !== projectId || job.type !== 'scan') return;
    
    completedJobs++;
    const page = pages.find(p => p.path === job.payload.page.path);
    if (page) {
      page.status = 'error';
      console.error(`✗ ${page.slug}: ${error.message}`);
    }
    captureSession.progress = Math.round((completedJobs / totalPages) * 100);
  };
  
  // Subscribe to events
  coordinator.pool.on('job:complete', onComplete);
  coordinator.pool.on('job:failed', onFailed);
  
  try {
    // Queue ALL pages for parallel processing
    for (const page of pages) {
      page.status = 'queued';
      coordinator.pool.addJob('scan', {
        projectId,
        site: baseUrl,
        page: {
          url: `${baseUrl}${page.path}`,
          path: page.path,
          title: page.title,
          depth: page.depth,
          parent: page.parent,
          slug: page.slug
        },
        options: {
          captureDesktop: config.desktop,
          captureMobile: config.mobile,
          scrollDelay: config.scrollDelay
        }
      }, { priority: page.depth }); // Higher depth = lower priority
    }
    
    // Wait for all scan jobs to complete
    await coordinator.pool.waitForType(projectId, 'scan');
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✨ Complete: ${totalPages} pages in ${elapsed}s (${(elapsed / totalPages).toFixed(2)}s/page)\n`);
    
  } finally {
    // Cleanup event listeners
    coordinator.pool.off('job:complete', onComplete);
    coordinator.pool.off('job:failed', onFailed);
  }
  
  // Save sitemap.json with timing info and rubric
  const now = new Date();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const sitemap = {
    site: captureSession.site,
    captured_at: now.toISOString().split('T')[0],
    captured_at_time: now.toTimeString().slice(0, 5),
    rubric: captureSession.config?.rubric || null,
    pages: pages,
    timing: {
      total: elapsed + 's',
      mode: 'parallel',
      workers: coordinator.pool.config.scan.concurrency
    }
  };
  fs.writeFileSync(path.join(projectDir, 'sitemap.json'), JSON.stringify(sitemap, null, 2));
  
  captureSession.status = 'done';
  captureSession.progress = 100;
  captureSession.currentPage = null;
  captureSession.currentViewport = null;
  
  await closeBrowser();
  
  // Auto-run analysis if rubric provided or elements extracted
  const hasRubric = captureSession.config?.rubric;
  const hasElements = pages.some(p => p.elements && p.elements.length > 0);
  
  if (hasRubric || hasElements) {
    console.log('\n🔍 Running analysis...');
    captureSession.status = 'analyzing';
    
    try {
      await runAnalysis(projectDir, pages, captureSession.config?.rubric, captureSession.site);
      console.log('✓ Analysis complete - saved to analysis.json\n');
    } catch (err) {
      console.error('Analysis error:', err.message);
    }
    
    captureSession.status = 'done';
  }
}

// Run analysis on captured pages and save analysis.json
async function runAnalysis(projectDir, pages, rubric, site) {
  const analysisResults = {
    site: site,
    analyzed_at: new Date().toISOString(),
    rubric: rubric || null,
    pages: []
  };
  
  for (const page of pages) {
    if (page.status !== 'done') continue;
    
    try {
      const result = await analyzePage({
        site: site,
        page: {
          url: page.path,
          path: page.path,
          title: page.title
        },
        extracted: page.extracted || {},
        elements: page.elements || [],
        rubric: rubric
      });
      
      analysisResults.pages.push({
        path: page.path,
        slug: page.slug,
        title: page.title,
        scores: result.scores || {},
        insights: result.insights || [],
        recommendations: result.recommendations || []
      });
      
      console.log(`  ✓ ${page.slug}: ${result.insights?.length || 0} insights`);
    } catch (err) {
      console.error(`  ✗ ${page.slug}: ${err.message}`);
      analysisResults.pages.push({
        path: page.path,
        slug: page.slug,
        title: page.title,
        error: err.message
      });
    }
  }
  
  // Save analysis.json
  fs.writeFileSync(
    path.join(projectDir, 'analysis.json'),
    JSON.stringify(analysisResults, null, 2)
  );
}

// Web UI
function getWebUI() {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Sitemap Analyzer</title>
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
    .btn-small { padding: 6px 12px; font-size: 12px; text-decoration: none; border-radius: 6px; display: inline-block; }
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
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
    .badge.v1 { background: #eee; color: #666; }
    .badge.v2 { background: #d4edda; color: #155724; }
    textarea { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; font-family: inherit; resize: vertical; margin-bottom: 12px; }
    textarea:focus { outline: none; border-color: #007AFF; }
    .preset-btns { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .preset-btn { padding: 6px 12px; font-size: 11px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 16px; cursor: pointer; }
    .preset-btn:hover { background: #e0e0e0; }
    .preset-btn.active { background: #007AFF; color: white; border-color: #007AFF; }
    .section-divider { border-top: 1px solid #eee; margin: 20px 0; padding-top: 20px; }
    .disabled-field { opacity: 0.5; pointer-events: none; }
    .coming-soon { font-size: 10px; color: #888; font-style: italic; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Sitemap Analyzer</h1>
    <p class="subtitle">Capture & analyze websites with AI-powered insights</p>
    
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
          <label><input type="checkbox" id="desktop" checked> Desktop (3840px)</label>
          <label><input type="checkbox" id="mobile" checked> Mobile (780px)</label>
        </div>
        <div class="row">
          <div>
            <label>Scroll Delay (ms)</label>
            <input type="number" id="scrollDelay" value="150" min="50" max="500">
            <p class="hint">Time to wait for lazy-loaded content</p>
          </div>
        </div>
        
        <div class="section-divider">
          <label>Analysis Rubric <span style="font-weight:normal;color:#888;">(optional)</span></label>
          <div class="preset-btns">
            <button class="preset-btn" onclick="setPreset('ux')">UX Audit</button>
            <button class="preset-btn" onclick="setPreset('conversion')">Conversion</button>
            <button class="preset-btn" onclick="setPreset('accessibility')">Accessibility</button>
            <button class="preset-btn" onclick="setPreset('seo')">SEO</button>
            <button class="preset-btn" onclick="setPreset('clear')">Clear</button>
          </div>
          <textarea id="rubric" rows="5" placeholder="Enter custom evaluation criteria, one per line. Example: Check if primary CTA is above the fold"></textarea>
          <p class="hint">AI will evaluate pages against these criteria and generate insights</p>
        </div>
        
        <div class="section-divider disabled-field">
          <label>Add Competitor <span class="coming-soon">Coming soon</span></label>
          <input type="text" id="competitor" placeholder="https://competitor.com" disabled>
          <p class="hint">Compare your site against competitors</p>
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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0;">Saved Projects</h2>
          <div style="display: flex; gap: 8px; align-items: center;">
            <select id="sortBy" onchange="loadProjects()" style="margin: 0; padding: 6px 10px; font-size: 12px;">
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="site-asc">Site A-Z</option>
              <option value="site-desc">Site Z-A</option>
              <option value="pages-desc">Most Pages</option>
              <option value="pages-asc">Least Pages</option>
            </select>
            <button class="btn-small btn-secondary" onclick="loadProjects()">↻ Refresh</button>
          </div>
        </div>
        <div id="batchActions" style="display: none; margin-bottom: 12px; padding: 12px; background: #f9f9f9; border-radius: 6px;">
          <span id="selectedCount" style="font-size: 13px; margin-right: 12px;">0 selected</span>
          <button class="btn-small btn-danger" onclick="deleteSelected()">🗑 Delete Selected</button>
          <button class="btn-small btn-secondary" onclick="selectAll()">Select All</button>
          <button class="btn-small btn-secondary" onclick="selectNone()">Select None</button>
        </div>
        <div id="projectsList" class="projects-list" style="max-height: 500px;">
          <div class="empty-state">Loading projects...</div>
        </div>
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
          <span id="totalStats" style="font-size: 12px; color: #888;"></span>
          <button class="btn-small btn-danger" onclick="flushAll()" style="opacity: 0.7;">🗑 Delete All Captures</button>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    let pollInterval;
    let discoveredPages = [];
    
    // Preset rubrics
    const PRESETS = {
      ux: '- Check navigation accessibility and clarity\\n- Evaluate visual hierarchy and content flow\\n- Assess mobile responsiveness and touch targets\\n- Look for consistent interaction patterns\\n- Check form usability and error handling\\n- Verify loading states and feedback',
      conversion: '- Check if primary CTA is above the fold\\n- Evaluate trust signals (logos, testimonials, badges)\\n- Assess pricing transparency and clarity\\n- Look for friction points in user journey\\n- Check urgency and scarcity elements\\n- Verify value proposition clarity',
      accessibility: '- Check color contrast ratios\\n- Evaluate form label associations\\n- Assess keyboard navigation support\\n- Look for alt text on images\\n- Check heading hierarchy (single H1)\\n- Verify focus states visibility',
      seo: '- Check page title optimization (50-60 chars)\\n- Evaluate meta description presence\\n- Assess heading structure (H1, H2, H3)\\n- Look for internal linking\\n- Check image alt attributes\\n- Verify URL structure clarity'
    };
    
    function setPreset(preset) {
      const textarea = document.getElementById('rubric');
      const btns = document.querySelectorAll('.preset-btn');
      btns.forEach(b => b.classList.remove('active'));
      
      if (preset === 'clear') {
        textarea.value = '';
      } else if (PRESETS[preset]) {
        textarea.value = PRESETS[preset];
        event.target.classList.add('active');
      }
    }
    
    function showTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.tab[onclick*="' + tab + '"]').classList.add('active');
      document.getElementById(tab + '-tab').classList.add('active');
      
      if (tab === 'projects') loadProjects();
    }
    
    let allProjects = [];
    let selectedProjects = new Set();

    async function loadProjects() {
      const res = await fetch('/api/projects');
      allProjects = await res.json();

      // Sort based on dropdown
      const sortBy = document.getElementById('sortBy').value;
      allProjects = sortProjects(allProjects, sortBy);

      const container = document.getElementById('projectsList');

      // Update stats
      const totalPages = allProjects.reduce((sum, p) => sum + (p.pageCount || 0), 0);
      document.getElementById('totalStats').textContent = allProjects.length + ' projects • ' + totalPages + ' total pages';

      if (allProjects.length === 0) {
        container.innerHTML = '<div class="empty-state">No saved projects yet.</div>';
        document.getElementById('batchActions').style.display = 'none';
        return;
      }

      // Show batch actions bar
      document.getElementById('batchActions').style.display = 'flex';
      updateSelectedCount();

      container.innerHTML = '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">' +
        '<thead><tr style="background: #f5f5f5; text-align: left;">' +
          '<th style="padding: 10px 8px; width: 30px;"><input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll(this)"></th>' +
          '<th style="padding: 10px 8px;">Site</th>' +
          '<th style="padding: 10px 8px; width: 80px;">Pages</th>' +
          '<th style="padding: 10px 8px; width: 140px;">Captured</th>' +
          '<th style="padding: 10px 8px; width: 120px;">Actions</th>' +
        '</tr></thead><tbody>' +
        allProjects.map(p =>
          '<tr style="border-bottom: 1px solid #eee;" data-id="' + p.id + '">' +
            '<td style="padding: 10px 8px;"><input type="checkbox" class="project-checkbox" value="' + p.id + '" onchange="updateSelectedCount()" ' + (selectedProjects.has(p.id) ? 'checked' : '') + '></td>' +
            '<td style="padding: 10px 8px;"><strong>' + p.site + '</strong> <span class="badge ' + (p.version || 'v1') + '">' + (p.version || 'v1') + '</span></td>' +
            '<td style="padding: 10px 8px;">' + (p.pageCount || 0) + '</td>' +
            '<td style="padding: 10px 8px; color: #666;">' + p.captured_at + ' ' + (p.captured_at_time || '') + '</td>' +
            '<td style="padding: 10px 8px;">' +
              '<a class="btn-small btn-secondary" href="/captures/' + p.id + '/" target="_blank" style="margin-right: 4px;">View</a>' +
              '<button class="btn-small btn-danger" onclick="deleteProject(\\'' + p.id + '\\')">Delete</button>' +
            '</td>' +
          '</tr>'
        ).join('') +
        '</tbody></table>';
    }

    function sortProjects(projects, sortBy) {
      const sorted = [...projects];
      switch (sortBy) {
        case 'date-desc':
          return sorted.sort((a, b) => new Date(b.captured_at + 'T' + (b.captured_at_time || '00:00')) - new Date(a.captured_at + 'T' + (a.captured_at_time || '00:00')));
        case 'date-asc':
          return sorted.sort((a, b) => new Date(a.captured_at + 'T' + (a.captured_at_time || '00:00')) - new Date(b.captured_at + 'T' + (b.captured_at_time || '00:00')));
        case 'site-asc':
          return sorted.sort((a, b) => a.site.localeCompare(b.site));
        case 'site-desc':
          return sorted.sort((a, b) => b.site.localeCompare(a.site));
        case 'pages-desc':
          return sorted.sort((a, b) => (b.pageCount || 0) - (a.pageCount || 0));
        case 'pages-asc':
          return sorted.sort((a, b) => (a.pageCount || 0) - (b.pageCount || 0));
        default:
          return sorted;
      }
    }

    function updateSelectedCount() {
      const checkboxes = document.querySelectorAll('.project-checkbox');
      selectedProjects.clear();
      checkboxes.forEach(cb => {
        if (cb.checked) selectedProjects.add(cb.value);
      });
      document.getElementById('selectedCount').textContent = selectedProjects.size + ' selected';
    }

    function toggleSelectAll(checkbox) {
      const checkboxes = document.querySelectorAll('.project-checkbox');
      checkboxes.forEach(cb => cb.checked = checkbox.checked);
      updateSelectedCount();
    }

    function selectAll() {
      const checkboxes = document.querySelectorAll('.project-checkbox');
      checkboxes.forEach(cb => cb.checked = true);
      document.getElementById('selectAllCheckbox').checked = true;
      updateSelectedCount();
    }

    function selectNone() {
      const checkboxes = document.querySelectorAll('.project-checkbox');
      checkboxes.forEach(cb => cb.checked = false);
      document.getElementById('selectAllCheckbox').checked = false;
      updateSelectedCount();
    }

    async function deleteSelected() {
      if (selectedProjects.size === 0) {
        alert('No projects selected');
        return;
      }
      if (!confirm('Delete ' + selectedProjects.size + ' selected project(s)?')) return;

      for (const id of selectedProjects) {
        await fetch('/api/projects/' + id, { method: 'DELETE' });
      }
      selectedProjects.clear();
      loadProjects();
    }

    async function flushAll() {
      if (!confirm('Delete ALL captures? This cannot be undone.')) return;
      await fetch('/api/captures', { method: 'DELETE' });
      selectedProjects.clear();
      loadProjects();
    }

    async function deleteProject(id) {
      if (!confirm('Delete this project?')) return;
      await fetch('/api/projects/' + id, { method: 'DELETE' });
      selectedProjects.delete(id);
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
      const rubric = document.getElementById('rubric').value.trim();
      
      await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url, 
          options: {
            desktop: document.getElementById('desktop').checked,
            mobile: document.getElementById('mobile').checked,
            scrollDelay: parseInt(document.getElementById('scrollDelay').value),
            rubric: rubric || null
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
      } else if (data.status === 'analyzing') {
        statusEl.textContent = '🔍 Analyzing pages...';
        statusEl.className = 'status';
      } else if (data.status === 'done') {
        statusEl.textContent = '✓ Done! ' + data.pages.length + ' pages captured';
        clearInterval(pollInterval);
        document.getElementById('captureBtn').disabled = false;
        document.getElementById('figmaCard').style.display = 'block';
      } else if (data.status === 'error') {
        statusEl.textContent = '✗ ' + data.error;
        clearInterval(pollInterval);
        document.getElementById('captureBtn').disabled = false;
      }
      
      if (data.pages?.length) {
        renderPagesList(data.pages);
      }
    }
    
    loadProjects();
  </script>
</body>
</html>`;
}

// Cleanup on exit
process.on('SIGINT', async () => {
  console.log('\\nShutting down...');
  await closeBrowser();
  process.exit();
});

app.listen(PORT, () => {
  console.log('\\n🚀 Sitemap Analyzer v2.0 running at http://localhost:' + PORT);
  console.log('   Worker pool: 4 scan, 2 analyze, 1 synthesize\\n');
});
