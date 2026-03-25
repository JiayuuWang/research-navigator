import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { papersTable, citationsTable, paperAuthorsTable, authorsTable } from "@workspace/db";
import { eq, or, inArray, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { randomUUID } from "crypto";

const router: IRouter = Router();

// In-memory cache for AI summaries
const summaryCache = new Map<string, { summary: string; keyContributions: string[]; methodology: string; impact: string }>();

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

    // BFS to build citation graph
    const nodeMap = new Map<string, typeof seed>();
    const edges: Array<{ source: string; target: string; isInfluential: boolean }> = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; currentDepth: number }> = [{ id: paperId!, currentDepth: 0 }];
    nodeMap.set(seed.id, seed);

    while (queue.length > 0 && nodeMap.size < maxNodes) {
      const item = queue.shift();
      if (!item) break;
      const { id: currentId, currentDepth } = item;

      if (visited.has(currentId) || currentDepth >= depth) continue;
      visited.add(currentId);

      // Fetch citations where this paper is cited
      const citationRows = await db
        .select()
        .from(citationsTable)
        .where(or(eq(citationsTable.citedPaperId, currentId), eq(citationsTable.citingPaperId, currentId)))
        .limit(50);

      const neighborIds: string[] = [];
      for (const row of citationRows) {
        edges.push({
          source: row.citingPaperId,
          target: row.citedPaperId,
          isInfluential: row.isInfluential ?? false,
        });
        const neighborId = row.citingPaperId === currentId ? row.citedPaperId : row.citingPaperId;
        if (!visited.has(neighborId) && !nodeMap.has(neighborId)) {
          neighborIds.push(neighborId);
        }
      }

      if (neighborIds.length > 0 && nodeMap.size < maxNodes) {
        const neighbors = await db
          .select()
          .from(papersTable)
          .where(inArray(papersTable.id, neighborIds.slice(0, 30)));

        for (const n of neighbors) {
          if (nodeMap.size >= maxNodes) break;
          nodeMap.set(n.id, n);
          if (currentDepth + 1 < depth) {
            queue.push({ id: n.id, currentDepth: currentDepth + 1 });
          }
        }
      }
    }

    const nodesArray = Array.from(nodeMap.values());
    const citationCounts = nodesArray.map((n) => n.citationCount ?? 0);
    const maxCitations = Math.max(...citationCounts, 1);
    const medianCitations = citationCounts.sort((a, b) => a - b)[Math.floor(citationCounts.length / 2)] ?? 0;

    // Compute hub scores (in-degree in edges)
    const inDegree = new Map<string, number>();
    for (const e of edges) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }

    // Detect bridges (nodes with diverse connections)
    const neighborSets = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!neighborSets.has(e.source)) neighborSets.set(e.source, new Set());
      if (!neighborSets.has(e.target)) neighborSets.set(e.target, new Set());
      neighborSets.get(e.source)!.add(e.target);
      neighborSets.get(e.target)!.add(e.source);
    }

    const nodes = nodesArray.map((n) => {
      const cit = n.citationCount ?? 0;
      const degree = inDegree.get(n.id) ?? 0;
      const isHub = cit > medianCitations * 3 || degree > 5;
      const neighbors = neighborSets.get(n.id) ?? new Set();
      const isBridge = neighbors.size >= 3 && (n.fieldsOfStudy as string[])?.length > 1;

      return {
        id: n.id,
        title: n.title,
        year: n.year,
        citationCount: cit,
        influentialCitationCount: n.influentialCitationCount ?? 0,
        depth: 0, // Will be computed below
        isHub,
        isBridge,
        cluster: null as string | null,
        authors: [],
      };
    });

    // Compute depth per node from seed
    const depthMap = new Map<string, number>();
    depthMap.set(paperId!, 0);
    const bfsQ: string[] = [paperId!];
    while (bfsQ.length > 0) {
      const curr = bfsQ.shift()!;
      const currDepth = depthMap.get(curr) ?? 0;
      for (const e of edges) {
        const neighbor = e.source === curr ? e.target : e.source === curr ? e.target : null;
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

    // Identify key lineages (top cited paths)
    const lineages = [];
    const topHubs = nodesWithDepth
      .filter((n) => n.isHub)
      .sort((a, b) => b.citationCount - a.citationCount)
      .slice(0, 5);

    for (const hub of topHubs) {
      lineages.push({
        id: randomUUID(),
        name: `Lineage: ${hub.title.substring(0, 50)}...`,
        paperIds: [hub.id],
        description: `High-impact paper with ${hub.citationCount} citations`,
      });
    }

    // Deduplicate edges
    const edgeSet = new Set<string>();
    const uniqueEdges = edges.filter((e) => {
      const key = `${e.source}:${e.target}`;
      if (edgeSet.has(key)) return false;
      edgeSet.add(key);
      return true;
    });

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
