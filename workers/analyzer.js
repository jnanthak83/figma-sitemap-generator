/**
 * Analyzer Worker - LLM-powered page analysis
 * /workers/analyzer.js
 */

const { LLMProvider, buildAnalysisPrompt, parseResponse } = require('./llm');

// Default LLM config
let llmConfig = {
  provider: 'ollama',
  model: 'llama3.2',
  endpoint: 'http://localhost:11434'
};

/**
 * Update LLM configuration
 */
function setLLMConfig(config) {
  llmConfig = { ...llmConfig, ...config };
}

/**
 * Get current LLM configuration
 */
function getLLMConfig() {
  return { ...llmConfig };
}

/**
 * Analyze a single page
 * @param {Object} payload - Analysis payload
 * @param {string} payload.projectId - Project ID
 * @param {string} payload.site - Site URL
 * @param {Object} payload.page - Page info
 * @param {Object} payload.extracted - Extracted content
 * @param {Array} payload.elements - Extracted elements with positions
 * @param {string} payload.rubric - Custom evaluation rubric
 */
async function analyzePage(payload, job) {
  const { projectId, site, page, extracted, elements, rubric } = payload;
  
  // Build page data for analysis
  const pageData = {
    url: page.url,
    path: page.path,
    title: page.title,
    extracted
  };
  
  // Create LLM provider
  const llm = new LLMProvider(llmConfig);
  
  // Check if LLM is available
  const available = await llm.isAvailable();
  if (!available) {
    console.warn('LLM not available, returning basic analysis');
    const basic = createBasicAnalysis(pageData, { elements, rubric });
    return { ...basic, site, page: page.path };
  }
  
  // Build and send prompt with rubric and elements
  const prompt = buildAnalysisPrompt(pageData, { rubric, elements });
  
  try {
    const response = await llm.complete(prompt, {
      temperature: 0.3, // Lower temperature for more consistent JSON
      maxTokens: 3000   // Increased for insights array
    });
    
    const analysis = parseResponse(response);
    
    return {
      page: page.path,
      site,
      ...analysis,
      rubric: rubric || null,
      llm: {
        provider: llmConfig.provider,
        model: llmConfig.model
      }
    };
    
  } catch (error) {
    console.error('Analysis failed:', error.message);
    // Return basic analysis on failure
    const basic = createBasicAnalysis(pageData, { elements, rubric });
    return { ...basic, site, page: page.path };
  }
}

/**
 * Create basic analysis without LLM (fallback)
 * Generates insights referencing elements when available
 */
