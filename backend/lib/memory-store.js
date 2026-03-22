import { appendFile, readFile, readdir, stat, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

function safeParseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function getSessionFileBase(projectPath, sessionId) {
  return join(projectPath, 'memory', sessionId);
}

function getSessionPaths(projectPath, sessionId) {
  const base = getSessionFileBase(projectPath, sessionId);
  return {
    meta: `${base}.meta.json`,
    jsonl: `${base}.jsonl`,
    summary: `${base}.summary.md`,
    legacy: `${base}.md`
  };
}

function extractTitleFromMarkdown(content, sessionId) {
  const firstLine = content.split('\n')[0];
  if (firstLine && firstLine.startsWith('# ')) {
    return firstLine.slice(2).trim();
  }
  return sessionId;
}

function parseLegacyEntries(content) {
  const direct = safeParseJson(content, null);
  if (Array.isArray(direct)) {
    return direct;
  }

  const jsonStart = content.indexOf('[');
  if (jsonStart !== -1) {
    const embedded = safeParseJson(content.slice(jsonStart), null);
    if (Array.isArray(embedded)) {
      return embedded;
    }
  }

  return null;
}

function entriesToJsonl(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '';
  }
  return `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
}

function jsonlToEntries(content) {
  if (!content.trim()) return [];
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => safeParseJson(line, null))
    .filter(Boolean);
}

function buildSummaryMarkdown(meta, entries) {
  const compressedEntries = entries.filter((entry) => entry.type === 'compressed_summary');
  if (compressedEntries.length === 0) {
    return `# ${meta.name}\n\n暂无摘要。\n`;
  }

  return `# ${meta.name}\n\n${compressedEntries
    .map(
      (entry, index) =>
        `## 摘要 ${index + 1}\n\n${entry.text}\n\n- 时间：${entry.time || '未知'}\n`
    )
    .join('\n')}`;
}

async function ensureMetaFromLegacy(projectPath, sessionId) {
  const paths = getSessionPaths(projectPath, sessionId);
  if (existsSync(paths.meta)) {
    return safeParseJson(await readFile(paths.meta, 'utf-8'), null);
  }

  const meta = {
    id: sessionId,
    name: sessionId,
    createdAt: new Date().toISOString()
  };

  if (existsSync(paths.legacy)) {
    const legacyContent = await readFile(paths.legacy, 'utf-8');
    meta.name = extractTitleFromMarkdown(legacyContent, sessionId);

    try {
      const fileStats = await stat(paths.legacy);
      meta.createdAt = fileStats.birthtime?.toISOString?.() || fileStats.mtime.toISOString();
    } catch {
      // ignore
    }
  }

  await writeFile(paths.meta, JSON.stringify(meta, null, 2));
  return meta;
}

async function migrateLegacyIfNeeded(projectPath, sessionId) {
  const paths = getSessionPaths(projectPath, sessionId);
  const meta = await ensureMetaFromLegacy(projectPath, sessionId);
  const legacyContent = existsSync(paths.legacy) ? await readFile(paths.legacy, 'utf-8') : '';
  const legacyEntries = legacyContent ? parseLegacyEntries(legacyContent) : null;

  if (existsSync(paths.jsonl)) {
    const currentEntries = await readSessionEntries(projectPath, sessionId, false);
    if (currentEntries.length === 0 && Array.isArray(legacyEntries) && legacyEntries.length > 0) {
      await writeFile(paths.jsonl, entriesToJsonl(legacyEntries));
      await writeFile(paths.summary, buildSummaryMarkdown(meta, legacyEntries));
      return meta;
    }

    if (!existsSync(paths.summary)) {
      const entries = currentEntries;
      await writeFile(paths.summary, buildSummaryMarkdown(meta, entries));
    }
    return meta;
  }

  if (!existsSync(paths.legacy)) {
    await writeFile(paths.jsonl, '');
    await writeFile(paths.summary, buildSummaryMarkdown(meta, []));
    return meta;
  }

  if (Array.isArray(legacyEntries)) {
    await writeFile(paths.jsonl, entriesToJsonl(legacyEntries));
    await writeFile(paths.summary, buildSummaryMarkdown(meta, legacyEntries));
    return meta;
  }

  const legacyBody = legacyContent.startsWith(`# ${meta.name}`)
    ? legacyContent.split('\n').slice(1).join('\n').trim()
    : legacyContent.trim();
  await writeFile(paths.jsonl, '');
  await writeFile(paths.summary, `# ${meta.name}\n\n${legacyBody || '暂无摘要。'}\n`);
  return meta;
}

