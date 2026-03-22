# Frontend / Backend Separation Notes

## 目标

在不改变现有前端界面和功能的前提下，把项目拆成清晰的前后端结构，并继续使用本地文件系统作为后端数据源。

## 当前结构

```text
skills/project-workspace/
├── app.html                 # 兼容保留的前端入口
├── api.js                   # 前端 API client
├── server.js                # 兼容保留的后端启动入口
├── frontend/
│   ├── index.html           # 独立前端入口
│   └── api.js               # 前端 API client
└── backend/
    ├── context.js           # 共享上下文/路径
    ├── lib/router.js        # 路由匹配与请求解析
    ├── routes/              # 分领域 route modules
    └── server.js            # API-only 后端服务
```

## 说明

- `frontend/index.html` 是独立前端入口。
- `api.js` 承载前端 API client，页面不再直接写 `fetch(...)` 调用。
- `backend/server.js` 是后端 API 服务，数据仍然写入本地 `projects/` 目录。
- 根目录的 `app.html` 和 `server.js` 继续保留，避免旧用法失效。
- 多窗口能力改为由主界面上的“新建窗口”按钮触发，不再保留单独的多标签前端页面。

## 启动方式

### 后端

```bash
node /Users/kidad/.openclaw/workspace/skills/project-workspace/backend/server.js
```

或继续使用旧命令：

```bash
node /Users/kidad/.openclaw/workspace/skills/project-workspace/server.js
```

### 自定义端口

```bash
PORT=3460 node /Users/kidad/.openclaw/workspace/skills/project-workspace/backend/server.js
```

前端可通过查询参数切换 API 地址：

```text
frontend/index.html?apiBase=http://localhost:3460
```

## 数据存储

后端仍使用本地文件系统：

```text
/Users/kidad/.openclaw/workspace/projects/
├── .projects-index.json
└── <project>/
    ├── .project.json
    ├── memory/
    ├── tasks/
    └── uploads/
```

## 会话记忆结构

新的会话记忆采用分层存储：

```text
projects/<project>/memory/
├── shared.md                    # 项目共享记忆
├── session-<id>.meta.json       # 会话元信息（名称、创建时间）
├── session-<id>.jsonl           # 原始消息流
├── session-<id>.summary.md      # 会话摘要
└── session-<id>.md              # 旧版兼容文件（懒迁移来源）
```

- API 仍兼容旧的会话读写方式。
- 旧版 `session-*.md` 会在读取时懒迁移到 `meta/jsonl/summary`。
- 聊天请求会优先组合：项目共享记忆 + 会话摘要 + 最近消息 + 当前请求。
