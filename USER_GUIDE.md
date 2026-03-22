# OpenManager Usage Guide

## 1. 设计目的

OpenManager 的目标不是做一个普通的项目列表，而是做一个面向 OpenClaw 的项目工作台：

- 每个项目有自己的共享记忆、任务、上传文件和会话
- 每个会话可以像一个持续工作的对话线程
- 项目可以绑定独立的 OpenClaw agent
- agent 可以读取项目上下文，并在对应 workspace 中工作

一句话理解：

> 项目是工作空间边界，agent 是执行边界，会话是对话边界。

## 2. 核心结构

### 前端

```text
skills/project-workspace/
├── app.html
├── api.js
└── frontend/
    ├── index.html
    └── api.js
```

- `app.html` 是兼容入口
- `frontend/index.html` 是独立前端入口
- `api.js` 负责统一封装前端 API 调用

### 后端

```text
skills/project-workspace/backend/
├── context.js
├── server.js
├── lib/
│   ├── router.js
│   └── memory-store.js
└── routes/
    ├── projects.js
    ├── sessions.js
    ├── tasks.js
    ├── files.js
    ├── openclaw.js
    └── system.js
```

- `projects.js`：项目配置与绑定
- `sessions.js`：会话与共享记忆
- `tasks.js`：任务管理
- `files.js`：上传与文件浏览
- `openclaw.js`：聊天、摘要、agent 列表
- `memory-store.js`：会话记忆的底层读写与迁移

## 3. 项目数据结构

```text
projects/<project>/
├── .project.json
├── memory/
│   ├── shared.md
│   ├── session-<id>.meta.json
│   ├── session-<id>.jsonl
│   ├── session-<id>.summary.md
│   └── session-<id>.md
├── tasks/
│   └── tasks.json
└── uploads/
```

### 文件含义

- `shared.md`
  项目级共享记忆，适合放目标、规则、架构、长期约定

- `session-<id>.meta.json`
  会话元信息，包含名称、创建时间

- `session-<id>.jsonl`
  原始消息流，机器最适合读写

- `session-<id>.summary.md`
  会话摘要，适合注入上下文和人工查看

- `session-<id>.md`
  旧版兼容文件，系统会在读取时懒迁移

## 4. 项目配置说明

`.project.json` 目前重点字段：

```json
{
  "name": "Project Manager",
  "description": "项目管理插件",
  "currentSession": "session-xxx",
  "model": "qwen3.5-plus",
  "agentId": null,
  "workspacePath": null
}
```

### 字段解释

- `name`
  项目名称

- `description`
  项目描述

- `currentSession`
  当前激活的会话 ID

- `model`
  项目默认模型配置

- `agentId`
  绑定的 OpenClaw agent。为空时走默认 `main`

- `workspacePath`
  当前项目对应的 agent 工作目录。为空时走主工作区

## 5. 项目设置与绑定方式

### 手动绑定

在项目右侧信息栏点击 `项目设置`：

- 选择已有 agent
- 设置 workspacePath
- 设置默认模型
- 保存

### 一键创建并绑定

在 `项目设置` 中点击 `一键创建并绑定`：

- 系统会自动生成 agent id
- 默认将当前项目目录作为 workspace
- 自动调用 `openclaw agents add`
- 自动把新 agent 绑定回当前项目

如果你不填 agent 名称：

- 英文项目名会自动转成 slug
- 中文项目名会自动生成稳定 id

## 6. 聊天上下文是怎么组装的

每次发消息到 OpenClaw 前，后端会组合：

1. 项目共享记忆 `shared.md`
2. 当前会话摘要 `session-<id>.summary.md`
3. 当前项目未完成任务摘要
4. 最近几条原始消息 `session-<id>.jsonl`
5. 当前用户请求

这样做的目的：

- 不把整段历史原文每次都塞给模型
- 保留项目级长期背景
- 保留会话级最近上下文
- 让 agent 更像一个持续工作的项目助手

## 7. 推荐使用方式

### 轻量项目

- 不绑定独立 agent
- 直接使用默认 `main`
- 适合临时项目、短任务、信息整理

### 正式项目

- 一键创建并绑定独立 agent
- 给项目设置单独 workspace
- 每个对话开一个独立 session

适合：

- 需要频繁读写本地文件
- 需要长期保留上下文
- 需要避免不同项目互相污染

## 8. 当前设计建议

推荐遵循：

- 一个项目一个 agent
- 一个对话一个 session
- 一个项目多个窗口

不推荐：

- 每个对话创建一个新 agent
- 每次消息临时换 workspace
- 把所有长期记忆都塞进单个 markdown 文件

## 9. 回滚与备份

本轮改造前的备份：

- 目录快照：
  `/Users/kidad/.openclaw/workspace/backups/project-workspace-snapshots/20260322_234432`

- 压缩归档：
  `/Users/kidad/.openclaw/workspace/backups/archives/project-workspace-pre-memory-refactor-20260322_234432.tar.gz`

如果要回滚，可以直接从这里恢复。

## 10. 下一步建议

后续最值得继续做的点：

- 会话摘要自动刷新策略
- 项目设置页里显示当前 agent 健康状态
- 新建项目时可选“自动创建并绑定 agent”
- 对话上下文调试面板
- 项目导入/导出增强
