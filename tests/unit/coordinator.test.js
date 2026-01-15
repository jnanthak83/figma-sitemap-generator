/**
 * Tests for Coordinator (workers/coordinator.js)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { Coordinator, PROJECT_STATUS } = require('../../workers/coordinator');

describe('Coordinator', () => {
  let coordinator;
  let tempDir;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `coord-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    coordinator = new Coordinator({
      capturesDir: tempDir,
      poolConfig: {
        scan: { concurrency: 2, timeout: 5000, retries: 1 },
        analyze: { concurrency: 1, timeout: 5000, retries: 1 },
        synthesize: { concurrency: 1, timeout: 5000, retries: 1 },
        discover: { concurrency: 1, timeout: 5000, retries: 1 }
      }
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('createProject', () => {
    test('creates project with valid config', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }],
        maxDepth: 2,
        maxPagesPerSite: 10
      });

      expect(project.id).toMatch(/^proj_/);
      expect(project.status).toBe(PROJECT_STATUS.CREATED);
      expect(project.sites).toHaveLength(1);
      expect(project.sites[0].url).toBe('https://example.com');
      expect(project.sites[0].role).toBe('primary');
      expect(project.config.maxDepth).toBe(2);
    });

    test('marks first site as primary, rest as competitors', async () => {
      const project = await coordinator.createProject({
        sites: [
          { url: 'https://mysite.com' },
          { url: 'https://competitor1.com' },
          { url: 'https://competitor2.com' }
        ]
      });

      expect(project.sites[0].role).toBe('primary');
      expect(project.sites[1].role).toBe('competitor');
      expect(project.sites[2].role).toBe('competitor');
    });

    test('creates project directory', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      const projectDir = path.join(tempDir, project.id);
      expect(fs.existsSync(projectDir)).toBe(true);
    });

    test('saves manifest.json', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      const manifestPath = path.join(tempDir, project.id, 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
      
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.id).toBe(project.id);
    });

    test('uses default config values', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      expect(project.config.maxDepth).toBe(3);
      expect(project.config.maxPagesPerSite).toBe(50);
      expect(project.config.captureDesktop).toBe(true);
      expect(project.config.captureMobile).toBe(true);
    });

    test('stores project in memory', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      expect(coordinator.getProject(project.id)).toBeDefined();
    });
  });

  describe('getProject', () => {
    test('returns project by ID', async () => {
      const created = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      const project = coordinator.getProject(created.id);
      expect(project.id).toBe(created.id);
    });

    test('returns undefined for unknown ID', () => {
      expect(coordinator.getProject('unknown_id')).toBeUndefined();
    });
  });

  describe('getProjectStatus', () => {
    test('returns project with job progress', async () => {
      const created = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      const status = coordinator.getProjectStatus(created.id);
      
      expect(status.id).toBe(created.id);
      expect(status.jobProgress).toBeDefined();
      expect(status.queueStatus).toBeDefined();
    });

    test('returns null for unknown project', () => {
      expect(coordinator.getProjectStatus('unknown')).toBeNull();
    });
  });

  describe('getAllProjects', () => {
    test('returns all projects sorted by date', async () => {
      await coordinator.createProject({ sites: [{ url: 'https://first.com' }] });
      await new Promise(r => setTimeout(r, 10));
      await coordinator.createProject({ sites: [{ url: 'https://second.com' }] });

      const projects = await coordinator.getAllProjects();
      
      expect(projects).toHaveLength(2);
      // Most recent first
      expect(projects[0].sites[0].url).toBe('https://second.com');
    });

    test('loads projects from disk', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      // Create new coordinator (simulating restart)
      const newCoordinator = new Coordinator({ capturesDir: tempDir });
      const projects = await newCoordinator.getAllProjects();
      
      expect(projects.some(p => p.id === project.id)).toBe(true);
    });
  });

  describe('registerHandlers', () => {
    test('registers all handler types', () => {
      const handlers = {
        discover: jest.fn(),
        scan: jest.fn(),
        analyze: jest.fn(),
        synthesize: jest.fn()
      };

      coordinator.registerHandlers(handlers);

      expect(coordinator.pool.handlers.discover).toBe(handlers.discover);
      expect(coordinator.pool.handlers.scan).toBe(handlers.scan);
      expect(coordinator.pool.handlers.analyze).toBe(handlers.analyze);
      expect(coordinator.pool.handlers.synthesize).toBe(handlers.synthesize);
    });

    test('allows partial handler registration', () => {
      coordinator.registerHandlers({ scan: jest.fn() });
      
      expect(coordinator.pool.handlers.scan).toBeDefined();
      expect(coordinator.pool.handlers.analyze).toBeUndefined();
    });
  });

  describe('startDiscovery', () => {
    test('updates project status to discovering', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      await coordinator.startDiscovery(project.id);

      const updated = coordinator.getProject(project.id);
      expect(updated.status).toBe(PROJECT_STATUS.DISCOVERING);
    });

    test('queues discover job for each site', async () => {
      const project = await coordinator.createProject({
        sites: [
          { url: 'https://site1.com' },
          { url: 'https://site2.com' }
        ]
      });

      await coordinator.startDiscovery(project.id);

      const jobs = coordinator.pool.getProjectJobs(project.id);
      const discoverJobs = jobs.filter(j => j.type === 'discover');
      expect(discoverJobs).toHaveLength(2);
    });

    test('throws for unknown project', async () => {
      await expect(coordinator.startDiscovery('unknown'))
        .rejects.toThrow('Project not found');
    });
  });

  describe('startScanning', () => {
    test('updates project status to scanning', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      const pages = [
        { url: 'https://example.com/', path: '/', site: 'https://example.com' }
      ];

      await coordinator.startScanning(project.id, pages);

      const updated = coordinator.getProject(project.id);
      expect(updated.status).toBe(PROJECT_STATUS.SCANNING);
    });

    test('queues scan job for each page', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      const pages = [
        { url: 'https://example.com/', path: '/', site: 'https://example.com' },
        { url: 'https://example.com/about', path: '/about', site: 'https://example.com' }
      ];

      await coordinator.startScanning(project.id, pages);

      const jobs = coordinator.pool.getProjectJobs(project.id);
      const scanJobs = jobs.filter(j => j.type === 'scan');
      expect(scanJobs).toHaveLength(2);
    });

    test('creates site directories', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      const pages = [
        { url: 'https://example.com/', path: '/', site: 'https://example.com' }
      ];

      await coordinator.startScanning(project.id, pages);

      const siteDir = path.join(tempDir, project.id, 'site_example.com');
      expect(fs.existsSync(siteDir)).toBe(true);
    });
  });

  describe('getPoolStatus', () => {
    test('returns worker pool status', () => {
      const status = coordinator.getPoolStatus();
      
      expect(status.scan).toBeDefined();
      expect(status.analyze).toBeDefined();
      expect(status.synthesize).toBeDefined();
      expect(status.discover).toBeDefined();
    });
  });

  describe('startSynthesis', () => {
    test('updates project status to synthesizing', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      await coordinator.startSynthesis(project.id);

      const updated = coordinator.getProject(project.id);
      expect(updated.status).toBe(PROJECT_STATUS.SYNTHESIZING);
      expect(updated.progress.phase).toBe('synthesizing');
    });

    test('queues synthesize job', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      await coordinator.startSynthesis(project.id);

      const jobs = coordinator.pool.getProjectJobs(project.id);
      const synthJobs = jobs.filter(j => j.type === 'synthesize');
      expect(synthJobs).toHaveLength(1);
    });

    test('throws for unknown project', async () => {
      await expect(coordinator.startSynthesis('unknown'))
        .rejects.toThrow('Project not found');
    });
  });

  describe('checkPhaseCompletion', () => {
    test('handles unknown project gracefully', async () => {
      // Should not throw
      await coordinator.checkPhaseCompletion('unknown_project');
    });
  });

  describe('updateProjectStatus', () => {
    test('updates site-level progress', async () => {
      const project = await coordinator.createProject({
        sites: [{ url: 'https://example.com' }]
      });

      // Manually add a completed scan job to the pool
      coordinator.pool.addJob('scan', {
        projectId: project.id,
        site: 'https://example.com',
        page: { url: 'https://example.com/', path: '/' }
      });

      coordinator.updateProjectStatus(project.id);

      const updated = coordinator.getProject(project.id);
      expect(updated.sites[0]).toBeDefined();
    });

    test('handles unknown project gracefully', () => {
      // Should not throw
      coordinator.updateProjectStatus('unknown_project');
    });
  });

  describe('sanitizeDomain', () => {
    test('extracts hostname from URL', () => {
      expect(coordinator.sanitizeDomain('https://example.com/path')).toBe('example.com');
    });

    test('handles invalid URLs gracefully', () => {
      expect(coordinator.sanitizeDomain('not-a-url')).toBe('not-a-url');
    });

    test('removes special characters', () => {
      expect(coordinator.sanitizeDomain('https://my-site.co.uk')).toBe('my-site.co.uk');
    });
  });
});

describe('PROJECT_STATUS', () => {
  test('has all required statuses', () => {
    expect(PROJECT_STATUS.CREATED).toBe('created');
    expect(PROJECT_STATUS.DISCOVERING).toBe('discovering');
    expect(PROJECT_STATUS.SCANNING).toBe('scanning');
    expect(PROJECT_STATUS.ANALYZING).toBe('analyzing');
    expect(PROJECT_STATUS.SYNTHESIZING).toBe('synthesizing');
    expect(PROJECT_STATUS.COMPLETE).toBe('complete');
    expect(PROJECT_STATUS.FAILED).toBe('failed');
  });
});
