#!/usr/bin/env node

import { readFile, writeFile, mkdir, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import {
  DEFAULT_MODEL,
  buildDefaultProjectDescription,
  buildSharedMemoryTemplate
} from './backend/lib/project-template.js';

const HOME_DIR = process.env.HOME || homedir();
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || join(HOME_DIR, '.openclaw');
const WORKSPACE_DIR =
  process.env.OPENMANAGER_WORKSPACE_DIR ||
  process.env.OPENCLAW_WORKSPACE_DIR ||
  join(OPENCLAW_HOME, 'workspace');
const PROJECTS_DIR = join(WORKSPACE_DIR, 'projects');
const INDEX_FILE = join(PROJECTS_DIR, '.projects-index.json');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(color, msg) {
  console.log(`${color}${msg}${colors.reset}`);
}

// 确保项目目录存在
async function ensureProjectsDir() {
  if (!existsSync(PROJECTS_DIR)) {
    await mkdir(PROJECTS_DIR, { recursive: true });
  }
  if (!existsSync(INDEX_FILE)) {
    await writeFile(INDEX_FILE, JSON.stringify({ projects: [], currentProject: null }, null, 2));
  }
}

// 读取索引
async function readIndex() {
  await ensureProjectsDir();
  const content = await readFile(INDEX_FILE, 'utf-8');
  return JSON.parse(content);
}

// 写入索引
async function writeIndex(index) {
  await writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
}

// 创建项目
async function createProject(name, description = '') {
  const index = await readIndex();
  
  if (index.projects.find(p => p.name === name)) {
    log(colors.red, `❌ 项目 "${name}" 已存在`);
    return;
  }
  
  const projectDir = join(PROJECTS_DIR, name);
  const memoryDir = join(projectDir, 'memory');
  const tasksDir = join(projectDir, 'tasks');
  
  await mkdir(projectDir, { recursive: true });
  await mkdir(memoryDir, { recursive: true });
  await mkdir(tasksDir, { recursive: true });
  
  // 创建项目配置
  const config = {
    name,
    description: description || buildDefaultProjectDescription(name),
    createdAt: new Date().toISOString(),
    currentSession: null,
    model: DEFAULT_MODEL,
    tags: []
  };
  
  await writeFile(join(projectDir, '.project.json'), JSON.stringify(config, null, 2));
  
  // 创建共享记忆
  const sharedMemory = buildSharedMemoryTemplate(name);
  await writeFile(join(memoryDir, 'shared.md'), sharedMemory);
  
  // 创建任务文件
  const tasksFile = { tasks: [], nextId: 1 };
  await writeFile(join(tasksDir, 'tasks.json'), JSON.stringify(tasksFile, null, 2));
  
  // 更新索引
  index.projects.push({
    name,
    description,
    path: projectDir,
    createdAt: config.createdAt,
    sessions: 0
  });
  index.currentProject = name;
  await writeIndex(index);
  
  log(colors.green, `✅ 项目 "${name}" 创建成功`);
  log(colors.gray, `   路径：${projectDir}`);
  log(colors.gray, `   已自动切换到该项目`);
}

// 列出项目
async function listProjects() {
  const index = await readIndex();
  
  if (index.projects.length === 0) {
    log(colors.yellow, '📭 暂无项目，使用 create 命令创建第一个项目');
    return;
  }
  
  log(colors.cyan, '\n📁 项目列表:\n');
  
  for (const project of index.projects) {
    const isCurrent = project.name === index.currentProject;
    const marker = isCurrent ? '➤ ' : '  ';
    const color = isCurrent ? colors.green : colors.reset;
    
    console.log(`${color}${marker}${project.name}${colors.reset}`);
    console.log(`   ${colors.gray}${project.description || '无描述'}${colors.reset}`);
    console.log(`   ${colors.gray}创建：${new Date(project.createdAt).toLocaleDateString('zh-CN')}${colors.reset}`);
    console.log(`   ${colors.gray}路径：${project.path}${colors.reset}\n`);
  }
  
  log(colors.cyan, `当前项目：${colors.green}${index.currentProject || '无'}${colors.reset}\n`);
}

// 切换项目
async function switchProject(name) {
  const index = await readIndex();
  
  const project = index.projects.find(p => p.name === name);
  if (!project) {
    log(colors.red, `❌ 项目 "${name}" 不存在`);
    return;
  }
  
  index.currentProject = name;
  await writeIndex(index);
  
  log(colors.green, `✅ 已切换到项目 "${name}"`);
  
  // 读取项目配置
  const configPath = join(project.path, '.project.json');
  if (existsSync(configPath)) {
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    if (config.currentSession) {
      log(colors.gray, `   当前会话：${config.currentSession}`);
    }
  }
}

// 查看项目信息
async function projectInfo(name) {
  const index = await readIndex();
  const projectName = name || index.currentProject;
  
  if (!projectName) {
    log(colors.red, '❌ 未指定项目且无当前项目');
    return;
  }
  
  const project = index.projects.find(p => p.name === projectName);
  if (!project) {
    log(colors.red, `❌ 项目 "${projectName}" 不存在`);
    return;
  }
  
  const configPath = join(project.path, '.project.json');
  const config = existsSync(configPath) 
    ? JSON.parse(await readFile(configPath, 'utf-8'))
    : null;
  
  log(colors.cyan, `\n📁 项目：${projectName}\n`);
  log(colors.gray, `描述：${config?.description || project.description || '无'}`);
  log(colors.gray, `路径：${project.path}`);
  log(colors.gray, `创建：${new Date(project.createdAt).toLocaleString('zh-CN')}`);
  log(colors.gray, `模型：${config?.model || 'default'}`);
  log(colors.gray, `当前会话：${config?.currentSession || '无'}`);
  
  // 列出会话
  const memoryDir = join(project.path, 'memory');
  if (existsSync(memoryDir)) {
    const sessions = await readdir(memoryDir);
    const sessionFiles = sessions.filter(f => f.endsWith('.md') && f !== 'shared.md');
    log(colors.gray, `会话数：${sessionFiles.length}`);
  }
  
  // 列出任务
  const tasksPath = join(project.path, 'tasks', 'tasks.json');
  if (existsSync(tasksPath)) {
    const tasksData = JSON.parse(await readFile(tasksPath, 'utf-8'));
    const pendingTasks = tasksData.tasks.filter(t => !t.completed);
    log(colors.gray, `待办任务：${pendingTasks.length}`);
  }
  
  console.log();
}

// 删除项目
async function deleteProject(name) {
  const index = await readIndex();
  
  const projectIdx = index.projects.findIndex(p => p.name === name);
  if (projectIdx === -1) {
    log(colors.red, `❌ 项目 "${name}" 不存在`);
    return;
  }
  
  const project = index.projects[projectIdx];
  
  log(colors.yellow, `⚠️  确认删除项目 "${name}"? 这将删除所有记忆和任务！(y/N)`);
  
  // 简单处理：需要用户确认
  console.log('   路径:', project.path);
  console.log('   使用 --force 参数跳过确认');
}

// 创建会话
async function createSession(sessionName = '') {
  const index = await readIndex();
  
  if (!index.currentProject) {
    log(colors.red, '❌ 请先切换到一个项目');
    return;
  }
  
  const project = index.projects.find(p => p.name === index.currentProject);
  if (!project) {
    log(colors.red, '❌ 当前项目不存在');
    return;
  }
  
  const memoryDir = join(project.path, 'memory');
  const sessionId = `session-${Date.now()}`;
  const sessionFile = `${sessionId}.md`;
  const displayName = sessionName || sessionId;
  
  // 创建会话记忆
  const sessionMemory = `# ${displayName}

## 对话记录

${new Date().toLocaleString('zh-CN')} - 会话创建

## 待办


## 笔记

`;
  await writeFile(join(memoryDir, sessionFile), sessionMemory);
  
  // 更新项目配置
  const configPath = join(project.path, '.project.json');
  const config = JSON.parse(await readFile(configPath, 'utf-8'));
  config.currentSession = sessionId;
  await writeFile(configPath, JSON.stringify(config, null, 2));
  
  log(colors.green, `✅ 会话 "${displayName}" 创建成功`);
  log(colors.gray, `   会话 ID: ${sessionId}`);
}

// 列出会话
async function listSessions() {
  const index = await readIndex();
  
  if (!index.currentProject) {
    log(colors.red, '❌ 请先切换到一个项目');
    return;
  }
  
  const project = index.projects.find(p => p.name === index.currentProject);
  const memoryDir = join(project.path, 'memory');
  
  if (!existsSync(memoryDir)) {
    log(colors.yellow, '📭 暂无会话');
    return;
  }
  
  const files = await readdir(memoryDir);
  const sessions = files
    .filter(f => f.endsWith('.md') && f !== 'shared.md')
    .map(f => f.replace('.md', ''));
  
  // 读取当前会话
  const configPath = join(project.path, '.project.json');
  const config = JSON.parse(await readFile(configPath, 'utf-8'));
  
  log(colors.cyan, `\n💬 会话列表 (${index.currentProject}):\n`);
  
  for (const session of sessions) {
    const isCurrent = session === config.currentSession;
    const marker = isCurrent ? '➤ ' : '  ';
    const color = isCurrent ? colors.green : colors.reset;
    console.log(`${color}${marker}${session}${colors.reset}`);
  }
  
  console.log();
}

// 切换会话
async function switchSession(sessionId) {
  const index = await readIndex();
  
  if (!index.currentProject) {
    log(colors.red, '❌ 请先切换到一个项目');
    return;
  }
  
  const project = index.projects.find(p => p.name === index.currentProject);
  const memoryDir = join(project.path, 'memory');
  const sessionFile = join(memoryDir, `${sessionId}.md`);
  
  if (!existsSync(sessionFile)) {
    log(colors.red, `❌ 会话 "${sessionId}" 不存在`);
    return;
  }
  
  // 更新项目配置
  const configPath = join(project.path, '.project.json');
  const config = JSON.parse(await readFile(configPath, 'utf-8'));
  config.currentSession = sessionId;
  await writeFile(configPath, JSON.stringify(config, null, 2));
  
  log(colors.green, `✅ 已切换到会话 "${sessionId}"`);
}

// 查看会话记忆
async function viewSessionMemory(sessionId) {
  const index = await readIndex();
  
  if (!index.currentProject) {
    log(colors.red, '❌ 请先切换到一个项目');
    return;
  }
  
  const project = index.projects.find(p => p.name === index.currentProject);
  const memoryDir = join(project.path, 'memory');
  
  // 读取共享记忆
  const sharedPath = join(memoryDir, 'shared.md');
  if (existsSync(sharedPath)) {
    const shared = await readFile(sharedPath, 'utf-8');
    log(colors.cyan, '\n📖 共享记忆:\n');
    console.log(shared.substring(0, 500));
    if (shared.length > 500) console.log('...');
  }
  
  // 读取会话记忆
  const targetSession = sessionId || (async () => {
    const configPath = join(project.path, '.project.json');
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    return config.currentSession;
  })();
  
  if (targetSession) {
    const sessionPath = join(memoryDir, `${targetSession}.md`);
    if (existsSync(sessionPath)) {
      const session = await readFile(sessionPath, 'utf-8');
      log(colors.cyan, `\n📖 会话记忆 (${targetSession}):\n`);
      console.log(session.substring(0, 500));
      if (session.length > 500) console.log('...');
    }
  }
  
  console.log();
}

// 添加任务
async function addTask(description) {
  const index = await readIndex();
  
  if (!index.currentProject) {
    log(colors.red, '❌ 请先切换到一个项目');
    return;
  }
  
  const project = index.projects.find(p => p.name === index.currentProject);
  const tasksPath = join(project.path, 'tasks', 'tasks.json');
  
  let tasksData;
  if (existsSync(tasksPath)) {
    tasksData = JSON.parse(await readFile(tasksPath, 'utf-8'));
  } else {
    tasksData = { tasks: [], nextId: 1 };
  }
  
  // 使用最大 ID+1 避免冲突
  const maxId = tasksData.tasks.reduce((max, t) => Math.max(max, t.id), 0);
  const newId = Math.max(maxId + 1, tasksData.nextId);
  
  const task = {
    id: newId,
    description,
    createdAt: new Date().toISOString(),
    completed: false
  };
  
  tasksData.tasks.push(task);
  tasksData.nextId = newId + 1;
  await writeFile(tasksPath, JSON.stringify(tasksData, null, 2));
  
  log(colors.green, `✅ 任务 #${task.id} 已添加`);
  log(colors.gray, `   ${description}`);
}

// 列出任务
async function listTasks() {
  const index = await readIndex();
  
  if (!index.currentProject) {
    log(colors.red, '❌ 请先切换到一个项目');
    return;
  }
  
  const project = index.projects.find(p => p.name === index.currentProject);
  const tasksPath = join(project.path, 'tasks', 'tasks.json');
  
  if (!existsSync(tasksPath)) {
    log(colors.yellow, '📭 暂无任务');
    return;
  }
  
  const tasksData = JSON.parse(await readFile(tasksPath, 'utf-8'));
  
  log(colors.cyan, `\n📋 任务列表 (${index.currentProject}):\n`);
  
  const pending = tasksData.tasks.filter(t => !t.completed);
  const completed = tasksData.tasks.filter(t => t.completed);
  
  if (pending.length > 0) {
    log(colors.yellow, '待办:');
    for (const task of pending) {
      console.log(`  ${colors.yellow}○${colors.reset} #${task.id} ${task.description}`);
    }
    console.log();
  }
  
  if (completed.length > 0) {
    log(colors.gray, '已完成:');
    for (const task of completed.slice(-5)) {
      console.log(`  ${colors.gray}✓${colors.reset} #${task.id} ${task.description}`);
    }
  }
  
  console.log();
}

// 完成任务
async function completeTask(taskId) {
  const index = await readIndex();
  
  if (!index.currentProject) {
    log(colors.red, '❌ 请先切换到一个项目');
    return;
  }
  
  const project = index.projects.find(p => p.name === index.currentProject);
  const tasksPath = join(project.path, 'tasks', 'tasks.json');
  
  const tasksData = JSON.parse(await readFile(tasksPath, 'utf-8'));
  const task = tasksData.tasks.find(t => t.id === parseInt(taskId));
  
  if (!task) {
    log(colors.red, `❌ 任务 #${taskId} 不存在`);
    return;
  }
  
  task.completed = true;
  task.completedAt = new Date().toISOString();
  
  await writeFile(tasksPath, JSON.stringify(tasksData, null, 2));
  
  log(colors.green, `✅ 任务 #${taskId} 已完成`);
}

// 删除任务
async function removeTask(taskId) {
  const index = await readIndex();
  
  if (!index.currentProject) {
    log(colors.red, '❌ 请先切换到一个项目');
    return;
  }
  
  const project = index.projects.find(p => p.name === index.currentProject);
  const tasksPath = join(project.path, 'tasks', 'tasks.json');
  
  const tasksData = JSON.parse(await readFile(tasksPath, 'utf-8'));
  const taskIdx = tasksData.tasks.findIndex(t => t.id === parseInt(taskId));
  
  if (taskIdx === -1) {
    log(colors.red, `❌ 任务 #${taskId} 不存在`);
    return;
  }
  
  tasksData.tasks.splice(taskIdx, 1);
  await writeFile(tasksPath, JSON.stringify(tasksData, null, 2));
  
  log(colors.green, `✅ 任务 #${taskId} 已删除`);
}

// 显示帮助
function showHelp() {
  console.log(`
${colors.cyan}📁 OpenManager${colors.reset}

${colors.yellow}项目管理:${colors.reset}
  create <name> [desc]   创建新项目
  list                   列出所有项目
  switch <name>          切换到项目
  info [name]            查看项目信息
  delete <name>          删除项目

${colors.yellow}会话管理:${colors.reset}
  session create [name]  创建新会话
  session list           列出会话
  session switch <id>    切换会话
  session memory [id]    查看记忆

${colors.yellow}任务管理:${colors.reset}
  task add "描述"        添加任务
  task list              列出任务
  task complete <id>     完成任务
  task remove <id>       删除任务

${colors.gray}工作目录：${PROJECTS_DIR}${colors.reset}
`);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];
  const param = args[2];
  const rest = args.slice(3).join(' ');
  
  try {
    switch (command) {
      case 'create':
        await createProject(param, rest);
        break;
      case 'list':
        await listProjects();
        break;
      case 'switch':
        await switchProject(param);
        break;
      case 'info':
        await projectInfo(param);
        break;
      case 'delete':
        await deleteProject(param);
        break;
      case 'session':
        switch (subcommand) {
          case 'create':
            await createSession(param);
            break;
          case 'list':
            await listSessions();
            break;
          case 'switch':
            await switchSession(param);
            break;
          case 'memory':
            await viewSessionMemory(param);
            break;
          default:
            showHelp();
        }
        break;
      case 'task':
        switch (subcommand) {
          case 'add':
            await addTask(param || rest);
            break;
          case 'list':
            await listTasks();
            break;
          case 'complete':
            await completeTask(param);
            break;
          case 'remove':
            await removeTask(param);
            break;
          default:
            showHelp();
        }
        break;
      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;
      default:
        showHelp();
    }
  } catch (err) {
    log(colors.red, `❌ 错误：${err.message}`);
    process.exit(1);
  }
}

main();
