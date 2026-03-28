import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { papersTable, citationsTable } from "@workspace/db";
import { eq, or, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { randomUUID } from "crypto";
import { fetchSSCitationsWithMeta, fetchSSReferencesWithMeta } from "../../lib/collectors/semantic-scholar.js";
import { logger } from "../../lib/logger.js";

const router: IRouter = Router();

// In-memory cache for AI summaries
const summaryCache = new Map<string, { summary: string; keyContributions: string[]; methodology: string; impact: string }>();

const RATE_LIMIT_MS = 1200;
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

interface SimpleNode {
  id: string;
  title: string;
  year: number | null;
  citationCount: number;
  influentialCitationCount: number;
  fieldsOfStudy: string[];
}

interface GraphEdge {
  source: string;
  target: string;
  isInfluential: boolean;
}

/**
 * Build citation graph using a fast, optimized approach:
 * 1. Load all papers from the same collection run
 * 2. Check DB for existing citation edges
 * 3. If insufficient, expand via Semantic Scholar API (capped at ~10 papers)
 *    using the withMeta variants that return neighbor metadata inline
 * 4. Only add nodes that are either in our corpus or discovered via API
 */
async function buildCitationGraph(
  seedId: string,
  depth: number,
  maxNodes: number,
  collectionRunId: string | null
): Promise<{ nodeMap: Map<string, SimpleNode>; edges: GraphEdge[] }> {
  const nodeMap = new Map<string, SimpleNode>();
  const edges: GraphEdge[] = [];

  // Step 1: Load all papers from this run
  const allRunPapers = collectionRunId
    ? await db.select().from(papersTable).where(eq(papersTable.collectionRunId, collectionRunId)).limit(500)
    : [];

  const runPaperMap = new Map<string, typeof allRunPapers[0]>();
  const ssIdToDbId = new Map<string, string>(); // ss_<ssId> -> db paper id
  for (const p of allRunPapers) {
    runPaperMap.set(p.id, p);
    if (p.semanticScholarId) {
      ssIdToDbId.set(`ss_${p.semanticScholarId}`, p.id);
    }
  }

  // Add seed node
  const seedPaper = runPaperMap.get(seedId);
  if (!seedPaper) {
    const [dbSeed] = await db.select().from(papersTable).where(eq(papersTable.id, seedId)).limit(1);
    if (!dbSeed) return { nodeMap, edges };
    nodeMap.set(dbSeed.id, {
      id: dbSeed.id, title: dbSeed.title, year: dbSeed.year,
      citationCount: dbSeed.citationCount ?? 0,
      influentialCitationCount: dbSeed.influentialCitationCount ?? 0,
      fieldsOfStudy: (dbSeed.fieldsOfStudy as string[]) ?? [],
    });
  } else {
    nodeMap.set(seedPaper.id, {
      id: seedPaper.id, title: seedPaper.title, year: seedPaper.year,
      citationCount: seedPaper.citationCount ?? 0,
      influentialCitationCount: seedPaper.influentialCitationCount ?? 0,
      fieldsOfStudy: (seedPaper.fieldsOfStudy as string[]) ?? [],
    });
  }

  // Step 2: Try DB citations first
  const allRunIds = allRunPapers.map((p) => p.id);
  if (allRunIds.length > 0) {
    // Fetch all citation edges between papers in this run
    const batchSize = 100;
    for (let i = 0; i < allRunIds.length; i += batchSize) {
      const batch = allRunIds.slice(i, i + batchSize);
      const rows = await db.select().from(citationsTable)
        .where(or(
          inArray(citationsTable.citingPaperId, batch),
          inArray(citationsTable.citedPaperId, batch),
        ))
        .limit(2000);

      for (const row of rows) {
        edges.push({ source: row.citingPaperId, target: row.citedPaperId, isInfluential: row.isInfluential ?? false });
        // Add endpoint nodes from run papers if they exist
        for (const nid of [row.citingPaperId, row.citedPaperId]) {
          if (!nodeMap.has(nid) && runPaperMap.has(nid) && nodeMap.size < maxNodes) {
            const p = runPaperMap.get(nid)!;
            nodeMap.set(p.id, {
              id: p.id, title: p.title, year: p.year,
              citationCount: p.citationCount ?? 0,
              influentialCitationCount: p.influentialCitationCount ?? 0,
              fieldsOfStudy: (p.fieldsOfStudy as string[]) ?? [],
            });
          }
        }
      }
    }
  }

  // Step 3: If DB produced too few nodes, expand via Semantic Scholar API
  if (nodeMap.size < 10) {
    logger.info({ seedId, dbNodes: nodeMap.size }, "DB citations sparse, expanding via Semantic Scholar API");

    // Pick papers to expand: seed + top cited papers from the run with SS IDs
    const papersToExpand = allRunPapers
      .filter((p) => p.semanticScholarId)
      .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
      .slice(0, 12);

    // Make sure seed is first
    const seedInList = papersToExpand.find((p) => p.id === seedId);
    if (!seedInList && seedPaper?.semanticScholarId) {
      papersToExpand.unshift(seedPaper);
    }

    // BFS expansion
    const visited = new Set<string>();
    const queue = papersToExpand
      .filter((p) => p.semanticScholarId)
      .map((p) => ({ id: p.id, ssId: p.semanticScholarId!, currentDepth: 0 }));

    // Cap the number of API expansions
    let apiCalls = 0;
    const maxApiCalls = 10;

    while (queue.length > 0 && nodeMap.size < maxNodes && apiCalls < maxApiCalls) {
      const item = queue.shift();
      if (!item) break;
      if (visited.has(item.ssId)) continue;
      visited.add(item.ssId);
      if (item.currentDepth >= depth) continue;

      try {
        // Fetch citations AND references with metadata inline — 2 API calls per paper
        const [citations, references] = await Promise.all([
          fetchSSCitationsWithMeta(item.ssId),
          fetchSSReferencesWithMeta(item.ssId),
        ]);
        apiCalls++;

        const allRels = [...citations, ...references];

        for (const rel of allRels) {
          if (nodeMap.size >= maxNodes) break;

          // Resolve IDs to DB IDs if possible
          const citingDbId = ssIdToDbId.get(rel.citingPaperId) ?? rel.citingPaperId;
          const citedDbId = ssIdToDbId.get(rel.citedPaperId) ?? rel.citedPaperId;

          edges.push({ source: citingDbId, target: citedDbId, isInfluential: rel.isInfluential });

          // Add the neighbor node if not already in graph
          const neighborId = citingDbId === item.id ? citedDbId : citingDbId;
          if (!nodeMap.has(neighborId) && rel.neighborPaper) {
            const resolvedId = ssIdToDbId.get(rel.neighborPaper.id) ?? rel.neighborPaper.id;
            const runP = runPaperMap.get(resolvedId);

            nodeMap.set(resolvedId, {
              id: resolvedId,
              title: runP?.title ?? rel.neighborPaper.title,
              year: runP?.year ?? rel.neighborPaper.year,
              citationCount: runP?.citationCount ?? rel.neighborPaper.citationCount,
              influentialCitationCount: runP?.influentialCitationCount ?? 0,
              fieldsOfStudy: (runP?.fieldsOfStudy as string[]) ?? rel.neighborPaper.fieldsOfStudy,
            });

            // Queue for further expansion if it's a run paper (has SS ID) and within depth
            if (runP?.semanticScholarId && item.currentDepth + 1 < depth) {
              queue.push({ id: resolvedId, ssId: runP.semanticScholarId, currentDepth: item.currentDepth + 1 });
            }
          }
        }

        // Persist discovered edges to DB for future use (fire and forget)
        persistEdgesAsync(edges.slice(-allRels.length), nodeMap);

        await sleep(RATE_LIMIT_MS);
      } catch (err) {
        logger.warn({ err, ssId: item.ssId }, "Failed to fetch citations from API");
      }
    }
  }

  // Step 4: Add remaining run papers as isolated nodes (for corpus coverage)
  // Only if we still have room and they connect to existing edges
  const edgeNodeIds = new Set<string>();
  for (const e of edges) {
    edgeNodeIds.add(e.source);
    edgeNodeIds.add(e.target);
  }
  for (const p of allRunPapers) {
    if (nodeMap.size >= maxNodes) break;
    if (!nodeMap.has(p.id) && edgeNodeIds.has(p.id)) {
      nodeMap.set(p.id, {
        id: p.id, title: p.title, year: p.year,
        citationCount: p.citationCount ?? 0,
        influentialCitationCount: p.influentialCitationCount ?? 0,
        fieldsOfStudy: (p.fieldsOfStudy as string[]) ?? [],
      });
    }
  }

  return { nodeMap, edges };
}

/** Persist discovered edges to DB asynchronously */
function persistEdgesAsync(edges: GraphEdge[], nodeMap: Map<string, SimpleNode>) {
  (async () => {
    for (const e of edges) {
      if (nodeMap.has(e.source) && nodeMap.has(e.target) && e.source !== e.target) {
        try {
          await db.insert(citationsTable).values({
            id: randomUUID(),
            citingPaperId: e.source,
            citedPaperId: e.target,
            isInfluential: e.isInfluential,
          }).onConflictDoNothing();
        } catch { /* ignore */ }
      }
    }
  })().catch(() => {});
}


// GET /graph/seed/:paperId
router.get("/seed/:paperId", async (req, res) => {
  try {
    const { paperId } = req.params;
    const depth = Math.min(Number(req.query["depth"] ?? 2), 3);
    const maxNodes = Math.min(Number(req.query["maxNodes"] ?? 200), 300);

    const [seed] = await db
      .select()
      .from(papersTable)
      .where(eq(papersTable.id, paperId!))
      .limit(1);

    if (!seed) {
      res.status(404).json({ error: "Paper not found" });
      return;
    }

    const { nodeMap, edges } = await buildCitationGraph(paperId!, depth, maxNodes, seed.collectionRunId);

    // --- Graph analysis ---
    const nodesArray = Array.from(nodeMap.values());
    const citationCounts = nodesArray.map((n) => n.citationCount ?? 0);
    const sortedCounts = [...citationCounts].sort((a, b) => a - b);
    const medianCitations = sortedCounts[Math.floor(sortedCounts.length / 2)] ?? 0;

    // In/out degree
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    for (const e of edges) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
      outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1);
    }

    // Neighbor sets
    const neighborSets = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!neighborSets.has(e.source)) neighborSets.set(e.source, new Set());
      if (!neighborSets.has(e.target)) neighborSets.set(e.target, new Set());
      neighborSets.get(e.source)!.add(e.target);
      neighborSets.get(e.target)!.add(e.source);
    }

    const nodes = nodesArray.map((n) => {
      const cit = n.citationCount ?? 0;
      const degree = (inDegree.get(n.id) ?? 0) + (outDegree.get(n.id) ?? 0);
      const isHub = cit > medianCitations * 3 || degree > 5;
      const neighbors = neighborSets.get(n.id) ?? new Set();
      const isBridge = neighbors.size >= 3 && (n.fieldsOfStudy ?? []).length > 1;

      return {
        id: n.id,
        title: n.title,
        year: n.year,
        citationCount: cit,
        influentialCitationCount: n.influentialCitationCount ?? 0,
        depth: 0,
        isHub,
        isBridge,
        cluster: null as string | null,
        authors: [] as string[],
      };
    });

    // BFS depth from seed
    const depthMap = new Map<string, number>();
    depthMap.set(paperId!, 0);
    const bfsQ: string[] = [paperId!];
    while (bfsQ.length > 0) {
      const curr = bfsQ.shift()!;
      const currDepth = depthMap.get(curr) ?? 0;
      for (const e of edges) {
        const neighbor = e.source === curr ? e.target : e.target === curr ? e.source : null;
        if (neighbor && !depthMap.has(neighbor)) {
          depthMap.set(neighbor, currDepth + 1);
          bfsQ.push(neighbor);
        }
      }
    }

    const nodesWithDepth = nodes.map((n) => ({ ...n, depth: depthMap.get(n.id) ?? 1 }));

    // Deduplicate edges
    const edgeSet = new Set<string>();
    const uniqueEdges = edges.filter((e) => {
      if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) return false;
      if (e.source === e.target) return false;
      const key = `${e.source}:${e.target}`;
      if (edgeSet.has(key)) return false;
      edgeSet.add(key);
      return true;
    });

    // --- Lineage detection ---
    const topHubs = nodesWithDepth
      .filter((n) => n.isHub)
      .sort((a, b) => b.citationCount - a.citationCount)
      .slice(0, 5);

    const lineages: Array<{ id: string; name: string; paperIds: string[]; description: string }> = [];

    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    for (const e of uniqueEdges) {
      if (!outgoing.has(e.source)) outgoing.set(e.source, []);
      outgoing.get(e.source)!.push(e.target);
      if (!incoming.has(e.target)) incoming.set(e.target, []);
      incoming.get(e.target)!.push(e.source);
    }

    function tracePath(startId: string, adjacency: Map<string, string[]>, maxLen: number): string[][] {
      const paths: string[][] = [];
      const stack: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }];
      while (stack.length > 0) {
        const { id, path } = stack.pop()!;
        if (path.length >= maxLen) { paths.push([...path]); continue; }
        const neighbors = adjacency.get(id) ?? [];
        let extended = false;
        for (const neighbor of neighbors) {
          if (!path.includes(neighbor) && nodeMap.has(neighbor)) {
            stack.push({ id: neighbor, path: [...path, neighbor] });
            extended = true;
          }
        }
        if (!extended && path.length >= 2) paths.push([...path]);
      }
      return paths;
    }

    const seedNodes = [paperId!, ...topHubs.map((h) => h.id)].slice(0, 6);
    const allPaths: Array<{ path: string[]; score: number }> = [];

    for (const startId of seedNodes) {
      for (const adj of [outgoing, incoming]) {
        const paths = tracePath(startId, adj, 5);
        for (const path of paths) {
          if (path.length >= 2) {
            const score = path.reduce((sum, id) => sum + (nodeMap.get(id)?.citationCount ?? 0), 0) * path.length;
            allPaths.push({ path, score });
          }
        }
      }
    }

    allPaths.sort((a, b) => b.score - a.score);
    const usedPapers = new Set<string>();
    for (const { path } of allPaths) {
      if (lineages.length >= 5) break;
      const newPapers = path.filter((id) => !usedPapers.has(id));
      if (newPapers.length === 0) continue;

      const firstPaper = nodeMap.get(path[0]!);
      const lastPaper = nodeMap.get(path[path.length - 1]!);
      const firstTitle = firstPaper?.title?.substring(0, 40) ?? "Unknown";
      const lastTitle = lastPaper?.title?.substring(0, 40) ?? "Unknown";
      const totalCit = path.reduce((s, id) => s + (nodeMap.get(id)?.citationCount ?? 0), 0);

      lineages.push({
        id: randomUUID(),
        name: `${firstTitle}... → ${lastTitle}...`,
        paperIds: path,
        description: `${path.length}-paper trajectory spanning ${firstPaper?.year ?? "?"}-${lastPaper?.year ?? "?"} with ${totalCit} combined citations`,
      });
      for (const id of path) usedPapers.add(id);
    }

    if (lineages.length === 0 && topHubs.length > 0) {
      for (const hub of topHubs) {
        lineages.push({
          id: randomUUID(),
          name: `Lineage: ${hub.title.substring(0, 50)}...`,
          paperIds: [hub.id],
          description: `High-impact paper with ${hub.citationCount} citations`,
        });
      }
    }

    res.json({
      nodes: nodesWithDepth,
      edges: uniqueEdges,
      seedPaperId: paperId,
      totalNodes: nodesWithDepth.length,
      totalEdges: uniqueEdges.length,
      lineages: lineages.slice(0, 5),
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to build citation graph");
    res.status(500).json({ error: "Failed to build citation graph" });
  }
});

