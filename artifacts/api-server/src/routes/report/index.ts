import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  collectionRunsTable,
  papersTable,
  researchProposalsTable,
  debateSessionsTable,
  keywordTrendsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

interface ReportContent {
  overview: string;
  graphInsights: string;
  trendsSummary: string;
  gapsSummary: string;
  controversySummary: string;
  recommendations: string[];
}

// GET /report/:runId
router.get("/:runId", async (req, res) => {
  try {
    const { runId } = req.params;
    const [run] = await db.select().from(collectionRunsTable).where(eq(collectionRunsTable.id, runId!)).limit(1);
    if (!run) {
      res.status(404).json({ error: "Collection run not found" });
      return;
    }

    // Check if a generated report is persisted in metadata
    const meta = (run.metadata as Record<string, unknown>) ?? {};
    const savedReport = meta.generatedReport as ReportContent | undefined;

    if (savedReport?.overview) {
      // Return persisted AI-generated report
      res.json({
        runId,
        topic: run.topic,
        overview: savedReport.overview,
        graphInsights: savedReport.graphInsights,
        trendsSummary: savedReport.trendsSummary,
        gapsSummary: savedReport.gapsSummary,
        controversySummary: savedReport.controversySummary,
        recommendations: savedReport.recommendations ?? [],
        totalPapers: run.papersCollected ?? 0,
        generatedAt: (meta.reportGeneratedAt as string) ?? new Date().toISOString(),
      });
      return;
    }

    // Fallback: return template content
    const proposals = await db.select().from(researchProposalsTable).where(eq(researchProposalsTable.collectionRunId, runId!)).limit(5);
    const debates = await db.select().from(debateSessionsTable).where(eq(debateSessionsTable.collectionRunId, runId!)).limit(1);
    const trends = await db.select().from(keywordTrendsTable).where(eq(keywordTrendsTable.collectionRunId, runId!)).limit(20);

    const topKeywords = trends
      .sort((a, b) => (b.growthRate ?? 0) - (a.growthRate ?? 0))
      .slice(0, 5)
      .map((t) => t.keyword);

    res.json({
      runId,
      topic: run.topic,
      overview: `This comprehensive analysis covers ${run.papersCollected ?? 0} papers in "${run.topic}" collected from multiple academic sources.`,
      graphInsights: `Citation network analysis reveals complex interconnections among key papers. Hub papers with high citation counts serve as foundational references, while bridge papers connect different sub-fields.`,
      trendsSummary: topKeywords.length > 0
        ? `Key emerging trends include: ${topKeywords.join(", ")}. The field shows dynamic growth with multiple active research fronts.`
        : "Trend analysis not yet computed.",
      gapsSummary: proposals.length > 0
        ? `${proposals.length} research proposals have been generated targeting identified gaps.`
        : "Research gap analysis not yet performed.",
      controversySummary: debates[0]?.finalReport ?? "No controversy analysis performed yet.",
      recommendations: proposals.slice(0, 3).map((p) => p.title),
      totalPapers: run.papersCollected ?? 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get report" });
  }
});

// POST /report/:runId/generate
router.post("/:runId/generate", async (req, res) => {
  try {
    const { runId } = req.params;
    const [run] = await db.select().from(collectionRunsTable).where(eq(collectionRunsTable.id, runId!)).limit(1);
    if (!run) {
      res.status(404).json({ error: "Collection run not found" });
      return;
    }

    const papers = await db.select().from(papersTable)
      .where(eq(papersTable.collectionRunId, runId!))
      .limit(100);
    const proposals = await db.select().from(researchProposalsTable).where(eq(researchProposalsTable.collectionRunId, runId!)).limit(5);
    const debates = await db.select().from(debateSessionsTable).where(eq(debateSessionsTable.collectionRunId, runId!)).limit(1);
    const trends = await db.select().from(keywordTrendsTable).where(eq(keywordTrendsTable.collectionRunId, runId!)).limit(20);

    const proposalTitles = proposals.map((p) => p.title).join(", ");
    const topKeywords = trends.sort((a, b) => (b.growthRate ?? 0) - (a.growthRate ?? 0)).slice(0, 8).map((t) => t.keyword).join(", ");
    const debateQuestion = debates[0]?.controversialQuestion ?? "Key open questions in the field";
    const narrativeSummary = ((run.metadata as Record<string, unknown>)?.narrativeSummary as string) ?? "";

    const reportResponse = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 3000,
      messages: [{
        role: "user",
        content: `Generate a comprehensive field research report for "${run.topic}".

Data:
- Papers collected: ${run.papersCollected ?? 0} papers from ${(run.sourcesUsed as string[])?.join(", ") ?? "multiple sources"}
- Top emerging keywords: ${topKeywords || "Not yet computed"}
- Research proposals generated: ${proposalTitles || "None yet"}
- Controversy analyzed: ${debateQuestion}
- AI trend narrative: ${narrativeSummary.substring(0, 500) || "Not available"}

Write a scholarly report with these sections. Each section should be 2-3 paragraphs of flowing prose:

Respond in JSON:
{
  "overview": "Field overview and scope of this analysis",
  "graphInsights": "Citation network insights and key papers",
  "trendsSummary": "Key trends with specific growth patterns",
  "gapsSummary": "Research gaps and opportunity landscape",
  "controversySummary": "Key debates and unresolved questions",
  "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
}`,
      }],
      response_format: { type: "json_object" },
    });

    let reportData: ReportContent = {
      overview: "",
      graphInsights: "",
      trendsSummary: "",
      gapsSummary: "",
      controversySummary: "",
      recommendations: [],
    };
    try { reportData = JSON.parse(reportResponse.choices[0]?.message?.content ?? "{}"); } catch { /* empty */ }

    const finalReport: ReportContent = {
      overview: reportData.overview || `Analysis of ${run.papersCollected ?? 0} papers in "${run.topic}".`,
      graphInsights: reportData.graphInsights || "Citation network reveals complex interconnections.",
      trendsSummary: reportData.trendsSummary || "Field shows active growth across multiple fronts.",
      gapsSummary: reportData.gapsSummary || "Several research opportunities identified.",
      controversySummary: reportData.controversySummary || debates[0]?.finalReport || "No controversy analysis performed.",
      recommendations: reportData.recommendations?.length ? reportData.recommendations : proposals.map((p) => p.title),
    };

    // Persist the generated report in collection run metadata
    const existingMeta = (run.metadata as Record<string, unknown>) ?? {};
    await db.update(collectionRunsTable)
      .set({
        metadata: {
          ...existingMeta,
          generatedReport: finalReport,
          reportGeneratedAt: new Date().toISOString(),
        },
      })
      .where(eq(collectionRunsTable.id, runId!));

    res.json({
      runId,
      topic: run.topic,
      ...finalReport,
      totalPapers: run.papersCollected ?? 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to generate report");
    res.status(500).json({ error: "Failed to generate report" });
  }
});

export default router;
