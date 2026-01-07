#!/usr/bin/env node

/**
 * Simple HTTP Server for Frontend
 * Serves static files from the Frontend directory
 * Runs on port 3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const FRONTEND_DIR = path.join(__dirname, 'Frontend');
const PORT = 3000;
const API_HOST = 'localhost';
const API_PORT = 3001;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Parse URL
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // Proxy API requests to backend
  if (pathname.startsWith('/api/')) {
    const apiPath = pathname + (parsedUrl.search || '');
    const apiOptions = {
      hostname: API_HOST,
      port: API_PORT,
      path: apiPath,
      method: req.method,
      headers: req.headers
    };

    // Remove host header to avoid issues
    delete apiOptions.headers.host;

    const apiReq = http.request(apiOptions, (apiRes) => {
      res.writeHead(apiRes.statusCode, apiRes.headers);
      apiRes.pipe(res);
    });

    apiReq.on('error', (err) => {
      console.error('API proxy error:', err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: 'API gateway error' }));
    });

    // Pipe request body to API
    req.pipe(apiReq);
    return;
  }

  // Default to index.html for root
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  // Build file path
  let filePath = path.join(FRONTEND_DIR, pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err) {
      // File not found
      if (pathname.endsWith('.html')) {
        // For HTML files, show 404
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>404 Not Found</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #d32f2f; }
              p { color: #666; }
              a { color: #1976d2; text-decoration: none; }
            </style>
          </head>
          <body>
            <h1>404 - Page Not Found</h1>
            <p>The requested page could not be found.</p>
            <a href="/">← Go back home</a>
          </body>
          </html>
        `);
      } else {
        // For other files, serve a simple 404
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      }
      return;
    }

    // Check if it's a directory
    if (stats.isDirectory()) {
      // Try index.html in directory
      filePath = path.join(filePath, 'index.html');
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        const ext = path.extname(filePath);
        const contentType = mimeTypes[ext] || 'text/html';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      });
      return;
    }

    // Read and serve file
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }

      const ext = path.extname(filePath);
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`\n✓ Frontend Server running on http://localhost:${PORT}`);
  console.log(`✓ Backend API running on http://localhost:3001`);
  console.log(`\nOpen http://localhost:${PORT} in your browser\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Frontend server shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
