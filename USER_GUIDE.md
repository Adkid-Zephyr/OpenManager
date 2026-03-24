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
openmanager/
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
openmanager/backend/
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
│   ├── session-<id>.hot.json
│   ├── session-<id>.facts.json
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

- `session-<id>.hot.json`
  当前工作记忆，保留当前目标、最近结论、阻塞和下一步

- `session-<id>.facts.json`
  结构化关键事实层，提取决策、约束、待办、偏好等高价值信息

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

### 运行目录说明

默认情况下，OpenManager 会把运行数据写到：

```text
~/.openclaw/workspace
```

如果你要把它放到别的位置，可以通过环境变量覆盖：

- `OPENMANAGER_WORKSPACE_DIR`
- `OPENCLAW_WORKSPACE_DIR`
- `OPENCLAW_HOME`

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
2. 当前工作记忆 `session-<id>.hot.json`
3. 当前关键事实 `session-<id>.facts.json`
4. 当前会话摘要 `session-<id>.summary.md`
5. 当前项目未完成任务摘要
6. 最近几条原始消息 `session-<id>.jsonl`
7. 当前用户请求

这样做的目的：

- 不把整段历史原文每次都塞给模型
- 保留项目级长期背景
- 保留会话级最近上下文和当前工作状态
- 尽量把高价值信息结构化，而不是埋在长文本里
- 让 agent 更像一个持续工作的项目助手

## 7. Memory 设计理念

OpenManager 的 memory 不是单一“大聊天记录文件”，而是刻意拆成不同层：

- `raw`
  原始事件流，完整保留，不追求适合直接喂模型

- `hot`
  当前工作集，追求快和短，服务“继续刚才的任务”

- `facts`
  高价值事实层，追求稳定，服务“别忘关键决定和约束”

- `summary`
  阶段摘要层，追求跨轮次压缩，服务“别每次都读完整历史”

一句话理解：

> 写入尽量全，注入尽量省。

### 为什么这样设计

目标不是“把所有历史都存下来”这么简单，而是同时满足三件事：

- 尽量不遗漏重要信息
- 尽量少消耗 token
- 尽量减少每轮上下文组装的开销

如果只有一个大 markdown：

- 历史会越来越长
- 每轮都要读很多无关内容
- 重要信息容易淹没在普通聊天里

分层后，模型每轮只需要读当前最相关的一小部分。

## 8. 当前现状与取舍

当前 memory 模块已经适合上线，但它仍然是偏务实、偏保守的实现，而不是最终形态。

### 当前优点

- 文件结构简单，仍然是纯本地文件，便于备份和排查
- 兼容旧版 `session-<id>.md`
- `jsonl` 适合追加写入，读写行为稳定
- `hot/facts/summary` 已经能减少 prompt 冗余
- `🤖 AI 压缩` 现在是追加阶段摘要，不再覆盖 raw

### 当前限制

- `facts` 目前仍是规则驱动提取，可能有噪音或遗漏
- `hot` 目前更像自动生成的工作快照，还不是严格的任务状态机
- `summary` 仍以文本块为主，尚未做到按主题切片
- 不同类型请求还没有做到完全意图驱动检索

所以可以把现在这版理解成：

> 已经具备分层 memory 的骨架，但还没有进入真正的“智能检索”阶段。

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

## 9. 当前设计建议

推荐遵循：

- 一个项目一个 agent
- 一个对话一个 session
- 一个项目多个窗口

不推荐：

- 每个对话创建一个新 agent
- 每次消息临时换 workspace
- 把所有长期记忆都塞进单个 markdown 文件

## 10. 后续优化方向

后续如果继续优化 memory，最值得投入的方向是：

- 意图驱动检索
  先判断当前请求属于“继续任务 / 查询历史决策 / 读取用户偏好 / 身份确认”等哪类，再决定读取哪一层记忆

- 更强的结构化 facts
  为事实增加 `type / confidence / source / pinned / scope` 等字段，降低噪音

- 自动 checkpoint
  从手动压缩逐步转向后台自动生成阶段摘要，而不是依赖用户点击

- 记忆生命周期
  让信息在 `hot -> facts/summary -> archive` 之间流动，而不是一直堆积

- memory 评估
  用固定测试集验证“是否记住了对的事、是否减少 token、是否提升速度”

这些方向不影响当前版本上线，但会直接决定长期体验是否真正优秀。

## 11. 备份建议

建议把运行态数据和仓库源码分开备份：

- 仓库源码走 Git
- `projects/` 下的运行数据走你自己的文件备份方案
- 发布前不要把真实项目的 memory、uploads、日志和临时备份提交到仓库

## 12. 下一步建议

后续最值得继续做的点：

- 会话摘要自动刷新策略
- memory 检索策略从固定拼接升级为按意图选择
- 项目设置页里显示当前 agent 健康状态
- 新建项目时可选“自动创建并绑定 agent”
- 对话上下文调试面板
- 项目导入/导出增强
