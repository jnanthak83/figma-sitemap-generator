/**
 * Integration Tests for API Endpoints
 */

const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Create a minimal test app
function createTestApp(tempDir) {
  const app = express();
  app.use(express.json());
  
  // Simplified routes for testing
  let captureSession = { status: 'idle', pages: [], progress: 0 };
  
  app.get('/api/status', (req, res) => {
    res.json(captureSession);
  });
  
  app.get('/api/projects', (req, res) => {
    const projects = [];
    if (fs.existsSync(tempDir)) {
      const folders = fs.readdirSync(tempDir, { withFileTypes: true });
      for (const folder of folders) {
        if (folder.isDirectory()) {
          const sitemapPath = path.join(tempDir, folder.name, 'sitemap.json');
          if (fs.existsSync(sitemapPath)) {
            const sitemap = JSON.parse(fs.readFileSync(sitemapPath, 'utf8'));
            projects.push({
              id: folder.name,
              site: sitemap.site,
              pageCount: sitemap.pages.length
            });
          }
        }
      }
    }
    res.json(projects);
  });
  
  app.get('/api/projects/:id/sitemap.json', (req, res) => {
    const sitemapPath = path.join(tempDir, req.params.id, 'sitemap.json');
    if (fs.existsSync(sitemapPath)) {
      res.sendFile(sitemapPath);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
  
  app.delete('/api/projects/:id', (req, res) => {
    const projectPath = path.join(tempDir, req.params.id);
    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
  
  app.post('/api/discover', (req, res) => {
    const { url, options = {} } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    // Mock discovery
    captureSession = {
      status: 'discovered',
      site: new URL(url).hostname,
      pages: [
        { slug: 'home', path: '/', title: 'Home', depth: 0 },
        { slug: 'about', path: '/about', title: 'About', depth: 1 }
      ]
    };
    
    res.json({ success: true, pages: captureSession.pages });
  });
  
  app.get('/api/queue/status', (req, res) => {
    res.json({
      scan: { pending: 0, running: 0, complete: 0 },
      analyze: { pending: 0, running: 0, complete: 0 },
      synthesize: { pending: 0, running: 0, complete: 0 }
    });
  });
  
  app.post('/api/config/llm', (req, res) => {
    const { provider, model } = req.body;
    res.json({ provider: provider || 'ollama', model: model || 'llama3.2' });
  });
  
  return app;
}

describe('API Endpoints', () => {
  let app;
  let tempDir;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `api-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    app = createTestApp(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('GET /api/status', () => {
    test('returns capture session status', async () => {
      const res = await request(app).get('/api/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
    });

    test('returns idle status by default', async () => {
      const res = await request(app).get('/api/status');

      expect(res.body.status).toBe('idle');
    });
  });

  describe('GET /api/projects', () => {
    test('returns empty array when no projects', async () => {
      const res = await request(app).get('/api/projects');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('returns projects with sitemaps', async () => {
      // Create a mock project
      const projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'sitemap.json'),
        JSON.stringify({ site: 'example.com', pages: [{ slug: 'home' }] })
      );

      const res = await request(app).get('/api/projects');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].site).toBe('example.com');
      expect(res.body[0].pageCount).toBe(1);
    });
  });

  describe('GET /api/projects/:id/sitemap.json', () => {
    test('returns sitemap for existing project', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      fs.mkdirSync(projectDir, { recursive: true });
      const sitemap = { site: 'example.com', pages: [] };
      fs.writeFileSync(path.join(projectDir, 'sitemap.json'), JSON.stringify(sitemap));

      const res = await request(app).get('/api/projects/test-project/sitemap.json');

      expect(res.status).toBe(200);
      expect(res.body.site).toBe('example.com');
    });

    test('returns 404 for non-existent project', async () => {
      const res = await request(app).get('/api/projects/nonexistent/sitemap.json');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });
  });

  describe('DELETE /api/projects/:id', () => {
    test('deletes existing project', async () => {
      const projectDir = path.join(tempDir, 'to-delete');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'sitemap.json'), '{}');

      const res = await request(app).delete('/api/projects/to-delete');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fs.existsSync(projectDir)).toBe(false);
    });

    test('returns 404 for non-existent project', async () => {
      const res = await request(app).delete('/api/projects/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/discover', () => {
    test('requires URL', async () => {
      const res = await request(app)
        .post('/api/discover')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('URL required');
    });

    test('returns discovered pages', async () => {
      const res = await request(app)
        .post('/api/discover')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.pages).toBeInstanceOf(Array);
      expect(res.body.pages.length).toBeGreaterThan(0);
    });

    test('accepts options', async () => {
      const res = await request(app)
        .post('/api/discover')
        .send({ 
          url: 'https://example.com',
          options: { maxDepth: 2, maxPages: 10 }
        });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/queue/status', () => {
    test('returns queue status for all job types', async () => {
      const res = await request(app).get('/api/queue/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('scan');
      expect(res.body).toHaveProperty('analyze');
      expect(res.body).toHaveProperty('synthesize');
    });

    test('returns numeric counts', async () => {
      const res = await request(app).get('/api/queue/status');

      expect(typeof res.body.scan.pending).toBe('number');
      expect(typeof res.body.scan.running).toBe('number');
      expect(typeof res.body.scan.complete).toBe('number');
    });
  });

  describe('POST /api/config/llm', () => {
    test('accepts LLM configuration', async () => {
      const res = await request(app)
        .post('/api/config/llm')
        .send({ provider: 'claude', model: 'claude-sonnet-4-20250514' });

      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('claude');
      expect(res.body.model).toBe('claude-sonnet-4-20250514');
    });

    test('returns defaults when no config provided', async () => {
      const res = await request(app)
        .post('/api/config/llm')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.provider).toBe('ollama');
    });
  });
});

describe('Content-Type handling', () => {
  let app;
  let tempDir;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `ct-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    app = createTestApp(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('accepts application/json', async () => {
    const res = await request(app)
      .post('/api/discover')
      .set('Content-Type', 'application/json')
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(200);
  });
});
