// @ts-nocheck

export function createProjectDashboardController({
  api,
  runtimeDefaults,
  getProjects,
  setProjects,
  getCurrentProject,
  setCurrentProject,
  getSearchQuery,
  setSearchQuery,
  setCurrentProjectDetails,
  openConversation,
  showCreateProjectModal,
  renameSession,
  switchSession,
  deleteSession,
  toggleTask,
  deleteTask,
  showToast
}) {
  function updateProjectCount() {
    document.getElementById('projectCount').textContent = `${getProjects().length} 个项目`;
  }

  function renderProjectList() {
    const list = document.getElementById('projectList');
    const projects = getProjects();
    const currentProject = getCurrentProject();
    const searchQuery = getSearchQuery();

    if (projects.length === 0) {
      list.innerHTML = `
        <li class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div>暂无项目</div>
          <div style="margin-top: 8px; font-size: 12px; color: #8a93a0;">从一个长期主题开始，比如「官网改版」或「内容工作台」</div>
          <button class="btn btn-primary" style="margin-top: 12px;" onclick="showCreateProjectModal()">创建第一个项目</button>
        </li>
      `;
      return;
    }

    let filtered = projects;
    if (searchQuery) {
      filtered = projects.filter((project) =>
        project.name.toLowerCase().includes(searchQuery) ||
        (project.description && project.description.toLowerCase().includes(searchQuery))
      );
    }

    if (filtered.length === 0 && searchQuery) {
      list.innerHTML = `
        <li class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <div>未找到匹配的项目</div>
          <div style="font-size: 12px; color: #999; margin-top: 8px;">搜索："${searchQuery}"</div>
        </li>
      `;
      return;
    }

    list.innerHTML = filtered.map((project) => `
      <li class="project-item ${currentProject === project.name ? 'active' : ''}" onclick="selectProject('${project.name}')">
        <div class="project-name">${project.name}</div>
        <div class="project-desc">${project.description || '无描述'}</div>
        <div class="project-meta">
          <span>💬 ${project.sessions || 0} 会话</span>
          <span>📋 ${project.tasks?.pending || 0} 待办</span>
        </div>
      </li>
    `).join('');
  }

  async function loadProjects() {
    try {
      const data = await api.projects.list();
      setProjects(data.projects || []);
      if (data.currentProject) {
        setCurrentProject(data.currentProject);
      }
    } catch (error) {
      console.error('加载项目失败:', error);
      alert('无法连接服务器，请确保 server.js 正在运行\n\n启动命令：node server.js');
      setProjects([]);
    }
    updateProjectCount();
  }

  function openWorkspaceWindow() {
    const url = new URL(window.location.href);
    const currentProject = getCurrentProject();
    if (currentProject) {
      url.searchParams.set('project', currentProject);
    }
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }

  async function editProjectDescription(projectName, currentDesc) {
    const newDesc = prompt('请输入项目描述:', currentDesc || '');
    if (newDesc === null) return;

    try {
      const result = await api.projects.updateDescription(projectName, newDesc);
      if (result.error) throw new Error(result.error);
      renderProjectList();
      if (projectName === getCurrentProject()) {
        await loadProjectDetails();
      }
    } catch (error) {
      alert('更新描述失败：' + error.message);
    }
  }

  async function openProjectInFinder(projectName) {
    try {
      const result = await api.projects.openInFinder(projectName);
      if (result.error) throw new Error(result.error);
      showToast(`✅ ${result.message}`);
    } catch (error) {
      console.error('[Finder] Error:', error);
      alert(`打开失败：${error.message}`);
    }
  }

  async function openProjectFolderInFinder() {
    const currentProject = getCurrentProject();
    if (!currentProject) return;
    await openProjectInFinder(currentProject);
  }

  function handleSearch() {
    setSearchQuery(document.getElementById('searchInput').value.toLowerCase());
    renderProjectList();
  }

  async function selectProject(name) {
    try {
      await api.projects.switch(name);
      setCurrentProject(name);
      document.getElementById('noProjectSelected').style.display = 'none';
      document.getElementById('projectContent').style.display = 'block';
      document.getElementById('currentProjectTitle').textContent = `📁 ${name}`;
      renderProjectList();
      await loadProjectDetails();
    } catch (error) {
      alert('切换项目失败：' + error.message);
    }
  }

  function updateStats(sessions, tasks) {
    document.getElementById('sessionCount').textContent = sessions.length;
    document.getElementById('pendingTaskCount').textContent = tasks.filter((task) => !task.completed).length;
    document.getElementById('completedTaskCount').textContent = tasks.filter((task) => task.completed).length;
  }

  function renderMemory(content) {
    document.getElementById('sharedMemory').textContent = content || '暂无内容';
  }

  function renderSessions(sessions, currentSession) {
    const list = document.getElementById('sessionList');
    const currentSessionLabel = document.getElementById('currentSessionLabel');

    if (sessions.length === 0) {
      list.innerHTML = `
        <li class="empty-state">
          <div class="empty-state-icon">💬</div>
          <div>暂无会话</div>
          <div style="font-size: 12px; color: #999; margin-top: 8px;">点击上方"+ 新会话"按钮创建</div>
        </li>
      `;
      currentSessionLabel.textContent = '';
      return;
    }

    currentSessionLabel.textContent = `· 当前：${currentSession || '无'}`;

    list.innerHTML = sessions.map((session) => {
      const isActive = session.id === currentSession;
      return `
        <li class="session-item ${isActive ? 'active' : ''}">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">${isActive ? '💬' : '🗨️'}</span>
              <div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-weight: 500;">${session.name}</span>
                  <button class="btn-icon btn-secondary" onclick="event.stopPropagation(); renameSession('${session.id}')" title="重命名" style="width: 24px; height: 24px; font-size: 12px;">✏️</button>
                </div>
                <div style="font-size: 11px; color: #999;">${session.id}</div>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            ${!isActive ? `<button class="btn-icon btn-success" onclick="switchSession('${session.id}')" title="切换">✓</button>` : ''}
            <button class="btn-icon btn-primary" onclick="openConversation('${session.id}')" title="打开对话" style="background: linear-gradient(180deg, #2a4fe0 0%, #2347d3 100%); color: white;">💬</button>
            <button class="btn-icon btn-danger" onclick="deleteSession('${session.id}')" title="删除">🗑️</button>
          </div>
        </li>
      `;
    }).join('');
  }

  function renderTasks(tasks) {
    const list = document.getElementById('taskList');

    if (!tasks || tasks.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="padding: 40px 20px;">
          <div class="empty-state-icon">📋</div>
          <div>暂无任务</div>
          <div style="margin-top: 8px; font-size: 13px; color: #999;">点击"+ 添加任务"按钮创建</div>
        </div>
      `;
      return;
    }

    const pending = tasks.filter((task) => !task.completed);
    const completed = tasks.filter((task) => task.completed);
    let html = '';

    if (pending.length > 0) {
      html += `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 600; color: #666; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; background: #2347d3; border-radius: 50%;"></span>
            待办任务（${pending.length}）
          </div>
          ${pending.map((task) => `
            <li class="task-item" style="border-left: 3px solid #2347d3;">
              <div class="task-content">
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id})">
                <span class="task-text">${task.description}</span>
              </div>
              <div class="task-actions">
                <span style="font-size: 11px; color: #999; margin-right: 8px;">#${task.id}</span>
                <button class="btn-icon btn-danger" onclick="deleteTask(${task.id})" title="删除">🗑️</button>
              </div>
            </li>
          `).join('')}
        </div>
      `;
    }

    if (completed.length > 0) {
      html += `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 600; color: #10b981; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span>
            已完成（${completed.length}）
          </div>
          ${completed.map((task) => `
            <li class="task-item" style="border-left: 3px solid #10b981; opacity: 0.7;">
              <div class="task-content">
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id})">
                <span class="task-text completed">${task.description}</span>
              </div>
              <div class="task-actions">
                <span style="font-size: 11px; color: #999; margin-right: 8px;">#${task.id}</span>
                <button class="btn-icon btn-danger" onclick="deleteTask(${task.id})" title="删除">🗑️</button>
              </div>
            </li>
          `).join('')}
        </div>
      `;
    }

    list.innerHTML = html;
  }

  function renderProjectInfo(project) {
    document.getElementById('projectInfo').style.display = 'none';
    document.getElementById('projectInfoContent').style.display = 'block';

    document.getElementById('infoName').textContent = project.name;
    document.getElementById('infoDesc').textContent = project.description || '无描述';
    document.getElementById('infoCreatedAt').textContent = new Date(project.createdAt).toLocaleString('zh-CN');
    document.getElementById('infoPath').textContent = project.path;
    document.getElementById('infoAgent').textContent = project.config?.agentId || '未绑定（使用默认 main）';
    const workspaceMode = project.config?.workspaceMode || (project.config?.workspacePath ? 'custom' : 'main');
    document.getElementById('infoWorkspace').textContent = workspaceMode === 'project'
      ? '当前项目目录'
      : workspaceMode === 'custom'
        ? (project.config?.workspacePath || '自定义目录')
        : '主工作区';
    document.getElementById('infoModel').textContent = project.config?.runtime === 'local'
      ? '本地 Codex'
      : (project.config?.model || runtimeDefaults.defaultModel || '未指定（跟随 OpenClaw 当前默认）');
  }

  async function loadProjectDetails() {
    const currentProject = getCurrentProject();
    if (!currentProject) return;

    try {
      const [sessionsData, tasksData, memoryData, projectData] = await Promise.all([
        api.sessions.list(currentProject),
        api.tasks.list(currentProject),
        api.memory.getShared(currentProject),
        api.projects.get(currentProject)
      ]);

      renderSessions(sessionsData.sessions || [], sessionsData.currentSession);
      renderTasks(tasksData.tasks || []);
      updateStats(sessionsData.sessions || [], tasksData.tasks || []);
      renderMemory(memoryData.content || '');
      setCurrentProjectDetails(projectData);
      renderProjectInfo(projectData);
    } catch (error) {
      console.error('加载项目详情失败:', error);
    }
  }

  return {
    loadProjects,
    openWorkspaceWindow,
    updateProjectCount,
    renderProjectList,
    editProjectDescription,
    openProjectInFinder,
    openProjectFolderInFinder,
    handleSearch,
    selectProject,
    loadProjectDetails,
    renderSessions,
    renderTasks,
    updateStats,
    renderMemory,
    renderProjectInfo
  };
}
