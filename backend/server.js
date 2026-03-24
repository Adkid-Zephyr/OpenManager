#!/usr/bin/env node

import http from 'http';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { HOST, PORT, PROJECTS_DIR } from './context.js';
import { fileRoutes } from './routes/files.js';
import { openclawRoutes } from './routes/openclaw.js';
import { projectRoutes } from './routes/projects.js';
import { sessionRoutes } from './routes/sessions.js';
import { systemRoutes } from './routes/system.js';
import { taskRoutes } from './routes/tasks.js';
import { matchRoute, parseBody, parseQuery, sendJson } from './lib/router.js';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST_ROOT = resolve(APP_ROOT, 'dist');
const STATIC_MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

const ALLOWED_API_ORIGINS = new Set([
  `http://${HOST}:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
  ...String(process.env.OPENMANAGER_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
]);

function resolveStaticFileFromRoot(rootDir, relativePath) {
  const filePath = join(rootDir, relativePath);
  if (!filePath.startsWith(rootDir) || !existsSync(filePath)) {
    return null;
  }

  return filePath;
}

function resolveStaticFile(reqUrl) {
  const pathname = decodeURIComponent(reqUrl).split('?')[0];
  if (pathname.startsWith('/api/')) {
    return null;
  }

  const relativePath = pathname === '/' ? 'app.html' : pathname.replace(/^\/+/, '');
  if (!relativePath || relativePath.includes('..')) {
    return null;
  }

  for (const rootDir of [DIST_ROOT, APP_ROOT]) {
    const filePath = resolveStaticFileFromRoot(rootDir, relativePath);
    if (filePath) {
      return filePath;
    }
  }

  return null;
}

function applyApiCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!origin) {
    return true;
  }

  if (ALLOWED_API_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    return true;
  }

  return false;
}

const routes = {
  ...projectRoutes,
  ...sessionRoutes,
  ...taskRoutes,
  ...fileRoutes,
  ...openclawRoutes,
  ...systemRoutes
};

const server = http.createServer(async (req, res) => {
  const isApiRequest = req.url?.startsWith('/api/');
  if (isApiRequest) {
    const corsAllowed = applyApiCors(req, res);
    if (!corsAllowed) {
      sendJson(res, 403, { error: 'Origin not allowed' });
      return;
    }
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, {
      name: 'OpenManager API',
      status: 'ok',
      host: HOST,
      port: PORT,
      projectsDir: PROJECTS_DIR
    });
    return;
  }

  if (req.method === 'GET') {
    const staticFile = resolveStaticFile(req.url);
    if (staticFile) {
      const ext = extname(staticFile).toLowerCase();
      const content = await readFile(staticFile);
      res.writeHead(200, {
        'Content-Type': STATIC_MIME_TYPES[ext] || 'application/octet-stream'
      });
      res.end(content);
      return;
    }
  }

  const matched = matchRoute(routes, req);
  if (!matched) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  try {
    const body = await parseBody(req);
    const query = parseQuery(req.url);
    const result = await matched.handler(body, matched.params, query);

    if (
      req.method === 'GET' &&
      req.url.startsWith('/api/files/') &&
      result &&
      typeof result.content === 'string' &&
      result.mimeType
    ) {
      res.writeHead(200, {
        'Content-Type': result.mimeType,
        'Content-Disposition': `inline; filename="${result.filename}"`
      });
      res.end(Buffer.from(result.content, 'base64'));
      return;
    }

    sendJson(res, 200, result);
  } catch (error) {
    console.error('Error:', error.message);
    sendJson(res, 400, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n🚀 OpenManager running at http://${HOST}:${PORT}`);
  console.log(`📁 Projects directory: ${PROJECTS_DIR}`);
  console.log(`🌐 App: http://${HOST}:${PORT}/`);
  console.log(`📘 Manual: http://${HOST}:${PORT}/manual.html`);
  console.log('\n按 Ctrl+C 停止服务器\n');
});
