// Sitemap Generator - Figma Plugin
// Creates a visual sitemap from screenshots with tiled image support

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

figma.showUI(__html__, { width: 300, height: 340 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'create-sitemap') {
    try {
      await createSitemap(msg.site, msg.pages);
      figma.ui.postMessage({ type: 'done', count: msg.pages.length });
    } catch (err) {
      console.error(err);
      figma.ui.postMessage({ type: 'error', message: err.message });
    }
  }
};

async function createSitemap(site, pages) {
  // Create parent frame
  const frame = figma.createFrame();
  frame.name = `Sitemap - ${site}`;
  frame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];

  // Load font
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });

  // Group pages by depth
  const pagesByDepth = new Map();
  pages.forEach(page => {
    const depth = page.depth || 0;
    if (!pagesByDepth.has(depth)) {
      pagesByDepth.set(depth, []);
    }
    pagesByDepth.get(depth).push(page);
  });

  // Calculate card dimensions based on first page
  const firstPage = pages[0];
  const desktopW = firstPage.desktopWidth || 300;
  const desktopH = firstPage.desktopHeight || 200;
  const mobileW = firstPage.mobileWidth || 90;
  const mobileH = firstPage.mobileHeight || 200;
  
  const cardWidth = CARD_PADDING * 2 + desktopW + SCREENSHOT_GAP + mobileW;
  const cardHeight = CARD_PADDING * 2 + 50 + Math.max(desktopH, mobileH);

  // Track card positions for connectors
  const cardPositions = new Map();
  const cards = [];
  
  let yOffset = 0;

  // Sort depths
  const depths = Array.from(pagesByDepth.keys()).sort((a, b) => a - b);

  for (const depth of depths) {
    const depthPages = pagesByDepth.get(depth);
    
    // Group by parent
    const byParent = new Map();
    depthPages.forEach(page => {
      const parent = page.parent || 'root';
      if (!byParent.has(parent)) {
        byParent.set(parent, []);
      }
      byParent.get(parent).push(page);
    });

    // Calculate total width needed
    let totalWidth = 0;
    byParent.forEach((children) => {
      totalWidth += children.length * (cardWidth + CARD_GAP);
    });
    totalWidth -= CARD_GAP;

    let xOffset = -totalWidth / 2;

    for (const [parentSlug, children] of byParent) {
      for (const page of children) {
        const card = await createCard(page, xOffset, yOffset, cardWidth, cardHeight);
        frame.appendChild(card);
        cards.push(card);
        
        cardPositions.set(page.slug, {
          x: xOffset + cardWidth / 2,
          y: yOffset,
          width: cardWidth,
          height: cardHeight,
          parent: page.parent
        });

        xOffset += cardWidth + CARD_GAP;
      }
    }

    yOffset += cardHeight + LEVEL_GAP;
  }

  // Draw connectors
  for (const [slug, pos] of cardPositions) {
    if (pos.parent && cardPositions.has(pos.parent)) {
      const parentPos = cardPositions.get(pos.parent);
      const connector = createConnector(
        parentPos.x, parentPos.y + parentPos.height,
        pos.x, pos.y
      );
      frame.insertChild(0, connector);
    }
  }

  // Resize frame to fit content
  const bounds = getBounds(cards);
  frame.resize(
    bounds.width + 200,
    bounds.height + 200
  );
  
  // Center content in frame
  cards.forEach(card => {
    card.x += 100 - bounds.minX;
    card.y += 100 - bounds.minY;
  });

  // Reposition connectors
  for (let i = 0; i < frame.children.length; i++) {
    const child = frame.children[i];
    if (child.type === 'LINE' || child.type === 'GROUP') {
      child.x += 100 - bounds.minX;
      child.y += 100 - bounds.minY;
    }
  }

  // Position and select
  frame.x = figma.viewport.center.x - frame.width / 2;
  frame.y = figma.viewport.center.y - frame.height / 2;
  
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
}

