#!/usr/bin/env node

import http from 'http';
import { PORT, PROJECTS_DIR } from './context.js';
import { fileRoutes } from './routes/files.js';
import { openclawRoutes } from './routes/openclaw.js';
import { projectRoutes } from './routes/projects.js';
import { sessionRoutes } from './routes/sessions.js';
import { systemRoutes } from './routes/system.js';
import { taskRoutes } from './routes/tasks.js';
import { matchRoute, parseBody, parseQuery, sendJson } from './lib/router.js';

const routes = {
  ...projectRoutes,
  ...sessionRoutes,
  ...taskRoutes,
  ...fileRoutes,
  ...openclawRoutes,
  ...systemRoutes
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/' && req.method === 'GET') {
    sendJson(res, 200, {
      name: 'Project Workspace API',
      status: 'ok',
      port: PORT,
      projectsDir: PROJECTS_DIR
    });
    return;
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

server.listen(PORT, () => {
  console.log(`\n🚀 Project Workspace API running at http://localhost:${PORT}`);
  console.log(`📁 Projects directory: ${PROJECTS_DIR}`);
  console.log('🌐 Frontend entry: frontend/index.html or app.html');
  console.log('\n按 Ctrl+C 停止服务器\n');
});
