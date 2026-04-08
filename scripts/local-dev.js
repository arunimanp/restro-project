import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const API_DIR = path.join(__dirname, '..', 'api');

const server = http.createServer(async (req, res) => {
  // Add resilience to response object (mocking Vercel/Express features)
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
    return res;
  };

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname;

  console.log(`[${req.method}] ${pathname}`);

  // 1. Handle API Routes (/api/...)
  if (pathname.startsWith('/api/')) {
    // Rewrite: /api/orders/:id/status -> /api/orders/status?id=:id (matches Vercel rewrite)
    const ordersStatusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
    if (ordersStatusMatch) {
      const orderId = ordersStatusMatch[1];
      parsedUrl.searchParams.set('id', orderId);
      pathname = '/api/orders/status';
      req.url = `${pathname}?${parsedUrl.searchParams.toString()}`;
    }

    let apiPath = pathname.slice(5); // remove /api/
    if (!apiPath) apiPath = 'index';
    
    // Check for directory vs file
    // Example: /api/auth/login -> api/auth/login.js
    let filePath = path.join(API_DIR, apiPath + '.js');
    
    // If it's a directory, look for index.js
    if (!fs.existsSync(filePath) && fs.existsSync(path.join(API_DIR, apiPath, 'index.js'))) {
        filePath = path.join(API_DIR, apiPath, 'index.js');
    }

    if (fs.existsSync(filePath)) {
      try {
        const module = await import(`file://${filePath}?t=${Date.now()}`);
        if (typeof module.default === 'function') {
          return module.default(req, res);
        }
      } catch (err) {
        console.error(`Error in API ${pathname}:`, err);
        return res.status(500).json({ error: 'Internal Server Error', message: err.message });
      }
    }
    return res.status(404).json({ error: 'API route not found' });
  }

  // 2. Handle Static Files
  let staticPath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  // If no extension, try adding .html
  if (!path.extname(staticPath) && !fs.existsSync(staticPath)) {
    staticPath += '.html';
  }

  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const ext = path.extname(staticPath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    fs.createReadStream(staticPath).pipe(res);
  } else {
    // 404 Fallback
    res.statusCode = 404;
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Local server running at http://localhost:${PORT}`);
  console.log(`📡 Database: ${process.env.DATABASE_URL?.split('@')[1] || 'None'}`);
  console.log(`🔑 Login credentials available in scripts/seed.sql\n`);
});
