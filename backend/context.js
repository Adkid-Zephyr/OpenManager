import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export const PORT = Number(process.env.PORT || 3456);
export const HOME_DIR = process.env.HOME || homedir();
export const WORKSPACE_DIR = join(HOME_DIR, '.openclaw', 'workspace');
export const PROJECTS_DIR = join(WORKSPACE_DIR, 'projects');
export const INDEX_FILE = join(PROJECTS_DIR, '.projects-index.json');

export const mimeTypes = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv'
};

export async function ensureProjectsDir() {
  if (!existsSync(PROJECTS_DIR)) {
    await mkdir(PROJECTS_DIR, { recursive: true });
  }

  if (!existsSync(INDEX_FILE)) {
    await writeFile(
      INDEX_FILE,
      JSON.stringify({ projects: [], currentProject: null }, null, 2)
    );
  }
}

export async function readIndex() {
  await ensureProjectsDir();
  const content = await readFile(INDEX_FILE, 'utf-8');
  return JSON.parse(content);
}

export async function writeIndex(index) {
  await writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
}

export async function getProjectOrThrow(name) {
  const index = await readIndex();
  const project = index.projects.find((item) => item.name === name);
  if (!project) {
    throw new Error('项目不存在');
  }
  return { index, project };
}
