import { mkdir, readFile, readdir, rename, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  PROJECTS_DIR,
  getProjectOrThrow,
  readIndex,
  writeIndex
} from '../context.js';
import { countSessions } from '../lib/memory-store.js';

const execAsync = promisify(exec);

async function listOpenClawAgents() {
  const { stdout } = await execAsync('openclaw agents list --json', {
    timeout: 10000,
    env: { ...process.env, HOME: process.env.HOME }
  });
  return JSON.parse(stdout);
}

function buildAgentSlug(name) {
  const asciiSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (asciiSlug) {
    return asciiSlug.slice(0, 24);
  }

  return `project-${Buffer.from(name).toString('hex').slice(0, 16)}`;
}

async function createAndBindProjectAgent(project, config, options = {}) {
  const existingAgents = await listOpenClawAgents();
  const existingIds = new Set(existingAgents.map((agent) => agent.id));
  const requestedName = (options.agentName || '').trim();
  const baseId = requestedName || buildAgentSlug(project.name);
  let nextId = baseId;
  let counter = 2;

  while (existingIds.has(nextId)) {
    nextId = `${baseId}-${counter}`;
    counter += 1;
  }

  const workspacePath = options.workspacePath || config.workspacePath || project.path;
  const model = options.model || config.model || 'qwen3.5-plus';

  await execAsync(
    `openclaw agents add ${JSON.stringify(nextId)} --workspace ${JSON.stringify(workspacePath)} --model ${JSON.stringify(model)} --non-interactive --json`,
    {
      timeout: 20000,
      env: { ...process.env, HOME: process.env.HOME }
    }
  );

  const nextConfig = {
    ...config,
    agentId: nextId,
    workspacePath,
    model
  };

  await writeFile(join(project.path, '.project.json'), JSON.stringify(nextConfig, null, 2));
  return { agentId: nextId, workspacePath, model, config: nextConfig };
}

