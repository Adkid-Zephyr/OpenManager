import { existsSync, statSync } from 'fs';
import { mkdir, open as openFile, readFile } from 'fs/promises';
import { exec, spawn } from 'child_process';
import { basename, join } from 'path';
import { promisify } from 'util';
import { DEFAULT_AGENT_ID, DEFAULT_MODEL, HOME_DIR, RUNTIME_DEFAULTS, WORKSPACE_DIR } from '../context.js';
import {
  appendSessionEntry,
  getRecentSessionEntries,
  readSessionFactsState,
  readSessionHotState,
  readSessionSummary
} from '../lib/memory-store.js';

const execAsync = promisify(exec);

const CONTEXT_LIMITS = {
  sharedFirstTurn: 600,
  sharedFollowup: 320,
  summaryFirstTurn: 480,
  summaryFollowup: 260
};
const CHAT_RUN_TTL_MS = 10 * 60 * 1000;
const CHAT_RUN_MAX_EVENTS = 160;
const LOCAL_CODEX_RUNNER_DIR = join(WORKSPACE_DIR, '.openmanager-codex-runner');
const activeChatRuns = new Map();
const activeSessionRuns = new Map();
let chatRunSeed = 0;

function getSessionRunKey(project, session) {
  return `${project || '__default__'}::${session || '__none__'}`;
}

function normalizeWorkspaceMode(projectConfig, projectPath) {
  if (projectConfig?.workspaceMode === 'main' || projectConfig?.workspaceMode === 'project' || projectConfig?.workspaceMode === 'custom') {
    return projectConfig.workspaceMode;
  }
  if (projectConfig?.workspacePath && projectPath && projectConfig.workspacePath === projectPath) {
    return 'project';
  }
  if (projectConfig?.workspacePath) {
    return 'custom';
  }
  return 'main';
}

function resolveExecutionConfig(project, projectConfig) {
  const projectPath = project ? join(WORKSPACE_DIR, 'projects', project) : null;
  const runtime = projectConfig?.runtime === 'local' ? 'local' : 'gateway';
  const workspaceMode = normalizeWorkspaceMode(projectConfig, projectPath);

  let cwd = WORKSPACE_DIR;
  if (workspaceMode === 'project' && projectPath) {
    cwd = projectPath;
  } else if (workspaceMode === 'custom' && projectConfig?.workspacePath) {
    cwd = projectConfig.workspacePath;
  }

  return {
    runtime,
    workspaceMode,
    cwd,
    projectPath
  };
}

async function readProjectConfig(project) {
  if (!project) return null;

  const configPath = join(WORKSPACE_DIR, 'projects', project, '.project.json');
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    return JSON.parse(await readFile(configPath, 'utf-8'));
  } catch (error) {
    console.error('[OpenClaw] Failed to read project config:', error.message);
    return null;
  }
}

function squeezeText(text, limit) {
  const normalized = String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized || normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trim()}\n…`;
}

function stripSummaryHeading(summary) {
  return String(summary || '')
    .replace(/^# .*?\n+/m, '')
    .trim();
}

function isSimpleTurn(message) {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.length > 24) return false;
  if (/[\n`/\\]/.test(normalized)) return false;

  return /^(你好|您好|hi|hello|hey|在吗|收到|好的|ok|继续|继续吧|开始吧|开始|测试|test)[!！?？.。 ]*$/.test(normalized);
}

function isIdentityTurn(message) {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized || normalized.length > 80) return false;

  return /^(你是|你现在是|现在是|who are you|are you|main|dashboard|你用的是哪个agent|你是main还是dashboard agent)/i.test(normalized);
}

function isDirectActionTurn(message) {
  const normalized = String(message || '').trim();
  if (!normalized) return false;

  if (/`[^`]+`/.test(normalized)) {
    return true;
  }

  if (/(^|[\s(])(cat|ls|pwd|rg|grep|git|npm|pnpm|yarn|bun|node|python|pip|sed|awk|tail|head|mkdir|touch|cp|mv|find|curl|wget|ssh|docker|kubectl|open)(?=$|[\s)`])/i.test(normalized)) {
    return true;
  }

  if (/(\/Users\/|~\/|\.\/|\.\.\/|[A-Za-z]:\\).+/.test(normalized)) {
    return true;
  }

  return /(读取|查看|打开|搜索|查找|编辑|修改|创建|删除|运行|执行|安装|修复|测试|读一下|看一下|查一下|read|open|edit|write|fix|run|install|test|search|find)/i.test(normalized);
}

