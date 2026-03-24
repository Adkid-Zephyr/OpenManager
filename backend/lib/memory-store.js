import { appendFile, open, readFile, readdir, stat, unlink, writeFile } from 'fs/promises';
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
    hot: `${base}.hot.json`,
    facts: `${base}.facts.json`,
    legacy: `${base}.md`
  };
}

function createEmptyHotState() {
  return {
    goal: '',
    latestDecision: '',
    blocker: '',
    nextStep: '',
    recent: [],
    updatedAt: new Date().toISOString()
  };
}

function createEmptyFactsState() {
  return {
    items: [],
    updatedAt: new Date().toISOString()
  };
}

function normalizeInlineText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimForMemory(text, limit = 200) {
  const normalized = normalizeInlineText(text);
  if (!normalized || normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1).trim()}…`;
}

function normalizeRecentEntry(entry) {
  return {
    type: entry?.type || 'unknown',
    time: entry?.time || null,
    text: trimForMemory(entry?.text || '', 180)
  };
}

function isLowSignalAssistantText(text) {
  const normalized = normalizeInlineText(text);
  if (!normalized) {
    return true;
  }

  if (/^刚才被旧会话.*不再给你播状态表/.test(normalized)) {
    return true;
  }

  if (/^我是 .*?(不是 main|现在走的是|这个项目里的 .* 助手)/.test(normalized) || normalized === '我是 main。') {
    return true;
  }

  if (/^在[，,].*直接说你要我做什么就行/.test(normalized)) {
    return true;
  }

  if (/^能[。.]?.*直接给具体任务.*不再播状态表/.test(normalized)) {
    return true;
  }

  return /(当前状态|状态确认|状态正常)/.test(normalized)
    && /(待命中|有什么新指令吗|skills 已安装|任务列表|安装位置|任务已完成|待处理)/i.test(normalized);
}

function shouldIgnoreForDerivedMemory(entry) {
  if (!entry || !['assistant', 'compressed_summary'].includes(entry.type)) {
    return false;
  }

  return isLowSignalAssistantText(entry.text);
}

function extractTextSegments(text) {
  const value = String(text || '').replace(/\r/g, '');
  const lines = value
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.length >= 4);

  const sentences = value
    .replace(/\n+/g, '。')
    .split(/[。！？!?]/)
    .map((segment) => segment.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim())
    .filter((segment) => segment.length >= 6);

  return [...lines, ...sentences];
}

function pickFirstMatch(text, patterns) {
  const segments = extractTextSegments(text);
  return segments.find((segment) => patterns.some((pattern) => pattern.test(segment))) || '';
}

function buildHotState(entries) {
  const hot = createEmptyHotState();
  const relevant = entries.filter((entry) =>
    ['user', 'assistant', 'error', 'compressed_summary'].includes(entry?.type)
  ).filter((entry) => !shouldIgnoreForDerivedMemory(entry));

  const latestUser = [...relevant].reverse().find((entry) => entry.type === 'user');
  const latestAssistant = [...relevant].reverse().find((entry) =>
    ['assistant', 'compressed_summary'].includes(entry.type)
  );
  const latestError = [...relevant].reverse().find((entry) => entry.type === 'error');

  hot.goal = trimForMemory(latestUser?.text || '', 220);

  const decisionCandidate = pickFirstMatch(latestAssistant?.text || '', [
    /决定/,
    /改为/,
    /采用/,
    /保留/,
    /切换/,
    /确认/,
    /完成/,
    /已(?:经)?(?:改|切换|同步|修复|支持)/
  ]);
  hot.latestDecision = trimForMemory(decisionCandidate || latestAssistant?.text || '', 220);

  hot.blocker = trimForMemory(latestError?.text || '', 200);

  const nextStepCandidate = pickFirstMatch(latestAssistant?.text || '', [
    /下一步/,
    /接下来/,
    /建议/,
    /可以/,
    /需要/,
    /待办/,
    /后续/
  ]);
  hot.nextStep = trimForMemory(
    nextStepCandidate || (latestError ? '先处理最近一次错误或中断，再继续当前任务。' : ''),
    200
  );

  hot.recent = relevant.slice(-6).map(normalizeRecentEntry);
  hot.updatedAt = new Date().toISOString();
  return hot;
}

const FACT_RULES = [
  {
    type: 'decision',
    patterns: [/决定/, /改为/, /采用/, /保留/, /切换/, /选定/, /确认/, /回退/]
  },
  {
    type: 'constraint',
    patterns: [/不要/, /不能/, /必须/, /只(?:能|保留)/, /限制/, /优先/, /避免/]
  },
  {
    type: 'todo',
    patterns: [/待办/, /下一步/, /接下来/, /后续/, /TODO/i, /需要/, /继续/]
  },
  {
    type: 'preference',
    patterns: [/希望/, /喜欢/, /更喜欢/, /想要/, /偏好/, /不喜欢/, /满意/]
  }
];

function isSimilarFactText(left, right) {
  const a = normalizeInlineText(left).toLowerCase();
  const b = normalizeInlineText(right).toLowerCase();
  if (!a || !b) {
    return false;
  }
  return a === b || a.includes(b) || b.includes(a);
}

function buildFactsState(entries) {
  const items = [];
  const seen = new Set();
  const candidates = entries
    .filter((entry) => ['user', 'assistant', 'compressed_summary', 'error'].includes(entry?.type))
    .filter((entry) => !shouldIgnoreForDerivedMemory(entry))
    .slice(-40);

  for (const entry of candidates) {
    for (const segment of extractTextSegments(entry?.text || '')) {
      for (const rule of FACT_RULES) {
        if (!rule.patterns.some((pattern) => pattern.test(segment))) {
          continue;
        }

        const text = trimForMemory(segment, 180);
        if (!text) {
          continue;
        }

        const key = `${rule.type}:${text}`;
        if (
          seen.has(key) ||
          items.some((item) => item.type === rule.type && isSimilarFactText(item.text, text))
        ) {
          continue;
        }

        seen.add(key);
        items.push({
          type: rule.type,
          text,
          time: entry?.time || null,
          sourceType: entry?.type || 'unknown'
        });
        break;
      }
    }
  }

  return {
    items: items.slice(-12),
    updatedAt: new Date().toISOString()
  };
}

async function writeDerivedMemory(projectPath, sessionId, entries) {
  const { hot, facts } = getSessionPaths(projectPath, sessionId);
  await writeFile(hot, JSON.stringify(buildHotState(entries), null, 2));
  await writeFile(facts, JSON.stringify(buildFactsState(entries), null, 2));
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
      await writeDerivedMemory(projectPath, sessionId, legacyEntries);
      return meta;
    }

    if (!existsSync(paths.summary)) {
      const entries = currentEntries;
      await writeFile(paths.summary, buildSummaryMarkdown(meta, entries));
    }
    if (!existsSync(paths.hot) || !existsSync(paths.facts)) {
      await writeDerivedMemory(projectPath, sessionId, currentEntries);
    }
    return meta;
  }

  if (!existsSync(paths.legacy)) {
    await writeFile(paths.jsonl, '');
    await writeFile(paths.summary, buildSummaryMarkdown(meta, []));
    await writeDerivedMemory(projectPath, sessionId, []);
    return meta;
  }

  if (Array.isArray(legacyEntries)) {
    await writeFile(paths.jsonl, entriesToJsonl(legacyEntries));
    await writeFile(paths.summary, buildSummaryMarkdown(meta, legacyEntries));
    await writeDerivedMemory(projectPath, sessionId, legacyEntries);
    return meta;
  }

  const legacyBody = legacyContent.startsWith(`# ${meta.name}`)
    ? legacyContent.split('\n').slice(1).join('\n').trim()
    : legacyContent.trim();
  await writeFile(paths.jsonl, '');
  await writeFile(paths.summary, `# ${meta.name}\n\n${legacyBody || '暂无摘要。'}\n`);
  await writeDerivedMemory(projectPath, sessionId, []);
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
  await writeFile(paths.hot, JSON.stringify(createEmptyHotState(), null, 2));
  await writeFile(paths.facts, JSON.stringify(createEmptyFactsState(), null, 2));
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
  await writeDerivedMemory(projectPath, sessionId, entries);
}

