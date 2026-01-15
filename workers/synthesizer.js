/**
 * Synthesizer Worker - Site-wide and cross-site analysis
 * /workers/synthesizer.js
 */

const { LLMProvider, buildSynthesisPrompt, buildComparisonPrompt, parseResponse } = require('./llm');
const { getLLMConfig } = require('./analyzer');
const fs = require('fs').promises;
const path = require('path');

/**
 * Synthesize analysis for a single site
 */
async function synthesizeSite(siteData) {
  const llm = new LLMProvider(getLLMConfig());
  
  const available = await llm.isAvailable();
  if (!available) {
    console.warn('LLM not available, returning basic synthesis');
    return createBasicSynthesis(siteData);
  }
  
  const prompt = buildSynthesisPrompt(siteData);
  
  try {
    const response = await llm.complete(prompt, {
      temperature: 0.3,
      maxTokens: 2000
    });
    
    return parseResponse(response);
  } catch (error) {
    console.error('Synthesis failed:', error.message);
    return createBasicSynthesis(siteData);
  }
}

/**
 * Compare multiple sites
 */
async function compareSites(sitesData) {
  const llm = new LLMProvider(getLLMConfig());
  
  const available = await llm.isAvailable();
  if (!available) {
    console.warn('LLM not available, returning basic comparison');
    return createBasicComparison(sitesData);
  }
  
  const prompt = buildComparisonPrompt(sitesData);
  
  try {
    const response = await llm.complete(prompt, {
      temperature: 0.3,
      maxTokens: 3000
    });
    
    return parseResponse(response);
  } catch (error) {
    console.error('Comparison failed:', error.message);
    return createBasicComparison(sitesData);
  }
}

/**
 * Main synthesize handler
 */
async function synthesize(payload, job) {
  const { projectId, sites } = payload;
  const capturesDir = './captures';
  
  // Load all site data
  const sitesData = [];
  
  for (const siteUrl of sites) {
    const hostname = new URL(siteUrl).hostname;
    const siteDir = path.join(capturesDir, projectId, `site_${hostname}`);
    
    try {
      // Load sitemap
      const sitemapPath = path.join(siteDir, 'sitemap.json');
      const sitemap = JSON.parse(await fs.readFile(sitemapPath, 'utf-8'));
      
      // Load analysis if exists
      let analysis = { pages: [] };
      try {
        const analysisPath = path.join(siteDir, 'analysis.json');
        analysis = JSON.parse(await fs.readFile(analysisPath, 'utf-8'));
      } catch {
        // No analysis yet
      }
      
      // Merge sitemap and analysis
      const pages = sitemap.pages.map(page => {
        const pageAnalysis = analysis.pages?.find(a => a.page === page.path);
        return {
          ...page,
          analysis: pageAnalysis || null
        };
      });
      
      sitesData.push({
        site: hostname,
        url: siteUrl,
        role: sitesData.length === 0 ? 'primary' : 'competitor',
        pages
      });
    } catch (error) {
      console.error(`Failed to load site data for ${siteUrl}:`, error.message);
    }
  }
  
  if (sitesData.length === 0) {
    throw new Error('No site data found');
  }
  
  // Synthesize each site
  for (const siteData of sitesData) {
    const synthesis = await synthesizeSite(siteData);
    
    // Save site analysis with synthesis
    const siteDir = path.join(capturesDir, projectId, `site_${siteData.site}`);
    const analysisPath = path.join(siteDir, 'analysis.json');
    
    let analysis = { pages: [] };
    try {
      analysis = JSON.parse(await fs.readFile(analysisPath, 'utf-8'));
    } catch {
      // Create new
    }
    
    analysis.siteWide = synthesis.siteWide;
    analysis.synthesized_at = new Date().toISOString();
    
    await fs.writeFile(analysisPath, JSON.stringify(analysis, null, 2));
  }
  
  // If multiple sites, do comparison
  let comparison = null;
  if (sitesData.length > 1) {
    comparison = await compareSites(sitesData);
  }
  
  // Save synthesis.json
  const synthesisPath = path.join(capturesDir, projectId, 'synthesis.json');
  const synthesis = {
    project_id: projectId,
    synthesized_at: new Date().toISOString(),
    sites: {
      primary: sitesData[0].site,
      competitors: sitesData.slice(1).map(s => s.site)
    },
    ...(comparison || {})
  };
  
  await fs.writeFile(synthesisPath, JSON.stringify(synthesis, null, 2));
  
  return synthesis;
}

/**
 * Basic synthesis without LLM
 */
function createBasicSynthesis(siteData) {
  const pages = siteData.pages || [];
  
  // Aggregate scores
  const scores = pages
    .filter(p => p.analysis?.scores)
    .map(p => p.analysis.scores);
  
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.overall, 0) / scores.length)
    : 50;
  
  // Find common components
  const componentCounts = {};
  pages.forEach(p => {
    const components = p.extracted?.components || {};
    Object.keys(components).forEach(c => {
      if (components[c]) {
        componentCounts[c] = (componentCounts[c] || 0) + 1;
      }
    });
  });
  
  const commonComponents = Object.entries(componentCounts)
    .filter(([_, count]) => count > pages.length / 2)
    .map(([name]) => name);
  
  // Collect issues
  const allIssues = pages.flatMap(p => 
    p.analysis?.recommendations?.map(r => r.issue) || []
  );
  
  const issueCounts = {};
  allIssues.forEach(issue => {
    issueCounts[issue] = (issueCounts[issue] || 0) + 1;
  });
  
  const topIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([issue]) => issue);
  
  return {
    siteWide: {
      strengths: commonComponents.length > 3 
        ? ['Consistent component usage'] 
        : [],
      weaknesses: topIssues,
      patterns: {
        commonComponents,
        missingComponents: [],
        inconsistencies: []
      },
      overallScore: avgScore,
      topPriority: topIssues[0] || 'Continue monitoring'
    }
  };
}

/**
 * Basic comparison without LLM
 */
function createBasicComparison(sitesData) {
  const primary = sitesData[0];
  const competitors = sitesData.slice(1);
  
  // Calculate average scores
  const scores = sitesData.map(site => ({
    site: site.site,
    avgScore: site.pages.length > 0
      ? Math.round(
          site.pages
            .filter(p => p.analysis?.scores)
            .reduce((sum, p) => sum + p.analysis.scores.overall, 0) / 
          site.pages.filter(p => p.analysis?.scores).length
        )
      : 50
  }));
  
  const primaryScore = scores[0]?.avgScore || 50;
  const competitorAvg = scores.slice(1).length > 0
    ? Math.round(scores.slice(1).reduce((sum, s) => sum + s.avgScore, 0) / scores.slice(1).length)
    : 50;
  
  const position = primaryScore > competitorAvg + 10 ? 'leading'
    : primaryScore < competitorAvg - 10 ? 'lagging'
    : 'middle';
  
  return {
    comparison: {
      byFeature: {},
      insights: [
        `Primary site scores ${primaryScore} on average`,
        `Competitors average ${competitorAvg}`
      ]
    },
    recommendations: {
      quickWins: [],
      majorImprovements: []
    },
    summary: {
      overallPosition: position,
      biggestGap: 'Analysis requires LLM',
      biggestStrength: 'Analysis requires LLM',
      topPriority: 'Enable LLM for detailed analysis'
    }
  };
}

module.exports = {
  synthesize,
  synthesizeSite,
  compareSites,
  createBasicSynthesis,
  createBasicComparison
};
