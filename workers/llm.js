/**
 * LLM Provider - Abstraction for Ollama, Claude, and OpenAI
 * /workers/llm.js
 */

/**
 * LLM Provider class
 */
class LLMProvider {
  constructor(config = {}) {
    this.provider = config.provider || 'ollama';
    this.model = config.model || 'llama3.2';
    this.endpoint = config.endpoint || 'http://localhost:11434';
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.fallback = config.fallback || null;
  }

  /**
   * Send completion request to configured provider
   */
  async complete(prompt, options = {}) {
    try {
      switch (this.provider) {
        case 'ollama':
          return await this.completeOllama(prompt, options);
        case 'claude':
          return await this.completeClaude(prompt, options);
        case 'openai':
          return await this.completeOpenAI(prompt, options);
        default:
          throw new Error(`Unknown provider: ${this.provider}`);
      }
    } catch (error) {
      // Try fallback if configured
      if (this.fallback) {
        console.warn(`Primary LLM failed, trying fallback: ${error.message}`);
        const fallbackProvider = new LLMProvider(this.fallback);
        return await fallbackProvider.complete(prompt, options);
      }
      throw error;
    }
  }

  /**
   * Ollama completion
   */
  async completeOllama(prompt, options = {}) {
    const response = await fetch(`${this.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          num_predict: options.maxTokens || 2000
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  /**
   * Claude completion
   */
  async completeClaude(prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model || 'claude-sonnet-4-20250514',
        max_tokens: options.maxTokens || 2000,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * OpenAI completion
   */
  async completeOpenAI(prompt, options = {}) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.model || 'gpt-4o',
        max_tokens: options.maxTokens || 2000,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Check if provider is available
   */
  async isAvailable() {
    try {
      if (this.provider === 'ollama') {
        const response = await fetch(`${this.endpoint}/api/tags`);
        return response.ok;
      }
      // For cloud providers, assume available if API key exists
      if (this.provider === 'claude') {
        return !!this.apiKey;
      }
      if (this.provider === 'openai') {
        return !!process.env.OPENAI_API_KEY;
      }
      return false;
    } catch {
      return false;
    }
  }
}

/**
 * Page analysis prompt template
 * @param {Object} pageData - Page content and metadata
 * @param {Object} options - Analysis options
 * @param {string} options.rubric - Custom evaluation criteria
 * @param {Array} options.elements - Extracted elements with positions
 */
function buildAnalysisPrompt(pageData, options = {}) {
  const { rubric, elements } = options;
  
  // Build elements section if provided
  let elementsSection = '';
  if (elements && elements.length > 0) {
    const elementsSummary = elements.map(el => ({
      id: el.id,
      type: el.type,
      text: el.text?.substring(0, 50) || '',
      prominence: el.prominence || null
    }));
    elementsSection = `
ELEMENTS DETECTED (reference by ID in insights):
${JSON.stringify(elementsSummary, null, 2)}
`;
  }
  
  // Build rubric section if provided
  let rubricSection = '';
  if (rubric && rubric.trim()) {
    rubricSection = `
CUSTOM EVALUATION RUBRIC:
Evaluate the page against these specific criteria:
${rubric}

For each rubric item, generate an insight referencing relevant elements.
`;
  }
  
  return `Analyze this web page and provide structured insights.

PAGE DATA:
- URL: ${pageData.url}
- Title: ${pageData.extracted?.meta?.title || 'Unknown'}
- Meta Description: ${pageData.extracted?.meta?.description || 'None'}

HEADINGS:
${JSON.stringify(pageData.extracted?.headings || {}, null, 2)}

CONTENT STATS:
- Word Count: ${pageData.extracted?.content?.wordCount || 0}
- Paragraphs: ${pageData.extracted?.content?.paragraphs || 0}
- Reading Time: ${pageData.extracted?.content?.readingTime || 'Unknown'}

CTAs FOUND:
${JSON.stringify(pageData.extracted?.ctas || [], null, 2)}

COMPONENTS DETECTED:
${JSON.stringify(pageData.extracted?.components || {}, null, 2)}
${elementsSection}${rubricSection}
Provide analysis in this JSON format:
{
  "scores": {
    "overall": <0-100>,
    "content": <0-100>,
    "structure": <0-100>,
    "ux": <0-100>,
    "seo": <0-100>
  },
  "insights": [
    {
      "id": "ins_001",
      "elementRef": "<element ID or null if page-level>",
      "severity": "<good|warning|issue>",
      "category": "<content|structure|ux|seo|conversion|trust|accessibility>",
      "message": "<clear description of finding>",
      "suggestion": "<actionable recommendation>",
      "rubricMatch": "<which rubric item this addresses, or null>"
    }
  ],
  "analysis": {
    "content": {
      "purpose": "<awareness|consideration|conversion|support>",
      "tone": "<professional|casual|technical|friendly>",
      "clarity": "<poor|fair|good|excellent>"
    },
    "structure": {
      "hierarchy": "<poor|fair|good|excellent>",
      "visualFlow": "<description>"
    },
    "ux": {
      "ctaClarity": "<low|medium|high>",
      "cognitiveLoad": "<low|medium|high>"
    },
    "seo": {
      "titleOptimized": <true|false>,
      "metaDescription": <true|false>,
      "headingStructure": "<poor|fair|good|excellent>"
    }
  },
  "recommendations": [
    {
      "priority": "<high|medium|low>",
      "category": "<content|structure|ux|seo>",
      "issue": "<brief issue description>",
      "suggestion": "<specific actionable suggestion>",
      "impact": "<expected impact>"
    }
  ]
}

IMPORTANT:
- Generate 5-15 insights, referencing element IDs where applicable
- For each rubric item (if provided), include at least one insight
- Use severity: "good" for positive findings, "warning" for minor issues, "issue" for problems
- Be specific and actionable in suggestions

Respond ONLY with valid JSON, no other text.`;
}

/**
 * Site synthesis prompt template
 */
function buildSynthesisPrompt(siteData) {
  const pagesSummary = siteData.pages.map(p => ({
    path: p.path,
    title: p.title,
    score: p.analysis?.scores?.overall || 0,
    topIssues: p.analysis?.recommendations?.slice(0, 2) || []
  }));

  return `Synthesize insights across all pages of this website.

SITE: ${siteData.site}
PAGES ANALYZED: ${siteData.pages.length}

PAGE SUMMARIES:
${JSON.stringify(pagesSummary, null, 2)}

Provide site-wide synthesis in this JSON format:
{
  "siteWide": {
    "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
    "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"],
    "patterns": {
      "commonComponents": ["<component 1>", "<component 2>"],
      "missingComponents": ["<component 1>"],
      "inconsistencies": ["<inconsistency 1>"]
    },
    "overallScore": <0-100>,
    "topPriority": "<single most important improvement>"
  }
}

Respond ONLY with valid JSON, no other text.`;
}

/**
 * Competitor comparison prompt template
 */
function buildComparisonPrompt(sitesData) {
  const sitesSummary = sitesData.map(site => ({
    domain: site.site,
    role: site.role,
    pageCount: site.pages.length,
    avgScore: Math.round(
      site.pages.reduce((sum, p) => sum + (p.analysis?.scores?.overall || 0), 0) / site.pages.length
    ),
    components: site.pages[0]?.extracted?.components || {}
  }));

  return `Compare these websites and identify competitive opportunities.

SITES:
${JSON.stringify(sitesSummary, null, 2)}

Provide comparison in this JSON format:
{
  "comparison": {
    "byFeature": {
      "trustSignals": {
        "<domain1>": ["<signal1>", "<signal2>"],
        "<domain2>": ["<signal1>"]
      },
      "ctaStrategies": {
        "<domain1>": "<description>",
        "<domain2>": "<description>"
      }
    },
    "insights": ["<insight 1>", "<insight 2>"]
  },
  "recommendations": {
    "quickWins": [
      {
        "priority": 1,
        "effort": "<low|medium|high>",
        "impact": "<low|medium|high>",
        "action": "<specific action>",
        "evidence": "<why this matters>"
      }
    ],
    "majorImprovements": [
      {
        "priority": 2,
        "effort": "<low|medium|high>",
        "impact": "<low|medium|high>",
        "action": "<specific action>",
        "evidence": "<why this matters>"
      }
    ]
  },
  "summary": {
    "overallPosition": "<leading|middle|lagging>",
    "biggestGap": "<description>",
    "biggestStrength": "<description>",
    "topPriority": "<single most important action>"
  }
}

Respond ONLY with valid JSON, no other text.`;
}

/**
 * Parse LLM response as JSON
 */
function parseResponse(response) {
  // Try to extract JSON from response
  let jsonStr = response.trim();
  
  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  
  jsonStr = jsonStr.trim();
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse LLM response:', e.message);
    console.error('Response was:', response.substring(0, 500));
    throw new Error('Invalid JSON response from LLM');
  }
}

module.exports = {
  LLMProvider,
  buildAnalysisPrompt,
  buildSynthesisPrompt,
  buildComparisonPrompt,
  parseResponse
};