// GET /graph/paper/:paperId/summary
router.get("/paper/:paperId/summary", async (req, res) => {
  try {
    const { paperId } = req.params;

    if (summaryCache.has(paperId!)) {
      const cached = summaryCache.get(paperId!)!;
      const [paper] = await db.select().from(papersTable).where(eq(papersTable.id, paperId!)).limit(1);
      res.json({ paperId, title: paper?.title ?? "", ...cached });
      return;
    }

    const [paper] = await db
      .select()
      .from(papersTable)
      .where(eq(papersTable.id, paperId!))
      .limit(1);

    if (!paper) {
      res.status(404).json({ error: "Paper not found" });
      return;
    }

    const prompt = `You are a scientific paper analyst. Given the following paper information, provide a concise analysis.

Title: ${paper.title}
Abstract: ${paper.abstract ?? "Not available"}
Year: ${paper.year ?? "Unknown"}
Citation Count: ${paper.citationCount ?? 0}
TLDR: ${paper.tldr ?? "Not available"}
Fields: ${(paper.fieldsOfStudy as string[])?.join(", ") ?? "Unknown"}

Respond in JSON format with these exact keys:
{
  "summary": "2-3 sentence summary of the paper's contribution",
  "keyContributions": ["contribution 1", "contribution 2", "contribution 3"],
  "methodology": "Brief description of methods used",
  "impact": "Assessment of scientific impact based on citations and field"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed: { summary?: string; keyContributions?: string[]; methodology?: string; impact?: string } = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const result = {
      summary: parsed.summary ?? "Summary not available.",
      keyContributions: parsed.keyContributions ?? [],
      methodology: parsed.methodology ?? "Not analyzed.",
      impact: parsed.impact ?? "Not analyzed.",
    };

    summaryCache.set(paperId!, result);

    res.json({ paperId, title: paper.title, ...result });
  } catch (err) {
    req.log?.error({ err }, "Failed to generate paper summary");
    res.status(500).json({ error: "Failed to generate paper summary" });
  }
});

export default router;
