// Sitemap Generator - Figma Plugin
// Creates a visual sitemap from screenshots

// Layout constants
const CARD_GAP = 80;
const LEVEL_GAP = 300;
const CARD_PADDING = 24;
const SCREENSHOT_GAP = 16;

// Colors
const COLORS = {
  cardBg: { r: 1, g: 1, b: 1 },
  cardStroke: { r: 0.9, g: 0.9, b: 0.9 },
  connector: { r: 0.8, g: 0.8, b: 0.8 },
  title: { r: 0.1, g: 0.1, b: 0.1 },
  url: { r: 0.5, g: 0.5, b: 0.5 }
};

figma.showUI(__html__, { width: 280, height: 280 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'create-sitemap') {
    try {
      await createSitemap(msg.site, msg.pages);
      figma.ui.postMessage({ type: 'done', count: msg.pages.length });
    } catch (err) {
      figma.ui.postMessage({ type: 'error', message: err.message });
    }
  }
};

async function createSitemap(site, pages) {
  // Load fonts
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  
  // Create main frame
  const mainFrame = figma.createFrame();
  mainFrame.name = `Sitemap - ${site}`;
  mainFrame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
  mainFrame.layoutMode = 'NONE';
  
  const pageCards = new Map();
  const pagesByDepth = new Map();
  
  for (const page of pages) {
    // Create card
    const card = figma.createFrame();
    card.name = page.title;
    card.fills = [{ type: 'SOLID', color: COLORS.cardBg }];
    card.strokes = [{ type: 'SOLID', color: COLORS.cardStroke }];
    card.strokeWeight = 1;
    card.cornerRadius = 12;
    card.layoutMode = 'VERTICAL';
    card.paddingTop = CARD_PADDING;
    card.paddingBottom = CARD_PADDING;
    card.paddingLeft = CARD_PADDING;
    card.paddingRight = CARD_PADDING;
    card.itemSpacing = 12;
    card.primaryAxisSizingMode = 'AUTO';
    card.counterAxisSizingMode = 'AUTO';
    
    // Title
    const title = figma.createText();
    title.characters = page.title;
    title.fontSize = 14;
    title.fontName = { family: "Inter", style: "Semi Bold" };
    title.fills = [{ type: 'SOLID', color: COLORS.title }];
    card.appendChild(title);
    
    // URL
    const url = figma.createText();
    url.characters = page.path;
    url.fontSize = 11;
    url.fontName = { family: "Inter", style: "Regular" };
    url.fills = [{ type: 'SOLID', color: COLORS.url }];
    card.appendChild(url);
    
    // Screenshots container
    const screenshotsContainer = figma.createFrame();
    screenshotsContainer.name = "Screenshots";
    screenshotsContainer.fills = [];
    screenshotsContainer.layoutMode = 'HORIZONTAL';
    screenshotsContainer.itemSpacing = SCREENSHOT_GAP;
    screenshotsContainer.primaryAxisSizingMode = 'AUTO';
    screenshotsContainer.counterAxisSizingMode = 'AUTO';
    
    // Desktop screenshot
    const desktopImage = figma.createImage(new Uint8Array(page.desktopImage));
    const desktopRect = figma.createRectangle();
    desktopRect.name = "Desktop";
    desktopRect.resize(page.desktopWidth, page.desktopHeight);
    desktopRect.fills = [{ type: 'IMAGE', imageHash: desktopImage.hash, scaleMode: 'FILL' }];
    desktopRect.cornerRadius = 4;
    screenshotsContainer.appendChild(desktopRect);
    
    // Mobile screenshot
    const mobileImage = figma.createImage(new Uint8Array(page.mobileImage));
    const mobileRect = figma.createRectangle();
    mobileRect.name = "Mobile";
    mobileRect.resize(page.mobileWidth, page.mobileHeight);
    mobileRect.fills = [{ type: 'IMAGE', imageHash: mobileImage.hash, scaleMode: 'FILL' }];
    mobileRect.cornerRadius = 4;
    screenshotsContainer.appendChild(mobileRect);
    
    card.appendChild(screenshotsContainer);
    mainFrame.appendChild(card);
    
    pageCards.set(page.slug, { card, page });
    
    if (!pagesByDepth.has(page.depth)) {
      pagesByDepth.set(page.depth, []);
    }
    pagesByDepth.get(page.depth).push(page.slug);
  }
  
  // Position cards in tree layout
  let currentY = CARD_PADDING;
  const positions = new Map();
  const depths = Array.from(pagesByDepth.keys()).sort((a, b) => a - b);
  
  for (const depth of depths) {
    const slugs = pagesByDepth.get(depth);
    let currentX = CARD_PADDING;
    let maxHeight = 0;
    
    // Group by parent
    const byParent = new Map();
    for (const slug of slugs) {
      const { page } = pageCards.get(slug);
      const parent = page.parent || '__root__';
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(slug);
    }
    
    for (const [parent, groupSlugs] of byParent) {
      let groupStartX = currentX;
      
      if (parent !== '__root__' && positions.has(parent)) {
        const parentPos = positions.get(parent);
        const parentCard = pageCards.get(parent).card;
        groupStartX = parentPos.x + (parentCard.width / 2);
        
        let totalChildrenWidth = 0;
        for (const slug of groupSlugs) {
          totalChildrenWidth += pageCards.get(slug).card.width + CARD_GAP;
        }
        totalChildrenWidth -= CARD_GAP;
        
        groupStartX = groupStartX - (totalChildrenWidth / 2);
        groupStartX = Math.max(currentX, groupStartX);
      }
      
      currentX = groupStartX;
      
      for (const slug of groupSlugs) {
        const { card } = pageCards.get(slug);
        card.x = currentX;
        card.y = currentY;
        positions.set(slug, { x: currentX, y: currentY });
        currentX += card.width + CARD_GAP;
        maxHeight = Math.max(maxHeight, card.height);
      }
      
      currentX += CARD_GAP;
    }
    
    currentY += maxHeight + LEVEL_GAP;
  }
  
  // Draw connectors using simple lines
  for (const [slug, { card, page }] of pageCards) {
    if (page.parent && pageCards.has(page.parent)) {
      const parentCard = pageCards.get(page.parent).card;
      
      const startX = parentCard.x + parentCard.width / 2;
      const startY = parentCard.y + parentCard.height;
      const endX = card.x + card.width / 2;
      const endY = card.y;
      
      // Create line using a simple connector (3 segments: down, across, down)
      const midY = startY + (endY - startY) / 2;
      
      // Vertical line from parent
      const line1 = figma.createLine();
      line1.x = startX;
      line1.y = startY;
      line1.rotation = -90;
      line1.resize(midY - startY, 0);
      line1.strokes = [{ type: 'SOLID', color: COLORS.connector }];
      line1.strokeWeight = 2;
      mainFrame.insertChild(0, line1);
      
      // Horizontal line
      if (Math.abs(endX - startX) > 1) {
        const line2 = figma.createLine();
        line2.x = Math.min(startX, endX);
        line2.y = midY;
        line2.resize(Math.abs(endX - startX), 0);
        line2.strokes = [{ type: 'SOLID', color: COLORS.connector }];
        line2.strokeWeight = 2;
        mainFrame.insertChild(0, line2);
      }
      
      // Vertical line to child
      const line3 = figma.createLine();
      line3.x = endX;
      line3.y = midY;
      line3.rotation = -90;
      line3.resize(endY - midY, 0);
      line3.strokes = [{ type: 'SOLID', color: COLORS.connector }];
      line3.strokeWeight = 2;
      mainFrame.insertChild(0, line3);
    }
  }
  
  // Resize main frame
  let maxX = 0, maxY = 0;
  for (const child of mainFrame.children) {
    if ('x' in child && 'width' in child) {
      maxX = Math.max(maxX, child.x + child.width);
    }
    if ('y' in child && 'height' in child) {
      maxY = Math.max(maxY, child.y + child.height);
    }
  }
  mainFrame.resize(maxX + CARD_PADDING, maxY + CARD_PADDING);
  
  figma.viewport.scrollAndZoomIntoView([mainFrame]);
}
