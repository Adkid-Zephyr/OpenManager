// @ts-nocheck

export function createRunStatusController({
  api,
  getCurrentProject,
  activeRunStatuses,
  runMonitors,
  sessionActiveRunIds,
  sessionRunActionState,
  selectedFiles,
  getComposerInput,
  escapeHtml
}) {
  function formatDuration(ms) {
    const value = Math.max(0, Number(ms) || 0);
    return `${(value / 1000).toFixed(1)}s`;
  }

  function getRunStatusDomId(runId) {
    return `run-status-${runId}`;
  }

  function isConversationOpen(sessionId) {
    const modal = document.getElementById('conversationModal');
    return Boolean(modal && modal.dataset.sessionId === sessionId);
  }

  function getConversationMessagesElement() {
    return document.getElementById('conversationMessages');
  }

  function getComposerPrimaryButton(sessionId) {
    return document.getElementById(`composerPrimaryBtn_${sessionId}`);
  }

  function getComposerReconnectButton(sessionId) {
    return document.getElementById(`composerReconnectBtn_${sessionId}`);
  }

  function getActiveSessionRunId(sessionId) {
    const runId = sessionActiveRunIds[sessionId];
    if (!runId) return null;

    const monitor = runMonitors[runId];
    if (monitor && monitor.done) {
      return null;
    }

    const state = activeRunStatuses[getRunStatusDomId(runId)];
    if (state && state.finishedAt) {
      return null;
    }

    return runId;
  }

  function ensureSessionRunActionState(sessionId) {
    if (!sessionRunActionState[sessionId]) {
      sessionRunActionState[sessionId] = {
        reconnecting: false,
        stopping: false
      };
    }
    return sessionRunActionState[sessionId];
  }

  function updateConversationActionState(sessionId) {
    const primaryBtn = getComposerPrimaryButton(sessionId);
    const reconnectBtn = getComposerReconnectButton(sessionId);
    const input = getComposerInput(sessionId);
    if (!primaryBtn || !input) return;

    const actionState = ensureSessionRunActionState(sessionId);
    const activeRunId = getActiveSessionRunId(sessionId);
    const hasDraft = Boolean(input.value.trim() || selectedFiles[sessionId]?.file);

    if (activeRunId) {
      primaryBtn.textContent = actionState.stopping ? '停止中...' : '停止运行';
      primaryBtn.disabled = actionState.stopping;
      primaryBtn.dataset.mode = 'stop';

      if (reconnectBtn) {
        reconnectBtn.style.display = 'inline-flex';
        reconnectBtn.disabled = actionState.reconnecting;
        reconnectBtn.textContent = actionState.reconnecting ? '连接中...' : '重新连接 run';
      }
      return;
    }

    primaryBtn.textContent = '发送';
    primaryBtn.disabled = !hasDraft;
    primaryBtn.dataset.mode = 'send';

    if (reconnectBtn) {
      reconnectBtn.style.display = 'none';
      reconnectBtn.disabled = false;
      reconnectBtn.textContent = '重新连接 run';
    }
  }

  function scrollConversationToBottom() {
    const messagesDiv = getConversationMessagesElement();
    if (messagesDiv) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  }

  function finishRunStep(step, finishedAt = Date.now()) {
    if (!step.finishedAt) {
      step.finishedAt = finishedAt;
    }
    if (step.state !== 'error') {
      step.state = 'done';
    }
    return step;
  }

  function ensureRunStatusState(statusId, { sessionId, runId, startedAt = Date.now() } = {}) {
    if (activeRunStatuses[statusId]) {
      return activeRunStatuses[statusId];
    }

    activeRunStatuses[statusId] = {
      id: statusId,
      runId,
      sessionId,
      startedAt,
      title: '准备运行',
      steps: [
        {
          label: '准备上下文',
          state: 'active',
          startedAt
        }
      ],
      toolCalls: [],
      renderedResult: false
    };

    activeRunStatuses[statusId].interval = setInterval(() => {
      renderRunStatus(statusId);
    }, 100);

    return activeRunStatuses[statusId];
  }

  function attachRunStatusToConversation(sessionId, runId, startedAt = Date.now()) {
    const statusId = getRunStatusDomId(runId);
    ensureRunStatusState(statusId, { sessionId, runId, startedAt });
    sessionActiveRunIds[sessionId] = runId;
    updateConversationActionState(sessionId);

    if (!isConversationOpen(sessionId)) {
      return statusId;
    }

    const messagesDiv = getConversationMessagesElement();
    if (!messagesDiv) {
      return statusId;
    }

    let messageDiv = document.getElementById(statusId);
    if (!messageDiv) {
      messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';
      messageDiv.id = statusId;
      messageDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">
          <div style="border: 1px solid rgba(35,71,211,0.16); background: linear-gradient(180deg, rgba(35,71,211,0.05), rgba(255,255,255,0.92)); border-radius: 16px; padding: 12px 14px; box-shadow: 0 12px 28px rgba(31,38,50,0.04);">
            <div class="run-status-summary" style="display: flex; align-items: center; justify-content: space-between; gap: 10px;"></div>
            <div class="run-status-steps" style="margin-top: 8px;"></div>
            <div class="run-status-badges"></div>
          </div>
        </div>
      `;
      messagesDiv.appendChild(messageDiv);
    }

    renderRunStatus(statusId);
    scrollConversationToBottom();
    return statusId;
  }

  function renderRunStatus(statusId) {
    const state = activeRunStatuses[statusId];
    const element = document.getElementById(statusId);
    if (!state || !element) return;

    const now = state.finishedAt || Date.now();
    const totalElapsed = now - state.startedAt;
    const summaryEl = element.querySelector('.run-status-summary');
    const stepsEl = element.querySelector('.run-status-steps');
    const badgesEl = element.querySelector('.run-status-badges');

    if (summaryEl) {
      summaryEl.innerHTML = `
        <span style="font-weight: 600; color: ${state.error ? '#dc2626' : state.stopped ? '#a16207' : state.finishedAt ? '#0f766e' : '#2347d3'};">${escapeHtml(state.title)}</span>
        <span style="font-size: 12px; color: #94a3b8;">${formatDuration(totalElapsed)}</span>
      `;
    }

    if (stepsEl) {
      stepsEl.innerHTML = state.steps.map((step) => {
        const stepEnd = step.finishedAt || now;
        const tone = step.state === 'error'
          ? '#dc2626'
          : step.state === 'active'
            ? '#2347d3'
            : '#475569';
        const dot = step.state === 'error'
          ? '●'
          : step.state === 'active'
            ? '◉'
            : '●';
        const duration = step.showDuration === false
          ? ''
          : `<span style="font-size: 11px; color: #94a3b8;">${formatDuration(stepEnd - step.startedAt)}</span>`;
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; color: ${tone}; margin-top: 6px;">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
              <span>${dot}</span>
              <span style="word-break: break-word;">${escapeHtml(step.label)}${step.detail ? `<span style="color: #94a3b8;"> · ${escapeHtml(step.detail)}</span>` : ''}</span>
            </div>
            ${duration}
          </div>
        `;
      }).join('');
    }

    if (badgesEl) {
      badgesEl.innerHTML = (state.toolCalls || []).map((tool) => `
        <span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 999px; background: rgba(16,185,129,0.12); color: #047857; font-size: 11px; margin-right: 6px; margin-top: 8px;">
          tool
          <strong style="font-weight: 600;">${escapeHtml(tool.name || 'unknown')}</strong>
        </span>
      `).join('');
    }
  }

  function beginRunStatusPhase(statusId, label, detail = '') {
    const state = activeRunStatuses[statusId];
    if (!state || state.finishedAt) return;

    const now = Date.now();
    const activeStep = state.steps.find((step) => step.state === 'active');
    if (activeStep) {
      finishRunStep(activeStep, now);
    }

    state.steps.push({
      label,
      detail,
      state: 'active',
      startedAt: now
    });
    renderRunStatus(statusId);
  }

  function completeRunStatus(statusId, result = {}) {
    const state = activeRunStatuses[statusId];
    if (!state) return;

    const finishedAt = Date.now();
    state.finishedAt = finishedAt;
    state.error = Boolean(result.error);
    state.stopped = Boolean(result.stopped);
    state.title = result.stopped ? '已停止' : result.error ? '运行失败' : '运行完成';
    state.toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];

    const activeStep = state.steps.find((step) => step.state === 'active');
    if (activeStep) {
      finishRunStep(activeStep, finishedAt);
    }

    if (state.toolCalls.length > 0) {
      state.steps.push({
        label: state.toolCalls.length === 1 ? '调用 tool' : `调用 ${state.toolCalls.length} 个 tools`,
        detail: state.toolCalls.map((tool) => tool.name).join(', '),
        state: 'done',
        startedAt: finishedAt,
        finishedAt,
        showDuration: false
      });
    }

    state.steps.push({
      label: result.stopped ? '已停止' : result.error ? '返回错误' : '响应就绪',
      detail: result.model ? `模型 ${result.model}` : '',
      state: result.error ? 'error' : 'done',
      startedAt: finishedAt,
      finishedAt,
      showDuration: false
    });

    if (state.interval) {
      clearInterval(state.interval);
      state.interval = null;
    }
    if (state.phaseTimeout) {
      clearTimeout(state.phaseTimeout);
      state.phaseTimeout = null;
    }
    if (state.waitingTimeout) {
      clearTimeout(state.waitingTimeout);
      state.waitingTimeout = null;
    }

    if (state.sessionId && sessionActiveRunIds[state.sessionId] === state.runId) {
      delete sessionActiveRunIds[state.sessionId];
    }
    if (state.sessionId) {
      const actionState = ensureSessionRunActionState(state.sessionId);
      actionState.stopping = false;
      actionState.reconnecting = false;
      updateConversationActionState(state.sessionId);
    }

    renderRunStatus(statusId);
  }

  function applyRunEvent(statusId, event) {
    const state = activeRunStatuses[statusId];
    if (!state || !event) return;

    if (event.type === 'phase') {
      state.title = event.label || state.title;
      if (event.phase === 'context') {
        const current = state.steps[state.steps.length - 1];
        if (current && current.label === '准备上下文' && current.state === 'active') {
          if (event.detail) {
            current.detail = event.detail;
          }
          renderRunStatus(statusId);
          return;
        }
      }

      beginRunStatusPhase(statusId, event.label || 'thinking', event.detail || '');
      return;
    }

    if (event.type === 'tool') {
      const name = event.name || 'tool';
      if (!state.toolCalls.some((tool) => tool.name === name && tool.detail === event.detail)) {
        state.toolCalls.push({ name, detail: event.detail || '' });
      }

      const activeStep = state.steps.find((step) => step.state === 'active');
      if (activeStep && !/tool/i.test(activeStep.label)) {
        activeStep.detail = event.detail || `捕获到 ${name}`;
      }
      renderRunStatus(statusId);
      return;
    }

    if (event.type === 'note') {
      const activeStep = state.steps.find((step) => step.state === 'active');
      if (activeStep) {
        activeStep.detail = event.detail || activeStep.detail;
      }
      renderRunStatus(statusId);
    }
  }

  function applyRunSnapshot(sessionId, snapshot) {
    const statusId = attachRunStatusToConversation(sessionId, snapshot.runId, snapshot.createdAt || Date.now());
    ensureRunStatusState(statusId, {
      sessionId,
      runId: snapshot.runId,
      startedAt: snapshot.createdAt || Date.now()
    });

    (snapshot.events || []).forEach((event) => applyRunEvent(statusId, event));

    if (snapshot.done) {
      completeRunStatus(statusId, {
        stopped: snapshot.result?.stopped === true,
        error: snapshot.result?.connected === false,
        model: snapshot.result?.meta?.agentMeta?.model || null,
        toolCalls: snapshot.result?.toolCalls || []
      });
    }

    return statusId;
  }

  async function ensureRunMonitor(runId, sessionId, options = {}) {
    if (runMonitors[runId]) {
      attachRunStatusToConversation(sessionId, runId, options.createdAt || runMonitors[runId].createdAt || Date.now());
      return runMonitors[runId].promise;
    }

    const monitor = {
      runId,
      sessionId,
      createdAt: options.createdAt || Date.now(),
      cursor: 0,
      done: false,
      promise: null
    };
    runMonitors[runId] = monitor;
    sessionActiveRunIds[sessionId] = runId;
    attachRunStatusToConversation(sessionId, runId, monitor.createdAt);

    monitor.promise = (async () => {
      let firstSnapshot = options.initialSnapshot || null;

      if (firstSnapshot) {
        applyRunSnapshot(sessionId, firstSnapshot);
        monitor.cursor = firstSnapshot.cursor || 0;
        if (firstSnapshot.done) {
          monitor.done = true;
          return firstSnapshot.result;
        }
      }

      while (true) {
        const snapshot = await api.openclaw.chatStatus(runId, monitor.cursor);
        if (snapshot.error) {
          throw new Error(snapshot.error);
        }

        applyRunSnapshot(sessionId, snapshot);
        monitor.cursor = snapshot.cursor || monitor.cursor;

        if (snapshot.done) {
          monitor.done = true;
          return snapshot.result;
        }

        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    })()
      .catch((error) => {
        monitor.error = error;
        throw error;
      })
      .finally(() => {
        monitor.done = true;
        if (sessionActiveRunIds[sessionId] === runId) {
          delete sessionActiveRunIds[sessionId];
        }
        const actionState = ensureSessionRunActionState(sessionId);
        actionState.reconnecting = false;
        actionState.stopping = false;
        updateConversationActionState(sessionId);
      });

    updateConversationActionState(sessionId);
    return monitor.promise;
  }

  async function recoverConversationRun(sessionId, options = {}) {
    const { force = false, background = false } = options;
    const localRunId = sessionActiveRunIds[sessionId];
    if (!force && localRunId && runMonitors[localRunId] && !runMonitors[localRunId].done) {
      attachRunStatusToConversation(sessionId, localRunId, runMonitors[localRunId].createdAt);
      return;
    }

    const snapshot = await api.openclaw.chatSessionRun(getCurrentProject(), sessionId, 0);
    if (!snapshot || snapshot.found === false || !snapshot.runId || snapshot.done) {
      updateConversationActionState(sessionId);
      return;
    }

    sessionActiveRunIds[sessionId] = snapshot.runId;
    applyRunSnapshot(sessionId, snapshot);
    if (!snapshot.done) {
      const promise = ensureRunMonitor(snapshot.runId, sessionId, {
        createdAt: snapshot.createdAt,
        initialSnapshot: snapshot
      });
      if (!background) {
        await promise;
      }
    }
    updateConversationActionState(sessionId);
  }

  return {
    formatDuration,
    getRunStatusDomId,
    isConversationOpen,
    getConversationMessagesElement,
    getComposerPrimaryButton,
    getComposerReconnectButton,
    getActiveSessionRunId,
    ensureSessionRunActionState,
    updateConversationActionState,
    scrollConversationToBottom,
    finishRunStep,
    ensureRunStatusState,
    attachRunStatusToConversation,
    renderRunStatus,
    beginRunStatusPhase,
    completeRunStatus,
    applyRunEvent,
    applyRunSnapshot,
    ensureRunMonitor,
    recoverConversationRun
  };
}
