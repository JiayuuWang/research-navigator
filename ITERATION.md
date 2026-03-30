# Reflection Report — Research Navigator

## Specification Iteration History

### v1 — Initial Spec (Literal Translation of Requirements)

```
Goal: Build a 6-module research intelligence platform
Modules: Data collection → Citation graph → Trends → Gaps → Debate → Report
Approach: Scaffold all 6 modules simultaneously with AI assistance
Assumption: AI can generate correct, working implementations end-to-end
```

**What I asked AI to build:**
- REST API with all routes wired up
- React dashboard with 7 tabs
- OpenAPI spec → auto-generated client hooks
- Data collectors for Semantic Scholar + OpenAlex
- Force-directed citation graph with BFS expansion

**What I actually got:**
A structurally complete but functionally broken system. The citation graph
returned 1 node because the pipeline never collected citation relationships;
the collector sorted by `citationCount:desc` so 2025 papers were buried
under 2024 results; the report GET endpoint returned hardcoded template
strings regardless of whether AI generation had run.

**Trigger for revision:** Running the system end-to-end and testing each
API endpoint against real data.

---

### v2 — Data-Grounded Spec (After Live Testing)

```
Trigger: End-to-end run revealed 3 critical bugs:
  1. citationsTable always empty → graph had 1 node
  2. Papers sorted by citation count → 2024 dominated even for 2025 topics
  3. GET /report returned templates, POST /report discarded AI output

Revised priorities:
  P0: Fix graph — API fallback with inline citation metadata (<30s target)
  P1: Fix affiliations — institutions chart always empty
  P2: Fix report persistence — save AI output to run metadata
  P3: Improve recency — sort by publicationDate:desc, query year-by-year
```

**Key insight that drove revision:** The graph timeout was not a frontend
problem but an architectural one. The original fallback fetched paper
metadata one-by-one with 1.2s rate limiting (200 neighbors × 1.2s = 4 min).
The fix was to use citation API endpoints that return neighbor metadata
inline, capping expansion to ~10 API calls total.

**Result:** 200-node graph in 3 seconds (was 120s+ timeout).

