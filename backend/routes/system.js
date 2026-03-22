import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { exec } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import { HOME_DIR } from '../context.js';

const execAsync = promisify(exec);
const OPENCLAW_CONFIG = join(HOME_DIR, '.openclaw', 'openclaw.json');

function shellQuote(value) {
  return JSON.stringify(String(value));
}

async function runOpenClaw(command, timeout = 10000) {
  return execAsync(command, {
    timeout,
    env: { ...process.env, HOME: HOME_DIR }
  });
}

async function readOpenClawConfig() {
  if (!existsSync(OPENCLAW_CONFIG)) {
    return {};
  }

  return JSON.parse(await readFile(OPENCLAW_CONFIG, 'utf-8'));
}

async function writeOpenClawConfig(config) {
  await writeFile(OPENCLAW_CONFIG, JSON.stringify(config, null, 2));
}

function parseJsonOutput(stdout, fallback = {}) {
  try {
    return JSON.parse(stdout);
  } catch {
    return fallback;
  }
}

export const systemRoutes = {
  'GET /api/skills/list': async () => {
    try {
      const { stdout } = await runOpenClaw('openclaw skills list --json');
      const data = parseJsonOutput(stdout, { skills: [] });
      return { skills: data.skills || [], count: data.skills?.length || 0 };
    } catch (error) {
      return { skills: [], error: error.message };
    }
  },

  'POST /api/skills/:name/toggle': async (body, params) => {
    try {
      const { name } = params;
      const enabled = body.enabled !== false;
      const config = await readOpenClawConfig();

      config.skills = config.skills || {};
      config.skills.entries = config.skills.entries || {};
      config.skills.entries[name] = {
        ...(config.skills.entries[name] || {}),
        enabled
      };

      await writeOpenClawConfig(config);

      return {
        success: true,
        name,
        enabled,
        note: '技能状态已写入 openclaw.json。新会话会使用更新后的技能快照。'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  'GET /api/cron/jobs': async () => {
    try {
      const { stdout } = await runOpenClaw('openclaw cron list --json');
      const data = parseJsonOutput(stdout, { jobs: [] });
      return {
        jobs: data.jobs || [],
        count: data.total || data.count || data.jobs?.length || 0
      };
    } catch (error) {
      return { jobs: [], error: error.message };
    }
  },

  'POST /api/cron/jobs': async (body) => {
    try {
      const { name, message, cron, agentId, timezone, description, model, thinking, enabled } = body;

      if (!name || !message || !cron) {
        throw new Error('创建 Cron 任务需要 name、message 和 cron');
      }

      const args = [
        'openclaw cron add --json',
        `--name ${shellQuote(name)}`,
        `--message ${shellQuote(message)}`,
        `--cron ${shellQuote(cron)}`,
        '--session isolated'
      ];

      if (agentId) args.push(`--agent ${shellQuote(agentId)}`);
      if (timezone) args.push(`--tz ${shellQuote(timezone)}`);
      if (description) args.push(`--description ${shellQuote(description)}`);
      if (model) args.push(`--model ${shellQuote(model)}`);
      if (thinking) args.push(`--thinking ${shellQuote(thinking)}`);
      if (enabled === false) args.push('--disabled');

      const { stdout } = await runOpenClaw(args.join(' '), 20000);
      return {
        success: true,
        job: parseJsonOutput(stdout, null)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  'POST /api/cron/jobs/:id/run': async (_body, params) => {
    try {
      const { id } = params;
      await runOpenClaw(`openclaw cron run ${shellQuote(id)}`, 60000);

      return { success: true, message: `任务 ${id} 已运行` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  'POST /api/cron/jobs/:id/enable': async (_body, params) => {
    try {
      const { id } = params;
      await runOpenClaw(`openclaw cron enable ${shellQuote(id)}`);
      return { success: true, id, enabled: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  'POST /api/cron/jobs/:id/disable': async (_body, params) => {
    try {
      const { id } = params;
      await runOpenClaw(`openclaw cron disable ${shellQuote(id)}`);
      return { success: true, id, enabled: false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  'DELETE /api/cron/jobs/:id': async (_body, params) => {
    try {
      const { id } = params;
      const { stdout } = await runOpenClaw(`openclaw cron rm ${shellQuote(id)} --json`);
      return {
        success: true,
        id,
        result: parseJsonOutput(stdout, null)
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
