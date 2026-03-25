import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  papersTable,
  collectionRunsTable,
  authorsTable,
  paperAuthorsTable,
  keywordTrendsTable,
  clustersTable,
  paperClustersTable,
} from "@workspace/db";
import { eq, sql, desc, inArray, and } from "drizzle-orm";
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
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w));
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

    const trends = await db.select().from(keywordTrendsTable).where(eq(keywordTrendsTable.collectionRunId, runId!));
    const clusters = await db.select().from(clustersTable).where(eq(clustersTable.collectionRunId, runId!));

    if (trends.length === 0) {
      res.json({
        runId,
        topic: run.topic,
        keywordTrends: [],
        topAuthors: [],
        clusters: [],
        narrativeSummary: "No trend analysis has been computed yet. Run /trends/:runId/compute first.",
        totalPapersAnalyzed: 0,
      });
      return;
    }

    // Group keyword trends by keyword
    const keywordMap = new Map<string, typeof trends>();
    for (const t of trends) {
      if (!keywordMap.has(t.keyword)) keywordMap.set(t.keyword, []);
      keywordMap.get(t.keyword)!.push(t);
    }

    const keywordTrendsSerialized = Array.from(keywordMap.entries())
      .map(([keyword, points]) => ({
        keyword,
        dataPoints: points.map((p) => ({ year: p.year, count: p.count ?? 0, tfidfScore: p.tfidfScore ?? 0 })),
        growthRate: points[points.length - 1]?.growthRate ?? 0,
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

    res.json({
      runId,
      topic: run.topic,
      keywordTrends: keywordTrendsSerialized,
      topAuthors: [],
      clusters: clustersSerialized,
      narrativeSummary: "Trend analysis complete.",
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

    // Get papers for this run
    const papers = await db.select().from(papersTable)
      .where(eq(papersTable.collectionRunId, runId!))
      .limit(1000);

    if (papers.length === 0) {
      res.json({
        runId,
        topic: run.topic,
        keywordTrends: [],
        topAuthors: [],
        clusters: [],
        narrativeSummary: "No papers found to analyze.",
        totalPapersAnalyzed: 0,
      });
      return;
    }

    // Compute keyword trends per year
    const yearKeywords = new Map<number, string[]>();
    for (const paper of papers) {
      const year = paper.year;
      if (!year || year < 2020) continue;

      const tokens: string[] = [];
      if (paper.title) tokens.push(...extractKeywords(paper.title));
      if (paper.abstract) tokens.push(...extractKeywords(paper.abstract));
      const kw = paper.keywords as string[] ?? [];
      tokens.push(...kw.flatMap((k) => extractKeywords(k)));

      if (!yearKeywords.has(year)) yearKeywords.set(year, []);
      yearKeywords.get(year)!.push(...tokens);
    }

    // Aggregate keyword counts by year
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

    // Compute TF-IDF per keyword
    const docs = allYears.map((y) => yearKeywords.get(y) ?? []);
    const tfidf = computeTfIdf(docs);

    // Clear existing trends for this run
    await db.delete(keywordTrendsTable).where(eq(keywordTrendsTable.collectionRunId, runId!));

    // Get top keywords by TF-IDF
    const topKeywords = Array.from(tfidf.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([kw]) => kw);

    // Compute growth rates and persist
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

    // Simple clustering: group papers by keyword buckets (K=5)
    await db.delete(clustersTable).where(eq(clustersTable.collectionRunId, runId!));

    // Use top 5 keywords as cluster seeds
    const clusterSeeds = topKeywords.slice(0, 5);
    for (const seedKw of clusterSeeds) {
      const clusterId = randomUUID();
      const related = topKeywords.filter((k) => k !== seedKw).slice(0, 4);

      // Count papers mentioning this keyword
      const paperCount = papers.filter((p) => {
        const text = `${p.title ?? ""} ${p.abstract ?? ""}`.toLowerCase();
        return text.includes(seedKw);
      }).length;

      const recentCount = papers.filter((p) => {
        const text = `${p.title ?? ""} ${p.abstract ?? ""}`.toLowerCase();
        return text.includes(seedKw) && (p.year ?? 0) >= 2023;
      }).length;

      const olderCount = papers.filter((p) => {
        const text = `${p.title ?? ""} ${p.abstract ?? ""}`.toLowerCase();
        return text.includes(seedKw) && (p.year ?? 0) < 2023;
      }).length;

      const growthRate = olderCount > 0 ? (recentCount - olderCount) / olderCount : 0;

      await db.insert(clustersTable).values({
        id: clusterId,
        collectionRunId: runId!,
        label: seedKw,
        keywords: [seedKw, ...related],
        paperCount,
        growthRate,
        description: `Research cluster around "${seedKw}" with ${paperCount} papers`,
      });
    }

    // Generate AI narrative
    const topKws = topKeywords.slice(0, 10).join(", ");
    const narrative = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 512,
      messages: [{
        role: "user",
        content: `Given a research collection on "${run.topic}" with ${papers.length} papers, the top emerging keywords are: ${topKws}.

Write a 3-4 sentence trend analysis summary. Be specific, include growth trends, and use natural language. Mention specific numbers where possible.`,
      }],
    });

    const narrativeSummary = narrative.choices[0]?.message?.content ?? "Trend analysis completed.";

    // Fetch what we just wrote
    const trends = await db.select().from(keywordTrendsTable).where(eq(keywordTrendsTable.collectionRunId, runId!));
    const clusters = await db.select().from(clustersTable).where(eq(clustersTable.collectionRunId, runId!));

    const keywordMap = new Map<string, typeof trends>();
    for (const t of trends) {
      if (!keywordMap.has(t.keyword)) keywordMap.set(t.keyword, []);
      keywordMap.get(t.keyword)!.push(t);
    }

    const keywordTrendsSerialized = Array.from(keywordMap.entries())
      .map(([keyword, points]) => ({
        keyword,
        dataPoints: points.map((p) => ({ year: p.year, count: p.count ?? 0, tfidfScore: p.tfidfScore ?? 0 })),
        growthRate: Math.max(...points.map((p) => p.growthRate ?? 0)),
        peakYear: points.reduce((a, b) => ((a.count ?? 0) > (b.count ?? 0) ? a : b)).year,
      }))
      .sort((a, b) => b.growthRate - a.growthRate)
      .slice(0, 20);

    res.json({
      runId,
      topic: run.topic,
      keywordTrends: keywordTrendsSerialized,
      topAuthors: [],
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
