/**
 * Jest Test Setup
 * Global configuration and helpers for all tests
 */

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console.log/error in tests to reduce noise
global.originalConsole = { ...console };
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Track active timers for cleanup
const activeTimers = new Set();
const originalSetTimeout = global.setTimeout;
const originalSetInterval = global.setInterval;
const originalSetImmediate = global.setImmediate;

global.setTimeout = (fn, ms, ...args) => {
  const id = originalSetTimeout(fn, ms, ...args);
  activeTimers.add({ type: 'timeout', id });
  return id;
};

global.setInterval = (fn, ms, ...args) => {
  const id = originalSetInterval(fn, ms, ...args);
  activeTimers.add({ type: 'interval', id });
  return id;
};

global.setImmediate = (fn, ...args) => {
  const id = originalSetImmediate(fn, ...args);
  activeTimers.add({ type: 'immediate', id });
  return id;
};

// Clean up after all tests
afterAll(async () => {
  // Clear all timers
  activeTimers.forEach(timer => {
    if (timer.type === 'timeout') clearTimeout(timer.id);
    if (timer.type === 'interval') clearInterval(timer.id);
    if (timer.type === 'immediate') clearImmediate(timer.id);
  });
  activeTimers.clear();
  
  // Allow async operations to complete
  await new Promise(resolve => originalSetTimeout(resolve, 100));
});

// Helper to create mock job payload
global.createMockPayload = (overrides = {}) => ({
  projectId: 'test_project_123',
  site: 'https://example.com',
  page: {
    url: 'https://example.com/',
    path: '/',
    title: 'Test Page',
    depth: 0,
    parent: null
  },
  options: {
    captureDesktop: true,
    captureMobile: true,
    scrollDelay: 100
  },
  ...overrides
});

// Helper to wait for async conditions
global.waitFor = async (condition, timeout = 5000, interval = 50) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return true;
    await new Promise(r => originalSetTimeout(r, interval));
  }
  throw new Error('Timeout waiting for condition');
};

// Helper to create temp directory for tests
global.createTempDir = () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const dir = path.join(os.tmpdir(), `sitemap-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// Helper to clean up temp directory
global.cleanupTempDir = (dir) => {
  const fs = require('fs');
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
