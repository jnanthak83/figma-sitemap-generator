/**
 * Scanner Worker - Screenshot capture + content extraction
 * /workers/scanner.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/**
 * Scanner configuration
 */
const CONFIG = {
  desktopViewport: { width: 1920, height: 1080 },
  mobileViewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  scrollStep: 500,
  scrollDelay: 150,
  timeout: 15000
};

/**
 * Browser instance management
 */
let browserInstance = null;

/**
 * Get or create browser instance
 */
async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserInstance;
}

/**
 * Close browser instance
 */
async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Extract content from page using Playwright
 */
async function extractContent(page) {
  return await page.evaluate(() => {
    const getText = (el) => el?.textContent?.trim() || '';
    const getAttr = (el, attr) => el?.getAttribute(attr) || '';
    
    // Meta tags
    const meta = {
      title: document.title,
      description: getAttr(document.querySelector('meta[name="description"]'), 'content'),
      ogTitle: getAttr(document.querySelector('meta[property="og:title"]'), 'content'),
      ogDescription: getAttr(document.querySelector('meta[property="og:description"]'), 'content'),
      ogImage: getAttr(document.querySelector('meta[property="og:image"]'), 'content'),
      canonical: getAttr(document.querySelector('link[rel="canonical"]'), 'href')
    };
    
    // Headings
    const headings = {
      h1: Array.from(document.querySelectorAll('h1')).map(getText).filter(Boolean),
      h2: Array.from(document.querySelectorAll('h2')).map(getText).filter(Boolean),
      h3: Array.from(document.querySelectorAll('h3')).map(getText).filter(Boolean),
      h4: Array.from(document.querySelectorAll('h4')).map(getText).filter(Boolean),
      h5: Array.from(document.querySelectorAll('h5')).map(getText).filter(Boolean),
      h6: Array.from(document.querySelectorAll('h6')).map(getText).filter(Boolean)
    };
    
    // Main content
    const mainContent = document.querySelector('main') || 
                        document.querySelector('article') || 
                        document.querySelector('[role="main"]') ||
                        document.body;
    
    const textContent = mainContent?.innerText || '';
    const words = textContent.split(/\s+/).filter(Boolean);
    
    const content = {
      wordCount: words.length,
      paragraphs: document.querySelectorAll('p').length,
      readingTime: Math.ceil(words.length / 200) + ' min',
      mainText: textContent.substring(0, 500) + (textContent.length > 500 ? '...' : '')
    };
    
    // CTAs
    const ctas = [];
    document.querySelectorAll('button, a.btn, a.button, [role="button"], .cta').forEach(el => {
      const text = getText(el);
      if (text && text.length < 50) {
        const href = getAttr(el, 'href');
        const classes = el.className || '';
        let prominence = 'secondary';
        if (classes.includes('primary') || classes.includes('main') || 
            el.matches('header button, header a.btn, .hero button, .hero a.btn')) {
          prominence = 'primary';
        }
        ctas.push({ text, href, prominence });
      }
    });
    
    // Navigation
    const navigation = { primary: [], footer: [] };
    const headerNav = document.querySelector('header nav, nav.main-nav, nav.primary');
    if (headerNav) {
      navigation.primary = Array.from(headerNav.querySelectorAll('a'))
        .map(getText).filter(t => t && t.length < 30);
    }
    const footerNav = document.querySelector('footer nav, footer');
    if (footerNav) {
      navigation.footer = Array.from(footerNav.querySelectorAll('a'))
        .map(getText).filter(t => t && t.length < 30).slice(0, 20);
    }
    
    // Images
    const images = Array.from(document.querySelectorAll('img')).slice(0, 20).map(img => ({
      src: img.src,
      alt: img.alt || '',
      dimensions: img.naturalWidth ? `${img.naturalWidth}x${img.naturalHeight}` : 'unknown'
    }));
    
    // Forms
    const forms = Array.from(document.querySelectorAll('form')).slice(0, 10).map(form => ({
      id: form.id || null,
      action: form.action || null,
      method: form.method || 'get',
      fields: Array.from(form.querySelectorAll('input, select, textarea'))
        .map(f => f.name || f.type).filter(Boolean)
    }));
    
    // Components
    const components = {
      hero: !!document.querySelector('.hero, [class*="hero"], section:first-of-type'),
      testimonials: !!document.querySelector('[class*="testimonial"], [class*="review"], blockquote'),
      pricing: !!document.querySelector('[class*="pricing"], [class*="plans"], .price'),
      faq: !!document.querySelector('[class*="faq"], [class*="accordion"], details'),
      footer: !!document.querySelector('footer'),
      header: !!document.querySelector('header'),
      sidebar: !!document.querySelector('aside, [class*="sidebar"]'),
      carousel: !!document.querySelector('[class*="carousel"], [class*="slider"], .swiper'),
      video: !!document.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"]'),
      socialProof: !!document.querySelector('[class*="logo"], [class*="client"], [class*="partner"]')
    };
    
    return { meta, headings, content, ctas: ctas.slice(0, 10), navigation, images, forms, components };
  });
}

