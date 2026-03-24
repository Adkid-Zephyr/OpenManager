import { copyFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const sourcePairs = [
  ['frontend/index.html', 'app.html'],
  ['frontend/api.js', 'api.js'],
  ['frontend/manual.html', 'manual.html']
];

for (const [source, target] of sourcePairs) {
  const sourcePath = resolve(rootDir, source);
  const targetPath = resolve(rootDir, target);
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

const distPairs = [
  ['dist/frontend/index.html', 'dist/app.html'],
  ['dist/frontend/manual.html', 'dist/manual.html']
];

for (const [source, target] of distPairs) {
  const sourcePath = resolve(rootDir, source);
  if (!existsSync(sourcePath)) {
    continue;
  }
  const targetPath = resolve(rootDir, target);
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

console.log('Compatibility entry files synced for source and dist.');
