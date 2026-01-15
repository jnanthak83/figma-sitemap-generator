/**
 * Tests for LLM Provider (workers/llm.js)
 */

const { 
  LLMProvider, 
  buildAnalysisPrompt, 
  buildSynthesisPrompt, 
  buildComparisonPrompt,
  parseResponse 
} = require('../../workers/llm');

// Mock fetch globally
global.fetch = jest.fn();

describe('LLMProvider', () => {
  let provider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new LLMProvider({
      provider: 'ollama',
      model: 'llama3.2',
      endpoint: 'http://localhost:11434'
    });
  });

  describe('constructor', () => {
    test('uses default values', () => {
      const defaultProvider = new LLMProvider();
      
      expect(defaultProvider.provider).toBe('ollama');
      expect(defaultProvider.model).toBe('llama3.2');
      expect(defaultProvider.endpoint).toBe('http://localhost:11434');
    });

    test('accepts custom config', () => {
      const custom = new LLMProvider({
        provider: 'claude',
        model: 'claude-sonnet-4-20250514',
        apiKey: 'test-key'
      });

      expect(custom.provider).toBe('claude');
      expect(custom.model).toBe('claude-sonnet-4-20250514');
      expect(custom.apiKey).toBe('test-key');
    });

    test('stores fallback config', () => {
      const withFallback = new LLMProvider({
        provider: 'ollama',
        fallback: { provider: 'claude', apiKey: 'key' }
      });

      expect(withFallback.fallback).toEqual({ provider: 'claude', apiKey: 'key' });
    });
  });

  describe('complete', () => {
    test('calls Ollama endpoint for ollama provider', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Test response' })
      });

      const result = await provider.complete('Test prompt');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Test prompt')
        })
      );
      expect(result).toBe('Test response');
    });

    test('calls Claude endpoint for claude provider', async () => {
      const claudeProvider = new LLMProvider({
        provider: 'claude',
        model: 'claude-sonnet-4-20250514',
        apiKey: 'test-api-key'
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          content: [{ text: 'Claude response' }] 
        })
      });

      const result = await claudeProvider.complete('Test prompt');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key'
          })
        })
      );
      expect(result).toBe('Claude response');
    });

    test('throws for unknown provider', async () => {
      const unknownProvider = new LLMProvider({ provider: 'unknown' });
      
      await expect(unknownProvider.complete('prompt'))
        .rejects.toThrow('Unknown provider: unknown');
    });

    test('uses fallback on primary failure', async () => {
      const withFallback = new LLMProvider({
        provider: 'ollama',
        fallback: { provider: 'ollama', endpoint: 'http://backup:11434' }
      });

      // Primary fails
      global.fetch.mockRejectedValueOnce(new Error('Connection refused'));
      // Fallback succeeds
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Fallback response' })
      });

      const result = await withFallback.complete('prompt');

      expect(result).toBe('Fallback response');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('throws when no fallback and primary fails', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(provider.complete('prompt'))
        .rejects.toThrow('Connection refused');
    });
  });

  describe('completeOllama', () => {
    test('sends correct request body', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'response' })
      });

      await provider.completeOllama('Test prompt', { temperature: 0.5, maxTokens: 1000 });

      const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callBody.model).toBe('llama3.2');
      expect(callBody.prompt).toBe('Test prompt');
      expect(callBody.stream).toBe(false);
      expect(callBody.options.temperature).toBe(0.5);
      expect(callBody.options.num_predict).toBe(1000);
    });

    test('throws on non-OK response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(provider.completeOllama('prompt'))
        .rejects.toThrow('Ollama error: 500 Internal Server Error');
    });
  });

  describe('completeClaude', () => {
    test('throws without API key', async () => {
      const noKeyProvider = new LLMProvider({ provider: 'claude' });
      
      await expect(noKeyProvider.completeClaude('prompt'))
        .rejects.toThrow('Claude API key not configured');
    });

    test('sends correct headers', async () => {
      const claudeProvider = new LLMProvider({
        provider: 'claude',
        apiKey: 'test-key'
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: 'response' }] })
      });

      await claudeProvider.completeClaude('prompt');

      const headers = global.fetch.mock.calls[0][1].headers;
      expect(headers['x-api-key']).toBe('test-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('isAvailable', () => {
    test('checks Ollama availability', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true });

      const available = await provider.isAvailable();

      expect(available).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:11434/api/tags');
    });

    test('returns false when Ollama unreachable', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Connection refused'));

      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });

    test('checks Claude by API key presence', async () => {
      const claudeWithKey = new LLMProvider({ provider: 'claude', apiKey: 'key' });
      const claudeNoKey = new LLMProvider({ provider: 'claude' });

      expect(await claudeWithKey.isAvailable()).toBe(true);
      expect(await claudeNoKey.isAvailable()).toBe(false);
    });
  });
});

