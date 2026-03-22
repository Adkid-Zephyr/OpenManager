import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getProjectOrThrow } from '../context.js';

export const taskRoutes = {
  'GET /api/projects/:name/tasks': async (_body, params) => {
    const { name } = params;
    const { project } = await getProjectOrThrow(name);
    const tasksPath = join(project.path, 'tasks', 'tasks.json');

    if (!existsSync(tasksPath)) {
      return { tasks: [], nextId: 1 };
    }

    return JSON.parse(await readFile(tasksPath, 'utf-8'));
  },

  'POST /api/projects/:name/tasks': async (body, params) => {
    const { name } = params;
    const { description } = body;
    const { project } = await getProjectOrThrow(name);
    const tasksPath = join(project.path, 'tasks', 'tasks.json');

    const tasksData = existsSync(tasksPath)
      ? JSON.parse(await readFile(tasksPath, 'utf-8'))
      : { tasks: [], nextId: 1 };

    const maxId = tasksData.tasks.reduce((max, task) => Math.max(max, task.id), 0);
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

    return { success: true, task };
  },

  'POST /api/projects/:name/tasks/:id/toggle': async (_body, params) => {
    const { name, id } = params;
    const { project } = await getProjectOrThrow(name);
    const tasksPath = join(project.path, 'tasks', 'tasks.json');
    const tasksData = JSON.parse(await readFile(tasksPath, 'utf-8'));
    const task = tasksData.tasks.find((item) => item.id === Number.parseInt(id, 10));

    if (!task) {
      throw new Error('任务不存在');
    }

    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date().toISOString() : null;

    await writeFile(tasksPath, JSON.stringify(tasksData, null, 2));
    return { success: true, task };
  },

  'DELETE /api/projects/:name/tasks/:id': async (_body, params) => {
    const { name, id } = params;
    const { project } = await getProjectOrThrow(name);
    const tasksPath = join(project.path, 'tasks', 'tasks.json');
    const tasksData = JSON.parse(await readFile(tasksPath, 'utf-8'));
    const taskIdx = tasksData.tasks.findIndex((item) => item.id === Number.parseInt(id, 10));

    if (taskIdx === -1) {
      throw new Error('任务不存在');
    }

    tasksData.tasks.splice(taskIdx, 1);
    await writeFile(tasksPath, JSON.stringify(tasksData, null, 2));

    return { success: true };
  }
};
