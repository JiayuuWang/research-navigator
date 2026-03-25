# Research Navigator (研究领域导航器)

A comprehensive scientific intelligence platform that takes a research topic as input and produces:
- Paper collection from multiple public APIs (Semantic Scholar + OpenAlex)
- Citation graph visualization (interactive network)
- Trend analysis with AI narratives
- Research gap identification with proposal generation
- Multi-perspective controversy debate analysis
- Integrated exportable reports

## Architecture

### Monorepo Structure (pnpm workspaces)

```
artifacts/
  api-server/       # Express.js REST API backend (port from $PORT, runs on 8080 in dev)
  web-app/          # React + Vite frontend (/, Shadcn UI, TanStack Query)
  mockup-sandbox/   # Vite component preview server for canvas prototyping

lib/
  db/               # Drizzle ORM schema + PostgreSQL migrations
  api-spec/         # OpenAPI 3.0 spec + codegen (orval)
  api-zod/          # Generated Zod schemas from OpenAPI
  api-client-react/ # Generated React Query hooks from OpenAPI
  integrations-openai-ai-server/  # OpenAI client (Replit AI Integrations proxy)
  integrations-openai-ai-react/   # React audio hooks for OpenAI

scripts/
  src/collect.ts    # CLI data collection script
```

### Database (PostgreSQL via Drizzle ORM)

Tables:
- `papers` — collected papers with metadata (DOI, abstract, year, citations, etc.)
- `authors` — paper authors
- `paper_authors` — paper-author junction
- `citations` — citation relationships between papers
- `collection_runs` — tracks collection job status
- `topics` / `clusters` / `paper_topics` — thematic clustering
- `keyword_trends` — computed keyword trend data over years
- `research_gaps` — AI-identified research gaps with scores
- `research_proposals` — generated research proposals for gaps
- `debate_sessions` — multi-perspective debate sessions
- `debate_turns` — individual debate turns per role
- `conversations` / `messages` — chat session storage

### API Routes (all under `/api`)

- `GET /api/healthz` — health check
- `GET /api/papers` — list papers with filters
- `GET /api/papers/:id` — paper detail
- `GET/POST /api/collection/runs` — list/create collection runs
- `GET /api/collection/runs/:id` — get run status
- `GET /api/graph/seed/:paperId` — build citation graph from seed paper
- `GET /api/graph/paper/:paperId/summary` — AI paper summary
- `POST /api/trends/:runId/compute` — compute keyword trends
- `GET /api/trends/:runId` — get trends data
- `GET /api/trends/:runId/narrative` — AI trend narrative
- `POST /api/gaps/:runId/analyze` — run gap analysis
- `GET /api/gaps/:runId` — get research gaps
- `POST /api/proposals/:runId/generate` — generate proposals
- `GET /api/proposals/:runId` — get proposals
- `POST /api/debates/:runId/start` — start structured debate (async, ~2-3 min)
- `GET /api/debates/:runId` — get debate sessions
- `GET /api/debates/sessions/:sessionId/turns` — get debate turns
- `POST /api/report/:runId/generate` — generate comprehensive report
- `GET /api/report/:runId` — get report

### Data Sources

- **Semantic Scholar API** — rate limited to 1100ms between requests, pagination support
- **OpenAlex API** — rate limited to 500ms, mailto param required, cursor pagination

### AI Integration

Uses Replit AI Integrations (OpenAI proxy) — no user API key required:
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — auto-set by Replit
- `AI_INTEGRATIONS_OPENAI_API_KEY` — auto-set by Replit
- Model: `gpt-5.2` for all AI features

### UI Style

Dark mode, professional scientific tool aesthetic. Modeled after high-precision data tools (dense layout, monospace accents, sharp contrast). Uses Shadcn UI components with Tailwind CSS.

## Development

```bash
# Install all dependencies
pnpm install

# Run API server (dev)
pnpm --filter @workspace/api-server run dev

# Run frontend (dev)  
pnpm --filter @workspace/web-app run dev

# Run collection CLI
pnpm --filter @workspace/scripts run collect -- --topic "transformer attention" --limit 200

# Push DB migrations
pnpm --filter @workspace/db run push

# Typecheck all libs
pnpm run typecheck:libs

# Typecheck API server
pnpm --filter @workspace/api-server exec tsc -p tsconfig.json --noEmit
```

## Key Technical Decisions

1. **Collection pipeline is async** — POST to start a run returns immediately, frontend polls for status
2. **Deduplication** — by DOI first, then normalized title (handles cross-source duplicates)
3. **All AI analysis** — done server-side using OpenAI batch API for parallel processing
4. **Citation graph** — BFS traversal up to 3 levels deep, max 300 nodes, custom canvas glow for hub nodes
5. **Debate format** — 4 roles × 3 rounds = 12 turns, generates final synthesis report with consensus/disagreement
6. **Research gaps** — AI generates 5 distinct gaps scored by novelty/impact/feasibility; expandable cards with evidence
7. **Proposals** — generated per gap using GPT, with research questions, methodology, contributions, challenges
8. **TopAuthor schema** — flat `{id, name, paperCount, citationCount, hIndex, affiliations}` (not nested Author)
9. **Markdown export** — report exported as `.md` file via client-side Blob download
10. **PapersList** — accepts `runId` to scope papers to a specific collection run (via `/api/papers?runId=...`)

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned by Replit)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI proxy base URL (auto-set)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI proxy key (auto-set)
- `PORT` — Server port (auto-assigned by Replit)

## GitHub Repository

Private repo: https://github.com/JiayuuWang/research-navigator
Auto-push: enabled via post-commit hook (requires GITHUB_TOKEN secret)