function createBasicAnalysis(pageData, options = {}) {
  const { elements, rubric } = options;
  const extracted = pageData.extracted || {};
  const meta = extracted.meta || {};
  const headings = extracted.headings || {};
  const content = extracted.content || {};
  const ctas = extracted.ctas || [];
  const components = extracted.components || {};
  
  // Calculate basic scores
  let seoScore = 50;
  if (meta.title && meta.title.length > 10 && meta.title.length < 60) seoScore += 15;
  if (meta.description && meta.description.length > 50) seoScore += 15;
  if (headings.h1?.length === 1) seoScore += 10;
  if (headings.h2?.length > 0) seoScore += 10;
  
  let contentScore = 50;
  if (content.wordCount > 300) contentScore += 20;
  if (content.wordCount > 600) contentScore += 10;
  if (headings.h2?.length > 2) contentScore += 10;
  if (headings.h3?.length > 0) contentScore += 10;
  
  let uxScore = 50;
  if (ctas.length > 0) uxScore += 20;
  if (ctas.some(c => c.prominence === 'primary')) uxScore += 15;
  if (components.hero) uxScore += 10;
  if (components.footer) uxScore += 5;
  
  let structureScore = 50;
  if (components.header) structureScore += 15;
  if (components.footer) structureScore += 10;
  if (headings.h1?.length === 1 && headings.h2?.length > 0) structureScore += 15;
  if (extracted.navigation?.primary?.length > 0) structureScore += 10;
  
  const overall = Math.round((seoScore + contentScore + uxScore + structureScore) / 4);
  
  // Generate insights with element references
  const insights = [];
  let insightId = 1;
  
  const addInsight = (severity, category, message, suggestion, elementRef = null, rubricMatch = null) => {
    insights.push({
      id: `ins_${String(insightId++).padStart(3, '0')}`,
      elementRef,
      severity,
      category,
      message,
      suggestion,
      rubricMatch
    });
  };
  
  // SEO insights
  if (meta.title && meta.title.length > 10 && meta.title.length < 60) {
    addInsight('good', 'seo', 'Page title is well-optimized', 'Keep title between 50-60 characters');
  } else if (!meta.title) {
    addInsight('issue', 'seo', 'Missing page title', 'Add a descriptive title tag');
  } else {
    addInsight('warning', 'seo', 'Page title length could be improved', 'Aim for 50-60 characters');
  }
  
  if (!meta.description) {
    addInsight('issue', 'seo', 'Missing meta description', 'Add a meta description of 150-160 characters');
  } else if (meta.description.length > 50) {
    addInsight('good', 'seo', 'Has meta description', 'Consider A/B testing different descriptions');
  }
  
  // Heading insights with element references
  if (elements && elements.length > 0) {
    const h1Elements = elements.filter(el => el.type === 'heading' && el.level === 1);
    if (h1Elements.length === 1) {
      addInsight('good', 'structure', 'Single H1 heading present', 'Good heading hierarchy', h1Elements[0].id);
    } else if (h1Elements.length === 0) {
      addInsight('issue', 'structure', 'No H1 heading found', 'Add a primary H1 heading');
    } else {
      addInsight('warning', 'structure', `Multiple H1 headings (${h1Elements.length})`, 'Use only one H1 per page', h1Elements[0].id);
    }
  } else if (headings.h1?.length !== 1) {
    addInsight('issue', 'structure', 'Should have exactly one H1', 'Add a single H1 heading');
  }
  
  // CTA insights with element references
  if (elements && elements.length > 0) {
    const ctaElements = elements.filter(el => el.type === 'cta');
    const primaryCtas = ctaElements.filter(el => el.prominence === 'primary');
    
    if (primaryCtas.length > 0) {
      addInsight('good', 'conversion', 'Primary CTA detected', 'Test different CTA copy for conversions', primaryCtas[0].id);
    } else if (ctaElements.length > 0) {
      addInsight('warning', 'conversion', 'No primary CTA prominence', 'Make your main CTA more visually prominent', ctaElements[0].id);
    } else {
      addInsight('issue', 'conversion', 'No clear CTAs detected', 'Add call-to-action buttons');
    }
  } else if (ctas.length === 0) {
    addInsight('issue', 'conversion', 'No clear CTAs detected', 'Add call-to-action buttons');
  }
  
  // Component insights
  if (!components.hero) {
    addInsight('warning', 'ux', 'No hero section detected', 'Consider adding a prominent hero section');
  } else {
    addInsight('good', 'ux', 'Hero section present', 'Ensure hero has clear value proposition');
  }
  
  if (components.testimonials) {
    const trustEl = elements?.find(el => el.type === 'trust');
    addInsight('good', 'trust', 'Social proof elements found', 'Consider adding more specific testimonials', trustEl?.id);
  } else {
    addInsight('warning', 'trust', 'No testimonials or social proof', 'Add customer testimonials or trust badges');
  }
  
  // Navigation insights
  if (elements && elements.length > 0) {
    const navElements = elements.filter(el => el.type === 'nav');
    if (navElements.length > 0) {
      addInsight('good', 'structure', 'Navigation structure detected', 'Ensure nav is accessible on mobile', navElements[0].id);
    }
  }
  
  // Form insights
  if (elements && elements.length > 0) {
    const formElements = elements.filter(el => el.type === 'form');
    if (formElements.length > 0) {
      addInsight('good', 'conversion', `${formElements.length} form(s) detected`, 'Minimize form fields for better conversion', formElements[0].id);
    }
  }
  
  // Rubric-based insights (basic matching)
  if (rubric) {
    const rubricLines = rubric.split('\n').filter(line => line.trim().startsWith('-'));
    rubricLines.forEach(line => {
      const criterion = line.replace(/^-\s*/, '').trim().toLowerCase();
      
      if (criterion.includes('cta') && criterion.includes('above the fold')) {
        const primaryCta = elements?.find(el => el.type === 'cta' && el.prominence === 'primary');
        if (primaryCta && primaryCta.desktop?.y < 800) {
          addInsight('good', 'conversion', 'Primary CTA is above the fold', 'CTA is well-positioned', primaryCta.id, line.trim());
        } else {
          addInsight('warning', 'conversion', 'Primary CTA may not be above the fold', 'Move main CTA higher on page', primaryCta?.id, line.trim());
        }
      }
      
      if (criterion.includes('trust') || criterion.includes('logo') || criterion.includes('badge')) {
        const trustEl = elements?.find(el => el.type === 'trust');
        if (trustEl || components.socialProof) {
          addInsight('good', 'trust', 'Trust signals present', 'Consider adding more social proof', trustEl?.id, line.trim());
        } else {
          addInsight('issue', 'trust', 'No trust signals found', 'Add customer logos or security badges', null, line.trim());
        }
      }
      
      if (criterion.includes('mobile') || criterion.includes('navigation')) {
        const navEl = elements?.find(el => el.type === 'nav');
        if (navEl && navEl.mobile) {
          addInsight('good', 'accessibility', 'Mobile navigation detected', 'Test nav usability on various devices', navEl.id, line.trim());
        } else {
          addInsight('warning', 'accessibility', 'Mobile navigation unclear', 'Ensure nav is touch-friendly', navEl?.id, line.trim());
        }
      }
      
      if (criterion.includes('pricing')) {
        if (components.pricing) {
          addInsight('good', 'conversion', 'Pricing section detected', 'Ensure pricing is clear and transparent', null, line.trim());
        } else {
          addInsight('warning', 'conversion', 'No pricing section found', 'Consider adding visible pricing if applicable', null, line.trim());
        }
      }
    });
  }
  
  // Build recommendations from top issues
  const issueInsights = insights.filter(i => i.severity === 'issue').slice(0, 3);
  const recommendations = issueInsights.map((insight, i) => ({
    priority: i === 0 ? 'high' : 'medium',
    category: insight.category,
    issue: insight.message,
    suggestion: insight.suggestion,
    impact: 'Improved page quality'
  }));
  
  return {
    page: pageData.path,
    scores: {
      overall,
      content: contentScore,
      structure: structureScore,
      ux: uxScore,
      seo: seoScore
    },
    insights,
    analysis: {
      content: {
        purpose: 'unknown',
        tone: 'unknown',
        clarity: overall > 70 ? 'good' : overall > 50 ? 'fair' : 'poor'
      },
      structure: {
        hierarchy: headings.h1?.length === 1 ? 'good' : 'poor',
        visualFlow: 'unknown'
      },
      ux: {
        ctaClarity: ctas.length > 0 ? 'medium' : 'low',
        cognitiveLoad: content.wordCount > 1000 ? 'high' : 'medium'
      },
      seo: {
        titleOptimized: meta.title?.length > 10,
        metaDescription: !!meta.description,
        headingStructure: headings.h1?.length === 1 ? 'good' : 'poor'
      }
    },
    recommendations,
    rubric: rubric || null,
    llm: {
      provider: 'basic',
      model: 'heuristic'
    }
  };
}

module.exports = {
  analyzePage,
  setLLMConfig,
  getLLMConfig,
  createBasicAnalysis
};
