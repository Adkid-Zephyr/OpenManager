// @ts-nocheck

export function createConversationPanelsController({
  api,
  escapeHtml,
  showToast,
  getCurrentProject,
  getComposerInput,
  resizeComposer,
  appendMessageElement,
  uploadFile,
  loadProjectDetails
}) {
  let currentFilePath = '';
  let currentModalSessionId = '';
  let styleInjected = false;

  function ensurePanelStyles() {
    if (styleInjected) return;
    styleInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  function renderWorkingMemoryBlock(hot) {
    const rows = [
      { label: '当前目标', value: hot?.goal },
      { label: '最近结论', value: hot?.latestDecision },
      { label: '当前阻塞', value: hot?.blocker },
      { label: '下一步', value: hot?.nextStep }
    ].filter((item) => item.value);

    if (rows.length === 0) {
      return '';
    }

    const updatedAt = hot?.updatedAt
      ? new Date(hot.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';

    return `
      <div style="margin-bottom: 16px; padding: 12px; border: 1px solid rgba(35, 71, 211, 0.14); border-radius: 14px; background: rgba(35, 71, 211, 0.06);">
        <div style="font-size: 12px; font-weight: 600; color: #2347d3; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span>当前工作记忆</span>
          ${updatedAt ? `<span style="font-size: 11px; color: #6b7280;">${escapeHtml(updatedAt)}</span>` : ''}
        </div>
        <div style="display: grid; gap: 8px;">
          ${rows.map((item) => `
            <div style="padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,0.72); border: 1px solid rgba(35, 71, 211, 0.08);">
              <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">${escapeHtml(item.label)}</div>
              <div style="font-size: 12px; color: #1e2128; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(item.value)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderKeyFactsBlock(facts) {
    const items = Array.isArray(facts?.items) ? facts.items : [];
    if (items.length === 0) {
      return '';
    }

    const labels = {
      decision: '决策',
      constraint: '约束',
      todo: '待办',
      preference: '偏好'
    };

    return `
      <div style="margin-bottom: 16px; padding: 12px; border: 1px solid rgba(17, 24, 39, 0.08); border-radius: 14px; background: rgba(248, 249, 251, 0.92);">
        <div style="font-size: 12px; font-weight: 600; color: #1b2f78; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; background: #1b2f78; border-radius: 50%;"></span>
          关键事实
        </div>
        <div style="display: grid; gap: 8px;">
          ${items.slice().reverse().map((item) => `
            <div style="padding: 8px 10px; border-radius: 10px; background: white; border: 1px solid #e5e7eb;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                <span style="font-size: 11px; color: #2347d3; font-weight: 600;">${escapeHtml(labels[item.type] || item.type || '事实')}</span>
                ${item.time ? `<span style="font-size: 11px; color: #9ca3af;">${escapeHtml(new Date(item.time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span>` : ''}
              </div>
              <div style="font-size: 12px; color: #1e2128; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(item.text || '')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  async function appendToMemoryRaw(sessionId, entry) {
    try {
      await api.sessions.appendEntry(getCurrentProject(), sessionId, entry);
    } catch (error) {
      console.error('更新记忆失败:', error);
    }
  }

  async function renderMemoryPanel(sessionId) {
    try {
      const currentProject = getCurrentProject();
      const [data, stateData] = await Promise.all([
        api.sessions.getMemory(currentProject, sessionId),
        api.sessions.getMemoryState(currentProject, sessionId).catch(() => ({ hot: null, facts: null }))
      ]);

      const panelContent = document.getElementById('memoryPanelContent');

      if (!data.content || data.content === '[]') {
        panelContent.innerHTML = `
          <div style="color: #999; font-size: 13px; text-align: center; padding: 20px;">
            暂无对话记忆
          </div>
        `;
        return;
      }

      let entries = [];
      try {
        entries = JSON.parse(data.content);
      } catch (error) {
        entries = [];
      }

      if (entries.length === 0) {
        panelContent.innerHTML = `
          <div style="color: #999; font-size: 13px; text-align: center; padding: 20px;">
            暂无对话记忆
          </div>
        `;
        return;
      }

      const uncompressedEntries = entries.filter((entry) => entry.type !== 'compressed_summary' && entry.type !== 'tools' && entry.type !== 'meta');
      const compressedEntries = entries.filter((entry) => entry.type === 'compressed_summary');
      const toolEntries = entries.filter((entry) => entry.type === 'tools');
      const metaEntries = entries.filter((entry) => entry.type === 'meta');

      let html = '';
      html += renderWorkingMemoryBlock(stateData.hot);
      html += renderKeyFactsBlock(stateData.facts);

      if (uncompressedEntries.length > 0) {
        html += `
          <div style="margin-bottom: 16px;">
            <div style="font-size: 12px; font-weight: 600; color: #2347d3; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; background: #2347d3; border-radius: 50%;"></span>
              对话记录 (${uncompressedEntries.length}条)
            </div>
            ${uncompressedEntries.map((entry) => {
              const time = new Date(entry.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
              const icon = entry.type === 'user' ? '👤' : entry.type === 'assistant' ? '🤖' : entry.type === 'error' ? '❌' : '⚠️';
              const color = entry.type === 'user' ? '#2347d3' : entry.type === 'assistant' ? '#10b981' : entry.type === 'error' ? '#ef4444' : '#f59e0b';

              return `
                <div class="memory-entry" style="margin-bottom: 8px;">
                  <div class="timestamp">${icon} ${time}</div>
                  <div class="content" style="border-left: 3px solid ${color}; padding-left: 8px;">${entry.text}</div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      if (toolEntries.length > 0) {
        html += `
          <div style="margin-bottom: 16px;">
            <div style="font-size: 12px; font-weight: 600; color: #10b981; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span>
              工具调用 (${toolEntries.length}次)
            </div>
            ${toolEntries.map((entry) => {
              const time = new Date(entry.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
              return `
                <div class="memory-entry" style="margin-bottom: 8px; border-left-color: #10b981; background: #f0fdf4;">
                  <div class="timestamp" style="color: #10b981;">🔧 ${time}</div>
                  <div class="content" style="border-left: 3px solid #10b981; padding-left: 8px; font-size: 12px;">${entry.text}</div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      if (metaEntries.length > 0) {
        html += `
          <div style="margin-bottom: 16px;">
            <div style="font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; background: #6b7280; border-radius: 50%;"></span>
              执行信息
            </div>
            ${metaEntries.map((entry) => {
              const time = new Date(entry.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
              return `
                <div class="memory-entry" style="margin-bottom: 8px; border-left-color: #6b7280; background: #f9fafb;">
                  <div class="timestamp" style="color: #6b7280;">⚙️ ${time}</div>
                  <div class="content" style="border-left: 3px solid #6b7280; padding-left: 8px; font-size: 12px;">${entry.text}</div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      if (compressedEntries.length > 0) {
        html += `
          <div style="border-top: 2px dashed #e0e0e0; padding-top: 16px;">
            <div style="font-size: 12px; font-weight: 600; color: #10b981; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span>
              压缩历史 (${compressedEntries.length}次压缩)
            </div>
            ${compressedEntries.map((entry, idx) => {
              const time = new Date(entry.time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              const fromInfo = entry.compressedFrom ? `（压缩${entry.compressedFrom.count}条记录）` : '';

              return `
                <div class="memory-entry" style="margin-bottom: 8px; border-left-color: #10b981; background: #f0fdf4;">
                  <div class="timestamp" style="color: #10b981;">🗜️ 第${idx + 1}次压缩 · ${time} ${fromInfo}</div>
                  <div class="content" style="border-left: 3px solid #10b981; padding-left: 8px; font-size: 12px;">${entry.text}</div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      panelContent.innerHTML = html;
    } catch (error) {
      console.error('加载记忆失败:', error);
    }
  }

  async function loadConversationMemory(sessionId) {
    await renderMemoryPanel(sessionId);
  }

  async function loadConversationHistory(sessionId) {
    try {
      const data = await api.sessions.getMemory(getCurrentProject(), sessionId);
      const messagesDiv = document.getElementById('conversationMessages');

      if (!data.content || data.content === '[]') {
        messagesDiv.innerHTML = `
          <div class="message assistant">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
              你好！我是你的 AI 助手 🚀<br><br>
              这里是 <strong>${sessionId}</strong> 对话空间。<br>
              我可以帮你记录想法、整理思路、总结对话。<br><br>
              💡 提示：点击右侧 <strong>🤖 压缩</strong> 可以用 AI 智能总结对话内容
            </div>
          </div>
        `;
        return;
      }

      let entries = [];
      try {
        entries = JSON.parse(data.content);
      } catch (error) {
        entries = [];
      }

      if (entries.length === 0) {
        messagesDiv.innerHTML = `
          <div class="message assistant">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
              你好！我是你的 AI 助手 🚀<br><br>
              这里是 <strong>${sessionId}</strong> 对话空间。<br>
              我可以帮你记录想法、整理思路、总结对话。<br><br>
              💡 提示：点击右侧 <strong>🤖 压缩</strong> 可以用 AI 智能总结对话内容
            </div>
          </div>
        `;
        return;
      }

      const chatEntries = entries.filter((entry) => entry.type === 'user' || entry.type === 'assistant' || entry.type === 'error');
      if (chatEntries.length === 0) {
        messagesDiv.innerHTML = `
          <div class="message assistant">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
              你好！我是你的 AI 助手 🚀<br><br>
              这里是 <strong>${sessionId}</strong> 对话空间。<br>
              我可以帮你记录想法、整理思路、总结对话。<br><br>
              💡 提示：点击右侧 <strong>🤖 压缩</strong> 可以用 AI 智能总结对话内容
            </div>
          </div>
        `;
        return;
      }

      messagesDiv.innerHTML = '';
      chatEntries.forEach((entry) => {
        const time = new Date(entry.time).toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        appendMessageElement({
          text: entry.text || '',
          type: entry.type,
          attachments: entry.attachments || [],
          time
        });
      });

      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } catch (error) {
      console.error('加载对话历史失败:', error);
      const messagesDiv = document.getElementById('conversationMessages');
      messagesDiv.innerHTML = `
        <div class="message assistant">
          <div class="message-avatar">🤖</div>
          <div class="message-content">
            你好！我是你的 AI 助手 🚀<br><br>
            这里是 <strong>${sessionId}</strong> 对话空间。<br>
            我可以帮你记录想法、整理思路、总结对话。
          </div>
        </div>
      `;
    }
  }

  async function compressMemory(sessionId) {
    try {
      const currentProject = getCurrentProject();
      const data = await api.sessions.getMemory(currentProject, sessionId);

      if (!data.content || data.content === '[]') {
        alert('暂无记忆可压缩');
        return;
      }

      let entries = [];
      try {
        entries = JSON.parse(data.content);
      } catch (error) {
        alert('记忆格式错误');
        return;
      }

      const compressedEntries = entries.filter((entry) => entry.type === 'compressed_summary');
      const rawEntries = entries.filter((entry) => entry.type !== 'compressed_summary');
      const latestCompressedEnd = compressedEntries.reduce((latest, entry) => {
        const candidate = entry?.compressedFrom?.end || entry?.time || '';
        return candidate && candidate > latest ? candidate : latest;
      }, '');
      const uncompressedEntries = latestCompressedEnd
        ? rawEntries.filter((entry) => !entry.time || entry.time > latestCompressedEnd)
        : rawEntries;

      if (uncompressedEntries.length === 0) {
        alert('没有新的未压缩记忆。所有记忆已被压缩过。');
        return;
      }

      const compressData = await api.openclaw.compress({
        project: currentProject,
        session: sessionId,
        entries: uncompressedEntries
      });

      if (compressData.error) {
        throw new Error(compressData.error);
      }

      const newCompressedEntry = {
        type: 'compressed_summary',
        text: compressData.summary,
        time: new Date().toISOString(),
        compressedFrom: {
          start: uncompressedEntries[0]?.time,
          end: uncompressedEntries[uncompressedEntries.length - 1]?.time,
          count: uncompressedEntries.length
        }
      };

      await api.sessions.appendEntry(currentProject, sessionId, newCompressedEntry);
      await renderMemoryPanel(sessionId);
      alert(`记忆已压缩！新增 1 条阶段摘要，已覆盖 ${uncompressedEntries.length} 条新记录，原始记录已保留。`);
    } catch (error) {
      alert('压缩失败：' + error.message);
    }
  }

  function copyMemory() {
    const panelContent = document.getElementById('memoryPanelContent');
    const text = panelContent.textContent;
    navigator.clipboard.writeText(text).then(() => {
      alert('记忆已复制');
    }).catch((error) => {
      alert('复制失败：' + error);
    });
  }

  async function showFilesModal(sessionId) {
    ensurePanelStyles();
    currentFilePath = '';
    currentModalSessionId = sessionId;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'filesModal';
    overlay.innerHTML = `
      <div class="modal" style="max-width: 900px; height: 80vh; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0;">📁 项目文件</h2>
          <button class="btn btn-secondary" onclick="document.getElementById('filesModal').remove()">✕ 关闭</button>
        </div>
        <div style="display: flex; gap: 8px; margin-bottom: 16px; align-items: center;">
          <button class="btn btn-secondary" onclick="navigateFiles('')" title="返回 uploads 根目录" style="padding: 6px 10px;">🏠 首页</button>
          <button class="btn btn-secondary" onclick="openUploadsInFinder('${sessionId}')" title="在 Finder 中打开 uploads 文件夹" style="padding: 6px 10px;">📂 Finder</button>
          <span id="currentFilePath" style="font-size: 13px; color: #666; flex: 1; font-family: monospace;"></span>
          <button class="btn btn-primary" onclick="uploadFileFromModal('${sessionId}')" title="上传文件到项目" style="padding: 6px 12px;">⬆️ 上传</button>
        </div>
        <div style="flex: 1; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px;" id="filesContent">
          <div style="text-align: center; padding: 40px; color: #666;">
            <div style="width: 24px; height: 24px; border: 3px solid #2347d3; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
            加载文件列表中...
          </div>
        </div>
        <div style="margin-top: 16px; padding: 12px; background: rgba(238,241,244,0.76); border: 1px solid rgba(126,135,148,0.12); border-radius: 12px; font-size: 12px; color: #4c5360;">
          💡 <strong>提示：</strong><br>
          • 点击文件可插入到对话输入框<br>
          • 支持图片、文档、表格、演示文稿、PDF 等格式<br>
          • 所有上传的文件在项目内所有会话间共享
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    await loadFilesList();
  }

  async function loadFilesList() {
    try {
      const currentProject = getCurrentProject();
      const data = await api.files.list(currentProject, currentFilePath || undefined);
      const filesContent = document.getElementById('filesContent');

      if (data.error) {
        filesContent.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center;">加载失败：${data.error}</div>`;
        return;
      }

      document.getElementById('currentFilePath').textContent = currentFilePath || '/';

      let html = '';

      if (data.folders && data.folders.length > 0) {
        html += `<div style="margin-bottom: 16px;"><div style="font-size: 12px; font-weight: 600; color: #4c5360; margin-bottom: 8px;">📂 文件夹</div>`;
        html += data.folders.map((folder) => `
          <div onclick="navigateFiles('${folder.path}')" style="padding: 10px 12px; background: rgba(238,241,244,0.72); border: 1px solid rgba(126,135,148,0.10); border-radius: 10px; margin-bottom: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.2s, border-color 0.2s;" onmouseover="this.style.background='rgba(227,232,237,0.92)';this.style.borderColor='rgba(126,135,148,0.18)'" onmouseout="this.style.background='rgba(238,241,244,0.72)';this.style.borderColor='rgba(126,135,148,0.10)'">
            <span style="font-size: 18px;">📂</span>
            <span style="flex: 1; font-weight: 500;">${folder.name}</span>
            <span style="font-size: 11px; color: #999;">${new Date(folder.updatedAt).toLocaleDateString('zh-CN')}</span>
          </div>
        `).join('');
        html += `</div>`;
      }

      if (data.files && data.files.length > 0) {
        html += `<div style="margin-bottom: 16px;"><div style="font-size: 12px; font-weight: 600; color: #4c5360; margin-bottom: 8px;">📄 文件（${data.files.length}个）</div>`;
        html += data.files.map((file) => {
          const ext = file.name.split('.').pop()?.toLowerCase();
          let icon = '📄';
          let color = '#2347d3';
          if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) { icon = '🖼️'; color = '#5f6b7c'; }
          else if (['doc', 'docx'].includes(ext)) { icon = '📘'; color = '#2b579a'; }
          else if (['xls', 'xlsx'].includes(ext)) { icon = '📗'; color = '#217346'; }
          else if (['ppt', 'pptx'].includes(ext)) { icon = '📙'; color = '#d24726'; }
          else if (ext === 'pdf') { icon = '📕'; color = '#b30b00'; }
          else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) { icon = '🎵'; color = '#ec4899'; }

          const displayName = file.path.includes('uploads/') ? file.name : file.name;

          return `
            <div onclick="insertFileToChat('${displayName}', '${file.name}')" style="padding: 10px 12px; background: rgba(255,255,255,0.92); border: 1px solid #dde2e8; border-radius: 10px; margin-bottom: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s;" onmouseover="this.style.borderColor='${color}';this.style.background='${color}12'" onmouseout="this.style.borderColor='#dde2e8';this.style.background='rgba(255,255,255,0.92)'">
              <span style="font-size: 18px;">${icon}</span>
              <span style="flex: 1; font-weight: 500;">${displayName}</span>
              <span style="font-size: 11px; color: #999;">${(file.size / 1024).toFixed(1)} KB</span>
              <button onclick="event.stopPropagation(); deleteFile('${file.name}', '${currentModalSessionId}')" title="删除文件" style="width: 28px; height: 28px; border: none; background: #fee2e2; color: #ef4444; border-radius: 6px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='#ef4444';this.style.color='white'" onmouseout="this.style.background='#fee2e2';this.style.color='#ef4444'">🗑️</button>
            </div>
          `;
        }).join('');
        html += `</div>`;
      }

      if (data.folders.length === 0 && data.files.length === 0) {
        html = `<div style="text-align: center; padding: 40px; color: #999;">
          <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
          <div>暂无文件</div>
          <div style="font-size: 13px; margin-top: 8px;">点击"上传"按钮添加文件</div>
        </div>`;
      }

      filesContent.innerHTML = html;
    } catch (error) {
      console.error('加载文件列表失败:', error);
      const filesContent = document.getElementById('filesContent');
      filesContent.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center;">加载失败：${error.message}</div>`;
    }
  }

  function navigateFiles(path) {
    currentFilePath = path;
    loadFilesList();
  }

  function navigateFilesUp() {
    if (!currentFilePath) return;
    const parts = currentFilePath.split('/');
    parts.pop();
    currentFilePath = parts.join('/');
    loadFilesList();
  }

  function insertFileToChat(filePath, fileName) {
    const modal = document.getElementById('conversationModal');
    const sessionId = modal?.dataset?.sessionId;
    const input = sessionId ? getComposerInput(sessionId) : document.getElementById('messageInput');
    if (!input) return;

    let displayName = fileName;
    const parts = fileName.split('-');
    if (parts.length > 1 && /^\d+$/.test(parts[0])) {
      displayName = parts.slice(1).join('-');
    }

    const fileUrl = api.fileUrl(getCurrentProject(), fileName);
    const ext = fileName.split('.').pop()?.toLowerCase();
    let fileText = `[文件：${displayName}](${fileUrl})`;

    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
      fileText = `[图片：${displayName}](${fileUrl})`;
    } else if (['doc', 'docx'].includes(ext)) {
      fileText = `[Word：${displayName}](${fileUrl})`;
    } else if (['xls', 'xlsx'].includes(ext)) {
      fileText = `[Excel：${displayName}](${fileUrl})`;
    } else if (['ppt', 'pptx'].includes(ext)) {
      fileText = `[PPT：${displayName}](${fileUrl})`;
    } else if (ext === 'pdf') {
      fileText = `[PDF：${displayName}](${fileUrl})`;
    }

    input.value = input.value ? `${input.value} ${fileText}` : fileText;
    resizeComposer(input);
    document.getElementById('filesModal')?.remove();
    input.focus();
  }

  async function deleteFile(fileName) {
    const displayName = fileName.split('-').slice(1).join('-') || fileName;
    if (!confirm(`确定删除文件 "${displayName}"？\n\n此操作不可恢复！`)) {
      return;
    }

    try {
      const result = await api.files.remove(getCurrentProject(), fileName);
      if (result.error) {
        throw new Error(result.error);
      }

      await loadFilesList();
      showToast(`✅ 已删除：${displayName}`);
    } catch (error) {
      alert(`删除失败：${error.message}`);
    }
  }

  async function renameConversation(sessionId) {
    const currentProject = getCurrentProject();
    const titleEl = document.getElementById(`conversationTitle_${sessionId}`);
    const currentName = titleEl ? titleEl.textContent : sessionId;
    const newName = prompt('请输入新对话名称:', currentName);
    if (!newName || newName === currentName) return;

    try {
      const result = await api.sessions.rename(currentProject, sessionId, newName);
      if (result.error) throw new Error(result.error);

      if (titleEl) {
        titleEl.textContent = newName;
      }

      await loadProjectDetails();
      showToast(`✅ 已重命名：${newName}`);
    } catch (error) {
      alert(`重命名失败：${error.message}`);
    }
  }

  async function openUploadsInFinder() {
    try {
      const result = await api.projects.openInFinder(getCurrentProject(), 'uploads');
      if (result.error) {
        throw new Error(result.error);
      }

      showToast(`✅ ${result.message}`);
      console.log('[Finder] Success:', result.message);
    } catch (error) {
      console.error('[Finder] Error:', error);
      alert(`打开失败：${error.message}`);
    }
  }

  function uploadFileFromModal(sessionId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,audio/*,video/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.md,.csv';
    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        await uploadFile(sessionId, file);
        await loadFilesList();
        alert(`文件已上传：${file.name}`);
      } catch (error) {
        alert(`上传失败：${error.message}`);
      }
    };
    input.click();
  }

  async function showLogsModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'logsModal';
    overlay.innerHTML = `
      <div class="modal" style="max-width: 800px; height: 80vh; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0;">📜 OpenClaw 日志</h2>
          <button class="btn btn-secondary" onclick="document.getElementById('logsModal').remove()">✕ 关闭</button>
        </div>
        <div style="flex: 1; overflow-y: auto; background: #1e1e1e; border-radius: 8px; padding: 16px; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; color: #d4d4d4;" id="logsContent">
          <div style="text-align: center; padding: 40px; color: #666;">
            <div style="width: 24px; height: 24px; border: 3px solid #2347d3; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
            加载日志中...
          </div>
        </div>
        <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end;">
          <button class="btn btn-secondary" onclick="refreshLogs()">🔄 刷新</button>
          <button class="btn btn-primary" onclick="copyLogs()">📋 复制日志</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    await loadLogs();
  }

  async function loadLogs() {
    try {
      const data = await api.openclaw.logs();
      const logsContent = document.getElementById('logsContent');

      if (data.error) {
        logsContent.innerHTML = `<div style="color: #ef4444; padding: 20px;">加载日志失败：${data.error}</div>`;
        return;
      }

      if (data.logs.length === 0) {
        logsContent.innerHTML = `<div style="color: #666; padding: 20px; text-align: center;">暂无日志</div>`;
        return;
      }

      logsContent.innerHTML = data.logs.map((log) => {
        const levelColor = log.level === 'ERROR' ? '#ef4444' : log.level === 'WARN' ? '#f59e0b' : log.level === 'DEBUG' ? '#6b7280' : '#10b981';
        const time = log.time ? new Date(log.time).toLocaleTimeString('zh-CN') : '';

        return `
          <div style="margin-bottom: 8px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; border-left: 3px solid ${levelColor};">
            <div style="display: flex; gap: 12px; align-items: baseline;">
              <span style="color: #6b7280; font-size: 11px;">${time}</span>
              <span style="color: ${levelColor}; font-weight: 600; font-size: 11px; min-width: 50px;">${log.level}</span>
              <span style="color: #d4d4d4; flex: 1; word-break: break-word;">${escapeHtml(log.message)}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (error) {
      const logsContent = document.getElementById('logsContent');
      logsContent.innerHTML = `<div style="color: #ef4444; padding: 20px;">加载日志失败：${error.message}</div>`;
    }
  }

  function refreshLogs() {
    loadLogs();
  }

  function copyLogs() {
    const logsContent = document.getElementById('logsContent');
    const text = logsContent.textContent;
    navigator.clipboard.writeText(text).then(() => {
      alert('日志已复制');
    }).catch((error) => {
      alert('复制失败：' + error);
    });
  }

  return {
    loadConversationMemory,
    loadConversationHistory,
    appendToMemoryRaw,
    renderWorkingMemoryBlock,
    renderKeyFactsBlock,
    renderMemoryPanel,
    compressMemory,
    copyMemory,
    showFilesModal,
    loadFilesList,
    navigateFiles,
    navigateFilesUp,
    insertFileToChat,
    deleteFile,
    renameConversation,
    openUploadsInFinder,
    uploadFileFromModal,
    showLogsModal,
    loadLogs,
    refreshLogs,
    copyLogs
  };
}
