# Research Navigator

<p align="center">
  <a href="#english">English</a> ·
  <a href="#中文">中文</a> ·
  <a href="#한국어">한국어</a>
</p>

---

<a id="english"></a>

## English

> An open-source scientific intelligence platform — enter a research topic and automatically collect papers, build citation graphs, analyze trends and gaps, and generate structured analysis reports.

**Stack**: React 19 · Express 5 · PostgreSQL · Drizzle ORM · OpenAI API · Tailwind CSS v4 · Shadcn UI

[Reflection During the Project](https://github.com/JiayuuWang/research-navigator/blob/master/REFLECTION.md) 

[Iteration Handbook](https://github.com/JiayuuWang/research-navigator/blob/master/ITERATION.md)

[More Miscellaneous Feelings](https://jiayuuwang.github.io/vibe%20coding/%E6%8A%80%E6%9C%AF%E9%9D%A2%E8%AF%95/feelings-after-a-vibecoding-interview-cn/)

### Features

| Module | Description |
|--------|-------------|
| **Corpus** | Dual-source paper collection from Semantic Scholar and OpenAlex with DOI deduplication |
| **Topology** | Interactive citation graph (BFS up to 3 levels, 300 nodes) with hub node highlighting |
| **Vectors** | Keyword trends (TF-IDF), top authors/institutions rankings, AI narrative summary |
| **Anomalies** | AI-identified research gaps scored by novelty / impact / feasibility |
| **Synthesis** | Full research proposals for each gap (research questions, methodology, expected contributions) |
| **Matrix** | 4-role × 3-round structured debate with consensus and disagreement extraction |
| **Dossier** | Comprehensive report with Markdown / HTML / PDF export |

### Quick Start

#### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9 (`npm install -g pnpm`)
- [PostgreSQL](https://www.postgresql.org/) >= 14
- OpenAI API key (or any OpenAI-compatible proxy)

#### 1. Clone the repository

```bash
git clone https://github.com/JiayuuWang/research-navigator.git
cd research-navigator
```

#### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in at least:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/research_navigator
OPENAI_API_KEY=sk-...
```

See [Environment Variables](#environment-variables) for the full list.

#### 3. Install dependencies

```bash
pnpm install
```

#### 4. Initialize the database

Make sure PostgreSQL is running and the database specified in `DATABASE_URL` exists:

```bash
# Create the database (if not exists)
createdb research_navigator

# Push schema (Drizzle direct push, no migration files)
pnpm --filter @workspace/db run push
```

#### 5. Start the services

Open **two terminals** for the backend and frontend:

**Terminal 1 — API server** (default port 8080):

```bash
pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Frontend dev server** (default port 5173):

```bash
pnpm --filter @workspace/web-app run dev
```

Open **http://localhost:5173** in your browser and enter a research topic to begin.

> **Note**: The first collection sends requests to the Semantic Scholar and OpenAlex APIs, subject to rate limits (1100ms and 500ms per request respectively). Collecting 200 papers takes approximately 3–5 minutes.

### Environment Variables

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key for all AI features |
| `OPENAI_BASE_URL` | ❌ | OpenAI official | Custom API endpoint (Azure OpenAI, local proxy, etc.) |
| `OPENALEX_EMAIL` | ❌ | — | Email for OpenAlex polite pool (faster rate limits) |
| `PORT` | ❌ | `8080` | API server port |

#### Using a third-party OpenAI proxy

If you cannot access the official OpenAI API directly, configure a compatible proxy:

```env
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://your-proxy/v1
```

### Development

#### Common commands

```bash
# Full typecheck
pnpm run typecheck

# Typecheck libs only
pnpm run typecheck:libs

# Typecheck API server only
pnpm --filter @workspace/api-server exec tsc -p tsconfig.json --noEmit

# CLI data collection (writes directly to DB, no API server needed)
pnpm --filter @workspace/scripts run collect -- --topic "transformer attention" --limit 200

# Regenerate API client (after modifying lib/api-spec/openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Force push schema (skips safety prompt — destructive)
pnpm --filter @workspace/db run push-force
```

#### Project structure

```
artifacts/
  api-server/       # Express 5 REST API (TypeScript ESM, esbuild build)
  web-app/          # React 19 frontend (Vite · TanStack Query · wouter · Shadcn UI)

lib/
  db/               # Drizzle ORM schema + PostgreSQL (no migration files, direct push)
  api-spec/         # OpenAPI 3.0 spec (single source of truth) + orval codegen config
  api-zod/          # Generated Zod validators (do not edit manually)
  api-client-react/ # Generated TanStack Query hooks (do not edit manually)
  integrations-openai-ai-server/  # OpenAI client wrapper (with batch processing)

scripts/
  src/collect.ts    # Paper collection CLI script
```

#### API design

All API endpoints are defined in `lib/api-spec/openapi.yaml`. After modifying this file, run `codegen` to regenerate the frontend hooks and Zod validators — **never** edit `lib/api-zod` or `lib/api-client-react` directly.

#### Async collection flow

1. `POST /api/collection/runs` — returns a run ID immediately, collection runs in the background
2. Frontend polls `GET /api/collection/runs/:id` until `status === "completed"`
3. AI analysis endpoints are triggered per-tab as the user navigates

### Data Sources

| Source | Purpose | Rate Limit |
|--------|---------|------------|
| [Semantic Scholar](https://api.semanticscholar.org/) | Paper metadata, citation relationships, TL;DR | 1100ms / request |
| [OpenAlex](https://openalex.org/) | Supplementary papers, institution data, concept tags | 500ms / request |

Papers from both sources are deduplicated by DOI first, then by normalized title.

---

<a id="中文"></a>

## 中文

> 一个开源的科研情报平台——输入研究主题，自动采集文献、构建引用图谱、分析趋势与研究空白，并生成结构化分析报告。

**技术栈**：React 19 · Express 5 · PostgreSQL · Drizzle ORM · OpenAI API · Tailwind CSS v4 · Shadcn UI

### 功能概览

| 模块 | 说明 |
|------|------|
| **Corpus** | 从 Semantic Scholar 和 OpenAlex 双源采集文献，DOI 去重 |
| **Topology** | 交互式引用图谱（BFS 最多 3 层，300 节点），枢纽节点高亮 |
| **Vectors** | 关键词趋势（TF-IDF），顶级作者 / 机构排行，AI 叙事摘要 |
| **Anomalies** | AI 识别研究空白，按新颖性 / 影响力 / 可行性评分 |
| **Synthesis** | 针对每个研究空白生成完整研究提案（研究问题、方法论、预期贡献） |
| **Matrix** | 4 角色 × 3 轮结构化辩论，输出共识与分歧点 |
| **Dossier** | 综合报告，支持 Markdown / HTML / PDF 导出 |

### 快速上手

#### 前置要求

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9（`npm install -g pnpm`）
- [PostgreSQL](https://www.postgresql.org/) >= 14
- OpenAI API key（或兼容 OpenAI 格式的代理服务）

#### 1. 克隆仓库

```bash
git clone https://github.com/JiayuuWang/research-navigator.git
cd research-navigator
```

#### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少填写以下两项：

```env
DATABASE_URL=postgresql://user:password@localhost:5432/research_navigator
OPENAI_API_KEY=sk-...
```

完整变量说明见[环境变量](#环境变量)章节。

#### 3. 安装依赖

```bash
pnpm install
```

#### 4. 初始化数据库

确保 PostgreSQL 已启动，且 `DATABASE_URL` 中的数据库已创建：

```bash
# 创建数据库（如果还没有）
createdb research_navigator

# 推送 schema（Drizzle 直接推送，无迁移文件）
pnpm --filter @workspace/db run push
```

#### 5. 启动服务

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

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `DATABASE_URL` | ✅ | — | PostgreSQL 连接字符串 |
| `OPENAI_API_KEY` | ✅ | — | OpenAI API 密钥，所有 AI 功能均需要 |
| `OPENAI_BASE_URL` | ❌ | OpenAI 官方 | 自定义 API 端点，可指向 Azure OpenAI、本地代理等 |
| `OPENALEX_EMAIL` | ❌ | — | 邮箱地址，填写后请求进入 OpenAlex "礼貌池"（速度更快） |
| `PORT` | ❌ | `8080` | API 服务器监听端口 |

#### 使用第三方 OpenAI 代理

如果无法直连 OpenAI 官方 API，可以配置兼容 OpenAI 格式的代理：

```env
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=https://你的代理地址/v1
```

### 数据来源

| 数据源 | 用途 | 速率限制 |
|--------|------|---------|
| [Semantic Scholar](https://api.semanticscholar.org/) | 文献元数据、引用关系、TL;DR | 1100ms / 请求 |
| [OpenAlex](https://openalex.org/) | 补充文献、机构信息、概念标签 | 500ms / 请求 |

两个来源的文献按 DOI 优先去重，相同 DOI 仅保留一条记录。

---

<a id="한국어"></a>

## 한국어

> 오픈소스 과학 인텔리전스 플랫폼 — 연구 주제를 입력하면 논문 수집, 인용 그래프 구축, 트렌드 및 연구 공백 분석, 구조화된 분석 보고서를 자동으로 생성합니다.

**기술 스택**: React 19 · Express 5 · PostgreSQL · Drizzle ORM · OpenAI API · Tailwind CSS v4 · Shadcn UI

### 기능 개요

| 모듈 | 설명 |
|------|------|
| **Corpus** | Semantic Scholar와 OpenAlex에서 이중 소스 논문 수집, DOI 중복 제거 |
| **Topology** | 인터랙티브 인용 그래프 (BFS 최대 3단계, 300개 노드), 허브 노드 하이라이트 |
| **Vectors** | 키워드 트렌드 (TF-IDF), 상위 저자/기관 순위, AI 내러티브 요약 |
| **Anomalies** | AI 기반 연구 공백 식별, 참신성/영향력/실현 가능성 점수 |
| **Synthesis** | 각 연구 공백에 대한 완전한 연구 제안서 생성 (연구 질문, 방법론, 기대 기여) |
| **Matrix** | 4개 역할 × 3라운드 구조화된 토론, 합의 및 이견 추출 |
| **Dossier** | 종합 보고서, Markdown / HTML / PDF 내보내기 지원 |

### 빠른 시작

#### 사전 요구 사항

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9 (`npm install -g pnpm`)
- [PostgreSQL](https://www.postgresql.org/) >= 14
- OpenAI API 키 (또는 OpenAI 호환 프록시)

#### 1. 저장소 복제

```bash
git clone https://github.com/JiayuuWang/research-navigator.git
cd research-navigator
```

#### 2. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 편집하여 최소한 다음 두 항목을 입력하세요:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/research_navigator
OPENAI_API_KEY=sk-...
```

전체 변수 목록은 [환경 변수](#환경-변수) 섹션을 참조하세요.

#### 3. 의존성 설치

```bash
pnpm install
```

#### 4. 데이터베이스 초기화

PostgreSQL이 실행 중이고 `DATABASE_URL`에 지정된 데이터베이스가 생성되어 있는지 확인하세요:

```bash
# 데이터베이스 생성 (아직 없는 경우)
createdb research_navigator

# 스키마 푸시 (Drizzle 직접 푸시, 마이그레이션 파일 없음)
pnpm --filter @workspace/db run push
```

#### 5. 서비스 시작

백엔드와 프론트엔드를 위해 **두 개의 터미널**을 열어야 합니다:

**터미널 1 — API 서버** (기본 포트 8080):

```bash
pnpm --filter @workspace/api-server run dev
```

**터미널 2 — 프론트엔드 개발 서버** (기본 포트 5173):

```bash
pnpm --filter @workspace/web-app run dev
```

브라우저에서 **http://localhost:5173**을 열고 연구 주제를 입력하여 시작하세요.

> **참고**: 첫 수집 시 Semantic Scholar와 OpenAlex API에 요청을 보내며, 속도 제한이 적용됩니다 (각각 1100ms, 500ms/요청). 200편의 논문 수집에 약 3~5분이 소요됩니다.

### 환경 변수

| 변수 | 필수 | 기본값 | 설명 |
|------|:----:|--------|------|
| `DATABASE_URL` | ✅ | — | PostgreSQL 연결 문자열 |
| `OPENAI_API_KEY` | ✅ | — | 모든 AI 기능에 필요한 OpenAI API 키 |
| `OPENAI_BASE_URL` | ❌ | OpenAI 공식 | 커스텀 API 엔드포인트 (Azure OpenAI, 로컬 프록시 등) |
| `OPENALEX_EMAIL` | ❌ | — | OpenAlex 폴라이트 풀용 이메일 (더 빠른 속도 제한) |
| `PORT` | ❌ | `8080` | API 서버 포트 |

#### 타사 OpenAI 프록시 사용

공식 OpenAI API에 직접 접근할 수 없는 경우, 호환 프록시를 설정하세요:

```env
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://your-proxy/v1
```

### 데이터 소스

| 소스 | 용도 | 속도 제한 |
|------|------|-----------|
| [Semantic Scholar](https://api.semanticscholar.org/) | 논문 메타데이터, 인용 관계, TL;DR | 1100ms / 요청 |
| [OpenAlex](https://openalex.org/) | 보충 논문, 기관 정보, 개념 태그 | 500ms / 요청 |

두 소스의 논문은 DOI 우선으로 중복 제거됩니다.

---

## License

MIT © 2024 Research Navigator Contributors
