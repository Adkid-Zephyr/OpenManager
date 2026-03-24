import { copyFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const pairs = [
  ['frontend/index.html', 'app.html'],
  ['frontend/api.js', 'api.js'],
  ['frontend/manual.html', 'manual.html']
];

for (const [source, target] of pairs) {
  const sourcePath = resolve(rootDir, source);
  const targetPath = resolve(rootDir, target);
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

console.log('Compatibility entry files synced.');
