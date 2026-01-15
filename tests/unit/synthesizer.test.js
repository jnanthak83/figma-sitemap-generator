/**
 * Tests for Synthesizer Worker (workers/synthesizer.js)
 */

const { 
  createBasicSynthesis, 
  createBasicComparison,
  synthesizeSite,
  compareSites
} = require('../../workers/synthesizer');

// Mock the LLM module
jest.mock('../../workers/llm', () => ({
  LLMProvider: jest.fn().mockImplementation(() => ({
    isAvailable: jest.fn().mockResolvedValue(false),
    complete: jest.fn()
  })),
  buildSynthesisPrompt: jest.fn().mockReturnValue('mock synthesis prompt'),
  buildComparisonPrompt: jest.fn().mockReturnValue('mock comparison prompt'),
  parseResponse: jest.fn()
}));

// Mock the analyzer module
jest.mock('../../workers/analyzer', () => ({
  getLLMConfig: jest.fn().mockReturnValue({ provider: 'ollama', model: 'llama3.2' })
}));

const { LLMProvider, parseResponse } = require('../../workers/llm');

describe('synthesizeSite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns basic synthesis when LLM unavailable', async () => {
    LLMProvider.mockImplementation(() => ({
      isAvailable: jest.fn().mockResolvedValue(false)
    }));

    const siteData = {
      site: 'example.com',
      pages: [{ path: '/', analysis: { scores: { overall: 75 } } }]
    };

    const result = await synthesizeSite(siteData);

    expect(result.siteWide).toBeDefined();
    expect(result.siteWide.overallScore).toBe(75);
  });

  test('uses LLM when available', async () => {
    const mockComplete = jest.fn().mockResolvedValue('{"siteWide": {"overallScore": 85}}');
    LLMProvider.mockImplementation(() => ({
      isAvailable: jest.fn().mockResolvedValue(true),
      complete: mockComplete
    }));
    parseResponse.mockReturnValue({ siteWide: { overallScore: 85 } });

    const siteData = { site: 'example.com', pages: [] };
    const result = await synthesizeSite(siteData);

    expect(mockComplete).toHaveBeenCalled();
    expect(result.siteWide.overallScore).toBe(85);
  });

  test('falls back to basic synthesis on LLM error', async () => {
    LLMProvider.mockImplementation(() => ({
      isAvailable: jest.fn().mockResolvedValue(true),
      complete: jest.fn().mockRejectedValue(new Error('LLM failed'))
    }));

    const siteData = { site: 'example.com', pages: [] };
    const result = await synthesizeSite(siteData);

    expect(result.siteWide).toBeDefined();
  });
});

describe('compareSites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns basic comparison when LLM unavailable', async () => {
    LLMProvider.mockImplementation(() => ({
      isAvailable: jest.fn().mockResolvedValue(false)
    }));

    const sitesData = [
      { site: 'mysite.com', pages: [] },
      { site: 'competitor.com', pages: [] }
    ];

    const result = await compareSites(sitesData);

    expect(result.comparison).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  test('uses LLM when available', async () => {
    const mockComplete = jest.fn().mockResolvedValue('{"comparison": {}, "summary": {}}');
    LLMProvider.mockImplementation(() => ({
      isAvailable: jest.fn().mockResolvedValue(true),
      complete: mockComplete
    }));
    parseResponse.mockReturnValue({ comparison: {}, summary: {} });

    const sitesData = [{ site: 'example.com', pages: [] }];
    const result = await compareSites(sitesData);

    expect(mockComplete).toHaveBeenCalled();
  });

  test('falls back to basic comparison on LLM error', async () => {
    LLMProvider.mockImplementation(() => ({
      isAvailable: jest.fn().mockResolvedValue(true),
      complete: jest.fn().mockRejectedValue(new Error('LLM failed'))
    }));

    const sitesData = [{ site: 'example.com', pages: [] }];
    const result = await compareSites(sitesData);

    expect(result.comparison).toBeDefined();
  });
});

