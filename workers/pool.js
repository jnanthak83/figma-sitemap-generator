/**
 * Worker Pool - In-memory job queue with configurable concurrency
 * /workers/pool.js
 */

const EventEmitter = require('events');

// Job statuses
const STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETE: 'complete',
  FAILED: 'failed'
};

// Job types
const JOB_TYPES = {
  DISCOVER: 'discover',
  SCAN: 'scan',
  ANALYZE: 'analyze',
  SYNTHESIZE: 'synthesize'
};

/**
 * Simple ID generator
 */
function generateId(prefix = 'job') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Job Queue - FIFO with priority support
 */
class JobQueue {
  constructor() {
    this.jobs = new Map();      // All jobs by ID
    this.pending = [];          // Pending job IDs (sorted by priority)
    this.running = new Set();   // Currently running job IDs
  }

  /**
   * Add a job to the queue
   */
  add(job) {
    this.jobs.set(job.id, job);
    this.pending.push(job.id);
    // Sort by priority (lower = higher priority)
    this.pending.sort((a, b) => {
      const jobA = this.jobs.get(a);
      const jobB = this.jobs.get(b);
      return (jobA.priority || 5) - (jobB.priority || 5);
    });
    return job;
  }

  /**
   * Get next pending job
   */
  getNext() {
    const jobId = this.pending.shift();
    if (!jobId) return null;
    
    const job = this.jobs.get(jobId);
    job.status = STATUS.RUNNING;
    job.startedAt = new Date().toISOString();
    this.running.add(jobId);
    return job;
  }

  /**
   * Mark job as complete
   */
  complete(jobId, result) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    
    job.status = STATUS.COMPLETE;
    job.result = result;
    job.completedAt = new Date().toISOString();
    this.running.delete(jobId);
    return job;
  }

  /**
   * Mark job as failed
   */
  fail(jobId, error) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    
    job.status = STATUS.FAILED;
    job.error = error.message || String(error);
    job.completedAt = new Date().toISOString();
    this.running.delete(jobId);
    return job;
  }

  /**
   * Get job by ID
   */
  get(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs for a project
   */
  getByProject(projectId) {
    return Array.from(this.jobs.values())
      .filter(j => j.payload?.projectId === projectId);
  }

  /**
   * Get queue stats
   */
  getStats() {
    const jobs = Array.from(this.jobs.values());
    return {
      total: jobs.length,
      pending: this.pending.length,
      running: this.running.size,
      complete: jobs.filter(j => j.status === STATUS.COMPLETE).length,
      failed: jobs.filter(j => j.status === STATUS.FAILED).length
    };
  }

  /**
   * Check if queue has pending work
   */
  hasPending() {
    return this.pending.length > 0;
  }

  /**
   * Clear completed/failed jobs older than maxAge (ms)
   */
  cleanup(maxAge = 3600000) {
    const cutoff = Date.now() - maxAge;
    for (const [id, job] of this.jobs) {
      if (job.status === STATUS.COMPLETE || job.status === STATUS.FAILED) {
        const completedTime = new Date(job.completedAt).getTime();
        if (completedTime < cutoff) {
          this.jobs.delete(id);
        }
      }
    }
  }
}

/**
 * Worker Pool - Manages multiple queues and workers
 */