function formatRecentEntries(entries, currentMessage) {
  const normalizedCurrent = (currentMessage || '').trim();
  let trimmed = [...entries]
    .filter((entry) => ['user', 'assistant', 'error'].includes(entry.type));

  const lastEntry = trimmed[trimmed.length - 1];
  if (
    lastEntry &&
    lastEntry.type === 'user' &&
    normalizedCurrent &&
    (lastEntry.text || '').trim() === normalizedCurrent
  ) {
    trimmed = trimmed.slice(0, -1);
  }

  if (trimmed.length === 0) {
    return '暂无最近对话。';
  }

  return trimmed
    .map((entry) => {
      const roleMap = {
        user: '用户',
        assistant: '助手',
        error: '错误',
        tools: '工具',
        meta: '元信息',
        compressed_summary: '摘要'
      };
      const role = roleMap[entry.type] || entry.type || '记录';
      return `[${role}] ${entry.text || ''}`;
    })
    .join('\n');
}

function formatHotState(hot) {
  if (!hot || typeof hot !== 'object') {
    return '';
  }

  const lines = [];
  if (hot.goal) lines.push(`- 当前目标：${trimText(hot.goal, 200)}`);
  if (hot.latestDecision) lines.push(`- 最近结论：${trimText(hot.latestDecision, 200)}`);
  if (hot.blocker) lines.push(`- 当前阻塞：${trimText(hot.blocker, 180)}`);
  if (hot.nextStep) lines.push(`- 下一步：${trimText(hot.nextStep, 180)}`);
  return lines.join('\n');
}

function formatFactsState(facts, limit = 6) {
  const items = Array.isArray(facts?.items) ? facts.items.slice(-limit) : [];
  if (items.length === 0) {
    return '';
  }

  const labels = {
    decision: '决策',
    constraint: '约束',
    todo: '待办',
    preference: '偏好'
  };

  return items
    .map((item) => `- [${labels[item.type] || item.type || '事实'}] ${trimText(item.text, 180)}`)
    .join('\n');
}

function stripCurrentUserEcho(entries, currentMessage) {
  const normalizedCurrent = (currentMessage || '').trim();
  const trimmed = [...entries].filter((entry) => ['user', 'assistant', 'error'].includes(entry.type));
  const lastEntry = trimmed[trimmed.length - 1];

  if (
    lastEntry &&
    lastEntry.type === 'user' &&
    normalizedCurrent &&
    (lastEntry.text || '').trim() === normalizedCurrent
  ) {
    return trimmed.slice(0, -1);
  }

  return trimmed;
}

async function readTaskSummary(projectPath, limit = 4) {
  const tasksPath = join(projectPath, 'tasks', 'tasks.json');
  if (!existsSync(tasksPath)) {
    return '暂无任务。';
  }

  try {
    const tasksData = JSON.parse(await readFile(tasksPath, 'utf-8'));
    const pending = (tasksData.tasks || []).filter((task) => !task.completed);
    if (pending.length === 0) {
      return '暂无未完成任务。';
    }

    return pending
      .slice(0, limit)
      .map((task) => `- [#${task.id}] ${task.description}`)
      .join('\n');
  } catch {
    return '任务读取失败。';
  }
}

async function buildProjectContextNote(projectName, sessionId, currentMessage) {
  if (!projectName || !sessionId) {
    return '';
  }

  const projectPath = join(WORKSPACE_DIR, 'projects', projectName);
  const sharedPath = join(projectPath, 'memory', 'shared.md');
  const recentEntries = await getRecentSessionEntries(projectPath, sessionId, 10);
  const priorEntries = stripCurrentUserEcho(recentEntries, currentMessage);
  const hasConversationHistory = priorEntries.some((entry) => ['user', 'assistant'].includes(entry.type));
  const simpleTurn = isSimpleTurn(currentMessage);
  const identityTurn = isIdentityTurn(currentMessage);
  const directActionTurn = isDirectActionTurn(currentMessage);

  if (simpleTurn || identityTurn || directActionTurn) {
    return '';
  }

  const sections = [
    `项目：${projectName}`,
    `会话：${sessionId}`
  ];

  const rawSharedMemory = existsSync(sharedPath) ? await readFile(sharedPath, 'utf-8') : '';
  const sharedMemory = squeezeText(
    rawSharedMemory,
    hasConversationHistory ? CONTEXT_LIMITS.sharedFollowup : CONTEXT_LIMITS.sharedFirstTurn
  );
  if (sharedMemory) {
    sections.push(`项目共享记忆：\n${sharedMemory}`);
  }

  const hotState = await readSessionHotState(projectPath, sessionId);
  const hotBlock = formatHotState(hotState);
  if (hotBlock) {
    sections.push(`当前工作记忆：\n${hotBlock}`);
  }

  const factsBlock = formatFactsState(await readSessionFactsState(projectPath, sessionId), 6);
  if (factsBlock) {
    sections.push(`关键事实：\n${factsBlock}`);
  }

  const summary = squeezeText(
    stripSummaryHeading(await readSessionSummary(projectPath, sessionId)),
    hasConversationHistory ? CONTEXT_LIMITS.summaryFollowup : CONTEXT_LIMITS.summaryFirstTurn
  );
  if (summary && !/^暂无摘要/.test(summary)) {
    sections.push(`当前会话摘要：\n${summary}`);
  }

  if (!hasConversationHistory || /任务|待办|todo|计划|安排/.test(currentMessage)) {
    sections.push(`当前未完成任务：\n${await readTaskSummary(projectPath, 4)}`);
  }

  const recentBlock = formatRecentEntries(recentEntries.slice(-6), currentMessage);
  if (recentBlock !== '暂无最近对话。') {
    sections.push(`最近对话：\n${recentBlock}`);
  }

  return sections.length > 2 ? sections.join('\n\n') : '';
}