describe('createBasicSynthesis', () => {
  test('calculates average score from pages', () => {
    const siteData = {
      pages: [
        { analysis: { scores: { overall: 70 } } },
        { analysis: { scores: { overall: 80 } } },
        { analysis: { scores: { overall: 90 } } }
      ]
    };

    const result = createBasicSynthesis(siteData);

    expect(result.siteWide.overallScore).toBe(80); // Average of 70, 80, 90
  });

  test('handles pages without scores', () => {
    const siteData = {
      pages: [
        { analysis: { scores: { overall: 80 } } },
        { analysis: null },
        { path: '/about' } // No analysis
      ]
    };

    const result = createBasicSynthesis(siteData);

    expect(result.siteWide.overallScore).toBe(80); // Only one valid score
  });

  test('returns 50 when no scored pages', () => {
    const siteData = {
      pages: [
        { path: '/' },
        { path: '/about' }
      ]
    };

    const result = createBasicSynthesis(siteData);

    expect(result.siteWide.overallScore).toBe(50);
  });

  test('identifies common components', () => {
    const siteData = {
      pages: [
        { extracted: { components: { hero: true, footer: true, header: true } } },
        { extracted: { components: { hero: true, footer: true, header: true } } },
        { extracted: { components: { hero: false, footer: true, header: true } } }
      ]
    };

    const result = createBasicSynthesis(siteData);

    // footer and header appear in > 50% of pages
    expect(result.siteWide.patterns.commonComponents).toContain('footer');
    expect(result.siteWide.patterns.commonComponents).toContain('header');
  });

  test('collects top issues from recommendations', () => {
    const siteData = {
      pages: [
        { analysis: { recommendations: [{ issue: 'Missing H1' }, { issue: 'No CTA' }] } },
        { analysis: { recommendations: [{ issue: 'Missing H1' }, { issue: 'Bad meta' }] } },
        { analysis: { recommendations: [{ issue: 'Missing H1' }] } }
      ]
    };

    const result = createBasicSynthesis(siteData);

    // 'Missing H1' appears 3 times, should be first
    expect(result.siteWide.weaknesses[0]).toBe('Missing H1');
    expect(result.siteWide.topPriority).toBe('Missing H1');
  });

  test('adds strength when many common components', () => {
    const siteData = {
      pages: [
        { extracted: { components: { hero: true, footer: true, header: true, nav: true } } },
        { extracted: { components: { hero: true, footer: true, header: true, nav: true } } }
      ]
    };

    const result = createBasicSynthesis(siteData);

    expect(result.siteWide.strengths).toContain('Consistent component usage');
  });

  test('handles empty pages array', () => {
    const siteData = { pages: [] };

    const result = createBasicSynthesis(siteData);

    expect(result.siteWide.overallScore).toBe(50);
    expect(result.siteWide.patterns.commonComponents).toEqual([]);
  });
});

describe('createBasicComparison', () => {
  test('identifies primary vs competitors', () => {
    const sitesData = [
      { site: 'mysite.com', role: 'primary', pages: [] },
      { site: 'competitor.com', role: 'competitor', pages: [] }
    ];

    const result = createBasicComparison(sitesData);

    // Check that insights array contains expected strings
    expect(result.comparison.insights.some(i => i.includes('Primary site'))).toBe(true);
    expect(result.comparison.insights.some(i => i.includes('Competitors average'))).toBe(true);
  });

  test('calculates position as leading when ahead', () => {
    const sitesData = [
      { 
        site: 'mysite.com', 
        pages: [
          { analysis: { scores: { overall: 90 } } },
          { analysis: { scores: { overall: 85 } } }
        ]
      },
      { 
        site: 'competitor.com', 
        pages: [
          { analysis: { scores: { overall: 60 } } }
        ]
      }
    ];

    const result = createBasicComparison(sitesData);

    expect(result.summary.overallPosition).toBe('leading');
  });

  test('calculates position as lagging when behind', () => {
    const sitesData = [
      { 
        site: 'mysite.com', 
        pages: [
          { analysis: { scores: { overall: 50 } } }
        ]
      },
      { 
        site: 'competitor.com', 
        pages: [
          { analysis: { scores: { overall: 90 } } }
        ]
      }
    ];

    const result = createBasicComparison(sitesData);

    expect(result.summary.overallPosition).toBe('lagging');
  });

  test('calculates position as middle when similar', () => {
    const sitesData = [
      { 
        site: 'mysite.com', 
        pages: [{ analysis: { scores: { overall: 75 } } }]
      },
      { 
        site: 'competitor.com', 
        pages: [{ analysis: { scores: { overall: 78 } } }]
      }
    ];

    const result = createBasicComparison(sitesData);

    expect(result.summary.overallPosition).toBe('middle');
  });

  test('handles pages without analysis', () => {
    const sitesData = [
      { site: 'mysite.com', pages: [{ path: '/' }] },
      { site: 'competitor.com', pages: [{ path: '/' }] }
    ];

    const result = createBasicComparison(sitesData);

    // Should use default score of 50
    expect(result.summary.overallPosition).toBe('middle');
  });

  test('handles single site (no competitors)', () => {
    const sitesData = [
      { 
        site: 'mysite.com', 
        pages: [{ analysis: { scores: { overall: 80 } } }]
      }
    ];

    const result = createBasicComparison(sitesData);

    expect(result.comparison.insights[0]).toContain('80');
  });

  test('suggests enabling LLM for detailed analysis', () => {
    const sitesData = [
      { site: 'mysite.com', pages: [] }
    ];

    const result = createBasicComparison(sitesData);

    expect(result.summary.topPriority).toContain('LLM');
  });

  test('returns empty recommendations arrays', () => {
    const sitesData = [
      { site: 'mysite.com', pages: [] }
    ];

    const result = createBasicComparison(sitesData);

    expect(result.recommendations.quickWins).toEqual([]);
    expect(result.recommendations.majorImprovements).toEqual([]);
  });
});
