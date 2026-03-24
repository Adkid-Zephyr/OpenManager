import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4576);
const host = process.env.HOST || '127.0.0.1';
const baseUrl = `http://${host}:${port}`;
const outputPath = join(rootDir, 'docs', 'screenshots', 'overview.png');

const workspaceDir = join(tmpdir(), 'openmanager-overview-shot');
const projectName = 'OpenManager Launch Hub';
const projectDescription = 'README polishing, docs cleanup, release prep, and launch coordination.';
const secondaryProjectName = 'Client Ops Sprint';
const secondaryProjectDescription = 'Ongoing product fixes, release notes, and support backlog.';

await rm(workspaceDir, { recursive: true, force: true });
await mkdir(workspaceDir, { recursive: true });

const runtimeState = {
  workspaceDir,
  defaultAgentId: 'dashboard-gw',
  defaultModel: 'bailian/qwen3.5-plus',
  agents: [
    { id: 'dashboard-gw', workspace: workspaceDir },
    { id: 'release-editor', workspace: workspaceDir }
  ],
  models: [
    { name: 'qwen3.5-plus', key: 'bailian/qwen3.5-plus', tags: ['default'] },
    { name: 'MiniMax-M2.5', key: 'bailian/MiniMax-M2.5', tags: [] }
  ],
  skills: [
    {
      name: 'find',
      description: 'Search project context quickly',
      emoji: '🔎',
      eligible: true,
      disabled: false,
      blockedByAllowlist: false
    },
    {
      name: 'skill-finder-cn',
      description: 'Discover additional skills',
      emoji: '🧭',
      eligible: true,
      disabled: true,
      blockedByAllowlist: false
    }
  ],
  cronJobs: [
    {
      id: 'cron-daily-review',
      name: '每日发布巡检',
      enabled: true,
      schedule: { expr: '0 9 * * *' },
      nextAt: new Date(Date.now() + 3600_000).toISOString()
    }
  ]
};

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
      if (response.ok) return;
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

async function seedDemoData() {
  await apiJson('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: projectName,
      description: projectDescription,
      model: runtimeState.defaultModel
    })
  });

  await apiJson(`/api/projects/${encodeURIComponent(projectName)}/settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      description: projectDescription,
      agentId: 'dashboard-gw',
      runtime: 'gateway',
      workspaceMode: 'main',
      workspacePath: workspaceDir,
      model: runtimeState.defaultModel
    })
  });

  const kickoff = await apiJson(`/api/projects/${encodeURIComponent(projectName)}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionName: '发布总览' })
  });

  await apiJson(`/api/projects/${encodeURIComponent(projectName)}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionName: 'README 与截图' })
  });

  await apiJson(`/api/projects/${encodeURIComponent(projectName)}/sessions/${kickoff.sessionId}/switch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });

  await apiJson(`/api/projects/${encodeURIComponent(projectName)}/memory/shared`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: [
        '# OpenManager Launch Hub',
        '',
        '## 目标',
        '- 为 OpenClaw 做一个本地优先的项目工作台',
        '- 把多项目、会话、记忆、任务和文件放到同一个界面里',
        '',
        '## 当前重点',
        '- README 首页总览图',
        '- 文档精炼',
        '- 开源发布准备'
      ].join('\n')
    })
  });

  const taskA = await apiJson(`/api/projects/${encodeURIComponent(projectName)}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: '确认首页总览图适合 README 宽度' })
  });
  const taskB = await apiJson(`/api/projects/${encodeURIComponent(projectName)}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: '整理开源文档与贡献指引' })
  });
  await apiJson(`/api/projects/${encodeURIComponent(projectName)}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: '验证 fresh clone 后可直接 npm start' })
  });

  await apiJson('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: secondaryProjectName,
      description: secondaryProjectDescription,
      model: runtimeState.defaultModel
    })
  });

  await apiJson(`/api/projects/${encodeURIComponent(secondaryProjectName)}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: '整理客户需求与修复计划' })
  });

  await apiJson(`/api/projects/${encodeURIComponent(projectName)}/switch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });

  await apiJson(`/api/projects/${encodeURIComponent(projectName)}/tasks/${taskB.task.id}/toggle`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });

  const sessionEntryBase = `/api/projects/${encodeURIComponent(projectName)}/sessions/${kickoff.sessionId}/entries`;
  await apiJson(sessionEntryBase, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      entry: {
        type: 'user',
        content: '把 README 的第一张图换成真正的项目总览图，让用户一眼知道这个项目是干嘛的。',
        createdAt: new Date().toISOString()
      }
    })
  });
  await apiJson(sessionEntryBase, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      entry: {
        type: 'assistant',
        content: '已整理文档和自动化回归，下一步生成宽屏总览图并替换中英文 README。',
        createdAt: new Date().toISOString()
      }
    })
  });

  const uploadsDir = join(workspaceDir, 'projects', projectName, 'uploads');
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(join(uploadsDir, 'launch-checklist.txt'), 'README\nCONTRIBUTING\nscreenshots\nclone-test\n');
}

async function main() {
  await waitForServer();
  await seedDemoData();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1160 },
    deviceScaleFactor: 1.5
  });
  const page = await context.newPage();

  await page.route(/\/api\/openclaw\/runtime(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, {
      workspaceDir: runtimeState.workspaceDir,
      defaultAgentId: runtimeState.defaultAgentId,
      defaultAgentWorkspace: runtimeState.workspaceDir,
      defaultModel: runtimeState.defaultModel,
      source: { model: 'overview-screenshot-stub' }
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

  await page.route(/\/api\/cron\/jobs(?:\/.*)?$/, async (route) => {
    await fulfillJson(route, {
      jobs: runtimeState.cronJobs.map((job) => ({ ...job, schedule: { ...job.schedule } })),
      count: runtimeState.cronJobs.length
    });
  });

  await page.route(/\/api\/openclaw\/chat(?:\/.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await fulfillJson(route, {
        found: false
      });
      return;
    }

    await fulfillJson(route, {
      connected: true,
      response: 'overview screenshot stub',
      meta: {
        durationMs: 0,
        agentMeta: {
          model: 'overview-screenshot-stub'
        }
      },
      toolCalls: []
    });
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    (name) => document.getElementById('currentProjectTitle')?.textContent?.includes(name),
    projectName
  );
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: outputPath,
    fullPage: false
  });

  await browser.close();
}

try {
  await main();
  console.log(`Saved screenshot to ${outputPath}`);
} finally {
  child.kill('SIGTERM');
  await rm(workspaceDir, { recursive: true, force: true });
}
