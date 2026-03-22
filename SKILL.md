---
name: project-workspace
description: 多项目工作空间管理 —— 每个项目独立文件夹，支持项目内多对话、共享记忆、任务追踪。适合管理多个并行复杂项目。
metadata:
  openclaw:
    requires:
      bins:
        - node
---

# Project Workspace Manager

多项目工作空间管理插件。每个项目对应本地一个文件夹，支持：
- 一个项目内多个独立对话
- 对话间共享记忆
- 同时管理多个项目
- 快速上下文切换

## 核心概念

```
projects/
├── <project-name>/
│   ├── .project.json      # 项目配置
│   ├── memory/
│   │   ├── shared.md      # 共享记忆（所有对话可见）
│   │   ├── session-<id>.md # 对话专属记忆
│   │   └── tasks.md       # 任务追踪
│   └── ...                # 项目文件
│
└── .projects-index.json   # 项目索引
```

## 命令

### 项目管理

```bash
# 创建新项目
node ~/.openclaw/workspace/skills/project-workspace/cli.js create <project-name>

# 列出所有项目
node ~/.openclaw/workspace/skills/project-workspace/cli.js list

# 切换到项目
node ~/.openclaw/workspace/skills/project-workspace/cli.js switch <project-name>

# 查看项目详情
node ~/.openclaw/workspace/skills/project-workspace/cli.js info <project-name>

# 删除项目
node ~/.openclaw/workspace/skills/project-workspace/cli.js delete <project-name>
```

### 对话管理

```bash
# 创建新对话
node ~/.openclaw/workspace/skills/project-workspace/cli.js session create [name]

# 列出对话
node ~/.openclaw/workspace/skills/project-workspace/cli.js session list

# 切换对话
node ~/.openclaw/workspace/skills/project-workspace/cli.js session switch <session-id>

# 查看对话记忆
node ~/.openclaw/workspace/skills/project-workspace/cli.js session memory [session-id]
```

### 任务管理

```bash
# 添加任务
node ~/.openclaw/workspace/skills/project-workspace/cli.js task add "任务描述"

# 列出任务
node ~/.openclaw/workspace/skills/project-workspace/cli.js task list

# 完成任务
node ~/.openclaw/workspace/skills/project-workspace/cli.js task complete <task-id>

# 删除任务
node ~/.openclaw/workspace/skills/project-workspace/cli.js task remove <task-id>
```

## 使用示例

### 场景 1：创建 Dashboard 项目

```bash
# 创建项目
node ~/.openclaw/workspace/skills/project-workspace/cli.js create dashboard-project

# 创建第一个对话（数据收集）
node ~/.openclaw/workspace/skills/project-workspace/cli.js session create "数据收集"

# 添加任务
node ~/.openclaw/workspace/skills/project-workspace/cli.js task add "设计数据结构"
node ~/.openclaw/workspace/skills/project-workspace/cli.js task add "实现 API 接口"

# 工作完成后，切换到新对话（分析）
node ~/.openclaw/workspace/skills/project-workspace/cli.js session create "数据分析"

# 新对话可以看到共享记忆，但有独立记忆空间
```

### 场景 2：多项目并行

```bash
# 查看当前项目
node ~/.openclaw/workspace/skills/project-workspace/cli.js info

# 切换到 AI 摘要项目
node ~/.openclaw/workspace/skills/project-workspace/cli.js switch ai-digest

# 处理完切回 Dashboard
node ~/.openclaw/workspace/skills/project-workspace/cli.js switch dashboard-project
```

## 配置说明

### .project.json

```json
{
  "name": "dashboard-project",
  "description": "Dashboard 项目",
  "createdAt": "2026-03-21T01:00:00.000Z",
  "currentSession": "session-1",
  "model": "qwen3.5-plus",
  "tags": ["dashboard", "analytics"]
}
```

### shared.md（共享记忆）

所有对话共享的内容：
- 项目目标
- 架构设计
- 关键决策
- 通用知识

### session-<id>.md（对话记忆）

对话专属内容：
- 当前对话的讨论
- 临时笔记
- 未完成的工作

## API（供其他工具调用）

```javascript
import { ProjectWorkspace } from './workspace.js';

const ws = new ProjectWorkspace('/path/to/projects');

// 创建项目
await ws.createProject('my-project');

// 切换项目
await ws.switchProject('my-project');

// 创建对话
const session = await ws.createSession('数据分析');

// 添加任务
await ws.addTask('实现功能 X');

// 获取上下文
const context = await ws.getContext();
```

## 与其他 OpenClaw 功能集成

### 会话（Sessions）

每个项目对话可以映射到 OpenClaw Session：
- 项目对话 = OpenClaw Session
- 项目记忆 = Session 记忆文件

### 子代理（Subagents）

项目内可以 spawn 子代理：
- 子代理继承项目上下文
- 子代理写入项目记忆

### Cron 任务

项目可以有专属定时任务：
- 每个项目独立调度
- 任务输出到项目记忆

---

**工作目录**: `~/.openclaw/workspace/projects/`
**索引文件**: `~/.openclaw/workspace/projects/.projects-index.json`