// Create a card with tiled images
async function createCard(page, x, y, width, height) {
  const card = figma.createFrame();
  card.name = page.title || page.slug;
  card.x = x;
  card.y = y;
  card.resize(width, height);
  card.fills = [{ type: 'SOLID', color: COLORS.cardBg }];
  card.strokes = [{ type: 'SOLID', color: COLORS.cardStroke }];
  card.strokeWeight = 1;
  card.cornerRadius = 8;

  // Title
  const title = figma.createText();
  title.characters = page.title || page.slug;
  title.fontSize = 16;
  title.fontName = { family: "Inter", style: "Bold" };
  title.fills = [{ type: 'SOLID', color: COLORS.title }];
  title.x = CARD_PADDING;
  title.y = CARD_PADDING;
  card.appendChild(title);

  // URL
  const url = figma.createText();
  url.characters = page.path || '/';
  url.fontSize = 12;
  url.fontName = { family: "Inter", style: "Regular" };
  url.fills = [{ type: 'SOLID', color: COLORS.url }];
  url.x = CARD_PADDING;
  url.y = CARD_PADDING + 24;
  card.appendChild(url);

  const screenshotY = CARD_PADDING + 50;
  let screenshotX = CARD_PADDING;

  // Desktop screenshot (with tiles support)
  if (page.desktopTiles && page.desktopTiles.length > 0) {
    const desktopGroup = await createTiledImage(
      page.desktopTiles, 
      page.desktopWidth, 
      page.desktopHeight,
      'Desktop'
    );
    desktopGroup.x = screenshotX;
    desktopGroup.y = screenshotY;
    card.appendChild(desktopGroup);
    screenshotX += page.desktopWidth + SCREENSHOT_GAP;
  }

  // Mobile screenshot (with tiles support)
  if (page.mobileTiles && page.mobileTiles.length > 0) {
    const mobileGroup = await createTiledImage(
      page.mobileTiles,
      page.mobileWidth,
      page.mobileHeight,
      'Mobile'
    );
    mobileGroup.x = screenshotX;
    mobileGroup.y = screenshotY;
    card.appendChild(mobileGroup);
  }

  return card;
}

// Create image from tiles (like Insert Big Image)
async function createTiledImage(tiles, totalWidth, totalHeight, name) {
  const imageNodes = [];
  
  for (const tile of tiles) {
    const rect = figma.createRectangle();
    rect.name = 'Image Tile';
    rect.x = tile.x;
    rect.y = tile.y;
    rect.resize(tile.width, tile.height);
    
    // Create image from bytes
    const imageHash = figma.createImage(new Uint8Array(tile.bytes)).hash;
    rect.fills = [{
      type: 'IMAGE',
      imageHash: imageHash,
      scaleMode: 'FILL'
    }];
    
    imageNodes.push(rect);
  }
  
  // Group tiles if multiple
  if (imageNodes.length === 1) {
    imageNodes[0].name = name;
    return imageNodes[0];
  }
  
  const group = figma.group(imageNodes, figma.currentPage);
  group.name = name;
  return group;
}

function createConnector(x1, y1, x2, y2) {
  const midY = y1 + (y2 - y1) / 2;
  
  // Create 3-segment path: vertical, horizontal, vertical
  const lines = [];
  
  // Top vertical segment
  const line1 = figma.createLine();
  line1.x = x1;
  line1.y = y1;
  line1.resize(0, midY - y1);
  line1.rotation = -90;
  line1.strokes = [{ type: 'SOLID', color: COLORS.connector }];
  line1.strokeWeight = 2;
  lines.push(line1);
  
  // Horizontal segment
  const line2 = figma.createLine();
  line2.x = Math.min(x1, x2);
  line2.y = midY;
  line2.resize(Math.abs(x2 - x1), 0);
  line2.strokes = [{ type: 'SOLID', color: COLORS.connector }];
  line2.strokeWeight = 2;
  lines.push(line2);
  
  // Bottom vertical segment
  const line3 = figma.createLine();
  line3.x = x2;
  line3.y = midY;
  line3.resize(0, y2 - midY);
  line3.rotation = -90;
  line3.strokes = [{ type: 'SOLID', color: COLORS.connector }];
  line3.strokeWeight = 2;
  lines.push(line3);
  
  const group = figma.group(lines, figma.currentPage);
  group.name = 'Connector';
  return group;
}

function getBounds(nodes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  nodes.forEach(node => {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  });
  
  return {
    minX, minY, maxX, maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}
