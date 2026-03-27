import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  papersTable,
  collectionRunsTable,
  authorsTable,
  paperAuthorsTable,
  keywordTrendsTable,
  clustersTable,
} from "@workspace/db";
import { eq, sql, desc, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { randomUUID } from "crypto";

const router: IRouter = Router();

function computeTfIdf(documents: string[][]): Map<string, number> {
  const N = documents.length;
  const tf = new Map<string, number>();
  const df = new Map<string, number>();

  for (const doc of documents) {
    const termSet = new Set<string>();
    for (const term of doc) {
      tf.set(term, (tf.get(term) ?? 0) + 1);
      termSet.add(term);
    }
    for (const term of termSet) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const tfidf = new Map<string, number>();
  for (const [term, freq] of tf) {
    const docFreq = df.get(term) ?? 1;
    tfidf.set(term, freq * Math.log((N + 1) / (docFreq + 1)));
  }
  return tfidf;
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "have", "has", "do", "does", "will", "would", "could", "should", "may",
    "can", "this", "that", "these", "those", "we", "our", "their", "its",
    "also", "using", "based", "proposed", "show", "paper", "results", "method",
    "approach", "model", "data", "use", "used", "new", "present", "work",
    "study", "research", "learning", "deep", "neural", "network", "networks",
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w));
}

