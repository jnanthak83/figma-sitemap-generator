/**
 * Tests for Analyzer Worker (workers/analyzer.js)
 */

const { 
  analyzePage, 
  setLLMConfig, 
  getLLMConfig, 
  createBasicAnalysis 
} = require('../../workers/analyzer');

// Mock the LLM module
jest.mock('../../workers/llm', () => ({
  LLMProvider: jest.fn().mockImplementation(() => ({
    isAvailable: jest.fn().mockResolvedValue(false),
    complete: jest.fn()
  })),
  buildAnalysisPrompt: jest.fn().mockReturnValue('mock prompt'),
  parseResponse: jest.fn()
}));

const { LLMProvider, parseResponse } = require('../../workers/llm');

describe('setLLMConfig / getLLMConfig', () => {
  test('sets and gets LLM configuration', () => {
    setLLMConfig({
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      endpoint: 'https://api.anthropic.com'
    });

    const config = getLLMConfig();

    expect(config.provider).toBe('claude');
    expect(config.model).toBe('claude-sonnet-4-20250514');
  });

  test('merges with existing config', () => {
    setLLMConfig({ provider: 'ollama', model: 'llama3.2' });
    setLLMConfig({ model: 'mistral' });

    const config = getLLMConfig();

    expect(config.provider).toBe('ollama');
    expect(config.model).toBe('mistral');
  });

  test('returns copy of config', () => {
    setLLMConfig({ provider: 'ollama' });
    const config1 = getLLMConfig();
    config1.provider = 'modified';
    const config2 = getLLMConfig();

    expect(config2.provider).toBe('ollama');
  });
});

describe('createBasicAnalysis', () => {
  test('calculates SEO score based on meta', () => {
    const pageData = {
      path: '/',
      extracted: {
        meta: { 
          title: 'Good Page Title Here', // > 10 chars
          description: 'This is a good meta description that is over 50 characters long for SEO purposes.'
        },
        headings: { h1: ['Single H1'], h2: ['Sub 1', 'Sub 2'] },
        content: { wordCount: 400 },
        ctas: [],
        components: {}
      }
    };

    const analysis = createBasicAnalysis(pageData);

    expect(analysis.scores.seo).toBeGreaterThan(50);
    expect(analysis.analysis.seo.titleOptimized).toBe(true);
    expect(analysis.analysis.seo.metaDescription).toBe(true);
  });

  test('penalizes missing meta description', () => {
    const withMeta = createBasicAnalysis({
      extracted: {
        meta: { title: 'A Good Page Title', description: 'Good description here that is long enough for SEO purposes' },
        headings: { h1: ['H1'] },
        content: {},
        ctas: [],
        components: {}
      }
    });

    const withoutMeta = createBasicAnalysis({
      extracted: {
        meta: { title: 'A Good Page Title' }, // Same title, no description
        headings: { h1: ['H1'] },
        content: {},
        ctas: [],
        components: {}
      }
    });

    expect(withMeta.scores.seo).toBeGreaterThan(withoutMeta.scores.seo);
  });

  test('calculates content score based on word count', () => {
    const shortContent = createBasicAnalysis({
      extracted: {
        meta: {},
        headings: {},
        content: { wordCount: 100 },
        ctas: [],
        components: {}
      }
    });

    const longContent = createBasicAnalysis({
      extracted: {
        meta: {},
        headings: {},
        content: { wordCount: 800 },
        ctas: [],
        components: {}
      }
    });

    expect(longContent.scores.content).toBeGreaterThan(shortContent.scores.content);
  });

  test('calculates UX score based on CTAs', () => {
    const noCtas = createBasicAnalysis({
      extracted: {
        meta: {},
        headings: {},
        content: {},
        ctas: [],
        components: {}
      }
    });

    const withCtas = createBasicAnalysis({
      extracted: {
        meta: {},
        headings: {},
        content: {},
        ctas: [
          { text: 'Get Started', prominence: 'primary' },
          { text: 'Learn More', prominence: 'secondary' }
        ],
        components: { hero: true }
      }
    });

    expect(withCtas.scores.ux).toBeGreaterThan(noCtas.scores.ux);
  });

  test('calculates structure score based on components', () => {
    const minimal = createBasicAnalysis({
      extracted: {
        meta: {},
        headings: {},
        content: {},
        ctas: [],
        components: {}
      }
    });

    const wellStructured = createBasicAnalysis({
      extracted: {
        meta: {},
        headings: { h1: ['Title'], h2: ['Section 1', 'Section 2'] },
        content: {},
        ctas: [],
        navigation: { primary: ['Home', 'About'] },
        components: { header: true, footer: true }
      }
    });

    expect(wellStructured.scores.structure).toBeGreaterThan(minimal.scores.structure);
  });

  test('generates issues for missing elements', () => {
    const analysis = createBasicAnalysis({
      extracted: {
        meta: {},
        headings: { h1: ['First H1', 'Second H1'] }, // Multiple H1s
        content: {},
        ctas: [],
        components: {}
      }
    });

    expect(analysis.analysis.seo.issues).toContain('Missing meta description');
    expect(analysis.analysis.content.issues.some(i => i.includes('H1'))).toBe(true);
  });

  test('generates findings for good elements', () => {
    const analysis = createBasicAnalysis({
      extracted: {
        meta: { title: 'Good Title' },
        headings: { h1: ['Single H1'], h2: ['Sub'] },
        content: {},
        ctas: [{ text: 'CTA', prominence: 'primary' }],
        components: { testimonials: true }
      }
    });

    expect(analysis.analysis.content.findings).toContain('Has page title');
    expect(analysis.analysis.content.findings).toContain('Good heading structure');
  });

  test('calculates overall score as average', () => {
    const analysis = createBasicAnalysis({
      extracted: {
        meta: { title: 'Title', description: 'Description that is long enough for the test' },
        headings: { h1: ['H1'], h2: ['H2'] },
        content: { wordCount: 500 },
        ctas: [{ prominence: 'primary' }],
        components: { header: true, footer: true, hero: true }
      }
    });

    const expectedAvg = Math.round(
      (analysis.scores.seo + analysis.scores.content + 
       analysis.scores.ux + analysis.scores.structure) / 4
    );

    expect(analysis.scores.overall).toBe(expectedAvg);
  });

  test('returns correct LLM info', () => {
    const analysis = createBasicAnalysis({ extracted: {} });

    expect(analysis.llm.provider).toBe('basic');
    expect(analysis.llm.model).toBe('heuristic');
  });

  test('generates recommendations from issues', () => {
    const analysis = createBasicAnalysis({
      extracted: {
        meta: {},
        headings: {},
        content: {},
        ctas: [],
        components: {}
      }
    });

    expect(analysis.recommendations.length).toBeGreaterThan(0);
    expect(analysis.recommendations[0].priority).toBe('high');
    expect(analysis.recommendations[0].category).toBe('general');
  });
});

