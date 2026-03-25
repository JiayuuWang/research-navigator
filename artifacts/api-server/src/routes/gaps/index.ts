import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  papersTable,
  collectionRunsTable,
  researchGapsTable,
  researchProposalsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { batchProcess } from "@workspace/integrations-openai-ai-server/batch";
import { randomUUID } from "crypto";

const router: IRouter = Router();

// GET /gaps/:runId
router.get("/:runId", async (req, res) => {
  try {
    const { runId } = req.params;
    const gaps = await db
      .select()
      .from(researchGapsTable)
      .where(eq(researchGapsTable.collectionRunId, runId!))
      .orderBy(desc(researchGapsTable.noveltyScore));

    res.json({
      gaps: gaps.map((g) => ({
        ...g,
        supportingPaperIds: (g.supportingPaperIds as string[]) ?? [],
        noveltyScore: g.noveltyScore ?? 0,
        impactScore: g.impactScore ?? 0,
        feasibilityScore: g.feasibilityScore ?? 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get research gaps" });
  }
});

// POST /gaps/:runId/analyze
router.post("/:runId/analyze", async (req, res) => {
  try {
    const { runId } = req.params;

    const [run] = await db.select().from(collectionRunsTable).where(eq(collectionRunsTable.id, runId!)).limit(1);
    if (!run) {
      res.status(404).json({ error: "Collection run not found" });
      return;
    }

    const papers = await db.select().from(papersTable).limit(500);

    if (papers.length === 0) {
      res.json({ gaps: [], message: "No papers to analyze." });
      return;
    }

    // Build paper corpus summary
    const paperSummaries = papers
      .slice(0, 50)
      .map((p) => `- "${p.title}" (${p.year ?? "?"}): ${(p.abstract ?? "").substring(0, 200)}`)
      .join("\n");

    const allKeywords = papers
      .flatMap((p) => [...((p.keywords as string[]) ?? []), ...(p.title ?? "").toLowerCase().split(/\s+/)])
      .filter((k) => k.length > 4)
      .reduce((acc: Record<string, number>, k) => {
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});

    const topKeywords = Object.entries(allKeywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([k, c]) => `${k}(${c})`)
      .join(", ");

    // Generate gaps using GPT
    const gapResponse = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 4096,
      messages: [{
        role: "system",
        content: `You are a research gap analyst. Identify 5 specific, evidence-based research gaps in the field.`,
      }, {
        role: "user",
        content: `Research field: "${run.topic}"

Sample papers from the corpus (${papers.length} total):
${paperSummaries}

Top keywords by frequency: ${topKeywords}

Identify 5 distinct research gaps. Each gap must be:
1. Specific and data-driven (not generic)
2. Different from others (diverse gap types: methodology gap, application gap, theoretical gap, etc.)
3. Supported by evidence from the corpus

Respond in JSON:
{
  "gaps": [
    {
      "title": "Short title (max 10 words)",
      "description": "2-3 sentence description of the gap",
      "evidenceType": "topic_modeling|citation_network|method_problem_matrix",
      "supportingEvidence": "Specific evidence from the corpus showing this gap exists",
      "noveltyScore": 0-1,
      "impactScore": 0-1,
      "feasibilityScore": 0-1
    }
  ]
}`,
      }],
      response_format: { type: "json_object" },
    });

    const gapContent = gapResponse.choices[0]?.message?.content ?? "{}";
    let gapData: { gaps?: Array<{
      title: string;
      description: string;
      evidenceType: string;
      supportingEvidence: string;
      noveltyScore: number;
      impactScore: number;
      feasibilityScore: number;
    }> } = {};
    try { gapData = JSON.parse(gapContent); } catch { /* empty */ }

    // Clear existing gaps
    await db.delete(researchGapsTable).where(eq(researchGapsTable.collectionRunId, runId!));

    const insertedGaps = [];
    for (const g of gapData.gaps ?? []) {
      const gapId = randomUUID();
      const supportingPapers = papers
        .filter((p) => (p.title ?? "").toLowerCase().includes(g.title.toLowerCase().split(" ")[0]!))
        .slice(0, 5)
        .map((p) => p.id);

      await db.insert(researchGapsTable).values({
        id: gapId,
        collectionRunId: runId!,
        title: g.title,
        description: g.description,
        evidenceType: g.evidenceType,
        supportingPaperIds: supportingPapers,
        noveltyScore: g.noveltyScore,
        impactScore: g.impactScore,
        feasibilityScore: g.feasibilityScore,
        metadata: { supportingEvidence: g.supportingEvidence },
      });

      insertedGaps.push({ id: gapId, ...g, supportingPaperIds: supportingPapers });
    }

    res.json({
      gaps: insertedGaps.map((g) => ({
        ...g,
        noveltyScore: g.noveltyScore ?? 0,
        impactScore: g.impactScore ?? 0,
        feasibilityScore: g.feasibilityScore ?? 0,
      })),
      message: `Identified ${insertedGaps.length} research gaps`,
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to analyze research gaps");
    res.status(500).json({ error: "Failed to analyze research gaps" });
  }
});

// GET /proposals/:runId (proposals sub-route, handled in gaps router for simplicity)
router.get("/proposals/:runId", async (req, res) => {
  try {
    const { runId } = req.params;
    const proposals = await db
      .select()
      .from(researchProposalsTable)
      .where(eq(researchProposalsTable.collectionRunId, runId!))
      .orderBy(desc(researchProposalsTable.noveltyScore));

    res.json({
      proposals: proposals.map((p) => ({
        ...p,
        researchQuestions: (p.researchQuestions as string[]) ?? [],
        expectedContributions: (p.expectedContributions as string[]) ?? [],
        challenges: (p.challenges as string[]) ?? [],
        supportingPaperIds: (p.supportingPaperIds as string[]) ?? [],
        noveltyScore: p.noveltyScore ?? 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get proposals" });
  }
});

export default router;
