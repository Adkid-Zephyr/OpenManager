// @ts-nocheck

import { createClient } from '../lib/api-client';
import { createConversationFlowController } from './conversation-flow';
import { createConversationUi } from './conversation-ui';
import { createConversationPanelsController } from './conversation-panels';
import { createOperationsPanelsController } from './operations-panels';
import { createProjectDashboardController } from './project-dashboard';
import { createProjectManagementController } from './project-management';
import { createRunStatusController } from './run-status';
import { createRuntimeConfig } from './runtime-config';
import { escapeHtml, openManual, showToast } from './ui-helpers';

    const api = createClient();
    const API_BASE = api.base;
    const urlParams = new URLSearchParams(window.location.search);
    const GUIDE_DEMO = urlParams.get('demo') === 'guide';
    
    let projects = [];
    let currentProject = null;
    let currentTab = 'sessions';
    let searchQuery = '';
    let currentProjectDetails = null;
    let cachedAgents = null;
    let cachedModels = null;
    let cachedAgentsAt = 0;
    let cachedModelsAt = 0;
    let agentsPromise = null;
    let modelsPromise = null;
    const runtimeDefaults = {
      workspaceDir: '',
      defaultAgentId: '',
      defaultAgentWorkspace: '',
      defaultModel: '',
      source: {}
    };
    const activeRunStatuses = {};
    const runMonitors = {};
    const sessionActiveRunIds = {};
    const sessionRunActionState = {};
    const composerSendArmState = {};
    const composerHistories = {};
    const composerHistoryState = {};
    const selectedFiles = {};
    const GUIDE_DEMO_SKILLS = [
      {
        name: 'openmanager',
        emoji: '🗂️',
        description: '帮助按项目管理长期工作流、会话和本地记忆。',
        eligible: true,
        disabled: false
      },
      {
        name: 'checks',
        emoji: '✅',
        description: '在发布和验收前提供结构化检查清单。',
        eligible: true,
        disabled: false
      },
      {
        name: 'sag',
        emoji: '🎙️',
        description: '提供更有表现力的语音输出能力。',
        eligible: false,
        disabled: true
      }
    ];
    const GUIDE_DEMO_CRON_JOBS = [
      {
        id: 'daily-review',
        name: '每日项目回顾',
        enabled: true,
        schedule: { expr: '0 9 * * *' },
        nextAt: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString()
      },
      {
        id: 'weekly-cleanup',
        name: '每周收尾提醒',
        enabled: false,
        schedule: { expr: '0 18 * * 5' }
      }
    ];
    const runtimeCache = {
      get cachedAgents() { return cachedAgents; },
      set cachedAgents(value) { cachedAgents = value; },
      get cachedModels() { return cachedModels; },
      set cachedModels(value) { cachedModels = value; },
      get cachedAgentsAt() { return cachedAgentsAt; },
      set cachedAgentsAt(value) { cachedAgentsAt = value; },
      get cachedModelsAt() { return cachedModelsAt; },
      set cachedModelsAt(value) { cachedModelsAt = value; },
      get agentsPromise() { return agentsPromise; },
      set agentsPromise(value) { agentsPromise = value; },
      get modelsPromise() { return modelsPromise; },
      set modelsPromise(value) { modelsPromise = value; }
    };
    const runtimeConfig = createRuntimeConfig({
      api,
      runtimeDefaults,
      runtimeCache,
      escapeHtml
    });
    const {
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
    } = runtimeConfig;
    let formatDuration;
    let getRunStatusDomId;
    let isConversationOpen;
    let getConversationMessagesElement;
    let getComposerPrimaryButton;
    let getComposerReconnectButton;
    let getComposerInput;
    let shouldSendOnDoubleEnter;
    let resetComposerSendArm;
    let resizeComposer;
    let formatFileSize;
    let getComposerHistoryState;
    let pushComposerHistory;
    let navigateComposerHistory;
    let renderSelectedFilePreview;
    let bindConversationComposer;
    let handleFileSelect;
    let clearFile;
    let uploadFile;
    let renderAttachmentsHtml;
    let appendMessageElement;
    let addMessage;
    let getActiveSessionRunId;
    let ensureSessionRunActionState;
    let updateConversationActionState;
    let scrollConversationToBottom;
    let finishRunStep;
    let ensureRunStatusState;
    let attachRunStatusToConversation;
    let renderRunStatus;
    let beginRunStatusPhase;
    let completeRunStatus;
    let applyRunEvent;
    let applyRunSnapshot;
    let ensureRunMonitor;
    let recoverConversationRun;
    let loadProjects;
    let openWorkspaceWindow;
    let updateProjectCount;
    let renderProjectList;
    let editProjectDescription;
    let openProjectInFinder;
    let openProjectFolderInFinder;
    let handleSearch;
    let selectProject;
    let loadProjectDetails;
    let renderSessions;
    let renderTasks;
    let updateStats;
    let renderMemory;
    let renderProjectInfo;
    let loadSkillsList;
    let renderSkills;
    let toggleSkill;
    let refreshSkills;
    let loadCronJobs;
    let renderCronJobs;
    let runCronJob;
    let disableCronJob;
    let enableCronJob;
    let deleteCronJob;
    let showAddCronModal;
    let createCronJob;
    let switchTab;
    let showCreateProjectModal;
    let showCreateSessionModal;
    let showAddTaskModal;
    let hideModal;
    let toggleCreateProjectAgentOptions;
    let toggleProjectWorkspacePathField;
    let resolveProjectWorkspaceSelection;
    let showProjectSettingsModal;
    let saveProjectSettings;
    let createAndBindProjectAgent;
    let createProject;
    let createSession;
    let addTask;
    let switchSession;
    let renameSession;
    let renameSessionFromConversation;
    let viewMemory;
    let deleteSession;
    let toggleTask;
    let deleteTask;
    let editSharedMemory;
    let saveSharedMemory;
    let openProjectFolder;
    let exportProject;
    let renameCurrentProject;
    let saveProjectRename;
    let deleteCurrentProject;
    let loadConversationMemory;
    let loadConversationHistory;
    let appendToMemoryRaw;
    let renderWorkingMemoryBlock;
    let renderKeyFactsBlock;
    let renderMemoryPanel;
    let compressMemory;
    let copyMemory;
    let showFilesModal;
    let loadFilesList;
    let navigateFiles;
    let navigateFilesUp;
    let insertFileToChat;
    let deleteFile;
    let renameConversation;
    let openUploadsInFinder;
    let uploadFileFromModal;
    let showLogsModal;
    let loadLogs;
    let refreshLogs;
    let copyLogs;
    let openConversation;
    let closeConversation;
    let handleComposerPrimaryAction;
    let reconnectConversationRun;
    let stopConversationRun;
    let sendMessage;
    let addThinkingMessage;
    const runStatus = createRunStatusController({
      api,
      getCurrentProject: () => currentProject,
      activeRunStatuses,
      runMonitors,
      sessionActiveRunIds,
      sessionRunActionState,
      selectedFiles,
      getComposerInput: (sessionId) => getComposerInput(sessionId),
      escapeHtml
    });
    ({
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
    } = runStatus);
    const conversationUi = createConversationUi({
      api,
      apiBase: API_BASE,
      getCurrentProject: () => currentProject,
      selectedFiles,
      composerSendArmState,
      composerHistories,
      composerHistoryState,
      updateConversationActionState: (sessionId) => updateConversationActionState(sessionId),
      getActiveSessionRunId: (sessionId) => getActiveSessionRunId(sessionId),
      showToast,
      escapeHtml,
      scrollConversationToBottom: () => scrollConversationToBottom(),
      sendMessage: (sessionId) => sendMessage(sessionId)
    });
    ({
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
    } = conversationUi);
    const projectDashboard = createProjectDashboardController({
      api,
      runtimeDefaults,
      getProjects: () => projects,
      setProjects: (value) => { projects = value; },
      getCurrentProject: () => currentProject,
      setCurrentProject: (value) => { currentProject = value; },
      getSearchQuery: () => searchQuery,
      setSearchQuery: (value) => { searchQuery = value; },
      setCurrentProjectDetails: (value) => { currentProjectDetails = value; },
      openConversation: (sessionId) => openConversation(sessionId),
      showCreateProjectModal: () => showCreateProjectModal(),
      renameSession: (sessionId) => renameSession(sessionId),
      switchSession: (sessionId) => switchSession(sessionId),
      deleteSession: (sessionId) => deleteSession(sessionId),
      toggleTask: (id) => toggleTask(id),
      deleteTask: (id) => deleteTask(id),
      showToast
    });
    ({
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
    } = projectDashboard);
    const operationsPanels = createOperationsPanelsController({
      api,
      guideDemo: GUIDE_DEMO,
      guideDemoSkills: GUIDE_DEMO_SKILLS,
      guideDemoCronJobs: GUIDE_DEMO_CRON_JOBS,
      getCurrentProject: () => currentProject,
      getCurrentProjectDetails: () => currentProjectDetails,
      runtimeDefaults,
      loadAgentOptions: (...args) => loadAgentOptions(...args),
      buildAgentSelectOptions,
      hideModal: (id) => hideModal(id),
      showToast,
      setCurrentTab: (value) => { currentTab = value; }
    });
    ({
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
    } = operationsPanels);
    const projectManagement = createProjectManagementController({
      api,
      runtimeDefaults,
      escapeHtml,
      showToast,
      getCurrentProject: () => currentProject,
      setCurrentProject: (value) => { currentProject = value; },
      getCurrentProjectDetails: () => currentProjectDetails,
      setCurrentProjectDetails: (value) => { currentProjectDetails = value; },
      getCachedAgents: () => cachedAgents,
      getCachedModels: () => cachedModels,
      setCachedAgents: (value) => { cachedAgents = value; },
      setCachedAgentsAt: (value) => { cachedAgentsAt = value; },
      loadAgentOptions: (...args) => loadAgentOptions(...args),
      buildAgentSelectOptions,
      buildModelSelectOptions,
      getPreferredModelValue,
      populateModelPicker,
      loadProjects: () => loadProjects(),
      renderProjectList: () => renderProjectList(),
      loadProjectDetails: () => loadProjectDetails(),
      selectProject: (name) => selectProject(name),
      renderMemory: (content) => renderMemory(content),
      openProjectFolderInFinder: () => openProjectFolderInFinder()
    });
    ({
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
    } = projectManagement);
    const conversationPanels = createConversationPanelsController({
      api,
      escapeHtml,
      showToast,
      getCurrentProject: () => currentProject,
      getComposerInput: (sessionId) => getComposerInput(sessionId),
      resizeComposer: (input) => resizeComposer(input),
      appendMessageElement,
      uploadFile: (sessionId, file) => uploadFile(sessionId, file),
      loadProjectDetails: () => loadProjectDetails()
    });
    ({
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
    } = conversationPanels);
    const conversationFlow = createConversationFlowController({
      api,
      apiBase: API_BASE,
      activeRunStatuses,
      sessionActiveRunIds,
      selectedFiles,
      getCurrentProject: () => currentProject,
      switchSession: (sessionId) => switchSession(sessionId),
      bindConversationComposer: (sessionId) => bindConversationComposer(sessionId),
      clearFile: (sessionId) => clearFile(sessionId),
      getActiveSessionRunId: (sessionId) => getActiveSessionRunId(sessionId),
      ensureSessionRunActionState: (sessionId) => ensureSessionRunActionState(sessionId),
      updateConversationActionState: (sessionId) => updateConversationActionState(sessionId),
      applyRunSnapshot: (sessionId, snapshot) => applyRunSnapshot(sessionId, snapshot),
      ensureRunMonitor: (runId, sessionId, options) => ensureRunMonitor(runId, sessionId, options),
      attachRunStatusToConversation: (sessionId, runId, createdAt) => attachRunStatusToConversation(sessionId, runId, createdAt),
      recoverConversationRun: (sessionId) => recoverConversationRun(sessionId),
      completeRunStatus: (statusId, payload) => completeRunStatus(statusId, payload),
      applyRunEvent: (statusId, event) => applyRunEvent(statusId, event),
      isConversationOpen: (sessionId) => isConversationOpen(sessionId),
      addMessage: (text, type, attachments) => addMessage(text, type, attachments),
      loadConversationMemory: (sessionId) => loadConversationMemory(sessionId),
      loadConversationHistory: (sessionId) => loadConversationHistory(sessionId),
      renderMemoryPanel: (sessionId) => renderMemoryPanel(sessionId),
      appendToMemoryRaw: (sessionId, entry) => appendToMemoryRaw(sessionId, entry),
      getComposerInput: (sessionId) => getComposerInput(sessionId),
      resetComposerSendArm: (sessionId) => resetComposerSendArm(sessionId),
      resizeComposer: (input) => resizeComposer(input),
      pushComposerHistory: (sessionId, value) => pushComposerHistory(sessionId, value),
      uploadFile: (sessionId, file) => uploadFile(sessionId, file),
      showToast
    });
    ({
      openConversation,
      closeConversation,
      handleComposerPrimaryAction,
      reconnectConversationRun,
      stopConversationRun,
      sendMessage,
      addThinkingMessage
    } = conversationFlow);
    
    // 初始化
    async function init() {
      await loadRuntimeDefaults();
      await loadProjects();
      renderProjectList();

      scheduleAgentPrefetch();
      scheduleModelPrefetch();

      const initialProject = urlParams.get('project');
      if (initialProject && projects.some(project => project.name === initialProject)) {
        await selectProject(initialProject);
      } else if (currentProject && projects.some(project => project.name === currentProject)) {
        await selectProject(currentProject);
      }

      await applyDeepLinkState();
    }

    async function applyDeepLinkState() {
      if (!currentProject) return;

      const tab = urlParams.get('tab');
      if (tab && ['sessions', 'tasks', 'cron', 'skills', 'memory'].includes(tab)) {
        switchTab(tab);
      }

      const sessionParam = urlParams.get('session');
      if (!sessionParam) return;

      try {
        const data = await api.sessions.list(currentProject);
        const session = (data.sessions || []).find((item) =>
          item.id === sessionParam || item.name === sessionParam
        );

        if (session) {
          await openConversation(session.id);
        }
      } catch (error) {
        console.error('恢复深链会话失败:', error);
      }
    }

    Object.assign(window, {
      init,
      applyDeepLinkState,
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
      populateModelPicker,
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
      recoverConversationRun,
      openManual,
      showToast,
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
      renderProjectInfo,
      switchTab,
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
      openConversation,
      closeConversation,
      handleComposerPrimaryAction,
      reconnectConversationRun,
      stopConversationRun,
      sendMessage,
      addThinkingMessage,
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
      addMessage,
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
      escapeHtml,
      refreshLogs,
      copyLogs,
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
    });

    // 启动
    init();