export async function listSessions(projectPath) {
  const memoryDir = join(projectPath, 'memory');
  if (!existsSync(memoryDir)) return [];

  const files = await readdir(memoryDir);
  const ids = new Set();

  files.forEach((file) => {
    if (file === 'shared.md') return;
    if (file.endsWith('.meta.json')) {
      ids.add(file.replace(/\.meta\.json$/, ''));
      return;
    }
    if (file.endsWith('.md') && !file.endsWith('.summary.md')) {
      ids.add(file.replace(/\.md$/, ''));
    }
  });

  const sessions = [];
  for (const id of ids) {
    const meta = await migrateLegacyIfNeeded(projectPath, id);
    sessions.push({
      id,
      name: meta?.name || id,
      createdAt: meta?.createdAt || null
    });
  }

  sessions.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return sessions;
}

export async function countSessions(projectPath) {
  const sessions = await listSessions(projectPath);
  return sessions.length;
}

export async function createSessionStore(projectPath, sessionId, displayName) {
  const paths = getSessionPaths(projectPath, sessionId);
  const meta = {
    id: sessionId,
    name: displayName,
    createdAt: new Date().toISOString()
  };

  await writeFile(paths.meta, JSON.stringify(meta, null, 2));
  await writeFile(paths.jsonl, '');
  await writeFile(paths.summary, `# ${displayName}\n\n暂无摘要。\n`);
  return meta;
}

export async function readSessionMeta(projectPath, sessionId) {
  return migrateLegacyIfNeeded(projectPath, sessionId);
}

export async function renameSessionMeta(projectPath, sessionId, newName) {
  const meta = await migrateLegacyIfNeeded(projectPath, sessionId);
  const paths = getSessionPaths(projectPath, sessionId);
  const nextMeta = { ...meta, name: newName };

  await writeFile(paths.meta, JSON.stringify(nextMeta, null, 2));

  if (existsSync(paths.summary)) {
    const entries = await readSessionEntries(projectPath, sessionId);
    await writeFile(paths.summary, buildSummaryMarkdown(nextMeta, entries));
  }

  return nextMeta;
}

export async function readSessionEntries(projectPath, sessionId, autoMigrate = true) {
  if (autoMigrate) {
    await migrateLegacyIfNeeded(projectPath, sessionId);
  }
  const { jsonl } = getSessionPaths(projectPath, sessionId);

  if (!existsSync(jsonl)) return [];
  return jsonlToEntries(await readFile(jsonl, 'utf-8'));
}

export async function writeSessionEntries(projectPath, sessionId, entries) {
  const meta = await migrateLegacyIfNeeded(projectPath, sessionId);
  const paths = getSessionPaths(projectPath, sessionId);

  await writeFile(paths.jsonl, entriesToJsonl(entries));
  await writeFile(paths.summary, buildSummaryMarkdown(meta, entries));
}

export async function appendSessionEntry(projectPath, sessionId, entry) {
  await migrateLegacyIfNeeded(projectPath, sessionId);
  const paths = getSessionPaths(projectPath, sessionId);
  await appendFile(paths.jsonl, `${JSON.stringify(entry)}\n`);

  if (entry?.type === 'compressed_summary') {
    const meta = await readSessionMeta(projectPath, sessionId);
    const entries = await readSessionEntries(projectPath, sessionId, false);
    await writeFile(paths.summary, buildSummaryMarkdown(meta, entries));
  }
}

export async function readSessionContentForApi(projectPath, sessionId) {
  const entries = await readSessionEntries(projectPath, sessionId);
  return JSON.stringify(entries, null, 2);
}

export async function writeSessionContentFromApi(projectPath, sessionId, content) {
  const entries = safeParseJson(content, []);
  await writeSessionEntries(projectPath, sessionId, Array.isArray(entries) ? entries : []);
}

export async function deleteSessionStore(projectPath, sessionId) {
  const paths = getSessionPaths(projectPath, sessionId);
  for (const target of Object.values(paths)) {
    if (existsSync(target)) {
      await unlink(target);
    }
  }
}

export async function readSessionSummary(projectPath, sessionId) {
  await migrateLegacyIfNeeded(projectPath, sessionId);
  const { summary } = getSessionPaths(projectPath, sessionId);
  if (!existsSync(summary)) return '';
  return readFile(summary, 'utf-8');
}

export async function getRecentSessionEntries(projectPath, sessionId, limit = 8) {
  const entries = await readSessionEntries(projectPath, sessionId);
  return entries.slice(-limit);
}
