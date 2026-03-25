# Research Navigator · 研究领域导航器

> 一个开源的科研情报平台——输入研究主题，自动采集文献、构建引用图谱、分析趋势与研究空白，并生成结构化分析报告。

**技术栈**：React 19 · Express 5 · PostgreSQL · Drizzle ORM · OpenAI API · Tailwind CSS v4 · Shadcn UI

---

## 功能概览

| 模块 | 说明 |
|------|------|
| **Corpus** | 从 Semantic Scholar 和 OpenAlex 双源采集文献，DOI 去重 |
| **Topology** | 交互式引用图谱（BFS 最多 3 层，300 节点），枢纽节点高亮 |
| **Vectors** | 关键词趋势（TF-IDF），顶级作者 / 机构排行，AI 叙事摘要 |
| **Anomalies** | AI 识别 5 个研究空白，按新颖性 / 影响力 / 可行性评分 |
| **Synthesis** | 针对每个研究空白生成完整研究提案（研究问题、方法论、预期贡献） |
| **Matrix** | 4 角色 × 3 轮结构化辩论，输出共识与分歧点 |
| **Dossier** | 综合报告，支持 Markdown / HTML 导出 |

---

## 快速上手

### 前置要求

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9（`npm install -g pnpm`）
- [PostgreSQL](https://www.postgresql.org/) >= 14
- OpenAI API key（或兼容 OpenAI 格式的代理服务）

### 1. 克隆仓库

```bash
git clone https://github.com/JiayuuWang/research-navigator.git
cd research-navigator
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少填写以下两项：

```env
DATABASE_URL=postgresql://user:password@localhost:5432/research_navigator
OPENAI_API_KEY=sk-...
```

完整变量说明见[环境变量](#环境变量)章节。

### 3. 安装依赖

```bash
pnpm install
```

### 4. 初始化数据库

确保 PostgreSQL 已启动，且 `DATABASE_URL` 中的数据库已创建：

```bash
# 创建数据库（如果还没有）
createdb research_navigator

# 推送 schema（Drizzle 直接推送，无迁移文件）
pnpm --filter @workspace/db run push
```

### 5. 启动服务

需要打开**两个终端**分别启动前后端：

**终端 1 — API 服务器**（默认端口 8080）：

```bash
pnpm --filter @workspace/api-server run dev
```

**终端 2 — 前端开发服务器**（默认端口 5173）：

```bash
pnpm --filter @workspace/web-app run dev
```

打开浏览器访问 **http://localhost:5173**，输入研究主题开始分析。

> **注意**：首次采集会向 Semantic Scholar 和 OpenAlex API 发送请求，受速率限制（分别为 1100ms/次 和 500ms/次），200 篇文献约需 3–5 分钟。

---

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `DATABASE_URL` | ✅ | — | PostgreSQL 连接字符串 |
| `OPENAI_API_KEY` | ✅ | — | OpenAI API 密钥，所有 AI 功能均需要 |
| `OPENAI_BASE_URL` | ❌ | OpenAI 官方 | 自定义 API 端点，可指向 Azure OpenAI、本地代理等 |
| `OPENALEX_EMAIL` | ❌ | — | 邮箱地址，填写后请求进入 OpenAlex "礼貌池"（速度更快） |
| `PORT` | ❌ | `8080` | API 服务器监听端口 |

### 使用国内 / 第三方 OpenAI 代理

如果无法直连 OpenAI 官方 API，可以配置兼容 OpenAI 格式的代理：

```env
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=https://你的代理地址/v1
```

---

## 开发指南

### 常用命令

```bash
# 类型检查（全量）
pnpm run typecheck

# 仅检查 lib 包
pnpm run typecheck:libs

# 仅检查 API server
pnpm --filter @workspace/api-server exec tsc -p tsconfig.json --noEmit

# 数据采集 CLI（直接写入数据库，无需启动 API server）
pnpm --filter @workspace/scripts run collect -- --topic "transformer attention" --limit 200

# 重新生成 API 客户端（修改 lib/api-spec/openapi.yaml 后执行）
pnpm --filter @workspace/api-spec run codegen

# 强制推送 schema（跳过安全提示，危险操作）
pnpm --filter @workspace/db run push-force
```

### 项目结构

```
artifacts/
  api-server/       # Express 5 REST API（TypeScript ESM，esbuild 构建）
  web-app/          # React 19 前端（Vite · TanStack Query · wouter · Shadcn UI）

lib/
  db/               # Drizzle ORM schema + PostgreSQL（无迁移文件，直接 push）
  api-spec/         # OpenAPI 3.0 规范（单一数据源）+ orval 代码生成配置
  api-zod/          # 从 OpenAPI 生成的 Zod 验证器（勿手动修改）
  api-client-react/ # 从 OpenAPI 生成的 TanStack Query hooks（勿手动修改）
  integrations-openai-ai-server/  # OpenAI 客户端封装（含批量处理工具）

scripts/
  src/collect.ts    # 文献采集 CLI 脚本
```

### API 设计

所有 API 接口定义在 `lib/api-spec/openapi.yaml`。修改此文件后运行 `codegen` 即可同步更新前端调用代码和 Zod 验证器，**不要**直接修改 `lib/api-zod` 和 `lib/api-client-react`。

### 异步采集流程

1. `POST /api/collection/runs` — 立即返回 run ID，后台异步采集
2. 前端轮询 `GET /api/collection/runs/:id` 直到 `status === "completed"`
3. 用户切换到各分析 Tab 时，各模块按需触发对应 AI 分析接口

---

## 数据来源

| 数据源 | 用途 | 速率限制 |
|--------|------|---------|
| [Semantic Scholar](https://api.semanticscholar.org/) | 文献元数据、引用关系、TL;DR | 1100ms / 请求 |
| [OpenAlex](https://openalex.org/) | 补充文献、机构信息、概念标签 | 500ms / 请求 |

两个来源的文献按 DOI 优先去重，相同 DOI 仅保留一条记录。

---

## License

MIT © 2024 Research Navigator Contributors