async function getTopAuthors(runId: string, paperIds: string[]) {
  if (paperIds.length === 0) return [];

  const paperAuthorRows = await db
    .select({
      authorId: paperAuthorsTable.authorId,
      paperId: paperAuthorsTable.paperId,
    })
    .from(paperAuthorsTable)
    .where(inArray(paperAuthorsTable.paperId, paperIds.slice(0, 200)));

  if (paperAuthorRows.length === 0) return [];

  const authorPaperCount = new Map<string, number>();
  for (const row of paperAuthorRows) {
    authorPaperCount.set(row.authorId, (authorPaperCount.get(row.authorId) ?? 0) + 1);
  }

  const topAuthorIds = Array.from(authorPaperCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  if (topAuthorIds.length === 0) return [];

  const authors = await db
    .select()
    .from(authorsTable)
    .where(inArray(authorsTable.id, topAuthorIds));

  return authors.map((a) => ({
    id: a.id,
    name: a.name,
    paperCount: authorPaperCount.get(a.id) ?? 0,
    citationCount: a.citationCount ?? 0,
    hIndex: a.hIndex ?? 0,
    affiliations: (a.affiliations as string[]) ?? [],
  })).sort((a, b) => b.paperCount - a.paperCount);
}

async function getTopInstitutions(paperIds: string[]) {
  if (paperIds.length === 0) return [];

  // Fetch authors for all papers in this run
  const authorRows = await db
    .select({
      authorId: paperAuthorsTable.authorId,
      paperId: paperAuthorsTable.paperId,
    })
    .from(paperAuthorsTable)
    .where(inArray(paperAuthorsTable.paperId, paperIds.slice(0, 300)));

  if (authorRows.length === 0) return [];

  const authorIds = [...new Set(authorRows.map((r) => r.authorId))];
  if (authorIds.length === 0) return [];

  const authors = await db
    .select({ id: authorsTable.id, affiliations: authorsTable.affiliations, citationCount: authorsTable.citationCount })
    .from(authorsTable)
    .where(inArray(authorsTable.id, authorIds.slice(0, 200)));

  // Build a map: authorId -> paperIds
  const authorPapers = new Map<string, Set<string>>();
  for (const row of authorRows) {
    if (!authorPapers.has(row.authorId)) authorPapers.set(row.authorId, new Set());
    authorPapers.get(row.authorId)!.add(row.paperId);
  }

  // Aggregate by institution
  const instPapers = new Map<string, Set<string>>();
  const instCitations = new Map<string, number>();

  for (const author of authors) {
    const affs = (author.affiliations as string[] | null) ?? [];
    const papersForAuthor = authorPapers.get(author.id) ?? new Set();

    for (const aff of affs) {
      const inst = aff.trim();
      if (!inst || inst.length < 4) continue;

      if (!instPapers.has(inst)) instPapers.set(inst, new Set());
      for (const pid of papersForAuthor) {
        instPapers.get(inst)!.add(pid);
      }
      instCitations.set(inst, (instCitations.get(inst) ?? 0) + (author.citationCount ?? 0));
    }
  }

  return Array.from(instPapers.entries())
    .map(([institution, papers]) => ({
      institution,
      paperCount: papers.size,
      citationCount: instCitations.get(institution) ?? 0,
    }))
    .sort((a, b) => b.paperCount - a.paperCount || b.citationCount - a.citationCount)
    .slice(0, 10);
}

// GET /trends/:runId
router.get("/:runId", async (req, res) => {
  try {
    const { runId } = req.params;

    const [run] = await db.select().from(collectionRunsTable).where(eq(collectionRunsTable.id, runId!)).limit(1);
    if (!run) {
      res.status(404).json({ error: "Collection run not found" });
      return;
    }

    const [trends, clusters, papers] = await Promise.all([
      db.select().from(keywordTrendsTable).where(eq(keywordTrendsTable.collectionRunId, runId!)),
      db.select().from(clustersTable).where(eq(clustersTable.collectionRunId, runId!)),
      db.select({ id: papersTable.id }).from(papersTable).where(eq(papersTable.collectionRunId, runId!)),
    ]);

    const paperIds = papers.map((p) => p.id);

    if (trends.length === 0) {
      res.json({
        runId,
        topic: run.topic,
        keywordTrends: [],
        topAuthors: [],
        topInstitutions: [],
        clusters: [],
        narrativeSummary: "No trend analysis has been computed yet. Run /trends/:runId/compute first.",
        totalPapersAnalyzed: 0,
      });
      return;
    }

    const keywordMap = new Map<string, typeof trends>();
    for (const t of trends) {
      if (!keywordMap.has(t.keyword)) keywordMap.set(t.keyword, []);
      keywordMap.get(t.keyword)!.push(t);
    }

    const keywordTrendsSerialized = Array.from(keywordMap.entries())
      .map(([keyword, points]) => ({
        keyword,
        dataPoints: points
          .map((p) => ({ year: p.year, count: p.count ?? 0, tfidfScore: p.tfidfScore ?? 0 }))
          .sort((a, b) => a.year - b.year),
        growthRate: Math.max(...points.map((p) => p.growthRate ?? 0)),
        peakYear: points.reduce((a, b) => ((a.count ?? 0) > (b.count ?? 0) ? a : b)).year,
      }))
      .sort((a, b) => b.growthRate - a.growthRate)
      .slice(0, 20);

    const clustersSerialized = clusters.map((c) => ({
      id: c.id,
      label: c.label,
      keywords: (c.keywords as string[]) ?? [],
      paperCount: c.paperCount ?? 0,
      growthRate: c.growthRate ?? 0,
      description: c.description ?? "",
    }));

    const [topAuthors, topInstitutions] = await Promise.all([
      getTopAuthors(runId!, paperIds),
      getTopInstitutions(paperIds),
    ]);

    // Read narrative from DB metadata (persisted) or fall back to generic
    const narrativeSummary = (run.metadata as Record<string, unknown>)?.narrativeSummary as string
      ?? "Trend analysis complete.";

    res.json({
      runId,
      topic: run.topic,
      keywordTrends: keywordTrendsSerialized,
      topAuthors,
      topInstitutions,
      clusters: clustersSerialized,
      narrativeSummary,
      totalPapersAnalyzed: run.papersCollected ?? 0,
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to get trends");
    res.status(500).json({ error: "Failed to get trends" });
  }
});

// POST /trends/:runId/compute
router.post("/:runId/compute", async (req, res) => {
  try {
    const { runId } = req.params;

    const [run] = await db.select().from(collectionRunsTable).where(eq(collectionRunsTable.id, runId!)).limit(1);
    if (!run) {
      res.status(404).json({ error: "Collection run not found" });
      return;
    }

    const papers = await db.select().from(papersTable)
      .where(eq(papersTable.collectionRunId, runId!))
      .limit(1000);

    if (papers.length === 0) {
      res.json({
        runId,
        topic: run.topic,
        keywordTrends: [],
        topAuthors: [],
        topInstitutions: [],
        clusters: [],
        narrativeSummary: "No papers found to analyze.",
        totalPapersAnalyzed: 0,
      });
      return;
    }

    const paperIds = papers.map((p) => p.id);

    // Compute keyword trends per year
    const yearKeywords = new Map<number, string[]>();
    for (const paper of papers) {
      const year = paper.year;
      if (!year || year < 2018) continue;

      const tokens: string[] = [];
      if (paper.title) tokens.push(...extractKeywords(paper.title));
      if (paper.abstract) tokens.push(...extractKeywords(paper.abstract));
      const kw = paper.keywords as string[] ?? [];
      tokens.push(...kw.flatMap((k) => extractKeywords(k)));

      if (!yearKeywords.has(year)) yearKeywords.set(year, []);
      yearKeywords.get(year)!.push(...tokens);
    }

    const allYears = Array.from(yearKeywords.keys()).sort();
    const keywordsByYear = new Map<string, Map<number, number>>();

    for (const year of allYears) {
      const tokens = yearKeywords.get(year) ?? [];
      const counts = new Map<string, number>();
      for (const t of tokens) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      for (const [kw, count] of counts) {
        if (!keywordsByYear.has(kw)) keywordsByYear.set(kw, new Map());
        keywordsByYear.get(kw)!.set(year, count);
      }
    }

    const docs = allYears.map((y) => yearKeywords.get(y) ?? []);
    const tfidf = computeTfIdf(docs.length > 0 ? docs : [[]]);

    await db.delete(keywordTrendsTable).where(eq(keywordTrendsTable.collectionRunId, runId!));

    const topKeywords = Array.from(tfidf.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([kw]) => kw);

    for (const kw of topKeywords) {
      const yearCounts = keywordsByYear.get(kw) ?? new Map();
      const sortedYears = allYears.filter((y) => yearCounts.has(y));

      for (let i = 0; i < sortedYears.length; i++) {
        const year = sortedYears[i]!;
        const count = yearCounts.get(year) ?? 0;
        const prevCount = i > 0 ? (yearCounts.get(sortedYears[i - 1]!) ?? 0) : 0;
        const growthRate = prevCount > 0 ? (count - prevCount) / prevCount : 0;

        await db.insert(keywordTrendsTable).values({
          id: randomUUID(),
          collectionRunId: runId!,
          keyword: kw,
          year,
          count,
          tfidfScore: tfidf.get(kw) ?? 0,
          growthRate,
        }).onConflictDoNothing();
      }
    }

    // Cluster papers
    await db.delete(clustersTable).where(eq(clustersTable.collectionRunId, runId!));

    const clusterSeeds = topKeywords.slice(0, 8);
    const clusterInserts = [];
    for (const seedKw of clusterSeeds) {
      const clusterId = randomUUID();
      const related = topKeywords.filter((k) => k !== seedKw).slice(0, 4);

      const matchingPapers = papers.filter((p) => {
        const text = `${p.title ?? ""} ${p.abstract ?? ""}`.toLowerCase();
        return text.includes(seedKw);
      });

      const paperCount = matchingPapers.length;
      const recentCount = matchingPapers.filter((p) => (p.year ?? 0) >= 2023).length;
      const olderCount = matchingPapers.filter((p) => (p.year ?? 0) < 2023 && (p.year ?? 0) >= 2018).length;
      const growthRate = olderCount > 0 ? (recentCount - olderCount) / olderCount : recentCount > 0 ? 1.0 : 0;

      clusterInserts.push(
        db.insert(clustersTable).values({
          id: clusterId,
          collectionRunId: runId!,
          label: seedKw,
          keywords: [seedKw, ...related],
          paperCount,
          growthRate,
          description: `Research cluster around "${seedKw}" with ${paperCount} papers (${Math.round(growthRate * 100)}% growth)`,
        })
      );
    }
    await Promise.all(clusterInserts);

    // Generate AI narrative with statistical backing
    const topKws = topKeywords.slice(0, 10).join(", ");
    const growthStats = clusterSeeds.slice(0, 3).map((kw) => {
      const cnt = papers.filter((p) => `${p.title ?? ""} ${p.abstract ?? ""}`.toLowerCase().includes(kw)).length;
      return `${kw} (${cnt} papers)`;
    }).join(", ");

    // Compute statistical summaries for the prompt
    const recentPapers = papers.filter((p) => (p.year ?? 0) >= 2023);
    const olderPapers = papers.filter((p) => (p.year ?? 0) >= 2020 && (p.year ?? 0) < 2023);
    const fieldGrowthRate = olderPapers.length > 0
      ? ((recentPapers.length - olderPapers.length) / olderPapers.length * 100).toFixed(1)
      : "N/A";

    // Compute per-cluster growth with simple statistical significance
    const clusterStats = clusterSeeds.slice(0, 5).map((kw) => {
      const matchAll = papers.filter((p) => `${p.title ?? ""} ${p.abstract ?? ""}`.toLowerCase().includes(kw));
      const matchRecent = matchAll.filter((p) => (p.year ?? 0) >= 2023).length;
      const matchOlder = matchAll.filter((p) => (p.year ?? 0) >= 2020 && (p.year ?? 0) < 2023).length;
      const growth = matchOlder > 0 ? ((matchRecent - matchOlder) / matchOlder * 100).toFixed(0) : matchRecent > 0 ? "100+" : "0";
      // Simple chi-square-like significance estimate
      const expected = matchAll.length / 2;
      const chiSq = expected > 0 ? Math.pow(matchRecent - expected, 2) / expected : 0;
      const significant = chiSq > 3.84; // p < 0.05
      const pValue = significant ? (chiSq > 6.63 ? "p<0.01" : "p<0.05") : "n.s.";
      return `"${kw}": ${matchAll.length} papers total, ${growth}% growth recent vs 2020-2022, ${pValue}`;
    }).join("\n");

    const avgCitationsPerPaper = papers.length > 0
      ? (papers.reduce((s, p) => s + (p.citationCount ?? 0), 0) / papers.length).toFixed(1)
      : "0";

    const narrative = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 800,
      messages: [{
        role: "user",
        content: `Research field: "${run.topic}" (${papers.length} papers analyzed)
Top emerging keywords: ${topKws}
Leading clusters: ${growthStats}

Statistical context:
- Overall field growth: ${fieldGrowthRate}% (recent vs 2020-2022 period)
- Average citations per paper: ${avgCitationsPerPaper}
- Recent papers (2023+): ${recentPapers.length}, Older baseline (2020-2022): ${olderPapers.length}

Per-cluster statistics:
${clusterStats}

Write a 5-6 sentence trend analysis as a data-driven narrative. Requirements:
1. Include specific growth percentages with statistical significance markers (e.g., "grew 47% over the baseline period, significantly above the field average (p<0.05)")
2. Name the dominant research keywords and their trajectories
3. Identify 2-3 major research directions with quantitative backing
4. Use precise academic language — no jargon for jargon's sake
5. Ground every claim in the statistics provided
Format: plain text, no bullet points, no markdown.`,
      }],
    });

    const narrativeSummary = narrative.choices[0]?.message?.content ?? "Trend analysis completed.";

    // Persist narrative summary in collection run metadata
    const existingMeta = (run.metadata as Record<string, unknown>) ?? {};
    await db.update(collectionRunsTable)
      .set({ metadata: { ...existingMeta, narrativeSummary } })
      .where(eq(collectionRunsTable.id, runId!));

    const [trends, clusters] = await Promise.all([
      db.select().from(keywordTrendsTable).where(eq(keywordTrendsTable.collectionRunId, runId!)),
      db.select().from(clustersTable).where(eq(clustersTable.collectionRunId, runId!)),
    ]);

    const keywordMap = new Map<string, typeof trends>();
    for (const t of trends) {
      if (!keywordMap.has(t.keyword)) keywordMap.set(t.keyword, []);
      keywordMap.get(t.keyword)!.push(t);
    }

    const keywordTrendsSerialized = Array.from(keywordMap.entries())
      .map(([keyword, points]) => ({
        keyword,
        dataPoints: points
          .map((p) => ({ year: p.year, count: p.count ?? 0, tfidfScore: p.tfidfScore ?? 0 }))
          .sort((a, b) => a.year - b.year),
        growthRate: Math.max(...points.map((p) => p.growthRate ?? 0)),
        peakYear: points.reduce((a, b) => ((a.count ?? 0) > (b.count ?? 0) ? a : b)).year,
      }))
      .sort((a, b) => b.growthRate - a.growthRate)
      .slice(0, 20);

    const [topAuthors, topInstitutions] = await Promise.all([
      getTopAuthors(runId!, paperIds),
      getTopInstitutions(paperIds),
    ]);

    res.json({
      runId,
      topic: run.topic,
      keywordTrends: keywordTrendsSerialized,
      topAuthors,
      topInstitutions,
      clusters: clusters.map((c) => ({
        id: c.id,
        label: c.label,
        keywords: (c.keywords as string[]) ?? [],
        paperCount: c.paperCount ?? 0,
        growthRate: c.growthRate ?? 0,
        description: c.description ?? "",
      })),
      narrativeSummary,
      totalPapersAnalyzed: papers.length,
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to compute trends");
    res.status(500).json({ error: "Failed to compute trends" });
  }
});

export default router;