function buildLocalCodexPrompt({ project, session, userMessage, projectCwd, contextNote }) {
  const sections = [
    '你在 OpenManager 中作为本地执行助手工作。',
    `当前项目：${project}`,
    `当前会话：${session}`,
    `首选工作目录：${projectCwd}`,
    '优先级：先处理用户当前请求，不要因为项目记忆而失语，也不要把注意力锁死在 memory 文件上。',
    '执行规则：只有在确实需要时才读文件、跑命令、改代码；一旦涉及本地操作，就在相关目录真实执行，并以结果为准。'
  ];

  if (contextNote) {
    sections.push(
      '项目附加上下文（按需参考，可忽略；不能因此限制正常工具使用或文件访问）：',
      contextNote
    );
  }

  sections.push(`当前用户请求：\n${userMessage}`);
  return sections.join('\n\n');
}

function getLocalCodexAddDirs(executionConfig) {
  return [...new Set([
    executionConfig?.cwd,
    executionConfig?.projectPath
  ].filter(Boolean))];
}

function trimText(text, limit = 180) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value || value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1).trim()}…`;
}

function normalizeToolCalls(toolCalls = []) {
  if (!Array.isArray(toolCalls)) {
    return [];
  }

  return toolCalls.map((toolCall) => ({
    name: toolCall?.name || toolCall?.tool || toolCall?.type || 'unknown',
    args: toolCall?.args || toolCall?.parameters || toolCall?.changes || {}
  }));
}

function normalizeAgentResponsePayload(payload, fallbackText = '') {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const result = payload.result && typeof payload.result === 'object' ? payload.result : payload;
  const responseText = Array.isArray(result.payloads)
    ? result.payloads.map((item) => item?.text).filter(Boolean).join('\n\n')
    : '';
  const response = responseText || result.response || result.message || fallbackText;

  return {
    response: String(response || '').trim() || fallbackText,
    connected: true,
    meta: result.meta || payload.meta || null,
    toolCalls: normalizeToolCalls(result.toolCalls || payload.toolCalls || [])
  };
}

function parseAgentJsonOutput(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return null;

  const candidates = [];
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    candidates.push(trimmed);
  }

  const broadMatch = trimmed.match(/\{[\s\S]*\}/);
  if (broadMatch && !candidates.includes(broadMatch[0])) {
    candidates.push(broadMatch[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizeAgentResponsePayload(parsed, trimmed);
      if (normalized) {
        return normalized;
      }
    } catch {
      // keep trying the next candidate
    }
  }

  return null;
}

function createChatRun(project, session, message) {
  const id = `chat-run-${Date.now()}-${(++chatRunSeed).toString(36)}`;
  const run = {
    id,
    project,
    session,
    message,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'running',
    events: [],
    nextEventId: 1,
    done: false,
    result: null,
    persisted: false,
    child: null,
    childKillTimer: null,
    control: {
      cancelRequested: false
    }
  };
  activeChatRuns.set(id, run);
  activeSessionRuns.set(getSessionRunKey(project, session), id);
  return run;
}

function pruneChatRuns() {
  const now = Date.now();
  for (const [id, run] of activeChatRuns.entries()) {
    if (now - run.updatedAt > CHAT_RUN_TTL_MS) {
      activeChatRuns.delete(id);
      const sessionKey = getSessionRunKey(run.project, run.session);
      if (activeSessionRuns.get(sessionKey) === id) {
        activeSessionRuns.delete(sessionKey);
      }
    }
  }
}

function pushChatRunEvent(run, event) {
  if (!run) return;
  run.updatedAt = Date.now();
  run.events.push({
    id: run.nextEventId++,
    time: new Date().toISOString(),
    ...event
  });
  if (run.events.length > CHAT_RUN_MAX_EVENTS) {
    run.events = run.events.slice(-CHAT_RUN_MAX_EVENTS);
  }
}

function finishChatRun(run, result) {
  if (!run) return;
  run.updatedAt = Date.now();
  run.status = result?.stopped
    ? 'stopped'
    : result?.connected === false
      ? 'error'
      : 'completed';
  run.done = true;
  run.result = result;
  if (run.childKillTimer) {
    clearTimeout(run.childKillTimer);
    run.childKillTimer = null;
  }
  run.child = null;
}

function serializeChatRun(run, cursor = 0) {
  const base = {
    runId: run.id,
    status: run.status,
    done: run.done,
    cancelRequested: Boolean(run.control?.cancelRequested),
    project: run.project,
    session: run.session,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    cursor: run.nextEventId - 1,
    events: run.events.filter((event) => event.id > cursor)
  };

  if (run.done) {
    base.result = run.result;
  }

  return base;
}

function attachChatRunProcess(run, child) {
  if (!run || !child) return;
  run.child = child;
  run.updatedAt = Date.now();
}

function requestChatRunStop(run) {
  if (!run || run.done || run.control?.cancelRequested || !run.child) {
    return false;
  }

  run.control.cancelRequested = true;
  run.status = 'stopping';
  run.updatedAt = Date.now();
  pushChatRunEvent(run, {
    type: 'phase',
    phase: 'stopping',
    label: '停止运行',
    detail: '已发送停止请求，等待本地进程退出'
  });

  try {
    run.child.kill('SIGTERM');
  } catch {
    return false;
  }

  run.childKillTimer = setTimeout(() => {
    try {
      run.child?.kill('SIGKILL');
    } catch {
      // ignore
    }
  }, 5000);

  return true;
}

async function persistChatRunResult(run, result) {
  if (!run?.project || !run?.session || run.persisted) {
    return;
  }

  const projectPath = join(WORKSPACE_DIR, 'projects', run.project);
  if (!existsSync(projectPath)) {
    return;
  }

  const now = new Date().toISOString();
  const baseEntry = { runId: run.id, time: now };

  if (result?.stopped) {
    await appendSessionEntry(projectPath, run.session, {
      ...baseEntry,
      type: 'meta',
      text: '⏹️ 当前运行已手动停止'
    });
    run.persisted = true;
    return;
  }

  if (result?.connected === false) {
    await appendSessionEntry(projectPath, run.session, {
      ...baseEntry,
      type: 'error',
      text: result.response || 'OpenClaw 执行失败'
    });
    run.persisted = true;
    return;
  }

  await appendSessionEntry(projectPath, run.session, {
    ...baseEntry,
    type: 'assistant',
    text: result?.response || 'OpenClaw 已处理'
  });

  if (result?.meta) {
    await appendSessionEntry(projectPath, run.session, {
      ...baseEntry,
      type: 'meta',
      text: `⏱️ 耗时：${(result.meta.durationMs / 1000).toFixed(1)}s | 🤖 模型：${result.meta.agentMeta?.model || 'unknown'}`
    });
  }

  if (Array.isArray(result?.toolCalls) && result.toolCalls.length > 0) {
    await appendSessionEntry(projectPath, run.session, {
      ...baseEntry,
      type: 'tools',
      text: `🔧 调用工具：${result.toolCalls.map((tool) => tool.name).join(', ')}`
    });
  }

  run.persisted = true;
}

async function readLogDelta(path, offset) {
  if (!existsSync(path)) {
    return { text: '', nextOffset: offset };
  }

  const handle = await openFile(path, 'r');
  try {
    const stats = await handle.stat();
    if (stats.size <= offset) {
      return { text: '', nextOffset: stats.size };
    }

    const length = stats.size - offset;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, offset);
    return { text: buffer.toString('utf8'), nextOffset: stats.size };
  } finally {
    await handle.close();
  }
}

function normalizeLogPayload(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed?.[0] === 'string') {
      return parsed[0];
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

function maybePushToolEventFromText(text, seenToolEvents, onEvent) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return;

  const match = normalized.match(/\b(read|write|edit|exec|browser|web_search|web_fetch|memory_search|memory_get)\b/i);
  if (!match) return;

  const toolName = match[1];
  const key = `${toolName}:${normalized}`;
  if (seenToolEvents.has(key)) return;
  seenToolEvents.add(key);

  onEvent({
    type: 'tool',
    name: toolName,
    detail: normalized.slice(0, 160)
  });
}

async function runOpenClawChatTurn({ project, session, contextualMessage, executionConfig, projectConfig, control, onProcess = () => {}, onEvent = () => {} }) {
  onEvent({ type: 'phase', phase: 'context', label: '准备上下文' });
  onEvent({ type: 'phase', phase: 'thinking', label: 'thinking', detail: '等待 OpenClaw 返回结果' });

  return new Promise((resolve) => {
    const args = ['agent'];
    if (projectConfig?.agentId) {
      args.push('--agent', projectConfig.agentId);
    }
    args.push('--session-id', session, '--message', contextualMessage, '--json', '--thinking', 'off');

    const child = spawn(
      'openclaw',
      args,
      {
        cwd: executionConfig.cwd,
        env: { ...process.env, HOME: HOME_DIR },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    onProcess(child);

    let stdout = '';
    let stderr = '';
    let hasJsonResult = false;
    const logPath = `/tmp/openclaw/openclaw-${new Date().toISOString().split('T')[0]}.log`;
    let logOffset = existsSync(logPath) ? statSync(logPath).size : 0;
    const seenToolEvents = new Set();

    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(waitingHintTimer);
      clearInterval(logWatcher);
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      cleanup();
      resolve({
        response:
          '⚠️ OpenClaw 响应超时\n\n消息已记录在本地记忆中，但 OpenClaw 未在 120 秒内响应。\n\n可能原因：\n- 模型响应较慢\n- 网关队列拥堵\n- 网络问题\n\n建议：\n- 稍后再试\n- 检查 `openclaw gateway status`\n- 查看日志了解详细进度',
        connected: false,
        timedOut: true
      });
    }, 120000);

    const waitingHintTimer = setTimeout(() => {
      onEvent({
        type: 'phase',
        phase: 'waiting',
        label: '等待模型',
        detail: '还在运行，可能正在推理、读文件或等待工具返回'
      });
    }, 1800);

    onEvent({
      type: 'note',
      detail: `${projectConfig?.agentId ? `Agent ${projectConfig.agentId}` : '默认 main'} · ${executionConfig.cwd}`
    });

    const logWatcher = setInterval(async () => {
      try {
        const { text, nextOffset } = await readLogDelta(logPath, logOffset);
        logOffset = nextOffset;
        if (!text) return;

        text
          .split(/\r?\n/)
          .map((line) => normalizeLogPayload(line))
          .filter(Boolean)
          .forEach((payload) => {
            if (!payload.includes(session)) return;
            if (!/toolCalls|tool call|calling tool|invok/i.test(payload)) return;
            maybePushToolEventFromText(payload, seenToolEvents, onEvent);
          });
      } catch {
        // 日志抓取只是增强路径，失败时静默降级
      }
    }, 500);

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (chunk.includes('"status": "ok"') || chunk.includes('"payloads"')) {
        hasJsonResult = true;
      }

      chunk
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          if (/^Registered plugin command:/.test(line)) return;
          if (/^[\[\]{}"]/.test(line) || /"tools"|"schemaChars"|"propertiesCount"/.test(line)) return;
          maybePushToolEventFromText(line, seenToolEvents, onEvent);
        });
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      chunk
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          if (/^[\[\]{}"]/.test(line) || /"tools"|"schemaChars"|"propertiesCount"/.test(line)) return;
          maybePushToolEventFromText(line, seenToolEvents, onEvent);
        });
    });

    child.on('close', (code) => {
      cleanup();

      if (control?.cancelRequested) {
        resolve({
          response: '已停止当前运行。',
          connected: false,
          stopped: true
        });
        return;
      }

      if (code !== 0 && !hasJsonResult && stderr.trim()) {
        resolve({
          response: `⚠️ OpenClaw 错误\n\n${stderr.trim()}\n\n排查步骤：\n1. 确认网关运行中：\`openclaw gateway status\`\n2. 检查模型配置：\`openclaw config get model\`\n3. 确保有可用的 API 密钥`,
          connected: false,
          error: stderr
        });
        return;
      }

      try {
        const parsed = parseAgentJsonOutput(stdout);
        if (parsed) {
          parsed.toolCalls.forEach((toolCall) => {
            onEvent({
              type: 'tool',
              name: toolCall.name,
              detail: Object.keys(toolCall.args || {}).slice(0, 3).join(', ')
            });
          });
          resolve(parsed);
          return;
        }
      } catch {
        // 使用下面的原始输出降级路径
      }

      resolve({
        response: stdout.trim() || 'OpenClaw 已处理（无输出）',
        connected: true
      });
    });

    child.on('error', (error) => {
      cleanup();
      resolve({
        response: `⚠️ OpenClaw 启动失败\n\n${error.message}\n\n请确认 OpenClaw 已正确安装且在 PATH 中。`,
        connected: false,
        error: error.message
      });
    });
  });
}

