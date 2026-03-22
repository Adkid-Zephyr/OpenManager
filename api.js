(function () {
  function resolveBase() {
    return (
      window.PROJECT_WORKSPACE_API_BASE ||
      new URLSearchParams(window.location.search).get('apiBase') ||
      'http://localhost:3456'
    );
  }

  function createClient(base = resolveBase()) {
    async function request(path, options = {}) {
      const response = await window.fetch(`${base}${path}`, options);
      return response;
    }

    async function json(path, options = {}) {
      const response = await request(path, options);
      return response.json();
    }

    return {
      base,
      request,
      json,
      fileUrl(project, filename) {
        return `${base}/api/files/${project}/${encodeURIComponent(filename)}`;
      },
      projects: {
        list: () => json('/api/projects'),
        create: (payload) =>
          json('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }),
        get: (name) => json(`/api/projects/${name}`),
        switch: (name) =>
          json(`/api/projects/${name}/switch`, {
            method: 'POST'
          }),
        updateDescription: (name, description) =>
          json(`/api/projects/${name}/description`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description })
          }),
        updateSettings: (name, payload) =>
          json(`/api/projects/${name}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }),
        createAndBindAgent: (name, payload) =>
          json(`/api/projects/${name}/agent/create-and-bind`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }),
        rename: (name, newName) =>
          json(`/api/projects/${name}/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName })
          }),
        remove: (name) =>
          json(`/api/projects/${name}`, {
            method: 'DELETE'
          }),
        export: (name) => json(`/api/projects/${name}/export`),
        openInFinder: (name, subPath = '') =>
          json(`/api/projects/${encodeURIComponent(name)}/open-in-finder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subPath })
          })
      },
      sessions: {
        list: (project) => json(`/api/projects/${project}/sessions`),
        create: (project, sessionName) =>
          json(`/api/projects/${project}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionName })
          }),
        switch: (project, sessionId) =>
          json(`/api/projects/${project}/sessions/${sessionId}/switch`, {
            method: 'POST'
          }),
        rename: (project, sessionId, newName) =>
          json(`/api/projects/${project}/sessions/${sessionId}/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName })
          }),
        remove: (project, sessionId) =>
          json(`/api/projects/${project}/sessions/${sessionId}`, {
            method: 'DELETE'
          }),
        getMemory: (project, sessionId) =>
          json(`/api/projects/${project}/sessions/${sessionId}/memory`),
        saveMemory: (project, sessionId, content) =>
          json(`/api/projects/${project}/sessions/${sessionId}/memory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
          }),
        appendEntry: (project, sessionId, entry) =>
          json(`/api/projects/${project}/sessions/${sessionId}/entries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entry })
          })
      },
      tasks: {
        list: (project) => json(`/api/projects/${project}/tasks`),
        create: (project, description) =>
          json(`/api/projects/${project}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description })
          }),
        toggle: (project, id) =>
          json(`/api/projects/${project}/tasks/${id}/toggle`, {
            method: 'POST'
          }),
        remove: (project, id) =>
          json(`/api/projects/${project}/tasks/${id}`, {
            method: 'DELETE'
          })
      },
      memory: {
        getShared: (project) => json(`/api/projects/${project}/memory/shared`),
        saveShared: (project, content) =>
          json(`/api/projects/${project}/memory/shared`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
          })
      },
      files: {
        list: (project, path) =>
          json(
            path
              ? `/api/projects/${project}/files?path=${encodeURIComponent(path)}`
              : `/api/projects/${project}/files`
          ),
        remove: (project, filename) =>
          json(`/api/projects/${project}/files/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
          }),
        upload: (payload) =>
          json('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
      },
      openclaw: {
        chatStart: (payload) =>
          json('/api/openclaw/chat/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }),
        chatStatus: (runId, cursor = 0) =>
          json(`/api/openclaw/chat/runs/${encodeURIComponent(runId)}?cursor=${encodeURIComponent(cursor)}`),
        chat: (payload) =>
          json('/api/openclaw/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }),
        agents: () => json('/api/openclaw/agents'),
        models: () => json('/api/openclaw/models'),
        logs: () => json('/api/openclaw/logs'),
        compress: (payload) =>
          json('/api/openclaw/compress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
      },
      skills: {
        list: () => json('/api/skills/list'),
        toggle: (name, enabled) =>
          json(`/api/skills/${encodeURIComponent(name)}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
          })
      },
      cron: {
        list: () => json('/api/cron/jobs'),
        create: (payload) =>
          json('/api/cron/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }),
        run: (id) =>
          json(`/api/cron/jobs/${encodeURIComponent(id)}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }),
        enable: (id) =>
          json(`/api/cron/jobs/${encodeURIComponent(id)}/enable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }),
        disable: (id) =>
          json(`/api/cron/jobs/${encodeURIComponent(id)}/disable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }),
        remove: (id) =>
          json(`/api/cron/jobs/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
          })
      }
    };
  }

  window.ProjectWorkspaceAPI = { createClient };
})();
