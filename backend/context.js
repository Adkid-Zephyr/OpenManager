import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export const PORT = Number(process.env.PORT || 3456);
export const HOST = process.env.HOST || '127.0.0.1';
export const HOME_DIR = process.env.HOME || homedir();
export const OPENCLAW_HOME = process.env.OPENCLAW_HOME || join(HOME_DIR, '.openclaw');
export const OPENCLAW_CONFIG_PATH = join(OPENCLAW_HOME, 'openclaw.json');

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizePath(path) {
  return normalizeString(path).replace(/\/+$/, '');
}

function normalizeModelLookup(value) {
  return normalizeString(value).toLowerCase();
}

function readOpenClawConfigSync() {
  if (!existsSync(OPENCLAW_CONFIG_PATH)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function listConfiguredAgents(config) {
  return Array.isArray(config?.agents?.list) ? config.agents.list : [];
}

function resolveConfiguredAgent(agentId, agents) {
  const normalizedAgentId = normalizeString(agentId);
  if (!normalizedAgentId) return null;
  return agents.find((agent) => normalizeString(agent?.id) === normalizedAgentId) || null;
}

function buildConfiguredModels(config) {
  const registry = new Map();
  const attach = (key, patch = {}) => {
    const normalizedKey = normalizeString(key);
    if (!normalizedKey) return null;
    const current = registry.get(normalizedKey) || {
      key: normalizedKey,
      aliases: new Set(),
      lookups: new Set()
    };
    if (patch.id) {
      current.id = patch.id;
      current.lookups.add(normalizeModelLookup(patch.id));
    }
    if (patch.name) {
      current.name = patch.name;
      current.lookups.add(normalizeModelLookup(patch.name));
    }
    if (patch.provider) {
      current.provider = patch.provider;
    }
    const keyTail = normalizedKey.includes('/') ? normalizedKey.split('/').pop() : normalizedKey;
    current.lookups.add(normalizeModelLookup(normalizedKey));
    current.lookups.add(normalizeModelLookup(keyTail));
    const aliases = Array.isArray(patch.aliases) ? patch.aliases : [];
    aliases.forEach((alias) => {
      const normalizedAlias = normalizeString(alias);
      if (!normalizedAlias) return;
      current.aliases.add(normalizedAlias);
      current.lookups.add(normalizeModelLookup(normalizedAlias));
    });
    registry.set(normalizedKey, current);
    return current;
  };

  const defaultModels = config?.agents?.defaults?.models || {};
  Object.entries(defaultModels).forEach(([key, value]) => {
    const aliases = [];
    if (typeof value?.alias === 'string') {
      aliases.push(value.alias);
    } else if (Array.isArray(value?.alias)) {
      aliases.push(...value.alias);
    }
    attach(key, { aliases });
  });

  const providers = config?.models?.providers || {};
  Object.entries(providers).forEach(([providerKey, provider]) => {
    const models = Array.isArray(provider?.models) ? provider.models : [];
    models.forEach((model) => {
      const modelId = normalizeString(model?.id);
      if (!modelId) return;
      attach(`${providerKey}/${modelId}`, {
        provider: providerKey,
        id: modelId,
        name: normalizeString(model?.name) || modelId
      });
    });
  });

  return Array.from(registry.values()).map((entry) => ({
    key: entry.key,
    id: entry.id || entry.key.split('/').pop(),
    name: entry.name || entry.id || entry.key.split('/').pop(),
    provider: entry.provider || entry.key.split('/')[0] || '',
    aliases: Array.from(entry.aliases),
    lookups: Array.from(entry.lookups)
  }));
}

const OPENCLAW_CONFIG = readOpenClawConfigSync();
const CONFIGURED_AGENTS = listConfiguredAgents(OPENCLAW_CONFIG);
const CONFIGURED_MODELS = buildConfiguredModels(OPENCLAW_CONFIG);
const REQUESTED_DEFAULT_AGENT_ID = normalizeString(process.env.OPENMANAGER_DEFAULT_AGENT_ID || process.env.OPENCLAW_AGENT_ID) || null;
const REQUESTED_DEFAULT_AGENT = resolveConfiguredAgent(REQUESTED_DEFAULT_AGENT_ID, CONFIGURED_AGENTS);
const OPENCLAW_DEFAULT_MODEL = normalizeString(OPENCLAW_CONFIG?.agents?.defaults?.model?.primary) || null;
const EXPLICIT_WORKSPACE_DIR = normalizePath(process.env.OPENMANAGER_WORKSPACE_DIR || process.env.OPENCLAW_WORKSPACE_DIR) || null;

function resolveConfiguredModelValue(value, fallbackValue = null) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) {
    return normalizeString(fallbackValue) || null;
  }

  const directKey = CONFIGURED_MODELS.find((model) => model.key === normalizedValue);
  if (directKey) {
    return directKey.key;
  }

  const lowered = normalizeModelLookup(normalizedValue);
  const matches = CONFIGURED_MODELS.filter((model) => model.lookups.includes(lowered));
  if (matches.length === 1) {
    return matches[0].key;
  }

  const fallback = normalizeString(fallbackValue);
  if (fallback) {
    const fallbackMatch = matches.find((model) => model.key === fallback);
    if (fallbackMatch) {
      return fallbackMatch.key;
    }
  }

  const defaultMatch = matches.find((model) => model.key === OPENCLAW_DEFAULT_MODEL);
  if (defaultMatch) {
    return defaultMatch.key;
  }

  return normalizedValue;
}