async function runCodexChatTurn({ project, session, message, contextNote, executionConfig, projectConfig, control, onProcess = () => {}, onEvent = () => {} }) {
  onEvent({ type: 'phase', phase: 'context', label: '准备上下文' });
  onEvent({ type: 'phase', phase: 'thinking', label: 'thinking', detail: '等待本地执行器返回结果' });

  await mkdir(LOCAL_CODEX_RUNNER_DIR, { recursive: true });
  const codexPrompt = buildLocalCodexPrompt({
    project,
    session,
    userMessage: message,
    projectCwd: executionConfig.cwd,
    contextNote
  });

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const args = [
      'exec',
      '-C',
      LOCAL_CODEX_RUNNER_DIR,
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
      '--json',
      '--color',
      'never',
      '--ephemeral'
    ];

    getLocalCodexAddDirs(executionConfig).forEach((dir) => {
      args.push('--add-dir', dir);
    });

    if (projectConfig?.model && /^(gpt|o[1345]|codex)/i.test(projectConfig.model)) {
      args.push('-m', projectConfig.model);
    }

    args.push(codexPrompt);

    const child = spawn(
      'codex',
      args,
      {
        cwd: LOCAL_CODEX_RUNNER_DIR,
        env: { ...process.env, HOME: HOME_DIR },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    onProcess(child);

    let stderr = '';
    let stdoutBuffer = '';
    let lastAgentMessage = '';
    const toolCalls = [];
    const seenToolDetails = new Set();

    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(waitingHintTimer);
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      cleanup();
      resolve({
        response:
          '⚠️ 本地执行超时\n\n任务已提交，但本地执行器未在 120 秒内完成。请稍后重试，或切回 Gateway Agent。',
        connected: false,
        timedOut: true
      });
    }, 120000);

    const waitingHintTimer = setTimeout(() => {
      onEvent({
        type: 'phase',
        phase: 'waiting',
        label: '等待模型',
        detail: '还在运行，可能正在读写文件、执行命令或整理结果'
      });
    }, 1800);

    onEvent({
      type: 'note',
      detail: `本地 Codex · ${executionConfig.cwd}`
    });

    const handleCodexEvent = (event) => {
      if (!event || typeof event !== 'object') return;

      if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
        lastAgentMessage = event.item.text || lastAgentMessage;
        onEvent({
          type: 'note',
          detail: trimText(lastAgentMessage, 140)
        });
        return;
      }

      if (event.type === 'item.completed' && event.item?.type === 'file_change') {
        (event.item.changes || []).forEach((change) => {
          const detail = `${change.kind || 'change'}: ${basename(change.path || 'file')}`;
          if (seenToolDetails.has(detail)) return;
          seenToolDetails.add(detail);
          toolCalls.push({
            name: 'file_change',
            args: {
              path: change.path || '',
              kind: change.kind || 'change'
            }
          });
          onEvent({
            type: 'tool',
            name: 'file_change',
            detail
          });
        });
        return;
      }

      if (event.type === 'item.completed' && event.item?.type === 'shell_command') {
        const detail = trimText(event.item.command || 'shell command', 140);
        if (!seenToolDetails.has(detail)) {
          seenToolDetails.add(detail);
          toolCalls.push({
            name: 'exec',
            args: {
              command: event.item.command || ''
            }
          });
          onEvent({
            type: 'tool',
            name: 'exec',
            detail
          });
        }
      }
    };

    child.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();

      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';

      lines
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          try {
            handleCodexEvent(JSON.parse(line));
          } catch {
            // 忽略非 JSON 行，例如外部工具的 warning
          }
        });
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      cleanup();

      const tail = stdoutBuffer.trim();
      if (tail) {
        try {
          handleCodexEvent(JSON.parse(tail));
        } catch {
          // ignore trailing non-json
        }
      }

      if (control?.cancelRequested) {
        resolve({
          response: '已停止当前运行。',
          connected: false,
          stopped: true,
          toolCalls
        });
        return;
      }

      if (code !== 0) {
        resolve({
          response: `⚠️ 本地执行失败\n\n${stderr.trim() || 'Codex CLI 返回非 0 退出码。'}`,
          connected: false,
          error: stderr.trim() || `exit code ${code}`
        });
        return;
      }

      resolve({
        response: lastAgentMessage || '本地执行已完成。',
        connected: true,
        meta: {
          durationMs: Date.now() - startedAt,
          agentMeta: {
            provider: 'codex',
            model: projectConfig?.model && /^(gpt|o[1345]|codex)/i.test(projectConfig.model)
              ? projectConfig.model
              : 'codex-local'
          }
        },
        toolCalls
      });
    });

    child.on('error', (error) => {
      cleanup();
      resolve({
        response: `⚠️ 本地执行器启动失败\n\n${error.message}`,
        connected: false,
        error: error.message
      });
    });
  });
}

