/**
 * Tests for Worker Pool (workers/pool.js)
 */

const { WorkerPool, JobQueue, JOB_TYPES, STATUS, generateId } = require('../../workers/pool');

describe('generateId', () => {
  test('generates unique IDs with prefix', () => {
    const id1 = generateId('job');
    const id2 = generateId('job');
    
    expect(id1).toMatch(/^job_\d+_[a-z0-9]+$/);
    expect(id2).toMatch(/^job_\d+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });

  test('uses default prefix', () => {
    const id = generateId();
    expect(id).toMatch(/^job_/);
  });
});

describe('JobQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new JobQueue();
  });

  describe('add', () => {
    test('adds job to queue', () => {
      const job = { id: 'job_1', type: 'scan', status: STATUS.PENDING };
      queue.add(job);
      
      expect(queue.jobs.size).toBe(1);
      expect(queue.pending.length).toBe(1);
    });

    test('sorts jobs by priority', () => {
      queue.add({ id: 'job_1', priority: 5, status: STATUS.PENDING });
      queue.add({ id: 'job_2', priority: 1, status: STATUS.PENDING });
      queue.add({ id: 'job_3', priority: 3, status: STATUS.PENDING });
      
      expect(queue.pending).toEqual(['job_2', 'job_3', 'job_1']);
    });
  });

  describe('getNext', () => {
    test('returns highest priority job', () => {
      queue.add({ id: 'job_1', priority: 5, status: STATUS.PENDING });
      queue.add({ id: 'job_2', priority: 1, status: STATUS.PENDING });
      
      const job = queue.getNext();
      
      expect(job.id).toBe('job_2');
      expect(job.status).toBe(STATUS.RUNNING);
      expect(job.startedAt).toBeDefined();
    });

    test('returns null when queue empty', () => {
      expect(queue.getNext()).toBeNull();
    });

    test('moves job to running set', () => {
      queue.add({ id: 'job_1', status: STATUS.PENDING });
      queue.getNext();
      
      expect(queue.running.has('job_1')).toBe(true);
      expect(queue.pending.length).toBe(0);
    });
  });

  describe('complete', () => {
    test('marks job as complete with result', () => {
      queue.add({ id: 'job_1', status: STATUS.PENDING });
      queue.getNext();
      
      const job = queue.complete('job_1', { data: 'test' });
      
      expect(job.status).toBe(STATUS.COMPLETE);
      expect(job.result).toEqual({ data: 'test' });
      expect(job.completedAt).toBeDefined();
      expect(queue.running.has('job_1')).toBe(false);
    });

    test('returns null for unknown job', () => {
      expect(queue.complete('unknown')).toBeNull();
    });
  });

  describe('fail', () => {
    test('marks job as failed with error', () => {
      queue.add({ id: 'job_1', status: STATUS.PENDING });
      queue.getNext();
      
      const job = queue.fail('job_1', new Error('Test error'));
      
      expect(job.status).toBe(STATUS.FAILED);
      expect(job.error).toBe('Test error');
      expect(queue.running.has('job_1')).toBe(false);
    });
  });

  describe('getStats', () => {
    test('returns correct statistics', () => {
      queue.add({ id: 'job_1', status: STATUS.PENDING });
      queue.add({ id: 'job_2', status: STATUS.PENDING });
      queue.getNext(); // job_1 now running
      queue.complete('job_1', {});
      
      const stats = queue.getStats();
      
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.running).toBe(0);
      expect(stats.complete).toBe(1);
      expect(stats.failed).toBe(0);
    });
  });

  describe('getByProject', () => {
    test('filters jobs by project ID', () => {
      queue.add({ id: 'job_1', payload: { projectId: 'proj_1' }, status: STATUS.PENDING });
      queue.add({ id: 'job_2', payload: { projectId: 'proj_2' }, status: STATUS.PENDING });
      queue.add({ id: 'job_3', payload: { projectId: 'proj_1' }, status: STATUS.PENDING });
      
      const jobs = queue.getByProject('proj_1');
      
      expect(jobs.length).toBe(2);
      expect(jobs.every(j => j.payload.projectId === 'proj_1')).toBe(true);
    });
  });
});

