import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getProjectOrThrow, mimeTypes, readIndex } from '../context.js';

export const fileRoutes = {
  'POST /api/upload': async (body) => {
    const { filename, content, mimeType, project } = body;
    const index = await readIndex();
    const projectObj = index.projects.find((item) => item.name === project);

    if (!projectObj) {
      throw new Error('项目不存在');
    }

    const uploadsDir = join(projectObj.path, 'uploads');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const safeName = filename.replace(/[\/\\:*?"<>|]/g, '_');
    const safeFilename = `${timestamp}-${safeName}`;
    const filePath = join(uploadsDir, safeFilename);
    const buffer = Buffer.from(content.split(',')[1] || content, 'base64');

    await writeFile(filePath, buffer);

    return {
      success: true,
      filename: safeFilename,
      path: filePath,
      url: `/api/files/${project}/${safeFilename}`,
      mimeType
    };
  },

  'GET /api/projects/:name/files': async (_body, params, query) => {
    const { name } = params;
    const { project } = await getProjectOrThrow(name);
    const currentPath = query?.path || 'uploads';
    const targetPath = join(project.path, currentPath);

    if (!existsSync(targetPath)) {
      const uploadsDir = join(project.path, 'uploads');
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }
      return { files: [], folders: [], currentPath: 'uploads', projectPath: project.path };
    }

    const items = await readdir(targetPath);
    const files = [];
    const folders = [];

    for (const item of items) {
      if (item.startsWith('.')) continue;

      const itemPath = join(targetPath, item);
      const stats = await stat(itemPath);
      const info = {
        name: item,
        path: currentPath ? `${currentPath}/${item}` : item,
        size: stats.size,
        updatedAt: stats.mtime,
        isDirectory: stats.isDirectory()
      };

      if (stats.isDirectory()) {
        folders.push(info);
      } else {
        files.push(info);
      }
    }

    return { files, folders, currentPath, projectPath: project.path };
  },

  'DELETE /api/projects/:name/files/:filename': async (_body, params) => {
    const { name, filename } = params;
    const { project } = await getProjectOrThrow(name);
    const filePath = join(project.path, 'uploads', filename);

    if (!existsSync(filePath)) {
      throw new Error('文件不存在');
    }

    await rm(filePath, { force: true });
    return { success: true, filename };
  },

  'GET /api/files/:project/:filename': async (_body, params) => {
    const { project, filename } = params;
    const index = await readIndex();
    const projectObj = index.projects.find((item) => item.name === project);

    if (!projectObj) {
      throw new Error('项目不存在');
    }

    const filePath = join(projectObj.path, 'uploads', filename);
    if (!existsSync(filePath)) {
      throw new Error('文件不存在');
    }

    const content = await readFile(filePath);
    const ext = filename.split('.').pop()?.toLowerCase();

    return {
      content: content.toString('base64'),
      mimeType: mimeTypes[ext] || 'application/octet-stream',
      filename
    };
  }
};
