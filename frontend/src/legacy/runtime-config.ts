// @ts-nocheck

const AGENT_CACHE_TTL = 60 * 1000;
const MODEL_CACHE_TTL = 60 * 1000;

export function createRuntimeConfig({
  api,
  runtimeDefaults,
  runtimeCache,
  escapeHtml
}) {
  function scheduleAgentPrefetch() {
    const run = () => loadAgentOptions().catch(() => null);
    if (window.requestIdleCallback) {
      window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      window.setTimeout(run, 200);
    }
  }

  function scheduleModelPrefetch() {
    const run = () => loadModelOptions().catch(() => null);
    if (window.requestIdleCallback) {
      window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      window.setTimeout(run, 260);
    }
  }

  async function loadAgentOptions(force = false) {
    const fresh = runtimeCache.cachedAgents && (Date.now() - runtimeCache.cachedAgentsAt) < AGENT_CACHE_TTL;
    if (!force && fresh) {
      return runtimeCache.cachedAgents;
    }

    if (!force && runtimeCache.agentsPromise) {
      return runtimeCache.agentsPromise;
    }

    runtimeCache.agentsPromise = api.openclaw.agents()
      .then((data) => {
        runtimeCache.cachedAgents = data.agents || [];
        runtimeCache.cachedAgentsAt = Date.now();
        return runtimeCache.cachedAgents;
      })
      .finally(() => {
        runtimeCache.agentsPromise = null;
      });

    return runtimeCache.agentsPromise;
  }

  async function loadModelOptions(force = false) {
    const fresh = runtimeCache.cachedModels && (Date.now() - runtimeCache.cachedModelsAt) < MODEL_CACHE_TTL;
    if (!force && fresh) {
      return {
        models: runtimeCache.cachedModels,
        defaultModel: runtimeCache.cachedModels.find((model) => (model.tags || []).includes('default'))?.key || null
      };
    }

    if (!force && runtimeCache.modelsPromise) {
      return runtimeCache.modelsPromise;
    }

    runtimeCache.modelsPromise = api.openclaw.models()
      .then((data) => {
        runtimeCache.cachedModels = data.models || [];
        runtimeCache.cachedModelsAt = Date.now();
        return {
          models: runtimeCache.cachedModels,
          defaultModel: data.defaultModel || runtimeCache.cachedModels.find((model) => (model.tags || []).includes('default'))?.key || null
        };
      })
      .finally(() => {
        runtimeCache.modelsPromise = null;
      });

    return runtimeCache.modelsPromise;
  }

  function getPreferredModelValue(explicitValue = '') {
    return String(explicitValue || '').trim() || runtimeDefaults.defaultModel || '';
  }

  function updateRuntimeDefaultsHint() {
    const hint = document.getElementById('createProjectRuntimeDefaults');
    if (!hint) return;

    const parts = [];
    if (runtimeDefaults.defaultModel) {
      parts.push(`默认模型：${runtimeDefaults.defaultModel}`);
    } else {
      parts.push('默认模型：未指定（跟随 OpenClaw 当前默认）');
    }

    if (runtimeDefaults.defaultAgentId) {
      parts.push(`实例默认 Agent：${runtimeDefaults.defaultAgentId}`);
    }

    if (runtimeDefaults.workspaceDir) {
      parts.push(`工作区：${runtimeDefaults.workspaceDir}`);
    }

    hint.textContent = `当前实例运行时：${parts.join(' · ')}。新项目和新 agent 会优先继承这里的模型默认值，但你仍然可以手动覆盖。`;
  }

  async function loadRuntimeDefaults() {
    try {
      const data = await api.openclaw.runtime();
      Object.assign(runtimeDefaults, {
        workspaceDir: data.workspaceDir || '',
        defaultAgentId: data.defaultAgentId || '',
        defaultAgentWorkspace: data.defaultAgentWorkspace || '',
        defaultModel: data.defaultModel || '',
        source: data.source || {}
      });
    } catch {
      Object.assign(runtimeDefaults, {
        workspaceDir: '',
        defaultAgentId: '',
        defaultAgentWorkspace: '',
        defaultModel: '',
        source: {}
      });
    }

    const modelInput = document.getElementById('newProjectModel');
    if (modelInput) {
      modelInput.value = getPreferredModelValue(modelInput.value);
    }
    updateRuntimeDefaultsHint();
  }

  function buildAgentSelectOptions(agents, selectedId, loading = false) {
    if (loading) {
      return `<option value="${selectedId || ''}">${selectedId || '正在加载 Agent 列表...'}</option>`;
    }

    const options = [`<option value="" ${!selectedId ? 'selected' : ''}>默认 main</option>`];
    (agents || []).forEach((agent) => {
      options.push(
        `<option value="${agent.id}" ${selectedId === agent.id ? 'selected' : ''}>${agent.id}${agent.workspace ? ' · ' + agent.workspace : ''}</option>`
      );
    });
    return options.join('');
  }

  function buildModelSelectOptions(models, selectedValue, defaultModel = null, loading = false) {
    if (loading) {
      return `<option value="${selectedValue || ''}">${selectedValue || '正在加载可用模型...'}</option>`;
    }

    const normalizedSelected = String(selectedValue || '').trim();
    const options = [`<option value="">手动输入 / 保持当前值</option>`];

    (models || []).forEach((model) => {
      const matches = normalizedSelected && [model.key, model.name].includes(normalizedSelected);
      const isDefault = model.key === defaultModel || model.name === defaultModel || (Array.isArray(model.tags) && model.tags.includes('default'));
      const tag = isDefault ? ' · default' : '';
      const inputTag = model.input ? ` · ${model.input}` : '';
      const keyTag = model.key && model.key !== model.name ? ` · ${model.key}` : '';
      const label = `${model.name}${keyTag}${tag}${inputTag}`;
      options.push(
        `<option value="${escapeHtml(model.key || model.name)}" ${matches ? 'selected' : ''}>${escapeHtml(label)}</option>`
      );
    });

    return options.join('');
  }

  function syncModelInputFromSelect(inputId, selectId) {
    const input = document.getElementById(inputId);
    const select = document.getElementById(selectId);
    if (!input || !select || !select.value) return;
    input.value = select.value;
  }

  function syncModelSelectFromInput(inputId, selectId) {
    const input = document.getElementById(inputId);
    const select = document.getElementById(selectId);
    if (!input || !select) return;

    const normalized = input.value.trim();
    const match = Array.from(select.options).find((option) => option.value === normalized);
    select.value = match ? match.value : '';
  }

  async function populateModelPicker({ selectId, inputId, noteId, value = '', force = false }) {
    const select = document.getElementById(selectId);
    const input = document.getElementById(inputId);
    const note = document.getElementById(noteId);
    if (!select || !input) return;

    const currentValue = getPreferredModelValue(value || input.value || '');
    input.value = currentValue;
    select.innerHTML = buildModelSelectOptions(runtimeCache.cachedModels, currentValue, null, !runtimeCache.cachedModels);
    syncModelSelectFromInput(inputId, selectId);

    if (note) {
      note.textContent = runtimeCache.cachedModels
        ? `已从缓存同步 ${runtimeCache.cachedModels.length} 个可用模型，可继续手动输入 alias 或完整 provider/model。`
        : '正在从 OpenClaw 同步可用模型...';
    }

    try {
      const { models, defaultModel } = await loadModelOptions(force);
      select.innerHTML = buildModelSelectOptions(models, input.value, defaultModel, false);
      syncModelSelectFromInput(inputId, selectId);
      if (note) {
        note.textContent = `已同步 ${models.length} 个可用模型${defaultModel ? `，当前默认是 ${defaultModel}` : ''}。也支持手动输入 alias 或完整 provider/model。`;
      }
    } catch (error) {
      if (note) {
        note.textContent = `模型列表加载失败：${error.message}。仍可手动输入 model id。`;
      }
    }
  }

  return {
    scheduleAgentPrefetch,
    scheduleModelPrefetch,
    loadAgentOptions,
    loadModelOptions,
    getPreferredModelValue,
    updateRuntimeDefaultsHint,
    loadRuntimeDefaults,
    buildAgentSelectOptions,
    buildModelSelectOptions,
    syncModelInputFromSelect,
    syncModelSelectFromInput,
    populateModelPicker
  };
}