describe('buildAnalysisPrompt', () => {
  test('includes page data', () => {
    const pageData = {
      url: 'https://example.com/',
      extracted: {
        meta: { title: 'Test Title', description: 'Test description' },
        headings: { h1: ['Main Heading'], h2: ['Sub 1', 'Sub 2'] },
        content: { wordCount: 500, paragraphs: 10, readingTime: '3 min' },
        ctas: [{ text: 'Sign Up', prominence: 'primary' }],
        components: { hero: true, testimonials: false }
      }
    };

    const prompt = buildAnalysisPrompt(pageData);

    expect(prompt).toContain('https://example.com/');
    expect(prompt).toContain('Test Title');
    expect(prompt).toContain('Main Heading');
    expect(prompt).toContain('500');
    expect(prompt).toContain('Sign Up');
    expect(prompt).toContain('JSON format');
  });

  test('handles missing extracted data', () => {
    const pageData = { url: 'https://example.com/' };

    const prompt = buildAnalysisPrompt(pageData);

    expect(prompt).toContain('https://example.com/');
    expect(prompt).toContain('Unknown'); // Default title
  });
});

describe('buildSynthesisPrompt', () => {
  test('includes site and page summaries', () => {
    const siteData = {
      site: 'example.com',
      pages: [
        { path: '/', title: 'Home', analysis: { scores: { overall: 75 } } },
        { path: '/about', title: 'About', analysis: { scores: { overall: 80 } } }
      ]
    };

    const prompt = buildSynthesisPrompt(siteData);

    expect(prompt).toContain('example.com');
    expect(prompt).toContain('2'); // Pages analyzed
    expect(prompt).toContain('75');
    expect(prompt).toContain('80');
  });
});

describe('buildComparisonPrompt', () => {
  test('includes all sites data', () => {
    const sitesData = [
      { site: 'mysite.com', role: 'primary', pages: [{ extracted: { components: { hero: true } } }] },
      { site: 'competitor.com', role: 'competitor', pages: [{ extracted: { components: { hero: true } } }] }
    ];

    const prompt = buildComparisonPrompt(sitesData);

    expect(prompt).toContain('mysite.com');
    expect(prompt).toContain('competitor.com');
    expect(prompt).toContain('primary');
    expect(prompt).toContain('competitor');
  });
});

describe('parseResponse', () => {
  test('parses valid JSON', () => {
    const response = '{"key": "value", "number": 42}';
    const result = parseResponse(response);
    
    expect(result).toEqual({ key: 'value', number: 42 });
  });

  test('removes markdown code blocks', () => {
    const response = '```json\n{"key": "value"}\n```';
    const result = parseResponse(response);
    
    expect(result).toEqual({ key: 'value' });
  });

  test('removes simple code blocks', () => {
    const response = '```\n{"key": "value"}\n```';
    const result = parseResponse(response);
    
    expect(result).toEqual({ key: 'value' });
  });

  test('handles whitespace', () => {
    const response = '  \n{"key": "value"}\n  ';
    const result = parseResponse(response);
    
    expect(result).toEqual({ key: 'value' });
  });

  test('throws on invalid JSON', () => {
    const response = 'not valid json';
    
    expect(() => parseResponse(response))
      .toThrow('Invalid JSON response from LLM');
  });
});
