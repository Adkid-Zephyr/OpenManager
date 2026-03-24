import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4571);
const host = process.env.HOST || '127.0.0.1';
const baseUrl = `http://${host}:${port}`;

const workspaceDir = await mkdtemp(join(tmpdir(), 'openmanager-regression-'));
const fixtureDir = join(workspaceDir, 'fixtures');
const customWorkspacePath = join(workspaceDir, 'custom-runtime-workspace');
await mkdir(fixtureDir, { recursive: true });
await mkdir(customWorkspacePath, { recursive: true });

const fixtureImagePath = join(fixtureDir, 'regression-image.png');
await writeFile(
  fixtureImagePath,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn7nWQAAAAASUVORK5CYII=',
    'base64'
  )
);

const child = spawn(process.execPath, ['server.js'], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: host,
    OPENMANAGER_WORKSPACE_DIR: workspaceDir
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

function fulfillJson(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

async function waitForServer() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return response.json();
      }
    } catch {
      // retry
    }
    await delay(300);
  }
  throw new Error(`Server did not become ready.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
}

async function apiJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const data = await response.json();
  if (!response.ok || data?.error) {
    throw new Error(`API ${path} failed: ${data?.error || response.status}`);
  }
  return data;
}

async function expectText(locator, expected) {
  const value = await locator.textContent();
  assert.ok(value?.includes(expected), `Expected text "${expected}", got "${value}"`);
}

async function waitForText(page, text, selector = 'body') {
  await page.waitForFunction(
    ({ selector: target, text: expected }) => {
      const node = document.querySelector(target);
      return node?.textContent?.includes(expected);
    },
    { selector, text }
  );
}

async function waitForMissingText(page, text, selector = 'body') {
  await page.waitForFunction(
    ({ selector: target, text: expected }) => {
      const node = document.querySelector(target);
      return !node?.textContent?.includes(expected);
    },
    { selector, text }
  );
}

async function clickActionButtonByItem({
  page,
  rootSelector,
  itemText,
  buttonTitle = null,
  buttonText = null
}) {
  const clicked = await page.evaluate(({ rootSelector: root, itemText: text, buttonTitle: title, buttonText: label }) => {
    const rootNode = document.querySelector(root);
    if (!rootNode) return false;

    const buttons = Array.from(rootNode.querySelectorAll('button'));
    const matched = buttons.find((button) => {
      if (title && button.getAttribute('title') !== title) {
        return false;
      }
      if (label && !button.textContent?.includes(label)) {
        return false;
      }

      let current = button.parentElement;
      while (current && current !== rootNode) {
        if (current.textContent?.includes(text)) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    });

    if (!matched) return false;
    matched.click();
    return true;
  }, { rootSelector, itemText, buttonTitle, buttonText });

  assert.ok(clicked, `Expected to click action for "${itemText}" in ${rootSelector}`);
}

async function clickProjectListItem(page, projectName) {
  const clicked = await page.evaluate((targetName) => {
    const items = Array.from(document.querySelectorAll('#projectList .project-item'));
    const matched = items.find((item) => item.querySelector('.project-name')?.textContent?.trim() === targetName);
    if (!matched) return false;
    matched.click();
    return true;
  }, projectName);

  assert.ok(clicked, `Expected project list item "${projectName}" to exist.`);
}

async function clickActionButtonForExactLabel({
  page,
  rootSelector,
  labelText,
  buttonTitle = null,
  buttonText = null
}) {
  const clicked = await page.evaluate(({ rootSelector: root, labelText: label, buttonTitle: title, buttonText: text }) => {
    const rootNode = document.querySelector(root);
    if (!rootNode) return false;

    const labelNodes = Array.from(rootNode.querySelectorAll('*')).filter(
      (node) => node.textContent?.trim() === label
    );

    for (const labelNode of labelNodes) {
      let current = labelNode;
      while (current && current !== rootNode) {
        const buttons = Array.from(current.querySelectorAll('button'));
        const matched = buttons.find((button) => {
          if (title && button.getAttribute('title') !== title) return false;
          if (text && !button.textContent?.includes(text)) return false;
          return true;
        });

        if (matched) {
          matched.click();
          return true;
        }
        current = current.parentElement;
      }
    }

    return false;
  }, { rootSelector, labelText, buttonTitle, buttonText });

  assert.ok(clicked, `Expected exact label action for "${labelText}" in ${rootSelector}`);
}

const health = await waitForServer();
assert.equal(health.status, 'ok');

const browser = await chromium.launch({
  headless: true
});

const context = await browser.newContext();
const page = await context.newPage();

const dialogQueue = [];
page.on('dialog', async (dialog) => {
  const type = dialog.type();
  const index = dialogQueue.findIndex((item) => item.type === type);
  const next = index === -1 ? null : dialogQueue.splice(index, 1)[0];

  if (type === 'prompt') {
    await dialog.accept(String(next?.value ?? ''));
    return;
  }

  if (type === 'confirm') {
    if (next?.accept === false) {
      await dialog.dismiss();
    } else {
      await dialog.accept();
    }
    return;
  }

  await dialog.accept();
});

function queuePrompt(value) {
  dialogQueue.push({ type: 'prompt', value });
}

function queueConfirm(accept = true) {
  dialogQueue.push({ type: 'confirm', accept });
}

const runtimeState = {
  defaultModel: 'qwen3.5-plus',
  defaultAgentId: 'main',
  workspaceDir,
  agents: [
    { id: 'main', workspace: workspaceDir },
    { id: 'dashboard-gw', workspace: customWorkspacePath }
  ],
  models: [
    { name: 'qwen3.5-plus', key: 'qwen3.5-plus', tags: ['default'] },
    { name: 'gpt-5.1', key: 'gpt-5.1', tags: [] }
  ],
  skills: [
    {
      name: 'find',
      description: 'Search project knowledge quickly',
      emoji: '🔎',
      eligible: true,
      disabled: false,
      blockedByAllowlist: false
    },
    {
      name: 'skill-finder-cn',
      description: 'Find more Chinese-friendly skills',
      emoji: '🧭',
      eligible: true,
      disabled: true,
      blockedByAllowlist: false
    }
  ],
  cronJobs: [
    {
      id: 'cron-enabled-1',
      name: '每日巡检',
      enabled: true,
      schedule: { expr: '0 9 * * *' },
      nextAt: new Date(Date.now() + 3600_000).toISOString()
    },
    {
      id: 'cron-disabled-1',
      name: '每周复盘',
      enabled: false,
      schedule: { expr: '0 18 * * 5' },
      nextAt: null
    }
  ],
  cronRunCalls: 0,
  nextCronId: 2
};

const runState = {
  runId: 'regression-run-1',
  createdAt: Date.now(),
  stopped: false,
  reconnectCalls: 0,
  stopCalls: 0,
  statusCalls: 0,
  sessionId: null,
  message: null
};

await page.route(/\/api\/openclaw\/runtime(?:\?.*)?$/, async (route) => {
  await fulfillJson(route, {
    workspaceDir: runtimeState.workspaceDir,
    defaultAgentId: runtimeState.defaultAgentId,
    defaultAgentWorkspace: runtimeState.workspaceDir,
    defaultModel: runtimeState.defaultModel,
    source: {
      model: 'regression-stub'
    }
  });
});

await page.route(/\/api\/openclaw\/agents(?:\?.*)?$/, async (route) => {
  await fulfillJson(route, { agents: runtimeState.agents });
});

await page.route(/\/api\/openclaw\/models(?:\?.*)?$/, async (route) => {
  await fulfillJson(route, {
    models: runtimeState.models,
    defaultModel: runtimeState.defaultModel
  });
});

await page.route(/\/api\/skills\/list(?:\?.*)?$/, async (route) => {
  await fulfillJson(route, {
    skills: runtimeState.skills.map((skill) => ({ ...skill })),
    count: runtimeState.skills.length
  });
});

await page.route(/\/api\/skills\/[^/]+\/toggle(?:\?.*)?$/, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const skillName = decodeURIComponent(url.pathname.split('/')[3] || '');
  const body = JSON.parse(request.postData() || '{}');
  const enabled = body.enabled !== false;
  const skill = runtimeState.skills.find((item) => item.name === skillName);
  if (skill) {
    skill.disabled = !enabled;
  }

  await fulfillJson(route, {
    success: true,
    name: skillName,
    enabled
  });
});

await page.route(/\/api\/cron\/jobs(?:\/.*)?$/, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const parts = url.pathname.split('/').filter(Boolean);

  if (url.pathname === '/api/cron/jobs' && method === 'GET') {
    await fulfillJson(route, {
      jobs: runtimeState.cronJobs.map((job) => ({ ...job, schedule: { ...job.schedule } })),
      count: runtimeState.cronJobs.length
    });
    return;
  }

  if (url.pathname === '/api/cron/jobs' && method === 'POST') {
    const body = JSON.parse(request.postData() || '{}');
    runtimeState.nextCronId += 1;
    const job = {
      id: `cron-regression-${runtimeState.nextCronId}`,
      jobId: `cron-regression-${runtimeState.nextCronId}`,
      name: body.name,
      enabled: true,
      schedule: { expr: body.cron },
      nextAt: new Date(Date.now() + 7200_000).toISOString()
    };
    runtimeState.cronJobs.push(job);

    await fulfillJson(route, {
      success: true,
      job
    });
    return;
  }

  const jobId = parts[3];
  const action = parts[4];
  const job = runtimeState.cronJobs.find((item) => (item.id || item.jobId) === jobId);

  if (!job) {
    await fulfillJson(route, { success: false, error: '任务不存在' }, 404);
    return;
  }

  if (method === 'POST' && action === 'run') {
    runtimeState.cronRunCalls += 1;
    await fulfillJson(route, {
      success: true,
      message: `任务 ${jobId} 已运行`
    });
    return;
  }

  if (method === 'POST' && action === 'enable') {
    job.enabled = true;
    await fulfillJson(route, { success: true, id: jobId, enabled: true });
    return;
  }

  if (method === 'POST' && action === 'disable') {
    job.enabled = false;
    await fulfillJson(route, { success: true, id: jobId, enabled: false });
    return;
  }

  if (method === 'DELETE' && parts.length === 4) {
    runtimeState.cronJobs = runtimeState.cronJobs.filter((item) => (item.id || item.jobId) !== jobId);
    await fulfillJson(route, {
      success: true,
      id: jobId
    });
    return;
  }

  await route.fallback();
});

await page.route(/\/api\/openclaw\/chat(?:\/.*)?$/, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const { pathname } = url;
  const method = request.method();

  if (pathname === '/api/openclaw/chat/start' && method === 'POST') {
    const body = JSON.parse(request.postData() || '{}');
    runState.createdAt = Date.now();
    runState.stopped = false;
    runState.statusCalls = 0;
    runState.sessionId = body.session || null;
    runState.message = body.message || null;

    await fulfillJson(route, {
      runId: runState.runId,
      status: 'running',
      createdAt: runState.createdAt
    });
    return;
  }

  if (pathname === `/api/openclaw/chat/runs/${runState.runId}/stop` && method === 'POST') {
    runState.stopCalls += 1;
    runState.stopped = true;

    await fulfillJson(route, {
      success: true,
      status: 'stopping',
      stopping: true
    });
    return;
  }

  if (runState.sessionId && pathname === `/api/openclaw/chat/session/${runState.sessionId}` && method === 'GET') {
    runState.reconnectCalls += 1;
    await fulfillJson(route, {
      found: true,
      runId: runState.runId,
      project: '',
      session: runState.sessionId,
      createdAt: runState.createdAt,
      status: runState.stopped ? 'stopped' : 'running',
      done: runState.stopped,
      cancelRequested: false,
      updatedAt: Date.now(),
      cursor: 1,
      events: [
        {
          id: 1,
          time: new Date().toISOString(),
          type: 'phase',
          phase: 'thinking',
          label: 'thinking',
          detail: 'waiting for regression stub'
        }
      ],
      result: runState.stopped
        ? {
            stopped: true,
            response: '已停止当前运行。',
            meta: {
              durationMs: 50,
              agentMeta: {
                model: 'playwright-stub'
              }
            },
            toolCalls: []
          }
        : undefined
    });
    return;
  }

  if (pathname === `/api/openclaw/chat/runs/${runState.runId}` && method === 'GET') {
    runState.statusCalls += 1;
    const payload = runState.stopped
      ? {
          runId: runState.runId,
          status: 'stopped',
          done: true,
          cancelRequested: true,
          project: '',
          session: runState.sessionId,
          createdAt: runState.createdAt,
          updatedAt: Date.now(),
          cursor: runState.statusCalls,
          events: [
            {
              id: runState.statusCalls,
              time: new Date().toISOString(),
              type: 'phase',
              phase: 'stopping',
              label: '停止运行',
              detail: '已发送停止请求，等待测试桩退出'
            }
          ],
          result: {
            stopped: true,
            response: '已停止当前运行。',
            meta: {
              durationMs: 120,
              agentMeta: {
                model: 'playwright-stub'
              }
            },
            toolCalls: []
          }
        }
      : {
          runId: runState.runId,
          status: 'running',
          done: false,
          cancelRequested: false,
          project: '',
          session: runState.sessionId,
          createdAt: runState.createdAt,
          updatedAt: Date.now(),
          cursor: runState.statusCalls,
          events: [
            {
              id: runState.statusCalls,
              time: new Date().toISOString(),
              type: 'phase',
              phase: runState.statusCalls === 1 ? 'context' : 'waiting',
              label: runState.statusCalls === 1 ? '准备上下文' : '等待模型',
              detail: runState.statusCalls === 1 ? 'regression stub attached' : 'holding active run for stop/reconnect coverage'
            }
          ]
        };

    await fulfillJson(route, payload);
    return;
  }

  if (pathname === '/api/openclaw/chat' && method === 'POST') {
    await fulfillJson(route, {
      connected: true,
      response: 'fallback response',
      meta: {
        durationMs: 0,
        agentMeta: {
          model: 'playwright-fallback'
        }
      },
      toolCalls: []
    });
    return;
  }

  await route.fallback();
});

const stamp = Date.now();
let primaryProjectName = `Regression Project ${stamp}`;
const renamedProjectName = `Regression Project ${stamp} Final`;
const secondaryProjectName = `Regression Project ${stamp} Sidecar`;
const sessionAlphaName = 'Regression Session Alpha';
const sessionBetaName = 'Regression Session Beta';
const renamedSessionAlphaName = 'Regression Session Alpha Renamed';
const taskDescription = 'Regression task: verify task workflow';
const cronJobName = `Regression Cron ${stamp}`;
const renamedProjectDescription = 'Behavior-preserving regression coverage (renamed project)';
const projectSettingsDescription = 'Behavior-preserving regression coverage';

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('h1').waitFor();

  await page.getByRole('button', { name: '+ 新建项目' }).click();
  await page.locator('#createProjectModal').waitFor();
  await waitForText(page, `默认模型：${runtimeState.defaultModel}`, '#createProjectRuntimeDefaults');
  await page.locator('#newProjectName').fill(primaryProjectName);
  await page.locator('#newProjectDesc').fill('Regression baseline project');
  await page.locator('#createProjectModal .btn.btn-primary').click();

  await page.waitForFunction(
    (name) => document.getElementById('currentProjectTitle')?.textContent?.includes(name),
    primaryProjectName
  );

  await page.getByRole('button', { name: '⚙️ 项目设置' }).click();
  await page.locator('#projectSettingsModal').waitFor();
  await waitForText(page, '已加载 2 个可选 agent。', '#projectAgentLoadingNote');
  await waitForText(page, '已同步 2 个可用模型', '#projectModelNote');
  await page.selectOption('#projectAgentId', 'dashboard-gw');
  await page.selectOption('#projectRuntime', 'local');
  await page.selectOption('#projectWorkspaceMode', 'custom');
  await page.locator('#projectWorkspacePath').fill(customWorkspacePath);
  await page.locator('#projectModel').fill('qwen3.5-plus');
  await page.locator('#projectSettingsDesc').fill(projectSettingsDescription);
  await page.getByRole('button', { name: '保存' }).click();
  await waitForText(page, '项目设置已保存');

  let projectData = await apiJson(`/api/projects/${encodeURIComponent(primaryProjectName)}`);
  assert.equal(projectData.config.agentId, 'dashboard-gw');
  assert.equal(projectData.config.runtime, 'local');
  assert.equal(projectData.config.workspaceMode, 'custom');
  assert.equal(projectData.config.workspacePath, customWorkspacePath);
  assert.ok(
    ['qwen3.5-plus', 'bailian/qwen3.5-plus'].includes(projectData.config.model),
    `Unexpected normalized model value: ${projectData.config.model}`
  );
  assert.equal(projectData.config.description, projectSettingsDescription);
  await expectText(page.locator('#infoAgent'), 'dashboard-gw');
  await expectText(page.locator('#infoWorkspace'), customWorkspacePath);
  await expectText(page.locator('#infoModel'), '本地 Codex');
  await expectText(page.locator('#infoDesc'), projectSettingsDescription);

  await page.getByRole('button', { name: '+ 新会话' }).click();
  await page.locator('#createSessionModal').waitFor();
  await page.locator('#newSessionName').fill(sessionAlphaName);
  await page.locator('#createSessionModal .btn.btn-primary').click();
  await waitForText(page, sessionAlphaName, '#sessionList');

  await page.getByRole('button', { name: '+ 新会话' }).click();
  await page.locator('#createSessionModal').waitFor();
  await page.locator('#newSessionName').fill(sessionBetaName);
  await page.locator('#createSessionModal .btn.btn-primary').click();
  await waitForText(page, sessionBetaName, '#sessionList');

  let sessionsData = await apiJson(`/api/projects/${encodeURIComponent(primaryProjectName)}/sessions`);
  let alphaSession = sessionsData.sessions.find((item) => item.name === sessionAlphaName);
  const betaSession = sessionsData.sessions.find((item) => item.name === sessionBetaName);
  assert.ok(alphaSession, 'Expected alpha session to exist.');
  assert.ok(betaSession, 'Expected beta session to exist.');

  await clickActionButtonByItem({
    page,
    rootSelector: '#sessionList',
    itemText: sessionAlphaName,
    buttonTitle: '切换'
  });
  await waitForText(page, alphaSession.id, '#currentSessionLabel');

  queuePrompt(renamedSessionAlphaName);
  await clickActionButtonByItem({
    page,
    rootSelector: '#sessionList',
    itemText: sessionAlphaName,
    buttonTitle: '重命名'
  });
  await waitForText(page, renamedSessionAlphaName, '#sessionList');

  sessionsData = await apiJson(`/api/projects/${encodeURIComponent(primaryProjectName)}/sessions`);
  alphaSession = sessionsData.sessions.find((item) => item.id === alphaSession.id);
  assert.equal(alphaSession.name, renamedSessionAlphaName);

  queueConfirm(true);
  await clickActionButtonByItem({
    page,
    rootSelector: '#sessionList',
    itemText: sessionBetaName,
    buttonTitle: '删除'
  });
  await waitForMissingText(page, sessionBetaName, '#sessionList');
  sessionsData = await apiJson(`/api/projects/${encodeURIComponent(primaryProjectName)}/sessions`);
  assert.equal(sessionsData.sessions.length, 1);

  await page.locator('.tab[data-tab="tasks"]').click();
  await page.getByRole('button', { name: '+ 添加任务' }).click();
  await page.locator('#addTaskModal').waitFor();
  await page.locator('#newTaskDesc').fill(taskDescription);
  await page.locator('#addTaskModal .btn.btn-primary').click();
  await waitForText(page, taskDescription, '#taskList');

  let tasksData = await apiJson(`/api/projects/${encodeURIComponent(primaryProjectName)}/tasks`);
  assert.equal(tasksData.tasks.length, 1);
  assert.equal(tasksData.tasks[0].description, taskDescription);

  await page.locator('#taskList .task-checkbox').first().click();
  await page.waitForFunction(
    (text) => {
      const completed = document.querySelector('#taskList .task-text.completed');
      return completed?.textContent?.includes(text);
    },
    taskDescription
  );

  tasksData = await apiJson(`/api/projects/${encodeURIComponent(primaryProjectName)}/tasks`);
  assert.equal(tasksData.tasks[0].completed, true);

  queueConfirm(true);
  await page.locator('#taskList [title="删除"]').first().click();
  await waitForMissingText(page, taskDescription, '#taskList');
  tasksData = await apiJson(`/api/projects/${encodeURIComponent(primaryProjectName)}/tasks`);
  assert.equal(tasksData.tasks.length, 0);

  await page.getByRole('button', { name: '+ 新建项目' }).click();
  await page.locator('#createProjectModal').waitFor();
  await page.locator('#newProjectName').fill(secondaryProjectName);
  await page.locator('#newProjectDesc').fill('Secondary project for switch/delete regression');
  await page.locator('#createProjectModal .btn.btn-primary').click();
  await page.waitForFunction(
    (name) => document.getElementById('currentProjectTitle')?.textContent?.includes(name),
    secondaryProjectName
  );

  await clickProjectListItem(page, primaryProjectName);
  await page.waitForFunction(
    (name) => document.getElementById('currentProjectTitle')?.textContent?.includes(name),
    primaryProjectName
  );
  await clickProjectListItem(page, secondaryProjectName);
  await page.waitForFunction(
    (name) => document.getElementById('currentProjectTitle')?.textContent?.includes(name),
    secondaryProjectName
  );

  queueConfirm(true);
  await page.getByRole('button', { name: '🗑️ 删除项目' }).click();
  await waitForMissingText(page, secondaryProjectName, '#projectList');
  let projectsData = await apiJson('/api/projects');
  assert.ok(!projectsData.projects.some((item) => item.name === secondaryProjectName));

  await clickProjectListItem(page, primaryProjectName);
  await page.waitForFunction(
    (name) => document.getElementById('currentProjectTitle')?.textContent?.includes(name),
    primaryProjectName
  );

  await page.getByRole('button', { name: '✏️ 重命名' }).click();
  await page.locator('#renameModal').waitFor();
  await page.locator('#renameProjectName').fill(renamedProjectName);
  await page.locator('#renameProjectDesc').fill(renamedProjectDescription);
  await page.locator('#renameModal .btn.btn-primary').click();
  await page.waitForFunction(
    (name) => document.getElementById('currentProjectTitle')?.textContent?.includes(name),
    renamedProjectName
  );

  primaryProjectName = renamedProjectName;
  projectData = await apiJson(`/api/projects/${encodeURIComponent(primaryProjectName)}`);
  assert.equal(projectData.name, renamedProjectName);
  assert.equal(projectData.description, renamedProjectDescription);
  sessionsData = await apiJson(`/api/projects/${encodeURIComponent(primaryProjectName)}/sessions`);
  assert.equal(sessionsData.sessions.length, 1);
  assert.equal(sessionsData.sessions[0].name, renamedSessionAlphaName);

  await page.locator('.tab[data-tab="skills"]').click();
  await waitForText(page, 'find', '#skillsList');
  await waitForText(page, 'skill-finder-cn', '#skillsList');
  await clickActionButtonByItem({
    page,
    rootSelector: '#skillsList',
    itemText: 'skill-finder-cn',
    buttonText: '启用'
  });
  await page.waitForFunction(() => {
    const root = document.getElementById('skillsList');
    const buttons = Array.from(root?.querySelectorAll('button') || []);
    return buttons.some((button) => {
      if (!button.textContent?.includes('禁用')) return false;
      let current = button.parentElement;
      while (current && current !== root) {
        if (current.textContent?.includes('skill-finder-cn')) return true;
        current = current.parentElement;
      }
      return false;
    });
  });

  await clickActionButtonByItem({
    page,
    rootSelector: '#skillsList',
    itemText: 'skill-finder-cn',
    buttonText: '禁用'
  });
  await page.waitForFunction(() => {
    const root = document.getElementById('skillsList');
    const buttons = Array.from(root?.querySelectorAll('button') || []);
    return buttons.some((button) => {
      if (!button.textContent?.includes('启用')) return false;
      let current = button.parentElement;
      while (current && current !== root) {
        if (current.textContent?.includes('skill-finder-cn')) return true;
        current = current.parentElement;
      }
      return false;
    });
  });

  await page.locator('.tab[data-tab="cron"]').click();
  await waitForText(page, '每日巡检', '#cronList');
  await waitForText(page, '每周复盘', '#cronList');
  await page.getByRole('button', { name: '+ 添加任务' }).click();
  await page.locator('#addCronModal').waitFor();
  await page.locator('#cronJobName').fill(cronJobName);
  await page.locator('#cronJobExpr').fill('*/15 * * * *');
  await page.locator('#cronJobMessage').fill('Run regression cron coverage');
  await page.locator('#addCronModal .btn.btn-primary').click();
  await waitForText(page, cronJobName, '#cronList');

  await clickActionButtonForExactLabel({
    page,
    rootSelector: '#cronList',
    labelText: cronJobName,
    buttonTitle: '立即运行'
  });
  await delay(100);
  assert.equal(runtimeState.cronRunCalls, 1);

  queueConfirm(true);
  await clickActionButtonForExactLabel({
    page,
    rootSelector: '#cronList',
    labelText: cronJobName,
    buttonTitle: '禁用'
  });
  await delay(1200);
  assert.equal(runtimeState.cronJobs.find((job) => job.name === cronJobName)?.enabled, false);
  await waitForText(page, cronJobName, '#cronList');

  await clickActionButtonForExactLabel({
    page,
    rootSelector: '#cronList',
    labelText: cronJobName,
    buttonTitle: '启用'
  });
  await delay(1200);
  assert.equal(runtimeState.cronJobs.find((job) => job.name === cronJobName)?.enabled, true);
  await waitForText(page, cronJobName, '#cronList');

  queueConfirm(true);
  await clickActionButtonForExactLabel({
    page,
    rootSelector: '#cronList',
    labelText: cronJobName,
    buttonTitle: '删除'
  });
  await waitForMissingText(page, cronJobName, '#cronList');

  await page.locator('.tab[data-tab="sessions"]').click();
  await clickActionButtonByItem({
    page,
    rootSelector: '#sessionList',
    itemText: renamedSessionAlphaName,
    buttonTitle: '打开对话'
  });
  await page.locator(`#messageInput_${alphaSession.id}`).waitFor();

  await page.setInputFiles(`#fileInput_${alphaSession.id}`, fixtureImagePath);
  await page.waitForSelector(`#filePreview_${alphaSession.id}.active`);
  assert.equal(await page.locator(`#filePreviewImage_${alphaSession.id}`).isVisible(), true);
  await expectText(page.locator(`#fileName_${alphaSession.id}`), 'regression-image.png');
  await page.getByRole('button', { name: '移除' }).click();
  await page.waitForFunction(
    (sessionId) => {
      const preview = document.getElementById(`filePreview_${sessionId}`);
      return !preview?.classList.contains('active');
    },
    alphaSession.id
  );

  const input = page.locator(`#messageInput_${alphaSession.id}`);
  await input.fill('first line');
  await input.press('Shift+Enter');
  await input.type('second line');
  assert.equal(await input.inputValue(), 'first line\nsecond line');

  await input.press('Enter');
  await page.waitForFunction(
    (sessionId) => {
      const textarea = document.getElementById(`messageInput_${sessionId}`);
      return textarea?.value === 'first line\nsecond line';
    },
    alphaSession.id
  );
  await waitForText(page, '再按一次 Enter 发送');

  await input.press('Enter');
  await page.waitForFunction(
    (sessionId) => document.getElementById(`composerPrimaryBtn_${sessionId}`)?.textContent === '停止运行',
    alphaSession.id
  );
  await page.waitForFunction(
    (sessionId) => {
      const button = document.getElementById(`composerReconnectBtn_${sessionId}`);
      return button && getComputedStyle(button).display !== 'none';
    },
    alphaSession.id
  );
  await page.waitForFunction(
    () => document.getElementById('conversationMessages')?.textContent?.includes('first line')
      && document.getElementById('conversationMessages')?.textContent?.includes('second line')
  );

  await page.locator(`#composerReconnectBtn_${alphaSession.id}`).click();
  await waitForText(page, '已重新连接当前运行');
  assert.ok(runState.reconnectCalls >= 1, 'Expected reconnect API to be called.');

  await page.locator(`#composerPrimaryBtn_${alphaSession.id}`).click();
  await waitForText(page, '已发送停止请求');
  await page.waitForFunction(
    (sessionId) => document.getElementById(`composerPrimaryBtn_${sessionId}`)?.textContent === '发送',
    alphaSession.id
  );
  await page.waitForFunction(
    () => document.getElementById('conversationMessages')?.textContent?.includes('已停止当前运行。')
  );
  assert.equal(runState.stopCalls, 1);

  console.log(`Regression test passed on ${baseUrl}`);
} finally {
  await browser.close();
  child.kill('SIGTERM');
  await rm(workspaceDir, { recursive: true, force: true });
}
