import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4567);
const host = process.env.HOST || '127.0.0.1';

const child = spawn(process.execPath, ['server.js'], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: host,
    OPENMANAGER_WORKSPACE_DIR: resolve(rootDir, '.tmp-workspace')
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

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${host}:${port}/api/health`);
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

try {
  const data = await waitForServer();
  if (data.status !== 'ok') {
    throw new Error(`Unexpected health payload: ${JSON.stringify(data)}`);
  }

  const appResponse = await fetch(`http://${host}:${port}/`);
  const manualResponse = await fetch(`http://${host}:${port}/manual.html`);
  if (!appResponse.ok || !manualResponse.ok) {
    throw new Error(`Static pages failed: app=${appResponse.status}, manual=${manualResponse.status}`);
  }

  const [appHtml, manualHtml] = await Promise.all([
    appResponse.text(),
    manualResponse.text()
  ]);

  if (!appHtml.includes('OpenManager') || !manualHtml.includes('OpenManager')) {
    throw new Error('Static pages did not return the expected OpenManager content.');
  }

  console.log(`Smoke test passed on http://${host}:${port}`);
} finally {
  child.kill('SIGTERM');
}
