// Sitemap Generator - Figma Plugin
// Tile-by-tile loading to handle large images

const CARD_GAP = 80;
const LEVEL_GAP = 300;
const CARD_PADDING = 24;
const SCREENSHOT_GAP = 16;

const COLORS = {
  cardBg: { r: 1, g: 1, b: 1 },
  cardStroke: { r: 0.9, g: 0.9, b: 0.9 },
  connector: { r: 0.8, g: 0.8, b: 0.8 },
  title: { r: 0.1, g: 0.1, b: 0.1 },
  url: { r: 0.5, g: 0.5, b: 0.5 }
};

// State
let frame = null;
let pages = [];
let cardPositions = new Map();
let cardWidth = 0;
let cardHeight = 0;

// Current page state
let currentCard = null;
let currentPage = null;
let desktopTiles = [];
let mobileTiles = [];

figma.showUI(__html__, { width: 320, height: 480 });

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'open-url') {
      // Open URL in browser
      figma.openExternal(msg.url);
      return;
    } else if (msg.type === 'start') {
      await handleStart(msg.site);
    } else if (msg.type === 'start-page') {
      await handleStartPage(msg.page, msg.pageIndex, msg.totalPages);
    } else if (msg.type === 'add-tile') {
      await handleAddTile(msg.tile);
    } else if (msg.type === 'finish-page') {
      await handleFinishPage();
    } else if (msg.type === 'finalize') {
      await handleFinalize();
    }
  } catch (err) {
    console.error(err);
    figma.ui.postMessage({ type: 'error', message: err.message });
  }
};

async function handleStart(site) {
  pages = [];
  cardPositions = new Map();
  cardWidth = 0;
  cardHeight = 0;
  
  frame = figma.createFrame();
  frame.name = `Sitemap - ${site}`;
  frame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
  frame.resize(2000, 2000);

  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });

  figma.ui.postMessage({ type: 'ready' });
}

async function handleStartPage(page, pageIndex, totalPages) {
  currentPage = page;
  desktopTiles = [];
  mobileTiles = [];
  
  // Calculate card size from first page
  if (pageIndex === 0) {
    const desktopW = page.desktopWidth || 300;
    const desktopH = page.desktopHeight || 200;
    const mobileW = page.mobileWidth || 90;
    const mobileH = page.mobileHeight || 200;
    
    cardWidth = CARD_PADDING * 2 + desktopW + SCREENSHOT_GAP + mobileW;
    cardHeight = CARD_PADDING * 2 + 50 + Math.max(desktopH, mobileH);
  }

  // Grid layout position
  const cols = Math.max(1, Math.floor(4000 / (cardWidth + CARD_GAP)));
  const col = pageIndex % cols;
  const row = Math.floor(pageIndex / cols);
  const x = col * (cardWidth + CARD_GAP);
  const y = row * (cardHeight + CARD_GAP);
  
  // Create card frame
  currentCard = figma.createFrame();
  currentCard.name = page.title || page.slug;
  currentCard.x = x;
  currentCard.y = y;
  currentCard.resize(cardWidth, cardHeight);
  currentCard.fills = [{ type: 'SOLID', color: COLORS.cardBg }];
  currentCard.strokes = [{ type: 'SOLID', color: COLORS.cardStroke }];
  currentCard.strokeWeight = 1;
  currentCard.cornerRadius = 8;

  // Title
  const title = figma.createText();
  title.characters = page.title || page.slug;
  title.fontSize = 16;
  title.fontName = { family: "Inter", style: "Bold" };
  title.fills = [{ type: 'SOLID', color: COLORS.title }];
  title.x = CARD_PADDING;
  title.y = CARD_PADDING;
  currentCard.appendChild(title);

  // URL
  const url = figma.createText();
  url.characters = page.path || '/';
  url.fontSize = 12;
  url.fontName = { family: "Inter", style: "Regular" };
  url.fills = [{ type: 'SOLID', color: COLORS.url }];
  url.x = CARD_PADDING;
  url.y = CARD_PADDING + 24;
  currentCard.appendChild(url);

  frame.appendChild(currentCard);
  
  figma.ui.postMessage({ type: 'page-ready' });
}

async function handleAddTile(tile) {
  const rect = figma.createRectangle();
  rect.name = 'Tile';
  rect.resize(tile.width, tile.height);
  
  const imageHash = figma.createImage(new Uint8Array(tile.bytes)).hash;
  rect.fills = [{
    type: 'IMAGE',
    imageHash: imageHash,
    scaleMode: 'FILL'
  }];
  
  // Store tile with position info
  if (tile.imageType === 'desktop') {
    desktopTiles.push({ rect, x: tile.x, y: tile.y, totalWidth: tile.totalWidth, totalHeight: tile.totalHeight });
  } else {
    mobileTiles.push({ rect, x: tile.x, y: tile.y, totalWidth: tile.totalWidth, totalHeight: tile.totalHeight });
  }
  
  figma.ui.postMessage({ type: 'tile-added' });
}

