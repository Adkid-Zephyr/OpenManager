// @ts-nocheck

export function createConversationUi({
  api,
  apiBase,
  getCurrentProject,
  selectedFiles,
  composerSendArmState,
  composerHistories,
  composerHistoryState,
  updateConversationActionState,
  getActiveSessionRunId,
  showToast,
  escapeHtml,
  scrollConversationToBottom,
  sendMessage
}) {
  function getComposerInput(sessionId) {
    return document.getElementById(`messageInput_${sessionId}`) || document.getElementById('messageInput');
  }

  function shouldSendOnDoubleEnter(sessionId) {
    const now = Date.now();
    const armedAt = composerSendArmState[sessionId] || 0;
    if (armedAt && (now - armedAt) < 1200) {
      composerSendArmState[sessionId] = 0;
      return true;
    }
    composerSendArmState[sessionId] = now;
    return false;
  }

  function resetComposerSendArm(sessionId) {
    composerSendArmState[sessionId] = 0;
  }

  function resizeComposer(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }

  function formatFileSize(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(value / 1024).toFixed(1)} KB`;
  }

  function getComposerHistoryState(sessionId) {
    if (!composerHistoryState[sessionId]) {
      composerHistoryState[sessionId] = { index: -1, draft: '' };
    }
    if (!composerHistories[sessionId]) {
      composerHistories[sessionId] = [];
    }
    return composerHistoryState[sessionId];
  }

  function pushComposerHistory(sessionId, message) {
    const normalized = String(message || '').trim();
    if (!normalized) return;

    if (!composerHistories[sessionId]) {
      composerHistories[sessionId] = [];
    }

    const history = composerHistories[sessionId];
    if (history[history.length - 1] !== normalized) {
      history.push(normalized);
    }

    composerHistoryState[sessionId] = { index: -1, draft: '' };
  }

  function navigateComposerHistory(sessionId, direction) {
    const input = getComposerInput(sessionId);
    if (!input) return;

    const history = composerHistories[sessionId] || [];
    if (!history.length) return;

    const state = getComposerHistoryState(sessionId);

    if (direction < 0) {
      if (state.index === -1) {
        state.draft = input.value;
        state.index = history.length - 1;
      } else if (state.index > 0) {
        state.index -= 1;
      }
    } else {
      if (state.index === -1) return;
      if (state.index < history.length - 1) {
        state.index += 1;
      } else {
        state.index = -1;
        input.value = state.draft || '';
        resizeComposer(input);
        return;
      }
    }

    input.value = history[state.index] || '';
    resizeComposer(input);
    requestAnimationFrame(() => {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }

  function renderSelectedFilePreview(sessionId) {
    const preview = document.getElementById(`filePreview_${sessionId}`);
    const previewImage = document.getElementById(`filePreviewImage_${sessionId}`);
    const fileName = document.getElementById(`fileName_${sessionId}`);
    const fileMeta = document.getElementById(`fileMeta_${sessionId}`);
    const selected = selectedFiles[sessionId];

    if (!preview || !fileName || !fileMeta) return;

    if (!selected?.file) {
      preview.classList.remove('active');
      preview.style.display = '';
      if (previewImage) {
        previewImage.src = '';
        previewImage.style.display = 'none';
      }
      fileName.textContent = '';
      fileMeta.textContent = '';
      return;
    }

    preview.classList.add('active');
    const { file, previewUrl } = selected;
    fileName.textContent = file.name;
    fileMeta.textContent = `${file.type || '未知类型'} · ${formatFileSize(file.size)}`;

    if (previewImage) {
      if (file.type.startsWith('image/') && previewUrl) {
        previewImage.src = previewUrl;
        previewImage.style.display = 'block';
      } else {
        previewImage.src = '';
        previewImage.style.display = 'none';
      }
    }
  }

  function bindConversationComposer(sessionId) {
    const input = getComposerInput(sessionId);
    if (!input) return;

    resizeComposer(input);
    input.focus();

    if (input.dataset.bound === 'true') {
      renderSelectedFilePreview(sessionId);
      updateConversationActionState(sessionId);
      return;
    }

    input.dataset.bound = 'true';
    input.addEventListener('input', () => {
      resizeComposer(input);
      resetComposerSendArm(sessionId);
      updateConversationActionState(sessionId);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        if (getActiveSessionRunId(sessionId)) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        if (!shouldSendOnDoubleEnter(sessionId)) {
          showToast('再按一次 Enter 发送，或直接点击发送', '#64748b');
          return;
        }
        sendMessage(sessionId);
        return;
      }

      if (event.key === 'ArrowUp' && input.selectionStart === 0 && input.selectionEnd === 0) {
        event.preventDefault();
        navigateComposerHistory(sessionId, -1);
        return;
      }

      if (
        event.key === 'ArrowDown' &&
        input.selectionStart === input.value.length &&
        input.selectionEnd === input.value.length
      ) {
        event.preventDefault();
        navigateComposerHistory(sessionId, 1);
      }
    });

    renderSelectedFilePreview(sessionId);
    updateConversationActionState(sessionId);
  }

  function handleFileSelect(sessionId, input) {
    const file = input.files[0];
    if (!file) return;

    const existing = selectedFiles[sessionId];
    if (existing?.previewUrl) {
      URL.revokeObjectURL(existing.previewUrl);
    }

    selectedFiles[sessionId] = {
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    };

    renderSelectedFilePreview(sessionId);
    updateConversationActionState(sessionId);
  }

  function clearFile(sessionId) {
    const existing = selectedFiles[sessionId];
    if (existing?.previewUrl) {
      URL.revokeObjectURL(existing.previewUrl);
    }

    selectedFiles[sessionId] = null;
    const input = document.getElementById(`fileInput_${sessionId}`) || document.getElementById('fileInput');
    if (input) input.value = '';

    renderSelectedFilePreview(sessionId);
    updateConversationActionState(sessionId);
  }

  async function uploadFile(sessionId, file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = await api.files.upload({
            filename: file.name,
            content: e.target.result,
            mimeType: file.type,
            project: getCurrentProject(),
            session: sessionId
          });
          if (data.success) {
            resolve(data);
          } else {
            reject(new Error(data.error || '上传失败'));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  }

  function renderAttachmentsHtml(attachments = []) {
    if (!attachments.length) {
      return '';
    }

    return `<div style="margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 8px;">${attachments.map((att) => {
      const ext = att.filename.split('.').pop()?.toLowerCase();

      if (att.mimeType?.startsWith('image/')) {
        return `<img src="${att.url}" style="max-width: 200px; max-height: 200px; border-radius: 8px; cursor: pointer;" onclick="window.open('${att.url}')">`;
      } else if (att.mimeType?.startsWith('audio/')) {
        return `<audio controls src="${att.url}" style="max-width: 300px;"></audio>`;
      }

      let icon = '📄';
      let color = '#2347d3';
      if (['doc', 'docx'].includes(ext)) { icon = '📘'; color = '#2b579a'; }
      else if (['xls', 'xlsx'].includes(ext)) { icon = '📗'; color = '#217346'; }
      else if (['ppt', 'pptx'].includes(ext)) { icon = '📙'; color = '#d24726'; }
      else if (ext === 'pdf') { icon = '📕'; color = '#b30b00'; }
      else if (['csv', 'txt', 'md'].includes(ext)) { icon = '📃'; color = '#5c5c5c'; }

      return `<a href="${att.url}" target="_blank" style="padding: 8px 12px; background: ${color}; color: white; border-radius: 6px; text-decoration: none; font-size: 13px; display: flex; align-items: center; gap: 6px;">${icon} ${escapeHtml(att.filename)}</a>`;
    }).join('')}</div>`;
  }

  function appendMessageElement({ text, type, attachments = [], time = null }) {
    const messagesDiv = document.getElementById('conversationMessages');
    if (!messagesDiv) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    const timestamp = time
      ? `<div style="font-size: 11px; color: #999; margin-bottom: 4px;">${escapeHtml(time)}</div>`
      : '';

    messageDiv.innerHTML = `
      <div class="message-avatar">${type === 'user' ? '👤' : type === 'error' ? '❌' : '🤖'}</div>
      <div class="message-content">
        ${renderAttachmentsHtml(attachments)}
        ${timestamp}
        <div style="white-space: pre-wrap;">${escapeHtml(text || '')}</div>
      </div>
    `;
    messagesDiv.appendChild(messageDiv);
    scrollConversationToBottom();
  }

  function addMessage(text, type, attachments = []) {
    appendMessageElement({ text, type, attachments });
  }

  return {
    getComposerInput,
    shouldSendOnDoubleEnter,
    resetComposerSendArm,
    resizeComposer,
    formatFileSize,
    getComposerHistoryState,
    pushComposerHistory,
    navigateComposerHistory,
    renderSelectedFilePreview,
    bindConversationComposer,
    handleFileSelect,
    clearFile,
    uploadFile,
    renderAttachmentsHtml,
    appendMessageElement,
    addMessage
  };
}
