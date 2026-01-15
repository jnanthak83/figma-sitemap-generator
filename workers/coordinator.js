/**
 * Coordinator - Orchestrates scanning, analysis, and synthesis jobs
 * /workers/coordinator.js
 */

const { WorkerPool, JOB_TYPES, generateId } = require('./pool');
const path = require('path');
const fs = require('fs').promises;

/**
 * Project status constants
 */
const PROJECT_STATUS = {
  CREATED: 'created',
  DISCOVERING: 'discovering',
  SCANNING: 'scanning',
  ANALYZING: 'analyzing',
  SYNTHESIZING: 'synthesizing',
  COMPLETE: 'complete',
  FAILED: 'failed'
};

/**
 * Coordinator - Manages projects and job flow
 */
class Coordinator {
  constructor(options = {}) {
    this.capturesDir = options.capturesDir || './captures';
    this.pool = new WorkerPool(options.poolConfig);
    this.projects = new Map();
    
    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Set up pool event handlers for job flow
   */
  setupEventHandlers() {
    // When a scan job completes, queue an analyze job
    this.pool.on('job:complete', (job) => {
      if (job.type === JOB_TYPES.SCAN && job.result) {
        // Queue analysis for this page
        this.pool.addJob(JOB_TYPES.ANALYZE, {
          projectId: job.payload.projectId,
          site: job.payload.site,
          page: job.payload.page,
          extracted: job.result.extracted
        }, { priority: 3 });
        
        this.updateProjectStatus(job.payload.projectId);
      }
      
      // Check if all jobs of a type are done
      this.checkPhaseCompletion(job.payload.projectId);
    });

    this.pool.on('job:failed', (job, error) => {
      console.error(`Job ${job.id} failed:`, error.message);
      this.checkPhaseCompletion(job.payload.projectId);
    });
  }

  /**
   * Register worker handlers
   */
  registerHandlers(handlers) {
    if (handlers.discover) {
      this.pool.registerHandler(JOB_TYPES.DISCOVER, handlers.discover);
    }
    if (handlers.scan) {
      this.pool.registerHandler(JOB_TYPES.SCAN, handlers.scan);
    }
    if (handlers.analyze) {
      this.pool.registerHandler(JOB_TYPES.ANALYZE, handlers.analyze);
    }
    if (handlers.synthesize) {
      this.pool.registerHandler(JOB_TYPES.SYNTHESIZE, handlers.synthesize);
    }
  }

  /**
   * Create a new project
   */
  async createProject(config) {
    const projectId = generateId('proj');
    const timestamp = new Date().toISOString();
    
    const project = {
      id: projectId,
      created_at: timestamp,
      status: PROJECT_STATUS.CREATED,
      config: {
        maxDepth: config.maxDepth || 3,
        maxPagesPerSite: config.maxPagesPerSite || 50,
        captureDesktop: config.captureDesktop !== false,
        captureMobile: config.captureMobile !== false,
        scrollDelay: config.scrollDelay || 150,
        concurrency: config.concurrency || 4,
        llm: config.llm || { provider: 'ollama', model: 'llama3.2' }
      },
      sites: config.sites.map((site, index) => ({
        url: site.url,
        role: index === 0 ? 'primary' : 'competitor',
        status: 'pending',
        pagesFound: 0,
        pagesScanned: 0,
        pagesAnalyzed: 0
      })),
      progress: {
        phase: 'created',
        discoverComplete: 0,
        discoverTotal: config.sites.length,
        scanComplete: 0,
        scanTotal: 0,
        analyzeComplete: 0,
        analyzeTotal: 0
      }
    };

    // Create project directory
    const projectDir = path.join(this.capturesDir, projectId);
    await fs.mkdir(projectDir, { recursive: true });
    
    // Save manifest
    await this.saveManifest(project);
    
    // Store in memory
    this.projects.set(projectId, project);
    
    return project;
  }

  /**
   * Start discovery for all sites in a project
   */
  async startDiscovery(projectId) {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    
    project.status = PROJECT_STATUS.DISCOVERING;
    project.progress.phase = 'discovering';
    
    // Queue discover job for each site
    for (const site of project.sites) {
      this.pool.addJob(JOB_TYPES.DISCOVER, {
        projectId,
        site: site.url,
        options: {
          maxDepth: project.config.maxDepth,
          maxPages: project.config.maxPagesPerSite
        }
      }, { priority: 1 });
    }
    
    await this.saveManifest(project);
    return project;
  }

  /**
   * Start scanning after discovery is complete
   */
  async startScanning(projectId, pages) {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    
    project.status = PROJECT_STATUS.SCANNING;
    project.progress.phase = 'scanning';
    project.progress.scanTotal = pages.length;
    
    // Create site directories and queue scan jobs
    for (const page of pages) {
      const siteDir = path.join(
        this.capturesDir, 
        projectId, 
        `site_${this.sanitizeDomain(page.site)}`
      );
      await fs.mkdir(path.join(siteDir, 'screenshots'), { recursive: true });
      
      this.pool.addJob(JOB_TYPES.SCAN, {
        projectId,
        site: page.site,
        page: {
          url: page.url,
          path: page.path,
          title: page.title,
          depth: page.depth,
          parent: page.parent
        },
        options: {
          captureDesktop: project.config.captureDesktop,
          captureMobile: project.config.captureMobile,
          scrollDelay: project.config.scrollDelay
        }
      }, { priority: 2 });
    }
    
    await this.saveManifest(project);
    return project;
  }

  /**
   * Start synthesis after analysis is complete
   */
  async startSynthesis(projectId) {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    
    project.status = PROJECT_STATUS.SYNTHESIZING;
    project.progress.phase = 'synthesizing';
    
    this.pool.addJob(JOB_TYPES.SYNTHESIZE, {
      projectId,
      sites: project.sites.map(s => s.url)
    }, { priority: 4 });
    
    await this.saveManifest(project);
    return project;
  }

  /**
   * Check if a phase is complete and trigger next phase
   */
  async checkPhaseCompletion(projectId) {
    const project = this.projects.get(projectId);
    if (!project) return;
    
    const progress = this.pool.getProjectProgress(projectId);
    
    // Update project progress
    const byType = progress.byType || {};
    project.progress.discoverComplete = byType.discover?.complete || 0;
    project.progress.scanComplete = byType.scan?.complete || 0;
    project.progress.analyzeComplete = byType.analyze?.complete || 0;
    
    // Check phase transitions
    if (project.status === PROJECT_STATUS.DISCOVERING) {
      const discoverJobs = this.pool.getProjectJobs(projectId)
        .filter(j => j.type === JOB_TYPES.DISCOVER);
      
      const allDiscovered = discoverJobs.length > 0 &&
        discoverJobs.every(j => j.status === 'complete' || j.status === 'failed');
      
      if (allDiscovered) {
        // Collect all discovered pages and start scanning
        const pages = [];
        for (const job of discoverJobs) {
          if (job.result?.pages) {
            pages.push(...job.result.pages.map(p => ({
              ...p,
              site: job.payload.site
            })));
          }
        }
        
        if (pages.length > 0) {
          await this.startScanning(projectId, pages);
        } else {
          project.status = PROJECT_STATUS.FAILED;
          project.error = 'No pages discovered';
        }
      }
    }
    
    if (project.status === PROJECT_STATUS.SCANNING) {
      const scanJobs = this.pool.getProjectJobs(projectId)
        .filter(j => j.type === JOB_TYPES.SCAN);
      
      const allScanned = scanJobs.length > 0 &&
        scanJobs.every(j => j.status === 'complete' || j.status === 'failed');
      
      if (allScanned) {
        project.status = PROJECT_STATUS.ANALYZING;
        project.progress.phase = 'analyzing';
        project.progress.analyzeTotal = scanJobs.filter(j => j.status === 'complete').length;
      }
    }
    
    if (project.status === PROJECT_STATUS.ANALYZING) {
      const analyzeJobs = this.pool.getProjectJobs(projectId)
        .filter(j => j.type === JOB_TYPES.ANALYZE);
      
      const allAnalyzed = analyzeJobs.length > 0 &&
        analyzeJobs.every(j => j.status === 'complete' || j.status === 'failed');
      
      if (allAnalyzed) {
        await this.startSynthesis(projectId);
      }
    }
    
    if (project.status === PROJECT_STATUS.SYNTHESIZING) {
      const synthJobs = this.pool.getProjectJobs(projectId)
        .filter(j => j.type === JOB_TYPES.SYNTHESIZE);
      
      const allSynthesized = synthJobs.length > 0 &&
        synthJobs.every(j => j.status === 'complete' || j.status === 'failed');
      
      if (allSynthesized) {
        project.status = PROJECT_STATUS.COMPLETE;
        project.progress.phase = 'complete';
      }
    }
    
    await this.saveManifest(project);
  }

  /**
   * Update project status based on jobs
   */
  updateProjectStatus(projectId) {
    const project = this.projects.get(projectId);
    if (!project) return;
    
    // Update site-level progress
    const jobs = this.pool.getProjectJobs(projectId);
    
    for (const site of project.sites) {
      const siteJobs = jobs.filter(j => j.payload.site === site.url);
      
      site.pagesFound = siteJobs.filter(j => j.type === JOB_TYPES.DISCOVER && j.status === 'complete')
        .reduce((sum, j) => sum + (j.result?.pages?.length || 0), 0);
      
      site.pagesScanned = siteJobs.filter(j => j.type === JOB_TYPES.SCAN && j.status === 'complete').length;
      site.pagesAnalyzed = siteJobs.filter(j => j.type === JOB_TYPES.ANALYZE && j.status === 'complete').length;
    }
  }

  /**
   * Get project by ID
   */
  getProject(projectId) {
    return this.projects.get(projectId);
  }

  /**
   * Get project status with detailed progress
   */
  getProjectStatus(projectId) {
    const project = this.projects.get(projectId);
    if (!project) return null;
    
    const progress = this.pool.getProjectProgress(projectId);
    
    return {
      ...project,
      jobProgress: progress,
      queueStatus: this.pool.getStatus()
    };
  }

  /**
   * Get all projects
   */
  async getAllProjects() {
    // Load from disk if not in memory
    try {
      const dirs = await fs.readdir(this.capturesDir);
      
      for (const dir of dirs) {
        if (dir.startsWith('proj_') && !this.projects.has(dir)) {
          const manifestPath = path.join(this.capturesDir, dir, 'manifest.json');
          try {
            const data = await fs.readFile(manifestPath, 'utf-8');
            const project = JSON.parse(data);
            this.projects.set(project.id, project);
          } catch (e) {
            // Ignore missing manifests
          }
        }
      }
    } catch (e) {
      // Captures directory might not exist yet
    }
    
    return Array.from(this.projects.values())
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /**
   * Save project manifest to disk
   */
  async saveManifest(project) {
    const manifestPath = path.join(this.capturesDir, project.id, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(project, null, 2));
  }

  /**
   * Sanitize domain for folder name
   */
  sanitizeDomain(url) {
    try {
      const { hostname } = new URL(url);
      return hostname.replace(/[^a-z0-9.-]/gi, '_');
    } catch {
      return url.replace(/[^a-z0-9.-]/gi, '_');
    }
  }

  /**
   * Get pool status
   */
  getPoolStatus() {
    return this.pool.getStatus();
  }
}

module.exports = {
  Coordinator,
  PROJECT_STATUS
};
