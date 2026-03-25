# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Research Navigator (研究领域导航器) is a scientific intelligence platform. Given a research topic, it collects papers from public APIs, builds a citation graph, identifies trends and research gaps, runs AI-powered debate analysis, and generates exportable reports.

## Commands

```bash
# Install all dependencies
pnpm install

# Run API server (dev) — builds then starts on $PORT (default 8080)
pnpm --filter @workspace/api-server run dev

# Run frontend (dev) — Vite on http://localhost:5173
pnpm --filter @workspace/web-app run dev

# Run collection CLI
pnpm --filter @workspace/scripts run collect -- --topic "transformer attention" --limit 200

# Push DB schema (Drizzle — no migration files, direct push)
pnpm --filter @workspace/db run push
pnpm --filter @workspace/db run push-force   # skips safety prompt

# Typecheck everything
pnpm run typecheck

# Typecheck libs only (composite TS build)
pnpm run typecheck:libs

# Typecheck a specific package
pnpm --filter @workspace/api-server exec tsc -p tsconfig.json --noEmit

# Regenerate API client/zod from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

## Architecture

### Monorepo (pnpm workspaces)

```
artifacts/
  api-server/       # Express 5 REST API — TypeScript, ESM, built with esbuild
  web-app/          # React 19 + Vite frontend — TanStack Query, wouter, Shadcn UI

lib/
  db/               # Drizzle ORM schema + drizzle-kit push (PostgreSQL, no migration files)
  api-spec/         # OpenAPI 3.0 spec (source of truth) + orval codegen config
  api-zod/          # Generated Zod validators (do not edit manually)
  api-client-react/ # Generated TanStack Query hooks (do not edit manually)
  integrations-openai-ai-server/  # OpenAI client wrapper (server-side)

scripts/
  src/collect.ts    # CLI for seeding paper data
```

### API ↔ Frontend Contract

The OpenAPI spec at `lib/api-spec/openapi.yaml` is the single source of truth. Running `pnpm --filter @workspace/api-spec run codegen` regenerates both `lib/api-zod` (Zod schemas) and `lib/api-client-react` (React Query hooks). Never edit the generated packages directly.

### Frontend Routes

- `/` — Home: search form + recent runs list
- `/run/:id` — Dashboard: full analysis view for a collection run (tabs for graph, trends, gaps, proposals, debates, report)

### Backend Request Flow

1. `POST /api/collection/runs` — creates a run record, starts async data collection (Semantic Scholar + OpenAlex), returns immediately
2. Frontend polls `GET /api/collection/runs/:id` until `status === "completed"`
3. Subsequent AI analysis endpoints (`/api/trends/:runId/compute`, `/api/gaps/:runId/analyze`, etc.) are triggered per-tab as user navigates
4. All AI calls go through `lib/integrations-openai-ai-server`, which wraps the OpenAI SDK

### Database

PostgreSQL via Drizzle ORM. Schema lives in `lib/db/src/schema/`. Key tables: `collection_runs`, `papers`, `authors`, `paper_authors`, `citations`, `keyword_trends`, `research_gaps`, `research_proposals`, `debate_sessions`, `debate_turns`.

**No migration files** — schema is managed via `drizzle-kit push`. Use `push-force` only when intentionally destructive.

## Key Technical Constraints

- **Rate limits**: Semantic Scholar — 1100 ms between requests; OpenAlex — 500 ms, set `OPENALEX_EMAIL` env var for polite pool access
- **Deduplication**: DOI first, then normalized title (handles cross-source duplicates)
- **Citation graph**: BFS up to depth 3, max 300 nodes; hub nodes get canvas glow treatment
- **Debate format**: 4 roles × 3 rounds = 12 turns, followed by synthesis report
- **TopAuthor schema**: flat `{id, name, paperCount, citationCount, hIndex, affiliations}` — not the nested `Author` type
- **API server build**: esbuild (not tsc) via `artifacts/api-server/build.mjs`; outputs ESM to `dist/`

## Environment Variables

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key for all AI features |
| `OPENAI_BASE_URL` | ❌ | OpenAI official | Custom OpenAI-compatible endpoint (Azure, proxy, etc.) |
| `OPENALEX_EMAIL` | ❌ | — | Email for OpenAlex polite pool (faster rate limits) |
| `PORT` | ❌ | `8080` | API server port |

Copy `.env.example` to `.env` and fill in at minimum `DATABASE_URL` and `OPENAI_API_KEY`.

## UI Style

Dark mode, professional scientific tool aesthetic. Dense layout, monospace accents, sharp contrast. Shadcn UI components with Tailwind CSS v4. Recharts for trend charts; `react-force-graph-2d` for the citation network canvas.