describe('WorkerPool', () => {
  let pool;

  beforeEach(() => {
    pool = new WorkerPool();
  });

  describe('constructor', () => {
    test('creates queues for all job types', () => {
      expect(pool.queues.discover).toBeDefined();
      expect(pool.queues.scan).toBeDefined();
      expect(pool.queues.analyze).toBeDefined();
      expect(pool.queues.synthesize).toBeDefined();
    });

    test('uses default config', () => {
      expect(pool.config.scan.concurrency).toBe(4);
      expect(pool.config.analyze.concurrency).toBe(2);
      expect(pool.config.synthesize.concurrency).toBe(1);
    });

    test('accepts custom config', () => {
      const customPool = new WorkerPool({ scan: { concurrency: 8 } });
      expect(customPool.config.scan.concurrency).toBe(8);
    });
  });

  describe('registerHandler', () => {
    test('registers handler for job type', () => {
      const handler = jest.fn();
      pool.registerHandler('scan', handler);
      
      expect(pool.handlers.scan).toBe(handler);
    });
  });

  describe('addJob', () => {
    test('creates job with correct structure', () => {
      const job = pool.addJob('scan', { test: 'data' });
      
      expect(job.id).toMatch(/^scan_/);
      expect(job.type).toBe('scan');
      expect(job.status).toBe(STATUS.PENDING);
      expect(job.payload).toEqual({ test: 'data' });
      expect(job.createdAt).toBeDefined();
    });

    test('respects priority option', () => {
      const job = pool.addJob('scan', {}, { priority: 1 });
      expect(job.priority).toBe(1);
    });

    test('throws for unknown job type', () => {
      expect(() => pool.addJob('unknown', {})).toThrow('Unknown job type');
    });

    test('emits job:added event', () => {
      const listener = jest.fn();
      pool.on('job:added', listener);
      
      pool.addJob('scan', {});
      
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('processJob', () => {
    test('calls handler with payload and job', async () => {
      const handler = jest.fn().mockResolvedValue({ result: 'success' });
      pool.registerHandler('scan', handler);
      
      const job = pool.addJob('scan', { test: 'data' });
      
      // Wait for processing
      await new Promise(r => setTimeout(r, 100));
      
      expect(handler).toHaveBeenCalledWith({ test: 'data' }, expect.objectContaining({ id: job.id }));
    });

    test('marks job complete on success', async () => {
      const handler = jest.fn().mockResolvedValue({ result: 'success' });
      pool.registerHandler('scan', handler);
      
      const job = pool.addJob('scan', {});
      
      await new Promise(r => setTimeout(r, 100));
      
      const updated = pool.queues.scan.get(job.id);
      expect(updated.status).toBe(STATUS.COMPLETE);
      expect(updated.result).toEqual({ result: 'success' });
    });

    test('retries on failure', async () => {
      let attempts = 0;
      const handler = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) throw new Error('Retry me');
        return { success: true };
      });
      pool.registerHandler('scan', handler);
      
      pool.addJob('scan', {});
      
      await new Promise(r => setTimeout(r, 300));
      
      expect(attempts).toBe(2);
    });

    test('marks job failed after max retries', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Always fails'));
      pool.registerHandler('scan', handler);
      
      const job = pool.addJob('scan', {});
      
      await new Promise(r => setTimeout(r, 500));
      
      const updated = pool.queues.scan.get(job.id);
      expect(updated.status).toBe(STATUS.FAILED);
      expect(updated.error).toBe('Always fails');
    });
  });

  describe('getStatus', () => {
    test('returns status for all queues', () => {
      pool.addJob('scan', {});
      pool.addJob('analyze', {});
      
      const status = pool.getStatus();
      
      expect(status.scan).toBeDefined();
      expect(status.analyze).toBeDefined();
      expect(status.scan.total).toBe(1);
      expect(status.analyze.total).toBe(1);
    });
  });

  describe('getProjectProgress', () => {
    test('calculates progress correctly', () => {
      pool.addJob('scan', { projectId: 'proj_1' });
      pool.addJob('scan', { projectId: 'proj_1' });
      pool.addJob('scan', { projectId: 'proj_2' });
      
      const progress = pool.getProjectProgress('proj_1');
      
      expect(progress.total).toBe(2);
      expect(progress.byType.scan.total).toBe(2);
    });
  });

  describe('concurrency control', () => {
    test('respects concurrency limit', async () => {
      let running = 0;
      let maxRunning = 0;
      
      const handler = jest.fn().mockImplementation(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise(r => setTimeout(r, 50));
        running--;
        return {};
      });
      
      pool.registerHandler('scan', handler);
      
      // Add more jobs than concurrency limit
      for (let i = 0; i < 10; i++) {
        pool.addJob('scan', { i });
      }
      
      await new Promise(r => setTimeout(r, 1000));
      
      expect(maxRunning).toBeLessThanOrEqual(pool.config.scan.concurrency);
    });
  });
});

describe('JOB_TYPES', () => {
  test('has all required types', () => {
    expect(JOB_TYPES.DISCOVER).toBe('discover');
    expect(JOB_TYPES.SCAN).toBe('scan');
    expect(JOB_TYPES.ANALYZE).toBe('analyze');
    expect(JOB_TYPES.SYNTHESIZE).toBe('synthesize');
  });
});

describe('STATUS', () => {
  test('has all required statuses', () => {
    expect(STATUS.PENDING).toBe('pending');
    expect(STATUS.RUNNING).toBe('running');
    expect(STATUS.COMPLETE).toBe('complete');
    expect(STATUS.FAILED).toBe('failed');
  });
});