async function runChatTurn({ project, session, message, control = { cancelRequested: false }, onProcess = () => {}, onEvent = () => {} }) {
  const projectConfig = await readProjectConfig(project);
  const executionConfig = resolveExecutionConfig(project, projectConfig);

  console.log(
    `[OpenClaw] Chat request: project=${project}, session=${session}, runtime=${executionConfig.runtime}, message=${message.substring(0, 50)}...`
  );

  if (executionConfig.runtime === 'local') {
    const contextNote = await buildProjectContextNote(project, session, message);
    return runCodexChatTurn({
      project,
      session,
      message,
      contextNote,
      executionConfig,
      projectConfig,
      control,
      onProcess,
      onEvent
    });
  }

  return runOpenClawChatTurn({
    project,
    session,
    contextualMessage: message,
    executionConfig,
    projectConfig,
    control,
    onProcess,
    onEvent
  });
}

export const openclawRoutes = {
  'POST /api/openclaw/chat/start': async (body) => {
    const { project, session, message } = body;
    pruneChatRuns();

    if (!session || !message) {
      throw new Error('缺少 session 或 message');
    }

    const run = createChatRun(project, session, message);

    runChatTurn({
      project,
      session,
      message,
      control: run.control,
      onProcess: (child) => attachChatRunProcess(run, child),
      onEvent: (event) => pushChatRunEvent(run, event)
    })
      .then(async (result) => {
        await persistChatRunResult(run, result);
        finishChatRun(run, result);
      })
      .catch(async (error) => {
        const result = {
          response: `⚠️ OpenClaw 执行失败\n\n${error.message}`,
          connected: false,
          error: error.message
        };
        await persistChatRunResult(run, result);
        finishChatRun(run, result);
      });

    return { runId: run.id, status: run.status, createdAt: run.createdAt };
  },

  'GET /api/openclaw/chat/session/:sessionId': async (_body, params, query) => {
    pruneChatRuns();
    const project = query.project || '';
    const runId = activeSessionRuns.get(getSessionRunKey(project, params.sessionId));

    if (!runId) {
      return { found: false };
    }

    const run = activeChatRuns.get(runId);
    if (!run) {
      return { found: false };
    }

    const cursor = Number(query.cursor || 0);
    return {
      found: true,
      ...serializeChatRun(run, Number.isFinite(cursor) ? cursor : 0)
    };
  },

  'GET /api/openclaw/chat/runs/:runId': async (_body, params, query) => {
    pruneChatRuns();
    const run = activeChatRuns.get(params.runId);
    if (!run) {
      throw new Error('运行不存在或已过期');
    }

    const cursor = Number(query.cursor || 0);
    return serializeChatRun(run, Number.isFinite(cursor) ? cursor : 0);
  },

  'POST /api/openclaw/chat/runs/:runId/stop': async (_body, params) => {
    pruneChatRuns();
    const run = activeChatRuns.get(params.runId);
    if (!run) {
      throw new Error('运行不存在或已过期');
    }

    if (run.done) {
      return { success: true, alreadyDone: true, status: run.status };
    }

    const success = requestChatRunStop(run);
    return {
      success,
      status: run.status,
      stopping: run.status === 'stopping'
    };
  },

  'POST /api/openclaw/chat': async (body) => {
    const { project, session, message } = body;
    const result = await runChatTurn({ project, session, message });
    await persistChatRunResult({ id: `direct-${Date.now()}`, project, session, persisted: false }, result);
    return result;
  },

  'GET /api/openclaw/logs': async () => {
    try {
      const logPath = `/tmp/openclaw/openclaw-${new Date().toISOString().split('T')[0]}.log`;
      const { stdout } = await execAsync(`tail -100 "${logPath}" 2>/dev/null || echo "日志文件不存在或为空"`, {
        timeout: 5000
      });

      const logs = stdout
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          try {
            const parsed = JSON.parse(line);
            return {
              time: parsed.time,
              level: parsed._meta?.logLevelName || 'INFO',
              message: parsed[0] || JSON.stringify(parsed),
              raw: line
            };
          } catch {
            return {
              time: new Date().toISOString(),
              level: 'INFO',
              message: line,
              raw: line
            };
          }
        })
        .reverse();

      return { logs, logPath };
    } catch (error) {
      return { logs: [], error: error.message };
    }
  },

  'GET /api/openclaw/agents': async () => {
    try {
      const { stdout } = await execAsync('openclaw agents list --json', {
        timeout: 10000,
        env: { ...process.env, HOME: HOME_DIR }
      });
      return { agents: JSON.parse(stdout) };
    } catch (error) {
      return { agents: [], error: error.message };
    }
  },

  'GET /api/openclaw/runtime': async () => ({
    workspaceDir: WORKSPACE_DIR,
    defaultAgentId: DEFAULT_AGENT_ID,
    defaultAgentWorkspace: RUNTIME_DEFAULTS.defaultAgentWorkspace,
    defaultModel: DEFAULT_MODEL,
    source: RUNTIME_DEFAULTS.source
  }),

  'GET /api/openclaw/models': async () => {
    try {
      const { stdout } = await execAsync('openclaw models list --json', {
        timeout: 12000,
        env: { ...process.env, HOME: HOME_DIR }
      });
      const parsed = JSON.parse(stdout);
      const models = Array.isArray(parsed.models)
        ? parsed.models.filter((model) => model && model.available !== false && model.missing !== true)
        : [];
      const defaultModel = models.find((model) => Array.isArray(model.tags) && model.tags.includes('default')) || null;

      return {
        count: models.length,
        defaultModel: defaultModel?.key || defaultModel?.name || null,
        defaultModelName: defaultModel?.name || null,
        models
      };
    } catch (error) {
      return { count: 0, defaultModel: null, models: [], error: error.message };
    }
  },

  'POST /api/openclaw/compress': async (body) => {
    const { entries } = body;
    const userMessages = entries.filter((entry) => entry.type === 'user').map((entry) => entry.text);
    const assistantMessages = entries
      .filter((entry) => entry.type === 'assistant')
      .map((entry) => entry.text);

    const startTime = entries[0]?.time
      ? new Date(entries[0].time).toLocaleString('zh-CN')
      : '未知';
    const endTime = entries[entries.length - 1]?.time
      ? new Date(entries[entries.length - 1].time).toLocaleString('zh-CN')
      : '未知';

    try {
      const compressPrompt = `请总结以下对话，提取关键信息和决策：

用户问题：
${userMessages.map((message) => `- ${message}`).join('\n')}

AI 响应要点：
${assistantMessages.map((message) => `- ${message}`).join('\n')}

请用简洁的中文总结核心内容，包括：
1. 主要讨论的话题
2. 达成的结论或决策
3. 待办事项或后续步骤
4. 重要技术细节`;

      const cmd = `echo "${compressPrompt.replace(/"/g, '\\"')}" | openclaw --prompt -`;
      const { stdout } = await execAsync(cmd, { timeout: 30000 });

      if (stdout && stdout.trim().length > 0) {
        return {
          summary: `## 📝 AI 对话总结\n\n${stdout.trim()}\n\n---\n**压缩时间**: ${new Date().toLocaleString('zh-CN')}\n**原始记录数**: ${entries.length}`,
          method: 'openclaw-ai'
        };
      }
    } catch (error) {
      console.log('OpenClaw AI compression not available, using fallback:', error.message);
    }

    const keyTopics = [
      ...new Set(
        userMessages
          .map((message) => message.split(/[?？.]/)[0].trim())
          .filter((topic) => topic.length > 3)
      )
    ];

    return {
      summary: `## 📋 对话摘要

### 讨论主题
${keyTopics.slice(0, 5).map((topic) => `- ${topic}`).join('\n') || '- 未识别明确主题'}

### 用户提问 (${userMessages.length}条)
${userMessages.slice(-5).map((message) => `- ${message}`).join('\n')}

### AI 响应要点 (${assistantMessages.length}条)
${assistantMessages.slice(-5).map((message) => `- ${message}`).join('\n')}

---
**压缩时间**: ${new Date().toLocaleString('zh-CN')}  
**时间范围**: ${startTime} - ${endTime}  
**原始记录数**: ${entries.length}条`,
      method: 'fallback'
    };
  }
};
