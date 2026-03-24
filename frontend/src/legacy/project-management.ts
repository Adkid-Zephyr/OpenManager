// @ts-nocheck

export function createProjectManagementController({
  api,
  runtimeDefaults,
  escapeHtml,
  showToast,
  getCurrentProject,
  setCurrentProject,
  getCurrentProjectDetails,
  setCurrentProjectDetails,
  getCachedAgents,
  getCachedModels,
  setCachedAgents,
  setCachedAgentsAt,
  loadAgentOptions,
  buildAgentSelectOptions,
  buildModelSelectOptions,
  getPreferredModelValue,
  populateModelPicker,
  loadProjects,
  renderProjectList,
  loadProjectDetails,
  selectProject,
  renderMemory,
  openProjectFolderInFinder
}) {
  async function showCreateProjectModal() {
    document.getElementById('createProjectModal').classList.add('active');
    await populateModelPicker({
      selectId: 'newProjectModelSelect',
      inputId: 'newProjectModel',
      noteId: 'newProjectModelNote',
      value: document.getElementById('newProjectModel').value
    });
  }

  function showCreateSessionModal() {
    document.getElementById('createSessionModal').classList.add('active');
  }

  function showAddTaskModal() {
    document.getElementById('addTaskModal').classList.add('active');
  }

  function hideModal(id) {
    document.getElementById(id).classList.remove('active');
  }

  function toggleCreateProjectAgentOptions() {
    const checked = document.getElementById('newProjectAutoAgent').checked;
    document.getElementById('createProjectAgentOptions').style.display = checked ? 'block' : 'none';
    if (checked) {
      populateModelPicker({
        selectId: 'newProjectModelSelect',
        inputId: 'newProjectModel',
        noteId: 'newProjectModelNote',
        value: document.getElementById('newProjectModel').value
      });
    }
  }

  function toggleProjectWorkspacePathField() {
    const mode = document.getElementById('projectWorkspaceMode')?.value || 'main';
    const input = document.getElementById('projectWorkspacePath');
    const note = document.getElementById('projectWorkspaceModeNote');
    if (!input || !note) return;

    input.disabled = mode !== 'custom';
    input.style.opacity = mode === 'custom' ? '1' : '0.6';

    if (mode === 'project') {
      note.textContent = '对话默认在当前项目目录下运行，适合代码与文件操作。';
    } else if (mode === 'custom') {
      note.textContent = '对话会在下面的自定义目录运行，请确保路径存在且你希望它能访问。';
    } else {
      note.textContent = '对话运行在 OpenClaw 主工作区，适合跨项目操作。';
    }
  }

  function resolveProjectWorkspaceSelection() {
    const mode = document.getElementById('projectWorkspaceMode')?.value || 'main';
    const manualPath = document.getElementById('projectWorkspacePath')?.value.trim() || '';
    const currentProjectDetails = getCurrentProjectDetails();

    if (mode === 'project') {
      return currentProjectDetails?.path || null;
    }

    if (mode === 'custom') {
      return manualPath || null;
    }

    return null;
  }

  async function showProjectSettingsModal() {
    const currentProject = getCurrentProject();
    if (!currentProject) return;

    let projectData = getCurrentProjectDetails();
    if (!projectData || projectData.name !== currentProject) {
      try {
        projectData = await api.projects.get(currentProject);
        setCurrentProjectDetails(projectData);
      } catch (error) {
        alert('加载项目设置失败：' + error.message);
        return;
      }
    }

    const config = projectData.config || {};
    const cachedAgents = getCachedAgents();
    const cachedModels = getCachedModels();
    const workspaceMode = config.workspaceMode || (config.workspacePath ? 'custom' : 'main');
    const initialOptions = buildAgentSelectOptions(cachedAgents, config.agentId, !cachedAgents);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-overlay-scroll active';
    overlay.id = 'projectSettingsModal';
    overlay.innerHTML = `
      <div class="modal modal-scroll" style="max-width: 720px;">
        <h2 style="margin-bottom: 20px;">⚙️ 项目设置</h2>
        <div class="helper-card">
          这里可以绑定已有 agent，也可以一键生成一个新的 OpenClaw 子 agent 并写回到项目配置。
        </div>
        <div class="modal-section">
          <h3>运行绑定</h3>
          <div class="form-group">
            <label>绑定 Agent</label>
            <select id="projectAgentId" style="width: 100%; padding: 12px 16px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">${initialOptions}</select>
            <div class="muted-note" id="projectAgentLoadingNote">${cachedAgents ? '从缓存加载 agent 列表。' : '正在后台加载 agent 列表...'}</div>
          </div>
          <div class="field-grid" style="margin-bottom: 16px;">
            <div class="form-group">
              <label>新 Agent 名称（可选）</label>
              <input type="text" id="projectAgentName" value="" placeholder="留空则按项目名自动生成">
            </div>
            <div class="form-group">
              <label>默认模型</label>
              <select id="projectModelSelect" onchange="syncModelInputFromSelect('projectModel', 'projectModelSelect')" style="width: 100%; padding: 12px 16px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; margin-bottom: 10px;">${buildModelSelectOptions(cachedModels, getPreferredModelValue(config.model), null, !cachedModels)}</select>
              <input type="text" id="projectModel" value="${escapeHtml(getPreferredModelValue(config.model))}" placeholder="留空则跟随当前 OpenClaw 默认模型，也支持手动输入 alias 或 provider/model" oninput="syncModelSelectFromInput('projectModel', 'projectModelSelect')">
              <div class="muted-note" id="projectModelNote">${cachedModels ? `已从缓存同步 ${cachedModels.length} 个可用模型。` : '正在后台加载可用模型...'}</div>
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label>工作区路径</label>
            <input type="text" id="projectWorkspacePath" value="${config.workspacePath || ''}" placeholder="留空则使用主工作区">
          </div>
        </div>
        <div class="modal-section">
          <h3>权限与运行</h3>
          <div class="field-grid" style="margin-bottom: 16px;">
            <div class="form-group">
              <label>对话运行方式</label>
              <select id="projectRuntime">
                <option value="gateway" ${config.runtime !== 'local' ? 'selected' : ''}>Gateway Agent</option>
                <option value="local" ${config.runtime === 'local' ? 'selected' : ''}>本地 Codex</option>
              </select>
            </div>
            <div class="form-group">
              <label>文件作用域</label>
              <select id="projectWorkspaceMode" onchange="toggleProjectWorkspacePathField()">
                <option value="main" ${workspaceMode === 'main' ? 'selected' : ''}>主工作区</option>
                <option value="project" ${workspaceMode === 'project' ? 'selected' : ''}>当前项目目录</option>
                <option value="custom" ${workspaceMode === 'custom' ? 'selected' : ''}>自定义目录</option>
              </select>
            </div>
          </div>
          <div class="muted-note" id="projectWorkspaceModeNote"></div>
          <div class="helper-card" style="margin-top: 12px; margin-bottom: 0;">
            <code>Gateway Agent</code> 会继续走 OpenClaw agent；<code>本地 Codex</code> 会在你选定的目录里直接调用本地 Codex 执行器，更适合改代码、写文件、安装依赖和做项目级操作。本地 Codex 模式会忽略上面的 OpenClaw 模型字段。
          </div>
        </div>
        <div class="form-group">
          <label>项目描述</label>
          <textarea id="projectSettingsDesc" rows="3">${config.description || projectData.description || ''}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="createAndBindProjectAgent()">⚡ 一键创建并绑定</button>
          <button class="btn btn-secondary" onclick="document.getElementById('projectSettingsModal').remove()">取消</button>
          <button class="btn btn-primary" onclick="saveProjectSettings()">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    loadAgentOptions()
      .then((agents) => {
        const select = document.getElementById('projectAgentId');
        const note = document.getElementById('projectAgentLoadingNote');
        if (select) {
          select.innerHTML = buildAgentSelectOptions(agents, config.agentId, false);
        }
        if (note) {
          note.textContent = `已加载 ${agents.length} 个可选 agent。`;
        }
      })
      .catch((error) => {
        const note = document.getElementById('projectAgentLoadingNote');
        if (note) {
          note.textContent = `Agent 列表加载失败：${error.message}`;
        }
      });

    populateModelPicker({
      selectId: 'projectModelSelect',
      inputId: 'projectModel',
      noteId: 'projectModelNote',
      value: config.model || ''
    });
    toggleProjectWorkspacePathField();
  }

  async function saveProjectSettings() {
    const currentProject = getCurrentProject();
    if (!currentProject) return;

    const payload = {
      agentId: document.getElementById('projectAgentId').value || null,
      workspacePath: resolveProjectWorkspaceSelection(),
      model: document.getElementById('projectModel').value.trim() || runtimeDefaults.defaultModel || '',
      description: document.getElementById('projectSettingsDesc').value.trim(),
      runtime: document.getElementById('projectRuntime').value || 'gateway',
      workspaceMode: document.getElementById('projectWorkspaceMode').value || 'main'
    };

    try {
      const result = await api.projects.updateSettings(currentProject, payload);
      if (result.error) throw new Error(result.error);

      document.getElementById('projectSettingsModal').remove();
      await loadProjects();
      renderProjectList();
      await loadProjectDetails();
      showToast('✅ 项目设置已保存');
    } catch (error) {
      alert('保存项目设置失败：' + error.message);
    }
  }

  async function createAndBindProjectAgent() {
    const currentProject = getCurrentProject();
    if (!currentProject) return;

    const payload = {
      agentName: document.getElementById('projectAgentName').value.trim() || null,
      workspacePath: resolveProjectWorkspaceSelection(),
      model: document.getElementById('projectModel').value.trim() || runtimeDefaults.defaultModel || ''
    };

    try {
      const result = await api.projects.createAndBindAgent(currentProject, payload);
      if (result.error) throw new Error(result.error);

      setCachedAgents(null);
      setCachedAgentsAt(0);
      const agents = await loadAgentOptions(true).catch(() => []);
      const projectAgentId = document.getElementById('projectAgentId');
      if (projectAgentId) {
        projectAgentId.value = result.agentId;
        projectAgentId.innerHTML = buildAgentSelectOptions(agents, result.agentId, false);
      }
      document.getElementById('projectWorkspacePath').value = result.workspacePath || '';
      document.getElementById('projectModel').value = result.model || getPreferredModelValue();

      showToast(`✅ 已创建并绑定 Agent：${result.agentId}`);
      await loadProjects();
      renderProjectList();
      await loadProjectDetails();
    } catch (error) {
      alert('创建并绑定失败：' + error.message);
    }
  }

  async function createProject() {
    const name = document.getElementById('newProjectName').value.trim();
    const desc = document.getElementById('newProjectDesc').value.trim();
    const autoCreateAgent = document.getElementById('newProjectAutoAgent').checked;
    const agentName = document.getElementById('newProjectAgentName').value.trim();
    const workspacePath = document.getElementById('newProjectWorkspacePath').value.trim();
    const model = document.getElementById('newProjectModel').value.trim() || runtimeDefaults.defaultModel || '';

    if (!name) {
      alert('请输入项目名称');
      return;
    }

    try {
      const result = await api.projects.create({
        name,
        description: desc,
        autoCreateAgent,
        agentName: agentName || null,
        workspacePath: workspacePath || null,
        model
      });
      if (result.error) throw new Error(result.error);

      hideModal('createProjectModal');
      document.getElementById('newProjectName').value = '';
      document.getElementById('newProjectDesc').value = '';
      document.getElementById('newProjectAutoAgent').checked = false;
      document.getElementById('newProjectAgentName').value = '';
      document.getElementById('newProjectWorkspacePath').value = '';
      document.getElementById('newProjectModel').value = getPreferredModelValue();
      toggleCreateProjectAgentOptions();

      await loadProjects();
      renderProjectList();
      await selectProject(name);

      if (result.autoBoundAgent) {
        alert(`项目已创建，并自动绑定 Agent：${result.autoBoundAgent}`);
      }
    } catch (error) {
      alert('创建项目失败：' + error.message);
    }
  }

  async function createSession() {
    const currentProject = getCurrentProject();
    const sessionName = document.getElementById('newSessionName').value.trim();

    if (!currentProject) {
      alert('请先选择项目');
      return;
    }

    try {
      const result = await api.sessions.create(currentProject, sessionName);
      if (result.error) throw new Error(result.error);

      hideModal('createSessionModal');
      document.getElementById('newSessionName').value = '';
      await loadProjectDetails();
    } catch (error) {
      alert('创建会话失败：' + error.message);
    }
  }

  async function addTask() {
    const currentProject = getCurrentProject();
    const description = document.getElementById('newTaskDesc').value.trim();

    if (!currentProject) {
      alert('请先选择项目');
      return;
    }

    try {
      const result = await api.tasks.create(currentProject, description);
      if (result.error) throw new Error(result.error);

      hideModal('addTaskModal');
      document.getElementById('newTaskDesc').value = '';
      await loadProjectDetails();
    } catch (error) {
      alert('添加任务失败：' + error.message);
    }
  }

  async function switchSession(sessionId) {
    const currentProject = getCurrentProject();
    try {
      await api.sessions.switch(currentProject, sessionId);
      await loadProjectDetails();
    } catch (error) {
      alert('切换会话失败：' + error.message);
    }
  }

  async function renameSession(sessionId) {
    const currentProject = getCurrentProject();
    const newName = prompt('请输入新会话名称:', sessionId);
    if (!newName || newName === sessionId) return;

    try {
      const result = await api.sessions.rename(currentProject, sessionId, newName);
      if (result.error) throw new Error(result.error);
      await loadProjectDetails();
    } catch (error) {
      alert('重命名失败：' + error.message);
    }
  }

  async function renameSessionFromConversation(sessionId) {
    const currentProject = getCurrentProject();
    const newName = prompt('请输入新会话名称:', sessionId);
    if (!newName || newName === sessionId) return;

    try {
      const result = await api.sessions.rename(currentProject, sessionId, newName);
      if (result.error) throw new Error(result.error);

      const title = document.querySelector('.conversation-header-title h2');
      if (title) {
        title.textContent = `💬 ${newName}`;
      }
      await loadProjectDetails();
    } catch (error) {
      alert('重命名失败：' + error.message);
    }
  }

  async function viewMemory(sessionId) {
    const currentProject = getCurrentProject();
    try {
      const data = await api.sessions.getMemory(currentProject, sessionId);
      if (data.error) throw new Error(data.error);
      alert(`会话记忆:\n\n${data.content || '暂无内容'}`);
    } catch (error) {
      alert('查看记忆失败：' + error.message);
    }
  }

  async function deleteSession(sessionId) {
    const currentProject = getCurrentProject();
    if (!confirm(`确定删除会话 "${sessionId}"？\n\n这将删除该会话的所有记忆文件！`)) return;

    try {
      await api.sessions.remove(currentProject, sessionId);
      await loadProjectDetails();
    } catch (error) {
      alert('删除会话失败：' + error.message);
    }
  }

  async function toggleTask(id) {
    const currentProject = getCurrentProject();
    try {
      await api.tasks.toggle(currentProject, id);
      await loadProjectDetails();
    } catch (error) {
      alert('切换任务状态失败：' + error.message);
    }
  }

  async function deleteTask(id) {
    const currentProject = getCurrentProject();
    if (!confirm('确定删除此任务？')) return;

    try {
      await api.tasks.remove(currentProject, id);
      await loadProjectDetails();
    } catch (error) {
      alert('删除任务失败：' + error.message);
    }
  }

  async function editSharedMemory() {
    const currentContent = document.getElementById('sharedMemory').textContent;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'editSharedMemoryModal';
    modal.innerHTML = `
      <div class="modal" style="max-width: 700px;">
        <h2>✏️ 编辑共享记忆</h2>
        <div class="form-group">
          <label>记忆内容 (Markdown 格式)</label>
          <textarea id="editSharedMemoryContent" rows="15" style="width: 100%; font-family: monospace; font-size: 13px;">${currentContent}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('editSharedMemoryModal').remove()">取消</button>
          <button class="btn btn-primary" onclick="saveSharedMemory()">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  async function saveSharedMemory() {
    const currentProject = getCurrentProject();
    const content = document.getElementById('editSharedMemoryContent').value;

    try {
      await api.memory.saveShared(currentProject, content);
      document.getElementById('editSharedMemoryModal').remove();
      renderMemory(content);
    } catch (error) {
      alert('保存失败：' + error.message);
    }
  }

  async function openProjectFolder() {
    if (!getCurrentProject()) return;
    await openProjectFolderInFinder();
  }

  async function exportProject() {
    const currentProject = getCurrentProject();
    if (!currentProject) return;

    try {
      const data = await api.projects.export(currentProject);
      if (data.error) throw new Error(data.error);

      const blob = new Blob([JSON.stringify(data.export, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentProject}-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('导出失败：' + error.message);
    }
  }

  async function renameCurrentProject() {
    const currentProject = getCurrentProject();
    if (!currentProject) return;

    let currentDesc = '';
    try {
      const data = await api.projects.get(currentProject);
      currentDesc = data.description || '';
    } catch (error) {
      console.error('获取项目信息失败:', error);
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'renameModal';
    overlay.dataset.currentDesc = currentDesc;
    overlay.innerHTML = `
      <div class="modal">
        <h2 style="margin-bottom: 20px;">✏️ 重命名项目</h2>
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #555;">项目名称</label>
          <input type="text" id="renameProjectName" value="${escapeHtml(currentProject)}" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;">
        </div>
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #555;">项目描述</label>
          <textarea id="renameProjectDesc" rows="3" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; resize: vertical;">${escapeHtml(currentDesc)}</textarea>
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="btn btn-secondary" onclick="document.getElementById('renameModal').remove()">取消</button>
          <button class="btn btn-primary" onclick="saveProjectRename()">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  async function saveProjectRename() {
    const currentProject = getCurrentProject();
    const newName = document.getElementById('renameProjectName').value.trim();
    const newDesc = document.getElementById('renameProjectDesc').value.trim();
    const currentDesc = document.getElementById('renameModal')?.dataset?.currentDesc || '';

    if (!newName) {
      alert('项目名称不能为空');
      return;
    }

    if (newName === currentProject && newDesc === currentDesc) {
      document.getElementById('renameModal').remove();
      return;
    }

    try {
      if (newName !== currentProject) {
        const result = await api.projects.rename(currentProject, newName);
        if (result.error) throw new Error(result.error);
        setCurrentProject(newName);
      }

      const descResult = await api.projects.updateDescription(newName, newDesc);
      if (descResult.error) throw new Error(descResult.error);

      document.getElementById('renameModal').remove();
      await loadProjects();
      renderProjectList();
      await selectProject(newName);
    } catch (error) {
      alert('保存失败：' + error.message);
    }
  }

  async function deleteCurrentProject() {
    const currentProject = getCurrentProject();
    if (!currentProject) return;

    if (!confirm(`⚠️  确定删除项目 "${currentProject}"？\n\n这将删除所有会话、任务和记忆数据！\n\n此操作不可恢复！`)) return;

    try {
      const result = await api.projects.remove(currentProject);
      if (result.error) throw new Error(result.error);

      setCurrentProject(null);
      setCurrentProjectDetails(null);
      document.getElementById('noProjectSelected').style.display = 'block';
      document.getElementById('projectContent').style.display = 'none';
      document.getElementById('projectInfo').style.display = 'block';
      document.getElementById('projectInfoContent').style.display = 'none';

      await loadProjects();
      renderProjectList();
    } catch (error) {
      alert('删除项目失败：' + error.message);
    }
  }

  return {
    showCreateProjectModal,
    showCreateSessionModal,
    showAddTaskModal,
    hideModal,
    toggleCreateProjectAgentOptions,
    toggleProjectWorkspacePathField,
    resolveProjectWorkspaceSelection,
    showProjectSettingsModal,
    saveProjectSettings,
    createAndBindProjectAgent,
    createProject,
    createSession,
    addTask,
    switchSession,
    renameSession,
    renameSessionFromConversation,
    viewMemory,
    deleteSession,
    toggleTask,
    deleteTask,
    editSharedMemory,
    saveSharedMemory,
    openProjectFolder,
    exportProject,
    renameCurrentProject,
    saveProjectRename,
    deleteCurrentProject
  };
}