/**
 * Extract element positions for annotations
 * Returns array of elements with bounding boxes
 */
async function extractElements(page, viewport) {
  return await page.evaluate((vp) => {
    const elements = [];
    let idCounter = 1;
    
    // Helper to get unique ID
    const getId = () => `el_${String(idCounter++).padStart(3, '0')}`;
    
    // Helper to get bounding box
    const getBox = (el) => {
      const rect = el.getBoundingClientRect();
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const scrollX = window.scrollX || document.documentElement.scrollLeft;
      return {
        x: Math.round(rect.left + scrollX),
        y: Math.round(rect.top + scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    
    // Helper to check if visible
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && 
             style.display !== 'none' && 
             style.visibility !== 'hidden' &&
             style.opacity !== '0';
    };
    
    // Helper to get clean text
    const getText = (el) => el?.textContent?.trim().substring(0, 100) || '';
    
    // Helper to build selector
    const getSelector = (el) => {
      if (el.id) return `#${el.id}`;
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(' ').filter(c => c && !c.match(/^[0-9]/)).slice(0, 2);
        if (classes.length) selector += '.' + classes.join('.');
      }
      return selector;
    };
    
    // Extract headings (h1-h3)
    document.querySelectorAll('h1, h2, h3').forEach(el => {
      if (!isVisible(el)) return;
      const text = getText(el);
      if (!text) return;
      elements.push({
        id: getId(),
        type: 'heading',
        level: parseInt(el.tagName[1]),
        text,
        selector: getSelector(el),
        [vp]: getBox(el)
      });
    });
    
    // Extract CTAs (buttons and link buttons)
    document.querySelectorAll('button, a.btn, a.button, [role="button"], .cta, a[class*="btn"]').forEach(el => {
      if (!isVisible(el)) return;
      const text = getText(el);
      if (!text || text.length > 50) return;
      
      // Determine prominence
      const classes = el.className || '';
      const inHero = !!el.closest('.hero, [class*="hero"], section:first-of-type');
      const inHeader = !!el.closest('header');
      let prominence = 'secondary';
      if (classes.includes('primary') || inHero || inHeader) prominence = 'primary';
      
      elements.push({
        id: getId(),
        type: 'cta',
        text,
        prominence,
        href: el.href || null,
        selector: getSelector(el),
        [vp]: getBox(el)
      });
    });
    
    // Extract forms
    document.querySelectorAll('form').forEach(el => {
      if (!isVisible(el)) return;
      const fields = Array.from(el.querySelectorAll('input, select, textarea'))
        .map(f => f.name || f.placeholder || f.type)
        .filter(Boolean);
      elements.push({
        id: getId(),
        type: 'form',
        fields,
        action: el.action || null,
        selector: getSelector(el),
        [vp]: getBox(el)
      });
    });
    
    // Extract navigation
    document.querySelectorAll('nav, [role="navigation"]').forEach(el => {
      if (!isVisible(el)) return;
      const links = Array.from(el.querySelectorAll('a')).map(a => getText(a)).filter(Boolean);
      if (links.length === 0) return;
      const inHeader = !!el.closest('header');
      elements.push({
        id: getId(),
        type: 'nav',
        location: inHeader ? 'header' : 'other',
        links: links.slice(0, 10),
        selector: getSelector(el),
        [vp]: getBox(el)
      });
    });
    
    // Extract hero images (large images in first viewport)
    document.querySelectorAll('img').forEach(el => {
      if (!isVisible(el)) return;
      const rect = el.getBoundingClientRect();
      // Only capture significant images (> 200px wide, in first 1000px)
      if (rect.width < 200 || rect.top > 1000) return;
      elements.push({
        id: getId(),
        type: 'image',
        alt: el.alt || '',
        src: el.src?.substring(0, 100) || '',
        selector: getSelector(el),
        [vp]: getBox(el)
      });
    });
    
    // Extract trust signals (logos, badges)
    document.querySelectorAll('[class*="logo"], [class*="client"], [class*="partner"], [class*="trust"], [class*="badge"]').forEach(el => {
      if (!isVisible(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 30 || rect.height < 30) return;
      elements.push({
        id: getId(),
        type: 'trust',
        text: getText(el).substring(0, 50),
        selector: getSelector(el),
        [vp]: getBox(el)
      });
    });
    
    return elements;
  }, viewport);
}

/**
 * Merge element arrays from desktop and mobile
 * Matches by selector, combines viewport data
 */
function mergeElements(desktopEls, mobileEls) {
  const merged = [];
  const mobileMap = new Map();
  
  // Index mobile elements by selector+type+text for matching
  mobileEls.forEach(el => {
    const key = `${el.type}|${el.selector}|${el.text || ''}`;
    mobileMap.set(key, el);
  });
  
  // Start with desktop elements, add mobile data
  desktopEls.forEach(el => {
    const key = `${el.type}|${el.selector}|${el.text || ''}`;
    const mobileMatch = mobileMap.get(key);
    
    if (mobileMatch && mobileMatch.mobile) {
      el.mobile = mobileMatch.mobile;
      mobileMap.delete(key); // Mark as used
    }
    merged.push(el);
  });
  
  // Add remaining mobile-only elements
  mobileMap.forEach(el => {
    // Generate new ID for mobile-only elements
    el.id = `el_m${el.id.slice(3)}`;
    merged.push(el);
  });
  
  return merged;
}

/**
 * Scroll through page to trigger lazy loading
 */
async function warmUpScroll(page, scrollDelay) {
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  
  for (let y = 0; y < scrollHeight; y += CONFIG.scrollStep) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(scrollDelay);
  }
  
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

/**
 * Main scan handler
 */
async function scanPage(payload, job) {
  const { projectId, site, page: pageInfo, options } = payload;
  const browser = await getBrowser();
  
  const context = await browser.newContext({
    viewport: CONFIG.desktopViewport,
    deviceScaleFactor: CONFIG.deviceScaleFactor,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  const results = {
    page: pageInfo,
    screenshots: {},
    extracted: null,
    elements: [],
    timing: {}
  };
  
  let desktopElements = [];
  let mobileElements = [];
  
  try {
    const startTime = Date.now();
    
    // Navigate
    await page.goto(pageInfo.url, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.timeout
    });
    await page.waitForTimeout(1000);
    
    // Warm-up scroll
    const scrollDelay = options?.scrollDelay || CONFIG.scrollDelay;
    await warmUpScroll(page, scrollDelay);
    
    // Extract content
    results.extracted = await extractContent(page);
    results.timing.extraction = Date.now() - startTime;
    
    // Generate file paths
    const hostname = new URL(site).hostname;
    const pageSlug = pageInfo.path === '/' ? 'home' : 
      pageInfo.path.replace(/^\/|\/$/g, '').replace(/\//g, '_').replace(/[^a-z0-9_-]/gi, '');
    
    const basePath = path.join(__dirname, '..', 'captures', projectId, `site_${hostname}`, 'screenshots');
    
    // Ensure directory exists
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
    }
    
    // Desktop capture + element extraction
    if (options?.captureDesktop !== false) {
      const desktopPath = path.join(basePath, `${pageSlug}_desktop.png`);
      await page.setViewportSize(CONFIG.desktopViewport);
      await page.waitForTimeout(300);
      
      // Extract element positions for desktop
      desktopElements = await extractElements(page, 'desktop');
      
      await page.screenshot({ path: desktopPath, fullPage: true, type: 'png' });
      results.screenshots.desktop = desktopPath;
    }
    
    // Mobile capture + element extraction
    if (options?.captureMobile !== false) {
      const mobilePath = path.join(basePath, `${pageSlug}_mobile.png`);
      await page.setViewportSize(CONFIG.mobileViewport);
      await page.waitForTimeout(300);
      
      // Extract element positions for mobile
      mobileElements = await extractElements(page, 'mobile');
      
      await page.screenshot({ path: mobilePath, fullPage: true, type: 'png' });
      results.screenshots.mobile = mobilePath;
    }
    
    // Merge desktop and mobile element data
    results.elements = mergeElements(desktopElements, mobileElements);
    
    results.timing.total = Date.now() - startTime;
    
  } finally {
    await page.close();
    await context.close();
  }
  
  return results;
}

/**
 * Discover pages on a site
 */
async function discoverPages(payload, job) {
  const { site, options } = payload;
  const browser = await getBrowser();
  
  const context = await browser.newContext({
    viewport: CONFIG.desktopViewport,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  const pages = [];
  const visited = new Set();
  
  try {
    const baseUrl = new URL(site);
    
    await page.goto(site, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.timeout
    });
    
    // Extract navigation links
    const links = await page.evaluate((baseHost) => {
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      
      return allLinks.map(a => {
        try {
          const url = new URL(a.href, window.location.origin);
          if (url.hostname !== baseHost) return null;
          if (url.hash || url.pathname.match(/\.(pdf|jpg|png|gif|zip|doc)$/i)) return null;
          
          return {
            url: url.href,
            path: url.pathname,
            text: a.textContent?.trim() || '',
            inNav: !!a.closest('nav, header, [role="navigation"]')
          };
        } catch { return null; }
      }).filter(Boolean);
    }, baseUrl.hostname);
    
    // Dedupe and prioritize
    const seen = new Set();
    const uniqueLinks = links.filter(link => {
      if (seen.has(link.path)) return false;
      seen.add(link.path);
      return true;
    });
    
    uniqueLinks.sort((a, b) => {
      if (a.inNav && !b.inNav) return -1;
      if (!a.inNav && b.inNav) return 1;
      return a.path.length - b.path.length;
    });
    
    // Add homepage
    pages.push({
      url: site,
      path: '/',
      title: await page.title(),
      slug: 'home',
      depth: 0,
      parent: null,
      status: 'pending'
    });
    visited.add('/');
    
    const maxPages = options?.maxPages || 50;
    const maxDepth = options?.maxDepth || 3;
    
    for (const link of uniqueLinks) {
      if (pages.length >= maxPages) break;
      if (visited.has(link.path)) continue;
      
      const depth = link.path.split('/').filter(Boolean).length;
      if (depth > maxDepth) continue;
      
      const pathParts = link.path.split('/').filter(Boolean);
      let parent = 'home';
      if (pathParts.length > 1) {
        const parentPath = '/' + pathParts.slice(0, -1).join('/');
        const parentPage = pages.find(p => p.path === parentPath);
        if (parentPage) parent = parentPage.slug;
      }
      
      const slug = pathParts.join('-') || link.path.replace(/[^a-z0-9]/gi, '-');
      
      pages.push({
        url: link.url,
        path: link.path,
        title: link.text || link.path,
        slug,
        depth,
        parent,
        status: 'pending'
      });
      visited.add(link.path);
    }
    
  } finally {
    await page.close();
    await context.close();
  }
  
  return { pages };
}

module.exports = {
  scanPage,
  discoverPages,
  extractContent,
  extractElements,
  mergeElements,
  closeBrowser,
  CONFIG
};
