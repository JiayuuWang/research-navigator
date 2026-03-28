import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { papersTable, citationsTable } from "@workspace/db";
import { eq, or, inArray, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { randomUUID } from "crypto";
import { fetchSSCitations, fetchSSReferences, fetchSSPaperById } from "../../lib/collectors/semantic-scholar.js";
import type { CollectedPaper } from "../../lib/collectors/semantic-scholar.js";
import { logger } from "../../lib/logger.js";

const router: IRouter = Router();

// In-memory cache for AI summaries
const summaryCache = new Map<string, { summary: string; keyContributions: string[]; methodology: string; impact: string }>();

const RATE_LIMIT_MS = 1200;
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

interface GraphNode {
  id: string;
  title: string;
  year: number | null;
  citationCount: number;
  influentialCitationCount: number;
  depth: number;
  isHub: boolean;
  isBridge: boolean;
  cluster: string | null;
  authors: string[];
}

interface GraphEdge {
  source: string;
  target: string;
  isInfluential: boolean;
}

/**
 * Try to build the graph from DB citations first.
 * If we get fewer than 5 nodes, fall back to live Semantic Scholar API expansion.
 */
async function buildGraphFromDB(
  seedId: string,
  depth: number,
  maxNodes: number
): Promise<{ nodeMap: Map<string, { id: string; title: string; year: number | null; citationCount: number; influentialCitationCount: number; fieldsOfStudy: string[] }>; edges: GraphEdge[] }> {
  const nodeMap = new Map<string, { id: string; title: string; year: number | null; citationCount: number; influentialCitationCount: number; fieldsOfStudy: string[] }>();
  const edges: GraphEdge[] = [];
  const visited = new Set<string>();
  const queue: Array<{ id: string; currentDepth: number }> = [{ id: seedId, currentDepth: 0 }];

  const [seed] = await db.select().from(papersTable).where(eq(papersTable.id, seedId)).limit(1);
  if (!seed) return { nodeMap, edges };

  nodeMap.set(seed.id, {
    id: seed.id,
    title: seed.title,
    year: seed.year,
    citationCount: seed.citationCount ?? 0,
    influentialCitationCount: seed.influentialCitationCount ?? 0,
    fieldsOfStudy: (seed.fieldsOfStudy as string[]) ?? [],
  });

  while (queue.length > 0 && nodeMap.size < maxNodes) {
    const item = queue.shift();
    if (!item) break;
    const { id: currentId, currentDepth } = item;
    if (visited.has(currentId) || currentDepth >= depth) continue;
    visited.add(currentId);

    const citationRows = await db
      .select()
      .from(citationsTable)
      .where(or(eq(citationsTable.citedPaperId, currentId), eq(citationsTable.citingPaperId, currentId)))
      .limit(50);

    const neighborIds: string[] = [];
    for (const row of citationRows) {
      edges.push({ source: row.citingPaperId, target: row.citedPaperId, isInfluential: row.isInfluential ?? false });
      const neighborId = row.citingPaperId === currentId ? row.citedPaperId : row.citingPaperId;
      if (!visited.has(neighborId) && !nodeMap.has(neighborId)) {
        neighborIds.push(neighborId);
      }
    }

    if (neighborIds.length > 0 && nodeMap.size < maxNodes) {
      const neighbors = await db.select().from(papersTable).where(inArray(papersTable.id, neighborIds.slice(0, 50)));
      for (const n of neighbors) {
        if (nodeMap.size >= maxNodes) break;
        nodeMap.set(n.id, {
          id: n.id,
          title: n.title,
          year: n.year,
          citationCount: n.citationCount ?? 0,
          influentialCitationCount: n.influentialCitationCount ?? 0,
          fieldsOfStudy: (n.fieldsOfStudy as string[]) ?? [],
        });
        if (currentDepth + 1 < depth) {
          queue.push({ id: n.id, currentDepth: currentDepth + 1 });
        }
      }
    }
  }

  return { nodeMap, edges };
}

/**
 * Build graph by live-fetching from Semantic Scholar API.
 * This is the fallback when DB citations are empty/sparse.
 */
async function buildGraphFromAPI(
  seedPaper: { id: string; semanticScholarId: string | null; title: string; year: number | null; citationCount: number; influentialCitationCount: number; fieldsOfStudy: unknown },
  depth: number,
  maxNodes: number,
  runId: string | null
): Promise<{ nodeMap: Map<string, { id: string; title: string; year: number | null; citationCount: number; influentialCitationCount: number; fieldsOfStudy: string[] }>; edges: GraphEdge[] }> {
  const nodeMap = new Map<string, { id: string; title: string; year: number | null; citationCount: number; influentialCitationCount: number; fieldsOfStudy: string[] }>();
  const edges: GraphEdge[] = [];
  const visited = new Set<string>();

  nodeMap.set(seedPaper.id, {
    id: seedPaper.id,
    title: seedPaper.title,
    year: seedPaper.year,
    citationCount: seedPaper.citationCount ?? 0,
    influentialCitationCount: seedPaper.influentialCitationCount ?? 0,
    fieldsOfStudy: (seedPaper.fieldsOfStudy as string[]) ?? [],
  });

  // Get all papers from same run so we can cross-reference
  let runPapers = new Map<string, { id: string; title: string; year: number | null; citationCount: number; influentialCitationCount: number; fieldsOfStudy: string[]; semanticScholarId: string | null }>();
  if (runId) {
    const papers = await db.select().from(papersTable).where(eq(papersTable.collectionRunId, runId)).limit(500);
    for (const p of papers) {
      runPapers.set(p.id, {
        id: p.id,
        title: p.title,
        year: p.year,
        citationCount: p.citationCount ?? 0,
        influentialCitationCount: p.influentialCitationCount ?? 0,
        fieldsOfStudy: (p.fieldsOfStudy as string[]) ?? [],
        semanticScholarId: p.semanticScholarId,
      });
    }
  }

  // BFS using Semantic Scholar API
  const queue: Array<{ id: string; ssId: string; currentDepth: number }> = [];

  if (seedPaper.semanticScholarId) {
    queue.push({ id: seedPaper.id, ssId: seedPaper.semanticScholarId, currentDepth: 0 });
  }

  // Also seed the BFS with top papers from the run
  const topRunPapers = Array.from(runPapers.values())
    .filter((p) => p.semanticScholarId && p.id !== seedPaper.id)
    .sort((a, b) => b.citationCount - a.citationCount)
    .slice(0, 8);

  for (const p of topRunPapers) {
    if (!nodeMap.has(p.id)) {
      nodeMap.set(p.id, {
        id: p.id,
        title: p.title,
        year: p.year,
        citationCount: p.citationCount,
        influentialCitationCount: p.influentialCitationCount,
        fieldsOfStudy: p.fieldsOfStudy,
      });
    }
    queue.push({ id: p.id, ssId: p.semanticScholarId!, currentDepth: 0 });
  }

  // Build a reverse map: ss_<ssId> -> paper.id for matching
  const ssIdToDbId = new Map<string, string>();
  for (const [dbId, p] of runPapers) {
    if (p.semanticScholarId) {
      ssIdToDbId.set(`ss_${p.semanticScholarId}`, dbId);
    }
  }

  while (queue.length > 0 && nodeMap.size < maxNodes) {
    const item = queue.shift();
    if (!item) break;
    const { id: currentId, ssId, currentDepth } = item;

    if (visited.has(ssId)) continue;
    visited.add(ssId);

    if (currentDepth >= depth) continue;

    try {
      // Fetch citations and references from Semantic Scholar
      const [citations, references] = await Promise.all([
        fetchSSCitations(ssId),
        fetchSSReferences(ssId),
      ]);

      const allRels = [...citations, ...references];

      for (const rel of allRels) {
        if (nodeMap.size >= maxNodes) break;

        // Map SS IDs back to DB paper IDs
        const citingDbId = ssIdToDbId.get(rel.citingPaperId) ?? rel.citingPaperId;
        const citedDbId = ssIdToDbId.get(rel.citedPaperId) ?? rel.citedPaperId;

        const neighborSsId = rel.citingPaperId === `ss_${ssId}` ? rel.citedPaperId : rel.citingPaperId;
        const neighborDbId = citingDbId === currentId ? citedDbId : citingDbId;
        const rawNeighborSsId = neighborSsId.replace(/^ss_/, "");

        edges.push({ source: citingDbId, target: citedDbId, isInfluential: rel.isInfluential });

        // Try to add neighbor to graph
        if (!nodeMap.has(neighborDbId)) {
          // Check if this paper is in our run corpus
          const runPaper = runPapers.get(neighborDbId);
          if (runPaper) {
            nodeMap.set(runPaper.id, {
              id: runPaper.id,
              title: runPaper.title,
              year: runPaper.year,
              citationCount: runPaper.citationCount,
              influentialCitationCount: runPaper.influentialCitationCount,
              fieldsOfStudy: runPaper.fieldsOfStudy,
            });
            if (currentDepth + 1 < depth && runPaper.semanticScholarId) {
              queue.push({ id: runPaper.id, ssId: runPaper.semanticScholarId, currentDepth: currentDepth + 1 });
            }
          } else {
            // Fetch the paper metadata from SS if not in our corpus
            try {
              const fetchedPaper = await fetchSSPaperById(rawNeighborSsId);
              if (fetchedPaper && nodeMap.size < maxNodes) {
                nodeMap.set(fetchedPaper.id, {
                  id: fetchedPaper.id,
                  title: fetchedPaper.title,
                  year: fetchedPaper.year,
                  citationCount: fetchedPaper.citationCount,
                  influentialCitationCount: fetchedPaper.influentialCitationCount,
                  fieldsOfStudy: fetchedPaper.fieldsOfStudy,
                });
                ssIdToDbId.set(neighborSsId, fetchedPaper.id);
                if (currentDepth + 1 < depth && fetchedPaper.semanticScholarId) {
                  queue.push({ id: fetchedPaper.id, ssId: fetchedPaper.semanticScholarId, currentDepth: currentDepth + 1 });
                }
              }
              await sleep(RATE_LIMIT_MS);
            } catch {
              // Skip papers that can't be fetched
            }
          }
        }
      }

      // Also persist citations we discover to the DB for future use
      for (const rel of allRels) {
        const citingDbId = ssIdToDbId.get(rel.citingPaperId) ?? rel.citingPaperId;
        const citedDbId = ssIdToDbId.get(rel.citedPaperId) ?? rel.citedPaperId;
        if (nodeMap.has(citingDbId) && nodeMap.has(citedDbId)) {
          try {
            await db.insert(citationsTable).values({
              id: randomUUID(),
              citingPaperId: citingDbId,
              citedPaperId: citedDbId,
              isInfluential: rel.isInfluential,
            }).onConflictDoNothing();
          } catch { /* ignore */ }
        }
      }

      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      logger.warn({ err, ssId }, "Failed to fetch citations from API");
    }
  }

  return { nodeMap, edges };
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

    // Try DB first
    let { nodeMap, edges } = await buildGraphFromDB(paperId!, depth, maxNodes);

    // If DB produced too few nodes, fall back to API-based expansion
    if (nodeMap.size < 5) {
      logger.info({ paperId, dbNodes: nodeMap.size }, "DB citations sparse, expanding via Semantic Scholar API");
      const apiResult = await buildGraphFromAPI({
        ...seed,
        citationCount: seed.citationCount ?? 0,
        influentialCitationCount: seed.influentialCitationCount ?? 0,
      }, depth, maxNodes, seed.collectionRunId);
      nodeMap = apiResult.nodeMap;
      edges = apiResult.edges;
    }

    // --- Shared graph analysis logic ---
    const nodesArray = Array.from(nodeMap.values());
    const citationCounts = nodesArray.map((n) => n.citationCount ?? 0);
    const sortedCounts = [...citationCounts].sort((a, b) => a - b);
    const medianCitations = sortedCounts[Math.floor(sortedCounts.length / 2)] ?? 0;

    // Compute in-degree
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    for (const e of edges) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
      outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1);
    }

    // Neighbor sets for bridge detection
    const neighborSets = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!neighborSets.has(e.source)) neighborSets.set(e.source, new Set());
      if (!neighborSets.has(e.target)) neighborSets.set(e.target, new Set());
      neighborSets.get(e.source)!.add(e.target);
      neighborSets.get(e.target)!.add(e.source);
    }

    const nodes: GraphNode[] = nodesArray.map((n) => {
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
        cluster: null,
        authors: [],
      };
    });

    // Compute depth per node from seed via BFS
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

    const nodesWithDepth = nodes.map((n) => ({
      ...n,
      depth: depthMap.get(n.id) ?? 1,
    }));

    // Deduplicate edges
    const edgeSet = new Set<string>();
    const uniqueEdges = edges.filter((e) => {
      // Only keep edges where both nodes are in the graph
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

    // Fallback lineages
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
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    const result = {
      summary: parsed.summary ?? "Summary not available.",
      keyContributions: parsed.keyContributions ?? [],
      methodology: parsed.methodology ?? "Not analyzed.",
      impact: parsed.impact ?? "Not analyzed.",
    };

    summaryCache.set(paperId!, result);

    res.json({
      paperId,
      title: paper.title,
      ...result,
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to generate paper summary");
    res.status(500).json({ error: "Failed to generate paper summary" });
  }
});

export default router;