export const projectRoutes = {
  'GET /api/projects': async () => {
    const index = await readIndex();
    const projectsWithDetails = await Promise.all(
      index.projects.map(async (project) => {
        const tasksPath = join(project.path, 'tasks', 'tasks.json');
        const memoryDir = join(project.path, 'memory');

        let sessions = 0;
        let tasks = { pending: 0, completed: 0 };
        
        if (existsSync(memoryDir)) {
          sessions = await countSessions(project.path);
        }

        if (existsSync(tasksPath)) {
          const tasksData = JSON.parse(await readFile(tasksPath, 'utf-8'));
          tasks.pending = tasksData.tasks.filter((task) => !task.completed).length;
          tasks.completed = tasksData.tasks.filter((task) => task.completed).length;
        }

        return { ...project, sessions, tasks };
      })
    );

    return { projects: projectsWithDetails, currentProject: index.currentProject };
  },

  'POST /api/projects': async (body) => {
    const { name, description, autoCreateAgent, agentName, workspacePath, model } = body;
    const index = await readIndex();

    if (index.projects.find((project) => project.name === name)) {
      throw new Error('项目已存在');
    }

    const projectDir = join(PROJECTS_DIR, name);
    const memoryDir = join(projectDir, 'memory');
    const tasksDir = join(projectDir, 'tasks');

    await mkdir(projectDir, { recursive: true });
    await mkdir(memoryDir, { recursive: true });
    await mkdir(tasksDir, { recursive: true });

    const config = {
      name,
      description: description || `${name} 项目`,
      createdAt: new Date().toISOString(),
      currentSession: null,
      model: model || 'qwen3.5-plus',
      tags: [],
      agentId: null,
      workspacePath: workspacePath || null
    };

    await writeFile(join(projectDir, '.project.json'), JSON.stringify(config, null, 2));

    const sharedMemory = `# ${name} - 共享记忆\n\n## 项目目标\n\n\n## 架构设计\n\n\n## 关键决策\n\n\n## 通用知识\n\n`;
    await writeFile(join(memoryDir, 'shared.md'), sharedMemory);
    await writeFile(
      join(tasksDir, 'tasks.json'),
      JSON.stringify({ tasks: [], nextId: 1 }, null, 2)
    );

    index.projects.push({
      name,
      description,
      path: projectDir,
      createdAt: config.createdAt,
      sessions: 0
    });
    index.currentProject = name;
    await writeIndex(index);

    if (autoCreateAgent) {
      const bound = await createAndBindProjectAgent(
        { name, path: projectDir },
        config,
        { agentName, workspacePath: workspacePath || projectDir, model: model || config.model }
      );
      return { success: true, project: bound.config, autoBoundAgent: bound.agentId };
    }

    return { success: true, project: config };
  },

  'POST /api/projects/:name/switch': async (_body, params) => {
    const { name } = params;
    const index = await readIndex();
    const project = index.projects.find((item) => item.name === name);
    if (!project) throw new Error('项目不存在');

    index.currentProject = name;
    await writeIndex(index);
    return { success: true, currentProject: name };
  },

  'GET /api/projects/:name': async (_body, params) => {
    const { name } = params;
    const { project } = await getProjectOrThrow(name);
    const configPath = join(project.path, '.project.json');
    const config = existsSync(configPath)
      ? JSON.parse(await readFile(configPath, 'utf-8'))
      : null;
    const tasksPath = join(project.path, 'tasks', 'tasks.json');
    let tasks = { pending: 0, completed: 0 };

    if (existsSync(tasksPath)) {
      const tasksData = JSON.parse(await readFile(tasksPath, 'utf-8'));
      tasks.pending = tasksData.tasks.filter((task) => !task.completed).length;
      tasks.completed = tasksData.tasks.filter((task) => task.completed).length;
    }

    return {
      ...project,
      sessions: await countSessions(project.path),
      tasks,
      config
    };
  },

  'POST /api/projects/:name/description': async (body, params) => {
    const { name } = params;
    const { description } = body;
    const index = await readIndex();
    const projectIdx = index.projects.findIndex((project) => project.name === name);

    if (projectIdx === -1) {
      throw new Error('项目不存在');
    }

    index.projects[projectIdx].description = description || '';
    await writeIndex(index);

    const project = index.projects[projectIdx];
    const configPath = join(project.path, '.project.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(await readFile(configPath, 'utf-8'));
      config.description = description || '';
      await writeFile(configPath, JSON.stringify(config, null, 2));
    }

    return { success: true, description };
  },

  'POST /api/projects/:name/settings': async (body, params) => {
    const { name } = params;
    const index = await readIndex();
    const projectIdx = index.projects.findIndex((project) => project.name === name);

    if (projectIdx === -1) {
      throw new Error('项目不存在');
    }

    const project = index.projects[projectIdx];
    const configPath = join(project.path, '.project.json');
    if (!existsSync(configPath)) {
      throw new Error('项目配置不存在');
    }

    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    const pick = (key, fallback) => Object.prototype.hasOwnProperty.call(body, key) ? body[key] : fallback;
    const nextConfig = {
      ...config,
      description: pick('description', config.description ?? '') ?? '',
      agentId: pick('agentId', config.agentId ?? null),
      workspacePath: pick('workspacePath', config.workspacePath ?? null),
      model: pick('model', config.model ?? 'qwen3.5-plus') || 'qwen3.5-plus'
    };

    await writeFile(configPath, JSON.stringify(nextConfig, null, 2));

    index.projects[projectIdx].description = nextConfig.description || '';
    await writeIndex(index);

    return { success: true, config: nextConfig };
  },

  'POST /api/projects/:name/agent/create-and-bind': async (body, params) => {
    const { name } = params;
    const index = await readIndex();
    const projectIdx = index.projects.findIndex((project) => project.name === name);

    if (projectIdx === -1) {
      throw new Error('项目不存在');
    }

    const project = index.projects[projectIdx];
    const configPath = join(project.path, '.project.json');
    if (!existsSync(configPath)) {
      throw new Error('项目配置不存在');
    }

    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    const result = await createAndBindProjectAgent(project, config, body);
    return { success: true, ...result };
  },

  'DELETE /api/projects/:name': async (_body, params) => {
    const { name } = params;
    const index = await readIndex();
    const projectIdx = index.projects.findIndex((project) => project.name === name);

    if (projectIdx === -1) {
      throw new Error('项目不存在');
    }

    const project = index.projects[projectIdx];
    await rm(project.path, { recursive: true, force: true });

    index.projects.splice(projectIdx, 1);
    if (index.currentProject === name) {
      index.currentProject = index.projects.length > 0 ? index.projects[0].name : null;
    }
    await writeIndex(index);

    return { success: true };
  },

  'POST /api/projects/:name/rename': async (body, params) => {
    const { name } = params;
    const { newName } = body;
    const index = await readIndex();
    const projectIdx = index.projects.findIndex((project) => project.name === name);

    if (projectIdx === -1) throw new Error('项目不存在');
    if (index.projects.find((project) => project.name === newName)) {
      throw new Error('新名称已存在');
    }

    const project = index.projects[projectIdx];
    const oldPath = project.path;
    const newPath = join(PROJECTS_DIR, newName);

    await rm(newPath, { recursive: true, force: true });
    await rename(oldPath, newPath);

    index.projects[projectIdx].name = newName;
    index.projects[projectIdx].path = newPath;
    if (index.currentProject === name) {
      index.currentProject = newName;
    }
    await writeIndex(index);

    const configPath = join(newPath, '.project.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(await readFile(configPath, 'utf-8'));
      config.name = newName;
      await writeFile(configPath, JSON.stringify(config, null, 2));
    }

    return { success: true, newName };
  },

  'GET /api/projects/:name/export': async (_body, params) => {
    const { name } = params;
    const { project } = await getProjectOrThrow(name);

    const exportData = {
      name,
      exportedAt: new Date().toISOString(),
      config: null,
      sessions: [],
      tasks: []
    };

    const configPath = join(project.path, '.project.json');
    if (existsSync(configPath)) {
      exportData.config = JSON.parse(await readFile(configPath, 'utf-8'));
    }

    const memoryDir = join(project.path, 'memory');
    if (existsSync(memoryDir)) {
      const files = await readdir(memoryDir);
      for (const file of files) {
        if (file.startsWith('.')) continue;
        const content = await readFile(join(memoryDir, file), 'utf-8');
        exportData.sessions.push({ file, content });
      }
    }

    const tasksPath = join(project.path, 'tasks', 'tasks.json');
    if (existsSync(tasksPath)) {
      exportData.tasks = JSON.parse(await readFile(tasksPath, 'utf-8'));
    }

    return { export: exportData };
  },

  'POST /api/projects/:name/open-in-finder': async (body, params) => {
    const { name } = params;
    const { subPath = '' } = body;
    const { project } = await getProjectOrThrow(name);

    const targetPath = subPath ? join(project.path, subPath) : project.path;
    if (!existsSync(targetPath)) {
      throw new Error('文件夹不存在');
    }

    try {
      await execAsync(`open -R "${targetPath}"`);
    } catch {
      await execAsync(`open "${targetPath}"`);
    }

    return {
      success: true,
      path: targetPath,
      message: `已在 Finder 中打开：${name}${subPath ? `/${subPath}` : ''}`
    };
  }
};
