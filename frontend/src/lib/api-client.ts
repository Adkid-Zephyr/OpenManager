export function resolveBase() {
  if ((window as any).PROJECT_WORKSPACE_API_BASE) {
    return (window as any).PROJECT_WORKSPACE_API_BASE;
  }

  const apiBaseParam = new URLSearchParams(window.location.search).get('apiBase');
  if (apiBaseParam) {
    return apiBaseParam;
  }

  if (window.location.protocol !== 'file:' && window.location.origin) {
    return window.location.origin;
  }

  return 'http://localhost:3456';
}

export function createClient(base = resolveBase()) {
  async function request(path: string, options: RequestInit = {}) {
    const response = await window.fetch(`${base}${path}`, options);
    return response;
  }

  async function json(path: string, options: RequestInit = {}) {
    const response = await request(path, options);
    return response.json();
  }

  return {
    base,
    request,
    json,
    fileUrl(project: string, filename: string) {
      return `${base}/api/files/${project}/${encodeURIComponent(filename)}`;
    },
    projects: {
      list: () => json('/api/projects'),
      create: (payload: unknown) =>
        json('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }),
      get: (name: string) => json(`/api/projects/${name}`),
      switch: (name: string) =>
        json(`/api/projects/${name}/switch`, {
          method: 'POST'
        }),
      updateDescription: (name: string, description: string) =>
        json(`/api/projects/${name}/description`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description })
        }),
      updateSettings: (name: string, payload: unknown) =>
        json(`/api/projects/${name}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }),
      createAndBindAgent: (name: string, payload: unknown) =>
        json(`/api/projects/${name}/agent/create-and-bind`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }),
      rename: (name: string, newName: string) =>
        json(`/api/projects/${name}/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName })
        }),
      remove: (name: string) =>
        json(`/api/projects/${name}`, {
          method: 'DELETE'
        }),
      export: (name: string) => json(`/api/projects/${name}/export`),
      openInFinder: (name: string, subPath = '') =>
        json(`/api/projects/${encodeURIComponent(name)}/open-in-finder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subPath })
        })
    },
    sessions: {
      list: (project: string) => json(`/api/projects/${project}/sessions`),
      create: (project: string, sessionName: string) =>
        json(`/api/projects/${project}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionName })
        }),
      switch: (project: string, sessionId: string) =>
        json(`/api/projects/${project}/sessions/${sessionId}/switch`, {
          method: 'POST'
        }),
      rename: (project: string, sessionId: string, newName: string) =>
        json(`/api/projects/${project}/sessions/${sessionId}/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName })
        }),
      remove: (project: string, sessionId: string) =>
        json(`/api/projects/${project}/sessions/${sessionId}`, {
          method: 'DELETE'
        }),
      getMemory: (project: string, sessionId: string) =>
        json(`/api/projects/${project}/sessions/${sessionId}/memory`),
      getMemoryState: (project: string, sessionId: string) =>
        json(`/api/projects/${project}/sessions/${sessionId}/memory-state`),
      saveMemory: (project: string, sessionId: string, content: string) =>
        json(`/api/projects/${project}/sessions/${sessionId}/memory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        }),
      appendEntry: (project: string, sessionId: string, entry: unknown) =>
        json(`/api/projects/${project}/sessions/${sessionId}/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry })
        })
    },
    tasks: {
      list: (project: string) => json(`/api/projects/${project}/tasks`),
      create: (project: string, description: string) =>
        json(`/api/projects/${project}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description })
        }),
      toggle: (project: string, id: number) =>
        json(`/api/projects/${project}/tasks/${id}/toggle`, {
          method: 'POST'
        }),
      remove: (project: string, id: number) =>
        json(`/api/projects/${project}/tasks/${id}`, {
          method: 'DELETE'
        })
    },
    memory: {
      getShared: (project: string) => json(`/api/projects/${project}/memory/shared`),
      saveShared: (project: string, content: string) =>
        json(`/api/projects/${project}/memory/shared`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        })
    },
    files: {
      list: (project: string, path?: string) =>
        json(
          path
            ? `/api/projects/${project}/files?path=${encodeURIComponent(path)}`
            : `/api/projects/${project}/files`
        ),
      remove: (project: string, filename: string) =>
        json(`/api/projects/${project}/files/${encodeURIComponent(filename)}`, {
          method: 'DELETE'
        }),
      upload: (payload: unknown) =>
        json('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
    },
    openclaw: {
      chatStart: (payload: unknown) =>
        json('/api/openclaw/chat/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }),
      chatStatus: (runId: string, cursor = 0) =>
        json(`/api/openclaw/chat/runs/${encodeURIComponent(runId)}?cursor=${encodeURIComponent(cursor)}`),
      stopChatRun: (runId: string) =>
        json(`/api/openclaw/chat/runs/${encodeURIComponent(runId)}/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }),
      chatSessionRun: (project: string, sessionId: string, cursor = 0) =>
        json(`/api/openclaw/chat/session/${encodeURIComponent(sessionId)}?project=${encodeURIComponent(project || '')}&cursor=${encodeURIComponent(cursor)}`),
      chat: (payload: unknown) =>
        json('/api/openclaw/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }),
      runtime: () => json('/api/openclaw/runtime'),
      agents: () => json('/api/openclaw/agents'),
      models: () => json('/api/openclaw/models'),
      logs: () => json('/api/openclaw/logs'),
      compress: (payload: unknown) =>
        json('/api/openclaw/compress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
    },
    skills: {
      list: () => json('/api/skills/list'),
      toggle: (name: string, enabled: boolean) =>
        json(`/api/skills/${encodeURIComponent(name)}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        })
    },
    cron: {
      list: () => json('/api/cron/jobs'),
      create: (payload: unknown) =>
        json('/api/cron/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }),
      run: (id: string) =>
        json(`/api/cron/jobs/${encodeURIComponent(id)}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }),
      enable: (id: string) =>
        json(`/api/cron/jobs/${encodeURIComponent(id)}/enable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }),
      disable: (id: string) =>
        json(`/api/cron/jobs/${encodeURIComponent(id)}/disable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }),
      remove: (id: string) =>
        json(`/api/cron/jobs/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        })
    }
  };
}
