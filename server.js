/**
 * Simple server to serve screenshots to Figma plugin
 * Run: node server.js [path-to-screenshots-folder]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Get screenshots folder from args or use default
const screenshotsDir = process.argv[2] || path.join(__dirname, '..', '..', 'regent_screenshots');

const PORT = 3000;

const MIME_TYPES = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

const server = http.createServer((req, res) => {
  // CORS headers for Figma plugin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Clean URL path
  const urlPath = req.url === '/' ? '/sitemap.json' : req.url;
  const filePath = path.join(screenshotsDir, urlPath);
  
  // Security: ensure we're not serving files outside screenshots dir
  if (!filePath.startsWith(screenshotsDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  // Check if file exists
  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) {
      console.log(`404: ${urlPath}`);
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    
    // Get mime type
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    
    // Stream file
    console.log(`200: ${urlPath}`);
    res.writeHead(200, { 'Content-Type': mimeType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Screenshot server running at http://localhost:${PORT}`);
  console.log(`📁 Serving files from: ${screenshotsDir}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`   http://localhost:${PORT}/sitemap.json`);
  console.log(`   http://localhost:${PORT}/regent_[slug]_desktop.png`);
  console.log(`   http://localhost:${PORT}/regent_[slug]_mobile.png`);
  console.log(`\nPress Ctrl+C to stop.\n`);
});
