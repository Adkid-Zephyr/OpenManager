import { existsSync, statSync } from 'fs';
import { open as openFile, readFile } from 'fs/promises';
import { exec, spawn } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import { HOME_DIR, WORKSPACE_DIR } from '../context.js';
import { getRecentSessionEntries, readSessionSummary } from '../lib/memory-store.js';

const execAsync = promisify(exec);

const CONTEXT_LIMITS = {
  sharedFirstTurn: 1200,
  sharedFollowup: 420,
  summaryFirstTurn: 1000,
  summaryFollowup: 360
};
const CHAT_RUN_TTL_MS = 10 * 60 * 1000;
const CHAT_RUN_MAX_EVENTS = 160;
const activeChatRuns = new Map();
let chatRunSeed = 0;

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

async function buildContextualMessage(projectName, sessionId, currentMessage) {
  if (!projectName || !sessionId) {
    return currentMessage;
  }

  const projectPath = join(WORKSPACE_DIR, 'projects', projectName);
  const sharedPath = join(projectPath, 'memory', 'shared.md');
  const recentEntries = await getRecentSessionEntries(projectPath, sessionId, 10);
  const priorEntries = stripCurrentUserEcho(recentEntries, currentMessage);
  const hasConversationHistory = priorEntries.some((entry) => ['user', 'assistant'].includes(entry.type));
  const simpleTurn = hasConversationHistory && isSimpleTurn(currentMessage);

  const sections = [
    '你在 OpenManager 的项目工作流中处理任务。',
    `项目：${projectName}`,
    `会话：${sessionId}`
  ];

  if (!simpleTurn) {
    const rawSharedMemory = existsSync(sharedPath) ? await readFile(sharedPath, 'utf-8') : '';
    const sharedMemory = squeezeText(
      rawSharedMemory,
      hasConversationHistory ? CONTEXT_LIMITS.sharedFollowup : CONTEXT_LIMITS.sharedFirstTurn
    );
    if (sharedMemory) {
      sections.push(`项目共享记忆：\n${sharedMemory}`);
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
  }

  const recentBlock = formatRecentEntries(recentEntries.slice(-6), currentMessage);
  if (recentBlock !== '暂无最近对话。') {
    sections.push(`最近对话：\n${recentBlock}`);
  }

  sections.push(
    `当前用户请求：\n${currentMessage}`,
    '要求：优先依据当前项目上下文回答；需要工具或本地文件操作时直接执行；不要重复复述整段上下文。'
  );

  return sections.join('\n\n');
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
    result: null
  };
  activeChatRuns.set(id, run);
  return run;
}

function pruneChatRuns() {
  const now = Date.now();
  for (const [id, run] of activeChatRuns.entries()) {
    if (now - run.updatedAt > CHAT_RUN_TTL_MS) {
      activeChatRuns.delete(id);
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
  run.status = result?.connected === false ? 'error' : 'completed';
  run.done = true;
  run.result = result;
}

function serializeChatRun(run, cursor = 0) {
  const base = {
    runId: run.id,
    status: run.status,
    done: run.done,
    cursor: run.nextEventId - 1,
    events: run.events.filter((event) => event.id > cursor)
  };

  if (run.done) {
    base.result = run.result;
  }

  return base;
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

async function runChatTurn({ project, session, message, onEvent = () => {} }) {
  let projectConfig = null;

  if (project) {
    const configPath = join(WORKSPACE_DIR, 'projects', project, '.project.json');
    if (existsSync(configPath)) {
      try {
        projectConfig = JSON.parse(await readFile(configPath, 'utf-8'));
      } catch (error) {
        console.error('[OpenClaw] Failed to read project config:', error.message);
      }
    }
  }

  console.log(
    `[OpenClaw] Chat request: project=${project}, session=${session}, message=${message.substring(0, 50)}...`
  );

  onEvent({ type: 'phase', phase: 'context', label: '准备上下文' });
  const contextualMessage = await buildContextualMessage(project, session, message);
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
        cwd: projectConfig?.workspacePath || WORKSPACE_DIR,
        env: { ...process.env, HOME: HOME_DIR },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

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

      if (code !== 0 && !hasJsonResult && stderr.trim()) {
        resolve({
          response: `⚠️ OpenClaw 错误\n\n${stderr.trim()}\n\n排查步骤：\n1. 确认网关运行中：\`openclaw gateway status\`\n2. 检查模型配置：\`openclaw config get model\`\n3. 确保有可用的 API 密钥`,
          connected: false,
          error: stderr
        });
        return;
      }

      try {
        const jsonMatch = stdout.match(/\{[\s\S]*"status"[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          const response =
            result.result?.payloads?.[0]?.text || result.response || result.message || stdout;
          const toolCalls = [];

          if (Array.isArray(result.result?.toolCalls)) {
            result.result.toolCalls.forEach((toolCall) => {
              const nextTool = {
                name: toolCall.name || toolCall.tool || 'unknown',
                args: toolCall.args || toolCall.parameters || {}
              };
              toolCalls.push(nextTool);
              onEvent({
                type: 'tool',
                name: nextTool.name,
                detail: Object.keys(nextTool.args || {}).slice(0, 3).join(', ')
              });
            });
          }

          resolve({
            response,
            connected: true,
            meta: result.result?.meta,
            toolCalls
          });
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
      onEvent: (event) => pushChatRunEvent(run, event)
    })
      .then((result) => {
        finishChatRun(run, result);
      })
      .catch((error) => {
        finishChatRun(run, {
          response: `⚠️ OpenClaw 执行失败\n\n${error.message}`,
          connected: false,
          error: error.message
        });
      });

    return { runId: run.id, status: run.status };
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

  'POST /api/openclaw/chat': async (body) => {
    const { project, session, message } = body;
    return runChatTurn({ project, session, message });
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
        defaultModel: defaultModel?.name || null,
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