describe('analyzePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLLMConfig({ provider: 'ollama', model: 'llama3.2' });
  });

  test('returns basic analysis when LLM unavailable', async () => {
    LLMProvider.mockImplementation(() => ({
      isAvailable: jest.fn().mockResolvedValue(false)
    }));

    const result = await analyzePage({
      projectId: 'proj_1',
      site: 'https://example.com',
      page: { url: 'https://example.com/', path: '/', title: 'Home' },
      extracted: {
        meta: { title: 'Test' },
        headings: { h1: ['Title'] },
        content: { wordCount: 300 },
        ctas: [],
        components: {}
      }
    });

    expect(result.llm.provider).toBe('basic');
    expect(result.scores).toBeDefined();
  });

  test('uses LLM when available', async () => {
    const mockComplete = jest.fn().mockResolvedValue('{"scores": {"overall": 85}}');
    LLMProvider.mockImplementation(() => ({
      isAvailable: jest.fn().mockResolvedValue(true),
      complete: mockComplete
    }));
    parseResponse.mockReturnValue({ scores: { overall: 85 } });

    const result = await analyzePage({
      projectId: 'proj_1',
      site: 'https://example.com',
      page: { url: 'https://example.com/', path: '/' },
      extracted: {}
    });

    expect(mockComplete).toHaveBeenCalled();
    expect(result.scores.overall).toBe(85);
  });

  test('falls back to basic analysis on LLM error', async () => {
    LLMProvider.mockImplementation(() => ({
      isAvailable: jest.fn().mockResolvedValue(true),
      complete: jest.fn().mockRejectedValue(new Error('LLM error'))
    }));

    const result = await analyzePage({
      projectId: 'proj_1',
      site: 'https://example.com',
      page: { url: 'https://example.com/', path: '/' },
      extracted: { meta: {}, headings: {}, content: {}, ctas: [], components: {} }
    });

    expect(result.llm.provider).toBe('basic');
  });

  test('includes site and page info in result', async () => {
    LLMProvider.mockImplementation(() => ({
      isAvailable: jest.fn().mockResolvedValue(false)
    }));

    const result = await analyzePage({
      projectId: 'proj_1',
      site: 'https://example.com',
      page: { url: 'https://example.com/about', path: '/about' },
      extracted: {}
    });

    expect(result.page).toBe('/about');
    expect(result.site).toBe('https://example.com');
  });
});
