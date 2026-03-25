import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  researchGapsTable,
  researchProposalsTable,
  collectionRunsTable,
  papersTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { batchProcess } from "@workspace/integrations-openai-ai-server/batch";
import { randomUUID } from "crypto";

const router: IRouter = Router();

// GET /proposals/:runId
router.get("/:runId", async (req, res) => {
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

// POST /proposals/:runId/generate
router.post("/:runId/generate", async (req, res) => {
  try {
    const { runId } = req.params;

    const [run] = await db.select().from(collectionRunsTable).where(eq(collectionRunsTable.id, runId!)).limit(1);
    if (!run) {
      res.status(404).json({ error: "Collection run not found" });
      return;
    }

    const gaps = await db.select().from(researchGapsTable).where(eq(researchGapsTable.collectionRunId, runId!));
    if (gaps.length === 0) {
      res.json({ proposals: [], message: "No research gaps found. Run gap analysis first." });
      return;
    }

    const papers = await db.select().from(papersTable).limit(200);
    const paperIndex = new Map(papers.map((p) => [p.id, p]));

    // Clear existing proposals
    await db.delete(researchProposalsTable).where(eq(researchProposalsTable.collectionRunId, runId!));

    // Generate proposals for each gap using batch processing
    const results = await batchProcess(
      gaps.slice(0, 5),
      async (gap) => {
        const supportingPapers = (gap.supportingPaperIds as string[]).map((id) => paperIndex.get(id)).filter(Boolean);
        const paperContext = supportingPapers
          .slice(0, 5)
          .map((p) => `- "${p!.title}" (${p!.year ?? "?"}): ${(p!.abstract ?? "").substring(0, 150)}`)
          .join("\n");

        const response = await openai.chat.completions.create({
          model: "gpt-5.2",
          max_completion_tokens: 2048,
          messages: [{
            role: "system",
            content: `You are a research proposal writer. Generate a concise, professional one-page research proposal. Write as if submitting to a top-tier funding body.`,
          }, {
            role: "user",
            content: `Research field: "${run.topic}"
Research gap: "${gap.title}"
Gap description: "${gap.description}"

Supporting papers:
${paperContext || "General corpus of papers on " + run.topic}

Generate a structured research proposal in JSON format:
{
  "title": "Compelling proposal title",
  "motivation": "2-3 sentences explaining why this research is critical now",
  "researchQuestions": ["RQ1: ...", "RQ2: ...", "RQ3: ..."],
  "methodology": "3-4 sentences describing the research methodology and approach",
  "expectedContributions": ["Contribution 1", "Contribution 2", "Contribution 3"],
  "challenges": ["Challenge 1", "Challenge 2"],
  "noveltyScore": 0.0-1.0,
  "noveltyExplanation": "1-2 sentences explaining the novelty score based on distinctness from existing work"
}`,
          }],
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content ?? "{}";
        let parsed: {
          title?: string;
          motivation?: string;
          researchQuestions?: string[];
          methodology?: string;
          expectedContributions?: string[];
          challenges?: string[];
          noveltyScore?: number;
          noveltyExplanation?: string;
        } = {};
        try { parsed = JSON.parse(content); } catch { /* empty */ }

        const proposalId = randomUUID();
        await db.insert(researchProposalsTable).values({
          id: proposalId,
          gapId: gap.id,
          collectionRunId: runId!,
          title: parsed.title ?? `Proposal for: ${gap.title}`,
          motivation: parsed.motivation ?? gap.description,
          researchQuestions: parsed.researchQuestions ?? [],
          methodology: parsed.methodology ?? "Not specified",
          expectedContributions: parsed.expectedContributions ?? [],
          challenges: parsed.challenges ?? [],
          noveltyScore: parsed.noveltyScore ?? 0.5,
          noveltyExplanation: parsed.noveltyExplanation ?? null,
          supportingPaperIds: gap.supportingPaperIds,
          rawText: content,
        });

        return { id: proposalId, gapId: gap.id, ...parsed };
      },
      { concurrency: 2, retries: 3 }
    );

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
      message: `Generated ${proposals.length} research proposals`,
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to generate proposals");
    res.status(500).json({ error: "Failed to generate proposals" });
  }
});

export default router;
