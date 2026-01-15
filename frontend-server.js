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
const AI_PORT = 3002;

// MIME types
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
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

  // Proxy AI and Admin requests to Admin/AI server (Port 3002)
  if (pathname.startsWith('/ai/') || pathname.startsWith('/admin/')) {
    const aiPath = pathname + (parsedUrl.search || '');
    const aiOptions = {
      hostname: API_HOST,
      port: AI_PORT,
      path: aiPath,
      method: req.method,
      headers: req.headers
    };

    delete aiOptions.headers.host;

    const aiReq = http.request(aiOptions, (aiRes) => {
      res.writeHead(aiRes.statusCode, aiRes.headers);
      aiRes.pipe(res);
    });

    aiReq.on('error', (err) => {
      console.error('AI/Admin proxy error:', err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: 'AI/Admin Service Unavailable' }));
    });

    req.pipe(aiReq);
    return;
  }

  // Default to index.html for root
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  // Build file path
  let filePath;
  
  // Serve special folders which sit in the root
  if (pathname.startsWith('/ai-portal/') || pathname.startsWith('/admin-portal/')) {
    filePath = path.join(__dirname, pathname);
  } else {
    // Normal frontend files
    filePath = path.join(FRONTEND_DIR, pathname);
  
    // Prevent directory traversal
    if (!filePath.startsWith(FRONTEND_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
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
      fs.stat(filePath, (err, indexStats) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        serveFile(req, res, filePath, indexStats);
      });
      return;
    }

    // Serve file with Range support (streaming)
    serveFile(req, res, filePath, stats);
  });
});

function serveFile(req, res, filePath, stats) {
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const fileSize = stats.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    
    // Chunk size of 1MB (1024 * 1024)
    const MAX_CHUNK_SIZE = 1 * 1024 * 1024; 
    
    let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    let chunksize = (end - start) + 1;
    
    // Enforce max chunk size to prevent buffering entire file at once
    if (chunksize > MAX_CHUNK_SIZE) {
        end = start + MAX_CHUNK_SIZE - 1;
        if (end >= fileSize) {
            end = fileSize - 1;
        }
        chunksize = (end - start) + 1;
    }

    // Valid range check
    if(start >= fileSize || end >= fileSize) {
       res.writeHead(416, {
        "Content-Range": `bytes */${fileSize}`,
        "Content-Type": contentType
       });
       res.end();
       return;
    }

    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
}

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