async function handleFinishPage() {
  const screenshotY = CARD_PADDING + 50;
  let screenshotX = CARD_PADDING;
  
  // Assemble desktop image
  if (desktopTiles.length > 0) {
    const nodes = desktopTiles.map(t => {
      t.rect.x = t.x;
      t.rect.y = t.y;
      return t.rect;
    });
    
    let desktopImg;
    if (nodes.length === 1) {
      desktopImg = nodes[0];
      desktopImg.name = 'Desktop';
    } else {
      desktopImg = figma.group(nodes, figma.currentPage);
      desktopImg.name = 'Desktop';
    }
    
    desktopImg.x = screenshotX;
    desktopImg.y = screenshotY;
    currentCard.appendChild(desktopImg);
    
    screenshotX += desktopTiles[0].totalWidth + SCREENSHOT_GAP;
  }
  
  // Assemble mobile image
  if (mobileTiles.length > 0) {
    const nodes = mobileTiles.map(t => {
      t.rect.x = t.x;
      t.rect.y = t.y;
      return t.rect;
    });
    
    let mobileImg;
    if (nodes.length === 1) {
      mobileImg = nodes[0];
      mobileImg.name = 'Mobile';
    } else {
      mobileImg = figma.group(nodes, figma.currentPage);
      mobileImg.name = 'Mobile';
    }
    
    mobileImg.x = screenshotX;
    mobileImg.y = screenshotY;
    currentCard.appendChild(mobileImg);
  }
  
  // Store for repositioning
  pages.push(currentPage);
  cardPositions.set(currentPage.slug, {
    card: currentCard,
    depth: currentPage.depth || 0,
    parent: currentPage.parent,
    slug: currentPage.slug
  });
  
  figma.ui.postMessage({ type: 'page-done' });
}

async function handleFinalize() {
  if (pages.length === 0) {
    figma.ui.postMessage({ type: 'error', message: 'No pages loaded' });
    return;
  }

  // Group by depth
  const pagesByDepth = new Map();
  pages.forEach(page => {
    const depth = page.depth || 0;
    if (!pagesByDepth.has(depth)) pagesByDepth.set(depth, []);
    pagesByDepth.get(depth).push({ page, card: cardPositions.get(page.slug).card });
  });

  // Reposition by depth
  let yOffset = 0;
  const depths = Array.from(pagesByDepth.keys()).sort((a, b) => a - b);
  const newPositions = new Map();

  for (const depth of depths) {
    const items = pagesByDepth.get(depth);
    const totalWidth = items.length * (cardWidth + CARD_GAP) - CARD_GAP;
    let xOffset = -totalWidth / 2;

    for (const item of items) {
      item.card.x = xOffset;
      item.card.y = yOffset;
      
      newPositions.set(item.page.slug, {
        x: xOffset + cardWidth / 2,
        y: yOffset,
        width: cardWidth,
        height: cardHeight,
        parent: item.page.parent
      });

      xOffset += cardWidth + CARD_GAP;
    }
    
    yOffset += cardHeight + LEVEL_GAP;
  }

  // Draw connectors
  for (const [slug, pos] of newPositions) {
    if (pos.parent && newPositions.has(pos.parent)) {
      const parentPos = newPositions.get(pos.parent);
      const connector = createConnector(
        parentPos.x, parentPos.y + parentPos.height,
        pos.x, pos.y
      );
      frame.insertChild(0, connector);
    }
  }

  // Resize frame
  const cards = Array.from(cardPositions.values()).map(p => p.card);
  const bounds = getBounds(cards);
  
  frame.resize(bounds.width + 200, bounds.height + 200);
  
  for (let i = 0; i < frame.children.length; i++) {
    const child = frame.children[i];
    child.x += 100 - bounds.minX;
    child.y += 100 - bounds.minY;
  }

  frame.x = figma.viewport.center.x - frame.width / 2;
  frame.y = figma.viewport.center.y - frame.height / 2;
  
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);

  figma.ui.postMessage({ type: 'done', count: pages.length });
}

function createConnector(x1, y1, x2, y2) {
  const midY = y1 + (y2 - y1) / 2;
  const lines = [];
  
  const line1 = figma.createLine();
  line1.x = x1;
  line1.y = y1;
  line1.resize(0, midY - y1);
  line1.rotation = -90;
  line1.strokes = [{ type: 'SOLID', color: COLORS.connector }];
  line1.strokeWeight = 2;
  lines.push(line1);
  
  const line2 = figma.createLine();
  line2.x = Math.min(x1, x2);
  line2.y = midY;
  line2.resize(Math.abs(x2 - x1), 0);
  line2.strokes = [{ type: 'SOLID', color: COLORS.connector }];
  line2.strokeWeight = 2;
  lines.push(line2);
  
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
  
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
