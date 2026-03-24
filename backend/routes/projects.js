import { mkdir, readFile, readdir, rename, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  resolveOpenClawModel,
  PROJECTS_DIR,
  getProjectOrThrow,
  readIndex,
  writeIndex
} from '../context.js';
import { countSessions } from '../lib/memory-store.js';
import {
  DEFAULT_MODEL,
  buildDefaultProjectDescription,
  buildProjectAgentTemplate,
  buildProjectBootstrapTemplate,
  buildProjectIdentityTemplate,
  buildSharedMemoryTemplate,
  PROJECT_BOOTSTRAP_MARKER
} from '../lib/project-template.js';

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

function shouldRefreshProjectAgentsFile(content) {
  const value = String(content || '');
  return !value || value.includes(PROJECT_BOOTSTRAP_MARKER) || value.startsWith('# AGENTS.md - Your Workspace');
}

function shouldRefreshProjectIdentityFile(content) {
  const value = String(content || '');
  return !value || value.includes(PROJECT_BOOTSTRAP_MARKER);
}

async function syncProjectBootstrapFiles(project, options = {}) {
  const projectName = project?.name;
  const projectPath = project?.path;
  if (!projectName || !projectPath) return;

  const agentId = options.agentId || null;
  const agentsPath = join(projectPath, 'AGENTS.md');
  const bootstrapPath = join(projectPath, 'BOOTSTRAP.md');
  const identityPath = join(projectPath, 'IDENTITY.md');

  const currentAgents = existsSync(agentsPath) ? await readFile(agentsPath, 'utf-8') : '';
  if (shouldRefreshProjectAgentsFile(currentAgents)) {
    await writeFile(agentsPath, buildProjectAgentTemplate(projectName, agentId));
  }

  const currentBootstrap = existsSync(bootstrapPath) ? await readFile(bootstrapPath, 'utf-8') : '';
  if (!currentBootstrap || currentBootstrap.includes(PROJECT_BOOTSTRAP_MARKER)) {
    await writeFile(bootstrapPath, buildProjectBootstrapTemplate(projectName));
  }

  const currentIdentity = existsSync(identityPath) ? await readFile(identityPath, 'utf-8') : '';
  if (shouldRefreshProjectIdentityFile(currentIdentity)) {
    await writeFile(identityPath, buildProjectIdentityTemplate(projectName, agentId));
  }
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
  const model = resolveOpenClawModel(options.model || config.model || DEFAULT_MODEL) || null;
  const args = [
    'openclaw',
    'agents',
    'add',
    JSON.stringify(nextId),
    '--workspace',
    JSON.stringify(workspacePath)
  ];

  if (model) {
    args.push('--model', JSON.stringify(model));
  }

  args.push('--non-interactive', '--json');

  await execAsync(args.join(' '), {
    timeout: 20000,
    env: { ...process.env, HOME: process.env.HOME }
  });

  const nextConfig = {
    ...config,
    agentId: nextId,
    workspacePath,
    model,
    runtime: config.runtime || 'gateway',
    workspaceMode: workspacePath === project.path ? 'project' : 'custom'
  };

  await writeFile(join(project.path, '.project.json'), JSON.stringify(nextConfig, null, 2));
  await syncProjectBootstrapFiles(project, { agentId: nextId });
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
      description: description || buildDefaultProjectDescription(name),
      createdAt: new Date().toISOString(),
      currentSession: null,
      model: resolveOpenClawModel(model || DEFAULT_MODEL) || null,
      tags: [],
      agentId: null,
      workspacePath: workspacePath || null,
      runtime: 'gateway',
      workspaceMode: workspacePath ? 'custom' : 'main'
    };

    await writeFile(join(projectDir, '.project.json'), JSON.stringify(config, null, 2));

    const sharedMemory = buildSharedMemoryTemplate(name);
    await writeFile(join(memoryDir, 'shared.md'), sharedMemory);
    await writeFile(
      join(tasksDir, 'tasks.json'),
      JSON.stringify({ tasks: [], nextId: 1 }, null, 2)
    );
    await syncProjectBootstrapFiles({ name, path: projectDir }, { agentId: null });

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
    const selectedModel = resolveOpenClawModel(pick('model', config.model ?? DEFAULT_MODEL) || DEFAULT_MODEL) || null;
    const nextConfig = {
      ...config,
      description: pick('description', config.description ?? '') ?? '',
      agentId: pick('agentId', config.agentId ?? null),
      workspacePath: pick('workspacePath', config.workspacePath ?? null),
      model: selectedModel,
      runtime: pick('runtime', config.runtime ?? 'gateway') === 'local' ? 'local' : 'gateway',
      workspaceMode: ['main', 'project', 'custom'].includes(pick('workspaceMode', config.workspaceMode ?? 'main'))
        ? pick('workspaceMode', config.workspaceMode ?? 'main')
        : 'main'
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