const ENV_DEFAULT_MODEL = normalizeString(process.env.OPENMANAGER_DEFAULT_MODEL) || null;
const AGENT_DEFAULT_MODEL = REQUESTED_DEFAULT_AGENT?.model
  ? resolveConfiguredModelValue(REQUESTED_DEFAULT_AGENT.model, REQUESTED_DEFAULT_AGENT.model)
  : null;

export const DEFAULT_AGENT_ID = REQUESTED_DEFAULT_AGENT?.id || null;
export const DEFAULT_MODEL =
  resolveConfiguredModelValue(ENV_DEFAULT_MODEL, ENV_DEFAULT_MODEL) ||
  AGENT_DEFAULT_MODEL ||
  resolveConfiguredModelValue(OPENCLAW_DEFAULT_MODEL, OPENCLAW_DEFAULT_MODEL) ||
  null;
export const WORKSPACE_DIR =
  EXPLICIT_WORKSPACE_DIR ||
  normalizePath(OPENCLAW_CONFIG?.agents?.defaults?.workspace) ||
  join(OPENCLAW_HOME, 'workspace');
export const PROJECTS_DIR = join(WORKSPACE_DIR, 'projects');
export const INDEX_FILE = join(PROJECTS_DIR, '.projects-index.json');
export const RUNTIME_DEFAULTS = {
  workspaceDir: WORKSPACE_DIR,
  defaultAgentId: DEFAULT_AGENT_ID,
  defaultAgentWorkspace: REQUESTED_DEFAULT_AGENT?.workspace || null,
  defaultModel: DEFAULT_MODEL,
  source: {
    workspace: EXPLICIT_WORKSPACE_DIR ? 'env:workspace' : OPENCLAW_CONFIG?.agents?.defaults?.workspace ? 'openclaw-default' : 'fallback',
    model: ENV_DEFAULT_MODEL ? 'env:model' : AGENT_DEFAULT_MODEL ? 'default-agent' : OPENCLAW_DEFAULT_MODEL ? 'openclaw-default' : 'none'
  }
};

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

export function resolveOpenClawModel(value, options = {}) {
  const fallbackToDefault = options.fallbackToDefault !== false;
  const fallbackValue = fallbackToDefault ? DEFAULT_MODEL : null;
  return resolveConfiguredModelValue(value, fallbackValue);
}
