// @ts-nocheck

export function createOperationsPanelsController({
  api,
  guideDemo,
  guideDemoSkills,
  guideDemoCronJobs,
  getCurrentProject,
  getCurrentProjectDetails,
  runtimeDefaults,
  loadAgentOptions,
  buildAgentSelectOptions,
  hideModal,
  showToast,
  setCurrentTab
}) {
  function renderSkills(skills) {
    const skillsList = document.getElementById('skillsList');

    if (!skills || skills.length === 0) {
      skillsList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #999;">
          <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
          <div>暂无技能</div>
        </div>
      `;
      return;
    }

    const ready = skills.filter((skill) => skill.eligible);
    const missing = skills.filter((skill) => !skill.eligible && !skill.disabled && !skill.blockedByAllowlist);
    const blocked = skills.filter((skill) => skill.blockedByAllowlist);
    const disabled = skills.filter((skill) => skill.disabled);
    let html = '';

    if (ready.length > 0) {
      html += `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 600; color: #10b981; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span>
            可用技能（${ready.length}）
          </div>
          ${ready.map((skill) => `
            <div style="padding: 12px 16px; background: white; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 24px;">${skill.emoji || '🔧'}</span>
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-weight: 600; color: #333;">${skill.name}</span>
                    <span style="font-size: 11px; padding: 2px 6px; background: #10b981; color: white; border-radius: 4px;">已启用</span>
                  </div>
                  <div style="font-size: 12px; color: #666;">${skill.description?.substring(0, 80) || ''}${skill.description?.length > 80 ? '...' : ''}</div>
                </div>
                <button class="btn btn-secondary" onclick="toggleSkill('${skill.name}', false)" style="padding: 6px 12px; font-size: 12px;">⏸️ 禁用</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    if (missing.length > 0) {
      html += `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 600; color: #f59e0b; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; background: #f59e0b; border-radius: 50%;"></span>
            缺少依赖（${missing.length}）
          </div>
          ${missing.map((skill) => {
            const missingBins = skill.missing?.bins?.join(', ') || '未知';
            return `
              <div style="padding: 12px 16px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 24px;">${skill.emoji || '🔧'}</span>
                  <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 600; color: #333;">${skill.name}</span>
                      <span style="font-size: 11px; padding: 2px 6px; background: #f59e0b; color: white; border-radius: 4px;">缺少依赖</span>
                    </div>
                    <div style="font-size: 12px; color: #92400e; margin-top: 4px;">需要安装：${missingBins}</div>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (blocked.length > 0) {
      html += `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 600; color: #ef4444; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></span>
            被 Allowlist 阻止（${blocked.length}）
          </div>
          ${blocked.map((skill) => `
            <div style="padding: 12px 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 24px;">${skill.emoji || '🔧'}</span>
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 600; color: #333;">${skill.name}</span>
                    <span style="font-size: 11px; padding: 2px 6px; background: #ef4444; color: white; border-radius: 4px;">被阻止</span>
                  </div>
                  <div style="font-size: 12px; color: #991b1b; margin-top: 4px;">当前被 OpenClaw 的 allowlist 限制，不属于本页可直接切换的状态。</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    if (disabled.length > 0) {
      html += `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; background: #6b7280; border-radius: 50%;"></span>
            已禁用（${disabled.length}）
          </div>
          ${disabled.map((skill) => `
            <div style="padding: 12px 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; opacity: 0.7;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 24px; filter: grayscale(1);">${skill.emoji || '🔧'}</span>
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-weight: 600; color: #9ca3af;">${skill.name}</span>
                    <span style="font-size: 11px; padding: 2px 6px; background: #6b7280; color: white; border-radius: 4px;">已禁用</span>
                  </div>
                  <div style="font-size: 12px; color: #9ca3af;">${skill.description?.substring(0, 80) || ''}${skill.description?.length > 80 ? '...' : ''}</div>
                </div>
                <button class="btn btn-secondary" onclick="toggleSkill('${skill.name}', true)" style="padding: 6px 12px; font-size: 12px;">▶️ 启用</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    skillsList.innerHTML = html;
  }

  async function loadSkillsList() {
    const skillsList = document.getElementById('skillsList');
    if (guideDemo) {
      renderSkills(guideDemoSkills);
      return;
    }

    try {
      const data = await api.skills.list();
      if (data.error) throw new Error(data.error);
      renderSkills(data.skills || []);
    } catch (error) {
      console.error('加载技能列表失败:', error);
      skillsList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #ef4444;">
          <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
          <div>加载失败：${error.message}</div>
          <div style="margin-top: 8px; font-size: 13px;">请确保 OpenClaw 已正确安装</div>
        </div>
      `;
    }
  }

  async function toggleSkill(skillName, enabled) {
    try {
      const result = await api.skills.toggle(skillName, enabled);
      if (result.error) throw new Error(result.error);
      showToast(`✅ 已${enabled ? '启用' : '禁用'}技能：${skillName}。新会话将使用新配置。`);
      setTimeout(() => loadSkillsList(), 600);
    } catch (error) {
      alert(`操作失败：${error.message}`);
    }
  }

  function refreshSkills() {
    loadSkillsList();
  }

  function renderCronJobs(jobs) {
    const cronList = document.getElementById('cronList');

    if (!jobs || jobs.length === 0) {
      cronList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #999;">
          <div style="font-size: 48px; margin-bottom: 16px;">⏰</div>
          <div>暂无 Cron 任务</div>
          <div style="margin-top: 8px; font-size: 13px;">点击"+ 添加任务"创建定时任务</div>
        </div>
      `;
      return;
    }

    const enabled = jobs.filter((job) => job.enabled !== false);
    const disabled = jobs.filter((job) => job.enabled === false);
    let html = '';

    if (enabled.length > 0) {
      html += `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 600; color: #10b981; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span>
            启用中（${enabled.length}）
          </div>
          ${enabled.map((job) => `
            <div style="padding: 12px 16px; background: white; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-weight: 600; color: #333;">${job.name || '未命名任务'}</span>
                    <span style="font-size: 11px; padding: 2px 6px; background: #10b981; color: white; border-radius: 4px;">启用</span>
                  </div>
                  <div style="font-size: 12px; color: #666; font-family: monospace;">${job.schedule?.expr || job.schedule?.cron || '未知'}</div>
                  <div style="font-size: 11px; color: #999; margin-top: 4px;">下次执行：${job.nextAt || job.state?.nextRunAtMs ? new Date(job.nextAt || job.state?.nextRunAtMs).toLocaleString('zh-CN') : '未知'}</div>
                </div>
                <div style="display: flex; gap: 6px;">
                  <button class="btn-icon btn-success" onclick="runCronJob('${job.id || job.jobId}')" title="立即运行" style="width: 32px; height: 32px; font-size: 16px;">▶️</button>
                  <button class="btn-icon btn-secondary" onclick="disableCronJob('${job.id || job.jobId}')" title="禁用" style="width: 32px; height: 32px; font-size: 16px;">⏸️</button>
                  <button class="btn-icon btn-danger" onclick="deleteCronJob('${job.id || job.jobId}')" title="删除" style="width: 32px; height: 32px; font-size: 16px;">🗑️</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    if (disabled.length > 0) {
      html += `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; background: #6b7280; border-radius: 50%;"></span>
            已禁用（${disabled.length}）
          </div>
          ${disabled.map((job) => `
            <div style="padding: 12px 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; opacity: 0.7;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-weight: 600; color: #9ca3af;">${job.name || '未命名任务'}</span>
                    <span style="font-size: 11px; padding: 2px 6px; background: #6b7280; color: white; border-radius: 4px;">禁用</span>
                  </div>
                  <div style="font-size: 12px; color: #9ca3af; font-family: monospace;">${job.schedule?.expr || job.schedule?.cron || '未知'}</div>
                </div>
                <div style="display: flex; gap: 6px;">
                  <button class="btn-icon btn-secondary" onclick="enableCronJob('${job.id || job.jobId}')" title="启用" style="width: 32px; height: 32px; font-size: 16px;">▶️</button>
                  <button class="btn-icon btn-danger" onclick="deleteCronJob('${job.id || job.jobId}')" title="删除" style="width: 32px; height: 32px; font-size: 16px;">🗑️</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    cronList.innerHTML = html;
  }

  async function loadCronJobs() {
    const cronList = document.getElementById('cronList');
    if (guideDemo) {
      renderCronJobs(guideDemoCronJobs);
      return;
    }

    try {
      const data = await api.cron.list();
      if (data.error) throw new Error(data.error);
      renderCronJobs(data.jobs || []);
    } catch (error) {
      console.error('加载 Cron 任务失败:', error);
      cronList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #ef4444;">
          <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
          <div>加载失败：${error.message}</div>
          <div style="margin-top: 8px; font-size: 13px;">请确保 OpenClaw Gateway 正在运行</div>
        </div>
      `;
    }
  }

  async function runCronJob(jobId) {
    try {
      const result = await api.cron.run(jobId);
      if (result.error) throw new Error(result.error);
      showToast(`✅ ${result.message || '任务已运行'}`);
      setTimeout(() => loadCronJobs(), 1000);
    } catch (error) {
      alert(`运行失败：${error.message}`);
    }
  }

  async function disableCronJob(jobId) {
    if (!confirm('确定禁用此任务？')) return;
    try {
      const result = await api.cron.disable(jobId);
      if (result.error) throw new Error(result.error);
      showToast(`✅ 已禁用任务：${jobId}`);
      await loadCronJobs();
    } catch (error) {
      alert(`禁用失败：${error.message}`);
    }
  }

  async function enableCronJob(jobId) {
    try {
      const result = await api.cron.enable(jobId);
      if (result.error) throw new Error(result.error);
      showToast(`✅ 已启用任务：${jobId}`);
      await loadCronJobs();
    } catch (error) {
      alert(`启用失败：${error.message}`);
    }
  }

  async function deleteCronJob(jobId) {
    if (!confirm('确定删除这个 Cron 任务？此操作不可恢复。')) return;
    try {
      const result = await api.cron.remove(jobId);
      if (result.error) throw new Error(result.error);
      showToast(`✅ 已删除任务：${jobId}`);
      await loadCronJobs();
    } catch (error) {
      alert(`删除失败：${error.message}`);
    }
  }

  async function showAddCronModal() {
    const modal = document.getElementById('addCronModal');
    const agents = await loadAgentOptions().catch(() => []);
    const currentProjectDetails = getCurrentProjectDetails();
    const currentProject = getCurrentProject();
    const preferredAgent = currentProjectDetails?.config?.agentId || '';
    const options = [`<option value="">main</option>`]
      .concat((agents || []).map((agent) => `<option value="${agent.id}" ${preferredAgent === agent.id ? 'selected' : ''}>${agent.id}${agent.workspace ? ' · ' + agent.workspace : ''}</option>`))
      .join('');

    document.getElementById('cronJobName').value = '';
    document.getElementById('cronJobExpr').value = '0 9 * * *';
    document.getElementById('cronJobTimezone').value = 'Asia/Shanghai';
    document.getElementById('cronJobMessage').value = currentProject ? `总结 ${currentProject} 的最新进展，并提醒未完成任务。` : '';
    document.getElementById('cronJobThinking').value = 'off';
    document.getElementById('cronJobAgent').innerHTML = options;
    modal.classList.add('active');
  }

  async function createCronJob() {
    const currentProjectDetails = getCurrentProjectDetails();
    const payload = {
      name: document.getElementById('cronJobName').value.trim(),
      cron: document.getElementById('cronJobExpr').value.trim(),
      timezone: document.getElementById('cronJobTimezone').value.trim() || 'Asia/Shanghai',
      message: document.getElementById('cronJobMessage').value.trim(),
      agentId: document.getElementById('cronJobAgent').value || (currentProjectDetails?.config?.agentId || null),
      thinking: document.getElementById('cronJobThinking').value || 'off'
    };

    if (!payload.name || !payload.cron || !payload.message) {
      alert('请至少填写任务名称、Cron 表达式和任务提示词');
      return;
    }

    try {
      const result = await api.cron.create(payload);
      if (result.error) throw new Error(result.error);
      hideModal('addCronModal');
      showToast(`✅ 已创建 Cron 任务：${payload.name}`);
      await loadCronJobs();
    } catch (error) {
      alert(`创建失败：${error.message}`);
    }
  }

  function switchTab(tab, triggerEl = null) {
    setCurrentTab(tab);
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    const activeTab = triggerEl || document.querySelector(`.tab[data-tab="${tab}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
    }

    document.getElementById('sessionsTab').style.display = tab === 'sessions' ? 'block' : 'none';
    document.getElementById('tasksTab').style.display = tab === 'tasks' ? 'block' : 'none';
    document.getElementById('cronTab').style.display = tab === 'cron' ? 'block' : 'none';
    document.getElementById('skillsTab').style.display = tab === 'skills' ? 'block' : 'none';
    document.getElementById('memoryTab').style.display = tab === 'memory' ? 'block' : 'none';

    if (tab === 'skills') {
      loadSkillsList();
    } else if (tab === 'cron') {
      loadCronJobs();
    }
  }

  return {
    loadSkillsList,
    renderSkills,
    toggleSkill,
    refreshSkills,
    loadCronJobs,
    renderCronJobs,
    runCronJob,
    disableCronJob,
    enableCronJob,
    deleteCronJob,
    showAddCronModal,
    createCronJob,
    switchTab
  };
}