class WorkerPool extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Default configuration
    this.config = {
      scan: { concurrency: 4, timeout: 60000, retries: 2 },
      analyze: { concurrency: 2, timeout: 120000, retries: 1 },
      synthesize: { concurrency: 1, timeout: 300000, retries: 1 },
      discover: { concurrency: 2, timeout: 30000, retries: 1 },
      ...config
    };
    
    // Create queues for each job type
    this.queues = {
      discover: new JobQueue(),
      scan: new JobQueue(),
      analyze: new JobQueue(),
      synthesize: new JobQueue()
    };
    
    // Worker handlers (set by coordinator)
    this.handlers = {};
    
    // Active worker counts per type
    this.activeWorkers = {
      discover: 0,
      scan: 0,
      analyze: 0,
      synthesize: 0
    };
    
    // Processing state
    this.isProcessing = false;
  }

  /**
   * Register a handler for a job type
   */
  registerHandler(type, handler) {
    this.handlers[type] = handler;
  }

  /**
   * Add a job to the appropriate queue
   */
  addJob(type, payload, options = {}) {
    const queue = this.queues[type];
    if (!queue) {
      throw new Error(`Unknown job type: ${type}`);
    }

    const job = {
      id: generateId(type),
      type,
      status: STATUS.PENDING,
      priority: options.priority || 5,
      payload,
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      retries: 0,
      maxRetries: this.config[type]?.retries || 1
    };

    queue.add(job);
    this.emit('job:added', job);
    
    // Start processing if not already
    this.processQueues();
    
    return job;
  }

  /**
   * Process all queues
   */
  async processQueues() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Process each queue type
      const types = ['discover', 'scan', 'analyze', 'synthesize'];
      
      for (const type of types) {
        await this.processQueue(type);
      }
    } finally {
      this.isProcessing = false;
      
      // Check if more work appeared while processing
      const hasMoreWork = Object.values(this.queues).some(q => q.hasPending());
      if (hasMoreWork) {
        setImmediate(() => this.processQueues());
      }
    }
  }

  /**
   * Process a single queue type
   */
  async processQueue(type) {
    const queue = this.queues[type];
    const config = this.config[type];
    const handler = this.handlers[type];
    
    if (!handler) {
      console.warn(`No handler registered for job type: ${type}`);
      return;
    }

    // Start workers up to concurrency limit
    while (
      queue.hasPending() && 
      this.activeWorkers[type] < config.concurrency
    ) {
      const job = queue.getNext();
      if (!job) break;

      this.activeWorkers[type]++;
      this.emit('job:started', job);
      
      // Process job (don't await - let it run in parallel)
      this.processJob(type, job, handler, config)
        .finally(() => {
          this.activeWorkers[type]--;
          // Trigger more processing
          setImmediate(() => this.processQueues());
        });
    }
  }

  /**
   * Process a single job
   */
  async processJob(type, job, handler, config) {
    const queue = this.queues[type];
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Job timeout')), config.timeout);
      });

      // Run handler with timeout
      const result = await Promise.race([
        handler(job.payload, job),
        timeoutPromise
      ]);

      // Success
      queue.complete(job.id, result);
      this.emit('job:complete', job);
      
    } catch (error) {
      // Check for retries
      if (job.retries < job.maxRetries) {
        job.retries++;
        job.status = STATUS.PENDING;
        job.startedAt = null;
        queue.pending.unshift(job.id); // Add back to front
        queue.running.delete(job.id);
        this.emit('job:retry', job, error);
      } else {
        // Final failure
        queue.fail(job.id, error);
        this.emit('job:failed', job, error);
      }
    }
  }

  /**
   * Get status of all queues
   */
  getStatus() {
    const status = {};
    for (const [type, queue] of Object.entries(this.queues)) {
      status[type] = {
        ...queue.getStats(),
        activeWorkers: this.activeWorkers[type],
        maxWorkers: this.config[type].concurrency
      };
    }
    return status;
  }

  /**
   * Get jobs for a specific project
   */
  getProjectJobs(projectId) {
    const jobs = [];
    for (const queue of Object.values(this.queues)) {
      jobs.push(...queue.getByProject(projectId));
    }
    return jobs.sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );
  }

  /**
   * Get project progress
   */
  getProjectProgress(projectId) {
    const jobs = this.getProjectJobs(projectId);
    
    const byType = {};
    for (const job of jobs) {
      if (!byType[job.type]) {
        byType[job.type] = { total: 0, complete: 0, failed: 0, running: 0, pending: 0 };
      }
      byType[job.type].total++;
      byType[job.type][job.status]++;
    }
    
    const total = jobs.length;
    const complete = jobs.filter(j => j.status === STATUS.COMPLETE).length;
    const failed = jobs.filter(j => j.status === STATUS.FAILED).length;
    
    return {
      total,
      complete,
      failed,
      running: jobs.filter(j => j.status === STATUS.RUNNING).length,
      pending: jobs.filter(j => j.status === STATUS.PENDING).length,
      progress: total > 0 ? Math.round((complete / total) * 100) : 0,
      byType
    };
  }

  /**
   * Wait for all jobs of a type to complete for a project
   */
  waitForType(projectId, type) {
    return new Promise((resolve) => {
      const check = () => {
        const jobs = this.getProjectJobs(projectId)
          .filter(j => j.type === type);
        
        const allDone = jobs.length > 0 && 
          jobs.every(j => j.status === STATUS.COMPLETE || j.status === STATUS.FAILED);
        
        if (allDone) {
          resolve(jobs);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Cleanup old jobs
   */
  cleanup(maxAge = 3600000) {
    for (const queue of Object.values(this.queues)) {
      queue.cleanup(maxAge);
    }
  }
}

// Export
module.exports = {
  WorkerPool,
  JobQueue,
  JOB_TYPES,
  STATUS,
  generateId
};
