import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { getProjectOrThrow } from '../context.js';
import {
  appendSessionEntry,
  createSessionStore,
  deleteSessionStore,
  listSessions,
  readSessionContentForApi,
  readSessionFactsState,
  readSessionHotState,
  readSessionMeta,
  renameSessionMeta,
  writeSessionContentFromApi
} from '../lib/memory-store.js';

export const sessionRoutes = {
  'GET /api/projects/:name/sessions': async (_body, params) => {
    const { name } = params;
    const { project } = await getProjectOrThrow(name);
    const sessions = await listSessions(project.path);

    const config = JSON.parse(await readFile(join(project.path, '.project.json'), 'utf-8'));
    return { sessions, currentSession: config.currentSession };
  },

  'POST /api/projects/:name/sessions': async (body, params) => {
    const { name } = params;
    const { sessionName } = body;
    const { project } = await getProjectOrThrow(name);

    const sessionId = `session-${Date.now()}`;
    const displayName = sessionName || sessionId;
    await createSessionStore(project.path, sessionId, displayName);

    const configPath = join(project.path, '.project.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    config.currentSession = sessionId;
    await writeFile(configPath, JSON.stringify(config, null, 2));

    return { success: true, sessionId, displayName };
  },

  'POST /api/projects/:name/sessions/:sessionId/switch': async (_body, params) => {
    const { name, sessionId } = params;
    const { project } = await getProjectOrThrow(name);
    await readSessionMeta(project.path, sessionId);

    const configPath = join(project.path, '.project.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    config.currentSession = sessionId;
    await writeFile(configPath, JSON.stringify(config, null, 2));

    return { success: true, currentSession: sessionId };
  },

  'GET /api/projects/:name/sessions/:sessionId/memory': async (_body, params) => {
    const { name, sessionId } = params;
    const { project } = await getProjectOrThrow(name);
    return { content: await readSessionContentForApi(project.path, sessionId) };
  },

  'GET /api/projects/:name/sessions/:sessionId/memory-state': async (_body, params) => {
    const { name, sessionId } = params;
    const { project } = await getProjectOrThrow(name);
    const [hot, facts] = await Promise.all([
      readSessionHotState(project.path, sessionId),
      readSessionFactsState(project.path, sessionId)
    ]);

    return { hot, facts };
  },

  'POST /api/projects/:name/sessions/:sessionId/memory': async (body, params) => {
    const { name, sessionId } = params;
    const { content } = body;
    const { project } = await getProjectOrThrow(name);
    await writeSessionContentFromApi(project.path, sessionId, content);
    return { success: true };
  },

  'POST /api/projects/:name/sessions/:sessionId/entries': async (body, params) => {
    const { name, sessionId } = params;
    const { entry } = body;
    const { project } = await getProjectOrThrow(name);

    if (!entry || typeof entry !== 'object') {
      throw new Error('缺少有效的 entry');
    }

    await appendSessionEntry(project.path, sessionId, entry);
    return { success: true };
  },

  'DELETE /api/projects/:name/sessions/:sessionId': async (_body, params) => {
    const { name, sessionId } = params;
    const { project } = await getProjectOrThrow(name);
    await deleteSessionStore(project.path, sessionId);

    const configPath = join(project.path, '.project.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    if (config.currentSession === sessionId) {
      config.currentSession = null;
      await writeFile(configPath, JSON.stringify(config, null, 2));
    }

    return { success: true };
  },

  'POST /api/projects/:name/sessions/:sessionId/rename': async (body, params) => {
    const { name, sessionId } = params;
    const { newName } = body;
    const { project } = await getProjectOrThrow(name);
    await renameSessionMeta(project.path, sessionId, newName);

    const configPath = join(project.path, '.project.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    await writeFile(configPath, JSON.stringify(config, null, 2));

    return { success: true, sessionId, newName };
  },

  'GET /api/projects/:name/memory/shared': async (_body, params) => {
    const { name } = params;
    const { project } = await getProjectOrThrow(name);
    const memoryPath = join(project.path, 'memory', 'shared.md');

    if (!existsSync(memoryPath)) {
      return { content: '' };
    }

    const content = await readFile(memoryPath, 'utf-8');
    return { content };
  },

  'POST /api/projects/:name/memory/shared': async (body, params) => {
    const { name } = params;
    const { content } = body;
    const { project } = await getProjectOrThrow(name);
    const memoryPath = join(project.path, 'memory', 'shared.md');

    await writeFile(memoryPath, content);
    return { success: true };
  }
};