export async function appendSessionEntry(projectPath, sessionId, entry) {
  await migrateLegacyIfNeeded(projectPath, sessionId);
  const paths = getSessionPaths(projectPath, sessionId);
  await appendFile(paths.jsonl, `${JSON.stringify(entry)}\n`);

  const entries = await readSessionEntries(projectPath, sessionId, false);
  await writeDerivedMemory(projectPath, sessionId, entries);

  if (entry?.type === 'compressed_summary') {
    const meta = await readSessionMeta(projectPath, sessionId);
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

export async function readSessionHotState(projectPath, sessionId) {
  await migrateLegacyIfNeeded(projectPath, sessionId);
  const { hot } = getSessionPaths(projectPath, sessionId);
  if (!existsSync(hot)) {
    return createEmptyHotState();
  }
  return safeParseJson(await readFile(hot, 'utf-8'), createEmptyHotState());
}

export async function readSessionFactsState(projectPath, sessionId) {
  await migrateLegacyIfNeeded(projectPath, sessionId);
  const { facts } = getSessionPaths(projectPath, sessionId);
  if (!existsSync(facts)) {
    return createEmptyFactsState();
  }
  return safeParseJson(await readFile(facts, 'utf-8'), createEmptyFactsState());
}

async function readLastEntriesFromJsonl(jsonlPath, limit) {
  if (!existsSync(jsonlPath)) {
    return [];
  }

  const handle = await open(jsonlPath, 'r');
  try {
    const stats = await handle.stat();
    if (!stats.size) {
      return [];
    }

    let position = stats.size;
    let buffer = '';
    let lines = [];
    const chunkSize = 4096;

    while (position > 0 && lines.filter(Boolean).length <= limit) {
      const size = Math.min(chunkSize, position);
      position -= size;
      const chunk = Buffer.alloc(size);
      await handle.read(chunk, 0, size, position);
      buffer = chunk.toString('utf8') + buffer;
      lines = buffer.split('\n');
    }

    return lines
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-limit)
      .map((line) => safeParseJson(line, null))
      .filter(Boolean);
  } finally {
    await handle.close();
  }
}

export async function getRecentSessionEntries(projectPath, sessionId, limit = 8) {
  await migrateLegacyIfNeeded(projectPath, sessionId);
  const { jsonl } = getSessionPaths(projectPath, sessionId);
  const recent = await readLastEntriesFromJsonl(jsonl, limit);
  if (recent.length > 0) {
    return recent;
  }

  const entries = await readSessionEntries(projectPath, sessionId, false);
  return entries.slice(-limit);
}
