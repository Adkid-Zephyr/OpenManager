// @ts-nocheck

export function createConversationFlowController({
  api,
  apiBase,
  activeRunStatuses,
  sessionActiveRunIds,
  selectedFiles,
  getCurrentProject,
  switchSession,
  bindConversationComposer,
  clearFile,
  getActiveSessionRunId,
  ensureSessionRunActionState,
  updateConversationActionState,
  applyRunSnapshot,
  ensureRunMonitor,
  attachRunStatusToConversation,
  recoverConversationRun,
  completeRunStatus,
  applyRunEvent,
  isConversationOpen,
  addMessage,
  loadConversationMemory,
  loadConversationHistory,
  renderMemoryPanel,
  appendToMemoryRaw,
  getComposerInput,
  resetComposerSendArm,
  resizeComposer,
  pushComposerHistory,
  uploadFile,
  showToast
}) {
  async function openConversation(sessionId) {
    await switchSession(sessionId);

    let sessionName = sessionId;
    try {
      const data = await api.sessions.list(getCurrentProject());
      const session = data.sessions.find((item) => item.id === sessionId);
      if (session && session.name) {
        sessionName = session.name;
      }
    } catch (error) {
      console.error('获取会话名称失败:', error);
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'conversationModal';
    overlay.dataset.sessionId = sessionId;
    overlay.innerHTML = `
      <div class="modal conversation-modal">
        <div class="conversation-header">
          <div class="conversation-header-title">
            <h2 style="margin: 0;">💬 <span id="conversationTitle_${sessionId}">${sessionName}</span></h2>
            <button class="btn btn-secondary" onclick="renameConversation('${sessionId}')" title="重命名对话" style="padding: 4px 10px; font-size: 12px; margin-left: 8px;">✏️</button>
            <span style="font-size: 12px; color: #999; margin-left: 12px;">${getCurrentProject()}</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="closeConversation('${sessionId}')">✕ 关闭</button>
          </div>
        </div>

        <div class="conversation-body">
          <div class="conversation-messages" id="conversationMessages">
            <div style="text-align: center; padding: 20px; color: #666;">
              <div style="width: 24px; height: 24px; border: 3px solid #2347d3; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
              加载对话记录中...
            </div>
          </div>

          <div class="conversation-memory-panel">
            <div class="memory-panel-header">
              <span style="font-weight: 600; color: #2347d3;">🧠 对话记忆</span>
              <div style="display: flex; gap: 4px;">
                <button class="btn btn-secondary" onclick="showFilesModal('${sessionId}')" title="项目文件" style="padding: 4px 8px; font-size: 12px;">📁</button>
                <button class="btn btn-secondary" onclick="showLogsModal('${sessionId}')" title="查看日志" style="padding: 4px 8px; font-size: 12px;">📜</button>
              </div>
            </div>
            <div class="memory-panel-content" id="memoryPanelContent">
              <div style="color: #999; font-size: 13px; text-align: center; padding: 20px;">
                对话记忆将自动记录在这里<br><br>
                点击"🤖 压缩"可生成阶段摘要，原始记录会保留
              </div>
            </div>
            <div class="memory-actions">
              <button class="btn btn-secondary" style="flex: 1;" onclick="copyMemory()">📋 复制全部</button>
              <button class="btn btn-primary" style="flex: 1;" onclick="compressMemory('${sessionId}')">🤖 AI 压缩</button>
            </div>
          </div>
        </div>

        <div class="conversation-input">
          <div class="composer-shell">
            <input type="file" id="fileInput_${sessionId}" accept="image/*,audio/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.md,.csv" style="display: none;" onchange="handleFileSelect('${sessionId}', this)">
            <div class="composer-preview" id="filePreview_${sessionId}">
              <img id="filePreviewImage_${sessionId}" class="composer-preview-image" alt="attachment preview" style="display: none;">
              <div class="composer-preview-file">
                <div style="font-size: 18px;">📎</div>
                <div class="composer-preview-file-meta">
                  <strong id="fileName_${sessionId}"></strong>
                  <span id="fileMeta_${sessionId}" style="font-size: 12px; color: var(--muted);"></span>
                </div>
                <button class="btn btn-secondary" onclick="clearFile('${sessionId}')" style="padding: 4px 10px; font-size: 12px;">移除</button>
              </div>
            </div>
            <div class="composer-main">
              <button class="btn btn-secondary" onclick="document.getElementById('fileInput_${sessionId}').click()" title="上传图片、语音或文档" style="padding: 8px 12px; font-size: 14px;">📎</button>
              <textarea id="messageInput_${sessionId}" class="composer-textarea" rows="1" placeholder="输入消息... 连按两次 Enter 发送，Shift+Enter 换行，↑↓ 切换最近发送内容"></textarea>
              <div class="composer-actions">
                <button class="btn btn-secondary" id="composerReconnectBtn_${sessionId}" onclick="reconnectConversationRun('${sessionId}')" style="display: none;">重新连接 run</button>
                <button class="btn btn-primary composer-send" id="composerPrimaryBtn_${sessionId}" onclick="handleComposerPrimaryAction('${sessionId}')" disabled>发送</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    bindConversationComposer(sessionId);

    await loadConversationMemory(sessionId);
    await loadConversationHistory(sessionId);
    await recoverConversationRun(sessionId).catch((error) => {
      console.error('恢复运行状态失败:', error);
    });
    updateConversationActionState(sessionId);
  }

  function closeConversation(sessionId) {
    clearFile(sessionId);
    const modal = document.getElementById('conversationModal');
    if (modal) {
      modal.remove();
    }
  }

  function handleComposerPrimaryAction(sessionId) {
    if (getActiveSessionRunId(sessionId)) {
      stopConversationRun(sessionId);
      return;
    }
    sendMessage(sessionId);
  }

  async function reconnectConversationRun(sessionId) {
    const actionState = ensureSessionRunActionState(sessionId);
    if (actionState.reconnecting) return;

    actionState.reconnecting = true;
    updateConversationActionState(sessionId);

    try {
      const snapshot = await api.openclaw.chatSessionRun(getCurrentProject(), sessionId, 0);
      if (!snapshot || snapshot.found === false || !snapshot.runId || snapshot.done) {
        showToast('当前没有可重新连接的运行', '#64748b');
        return;
      }

      sessionActiveRunIds[sessionId] = snapshot.runId;
      applyRunSnapshot(sessionId, snapshot);
      ensureRunMonitor(snapshot.runId, sessionId, {
        createdAt: snapshot.createdAt,
        initialSnapshot: snapshot
      }).catch((error) => {
        console.error('重新连接 run 失败:', error);
      });
      showToast('已重新连接当前运行');
    } catch (error) {
      showToast(`重新连接失败：${error.message}`, '#b24b56');
    } finally {
      actionState.reconnecting = false;
      updateConversationActionState(sessionId);
    }
  }

  async function stopConversationRun(sessionId) {
    const runId = getActiveSessionRunId(sessionId);
    if (!runId) {
      updateConversationActionState(sessionId);
      return;
    }

    const actionState = ensureSessionRunActionState(sessionId);
    if (actionState.stopping) return;

    actionState.stopping = true;
    updateConversationActionState(sessionId);

    try {
      const result = await api.openclaw.stopChatRun(runId);
      if (result.error) {
        throw new Error(result.error);
      }
      showToast(result.alreadyDone ? '当前运行已经结束' : '已发送停止请求', '#64748b');
    } catch (error) {
      actionState.stopping = false;
      updateConversationActionState(sessionId);
      showToast(`停止失败：${error.message}`, '#b24b56');
    }
  }

  async function sendMessage(sessionId) {
    const input = getComposerInput(sessionId);
    if (!input) return;
    const message = input.value.trim();
    const selected = selectedFiles[sessionId];
    const file = selected?.file || selected;

    if (!message && !file) return;

    let attachments = [];
    let fullMessage = message;

    if (file) {
      try {
        const uploadResult = await uploadFile(sessionId, file);
        attachments.push({
          url: `${apiBase}${uploadResult.url}`,
          filename: uploadResult.filename,
          mimeType: uploadResult.mimeType
        });

        const ext = file.name.split('.').pop()?.toLowerCase();
        if (file.type.startsWith('image/')) {
          fullMessage = message ? `[图片：${file.name}]\n${message}` : `[图片：${file.name}]`;
        } else if (file.type.startsWith('audio/')) {
          fullMessage = message ? `[语音：${file.name}]\n${message}` : `[语音：${file.name}]`;
        } else if (['doc', 'docx'].includes(ext)) {
          fullMessage = message ? `[Word 文档：${file.name}]\n${message}` : `[Word 文档：${file.name}]`;
        } else if (['xls', 'xlsx'].includes(ext)) {
          fullMessage = message ? `[Excel 表格：${file.name}]\n${message}` : `[Excel 表格：${file.name}]`;
        } else if (['ppt', 'pptx'].includes(ext)) {
          fullMessage = message ? `[PowerPoint 演示文稿：${file.name}]\n${message}` : `[PowerPoint 演示文稿：${file.name}]`;
        } else if (ext === 'pdf') {
          fullMessage = message ? `[PDF 文档：${file.name}]\n${message}` : `[PDF 文档：${file.name}]`;
        } else if (['csv', 'txt', 'md'].includes(ext)) {
          fullMessage = message ? `[文本文件：${file.name}]\n${message}` : `[文本文件：${file.name}]`;
        } else {
          fullMessage = message ? `[文件：${file.name}]\n${message}` : `[文件：${file.name}]`;
        }

        clearFile(sessionId);
      } catch (error) {
        addMessage(`文件上传失败：${error.message}`, 'error');
        return;
      }
    }

    addMessage(fullMessage, 'user', attachments);
    input.value = '';
    resetComposerSendArm(sessionId);
    resizeComposer(input);
    pushComposerHistory(sessionId, fullMessage);
    updateConversationActionState(sessionId);

    await appendToMemoryRaw(sessionId, { type: 'user', text: fullMessage, attachments, time: new Date().toISOString() });

    try {
      let data;
      let thinkingId = null;
      try {
        const started = await api.openclaw.chatStart({
          project: getCurrentProject(),
          session: sessionId,
          message: fullMessage
        });

        if (!started.runId) {
          throw new Error('未拿到运行 ID');
        }

        thinkingId = attachRunStatusToConversation(sessionId, started.runId, started.createdAt || Date.now());
        updateConversationActionState(sessionId);
        data = await ensureRunMonitor(started.runId, sessionId, {
          createdAt: started.createdAt || Date.now()
        });
      } catch (streamError) {
        thinkingId = addThinkingMessage(sessionId);
        applyRunEvent(thinkingId, {
          type: 'note',
          detail: `实时日志不可用，已回退到直连模式：${streamError.message}`
        });

        data = await api.openclaw.chat({
          project: getCurrentProject(),
          session: sessionId,
          message: fullMessage
        });
      }

      if (data.stopped) {
        completeRunStatus(thinkingId, {
          stopped: true,
          model: data.meta?.agentMeta?.model || null,
          toolCalls: data.toolCalls || []
        });
        if (isConversationOpen(sessionId)) {
          addMessage(data.response || '已停止当前运行。', 'assistant');
        }
      } else if (data.connected === false) {
        completeRunStatus(thinkingId, {
          error: true,
          model: data.meta?.agentMeta?.model || null,
          toolCalls: data.toolCalls || []
        });
        const state = activeRunStatuses[thinkingId];
        if (state) state.renderedResult = true;
        if (isConversationOpen(sessionId)) {
          addMessage(data.response, 'error');
        }
      } else {
        const response = data.response || 'OpenClaw 已处理';
        completeRunStatus(thinkingId, {
          model: data.meta?.agentMeta?.model || null,
          toolCalls: data.toolCalls || []
        });
        const state = activeRunStatuses[thinkingId];
        if (state) {
          state.renderedResult = true;
        }
        if (isConversationOpen(sessionId)) {
          addMessage(response, 'assistant');
        }
      }

      await renderMemoryPanel(sessionId);
      updateConversationActionState(sessionId);
    } catch (error) {
      const fallbackStatusId = Object.values(activeRunStatuses)
        .find((state) => state.sessionId === sessionId && !state.finishedAt)?.id;
      if (fallbackStatusId) {
        completeRunStatus(fallbackStatusId, { error: true });
      }
      const errorMsg = `调用 OpenClaw 失败：${error.message}`;
      if (isConversationOpen(sessionId)) {
        addMessage(errorMsg, 'error');
      }
      await appendToMemoryRaw(sessionId, { type: 'error', text: errorMsg, time: new Date().toISOString() });
      await renderMemoryPanel(sessionId);
      updateConversationActionState(sessionId);
    }
  }

  function addThinkingMessage(sessionId) {
    const runId = `fallback-${Date.now()}`;
    return attachRunStatusToConversation(sessionId, runId, Date.now());
  }

  return {
    openConversation,
    closeConversation,
    handleComposerPrimaryAction,
    reconnectConversationRun,
    stopConversationRun,
    sendMessage,
    addThinkingMessage
  };
}
