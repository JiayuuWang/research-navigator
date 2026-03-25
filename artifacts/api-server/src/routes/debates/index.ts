import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  debateSessionsTable,
  debateTurnsTable,
  collectionRunsTable,
  papersTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { randomUUID } from "crypto";
import { z } from "zod";

const RunIdParamsSchema = z.object({ runId: z.string().uuid() });

const router: IRouter = Router();

const DEBATE_ROLES = [
  {
    name: "Proponent",
    description: "Advocates for the mainstream consensus view with strong empirical support",
    perspective: "Defends the dominant paradigm using the most cited papers and replication studies",
  },
  {
    name: "Methodological Critic",
    description: "Questions research methodology and experimental design flaws",
    perspective: "Identifies weaknesses in experimental setups, statistical methods, and generalizability",
  },
  {
    name: "Empirical Analyst",
    description: "Focuses on quantitative evidence and meta-analyses",
    perspective: "Examines effect sizes, confidence intervals, and reproducibility across studies",
  },
  {
    name: "Synthesist",
    description: "Seeks to reconcile contradictory views and find common ground",
    perspective: "Proposes unified frameworks that accommodate diverse findings",
  },
];

// GET /debates/:runId
router.get("/:runId", async (req, res) => {
  try {
    const { runId } = req.params;
    const sessions = await db
      .select()
      .from(debateSessionsTable)
      .where(eq(debateSessionsTable.collectionRunId, runId!))
      .orderBy(desc(debateSessionsTable.createdAt));

    res.json({
      sessions: sessions.map((s) => ({
        ...s,
        subTopics: (s.subTopics as string[]) ?? [],
        roles: s.roles ?? [],
        consensusPoints: (s.consensusPoints as string[]) ?? [],
        disagreementPoints: (s.disagreementPoints as string[]) ?? [],
        openQuestions: (s.openQuestions as string[]) ?? [],
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get debate sessions" });
  }
});

// POST /debates/:runId/start
router.post("/:runId/start", async (req, res) => {
  try {
    const paramsParsed = RunIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      res.status(400).json({ error: "Invalid runId", details: paramsParsed.error.flatten() });
      return;
    }
    const { runId } = paramsParsed.data;

    const [run] = await db.select().from(collectionRunsTable).where(eq(collectionRunsTable.id, runId!)).limit(1);
    if (!run) {
      res.status(404).json({ error: "Collection run not found" });
      return;
    }

    const papers = await db.select().from(papersTable)
      .where(eq(papersTable.collectionRunId, runId!))
      .limit(300);

    // Identify controversial topic using GPT
    const paperTitles = papers.slice(0, 30).map((p) => `"${p.title}"`).join(", ");
    const controversyResponse = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1024,
      messages: [{
        role: "user",
        content: `Given a research corpus on "${run.topic}" with papers including: ${paperTitles}

Identify ONE specific controversial or debated question within this field. It should be a genuine scientific debate, not just an open problem.

Respond in JSON:
{
  "controversialQuestion": "The specific debated question",
  "subTopics": ["sub-debate 1", "sub-debate 2", "sub-debate 3", "sub-debate 4"],
  "rationale": "Why this is genuinely controversial in the field"
}`,
      }],
      response_format: { type: "json_object" },
    });

    let controversyData: { controversialQuestion?: string; subTopics?: string[]; rationale?: string } = {};
    try { controversyData = JSON.parse(controversyResponse.choices[0]?.message?.content ?? "{}"); } catch { /* empty */ }

    const sessionId = randomUUID();
    await db.insert(debateSessionsTable).values({
      id: sessionId,
      collectionRunId: runId!,
      topic: run.topic,
      controversialQuestion: controversyData.controversialQuestion ?? `What are the key debates in ${run.topic}?`,
      subTopics: controversyData.subTopics ?? [],
      roles: DEBATE_ROLES,
      status: "running",
    });

    // Run 3 rounds of debate
    const paperContext = papers
      .slice(0, 20)
      .map((p) => `"${p.title}" (${p.year ?? "?"}): ${(p.abstract ?? "").substring(0, 100)}`)
      .join("\n");

    const question = controversyData.controversialQuestion ?? `What are the key debates in ${run.topic}?`;
    const conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (let round = 1; round <= 3; round++) {
      for (const debateRole of DEBATE_ROLES) {
        const turnPrompt = round === 1
          ? `You are the ${debateRole.name} in a structured academic debate about: "${question}"

Your perspective: ${debateRole.perspective}

Relevant papers from the corpus:
${paperContext}

Round ${round}: Present your initial argument. Be specific, cite evidence, and make a compelling case. Write as an academic, not a bullet-point list.

Format your response as JSON:
{
  "content": "Your 2-3 paragraph argument (prose, not bullets)",
  "claims": [
    {"claim": "specific claim text", "evidenceStrength": "strong_empirical|indirect_inference|theoretical_speculation", "sourceIds": []}
  ]
}`
          : `You are the ${debateRole.name}. 

Previous arguments in this debate:
${conversationHistory.slice(-4).map((m) => m.content).join("\n\n")}

Round ${round}: Respond directly to the arguments made. Push back, refine your position, or acknowledge valid points. Show real intellectual engagement.

Format as JSON:
{
  "content": "Your response (2-3 paragraphs, prose)",
  "claims": [
    {"claim": "claim text", "evidenceStrength": "strong_empirical|indirect_inference|theoretical_speculation", "sourceIds": []}
  ]
}`;

        const turnResponse = await openai.chat.completions.create({
          model: "gpt-5.2",
          max_completion_tokens: 1024,
          messages: [...conversationHistory.slice(-6), { role: "user", content: turnPrompt }],
          response_format: { type: "json_object" },
        });

        const turnContent = turnResponse.choices[0]?.message?.content ?? "{}";
        let turnData: { content?: string; claims?: Array<{ claim: string; evidenceStrength: string; sourceIds: string[] }> } = {};
        try { turnData = JSON.parse(turnContent); } catch { /* empty */ }

        await db.insert(debateTurnsTable).values({
          id: randomUUID(),
          sessionId,
          round,
          role: debateRole.name,
          content: turnData.content ?? "Argument not generated.",
          claims: turnData.claims ?? [],
        });

        conversationHistory.push({
          role: "assistant",
          content: `[${debateRole.name}, Round ${round}]: ${turnData.content ?? ""}`,
        });
      }
    }

    // Generate final synthesis report
    const allTurns = await db.select().from(debateTurnsTable).where(eq(debateTurnsTable.sessionId, sessionId));
    const debateTranscript = allTurns.map((t) => `[${t.role}, Round ${t.round}]: ${t.content}`).join("\n\n");

    const synthesisResponse = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2048,
      messages: [{
        role: "user",
        content: `You are an editorial reviewer writing a commentary-style synthesis of a structured debate.

Debate question: "${question}"

Debate transcript:
${debateTranscript.substring(0, 6000)}

Write a synthesis report in the style of a high-quality scientific commentary. Include:
1. The argumentative arc (how the debate evolved)
2. Where strong evidence clearly supports one side
3. Where genuine uncertainty remains
4. Open questions the field needs to address

Respond in JSON:
{
  "report": "Full synthesis report as flowing prose (4-6 paragraphs)",
  "consensusPoints": ["point 1", "point 2", "point 3"],
  "disagreementPoints": ["disagreement 1", "disagreement 2"],
  "openQuestions": ["question 1", "question 2", "question 3"]
}`,
      }],
      response_format: { type: "json_object" },
    });

    let synthesisData: { report?: string; consensusPoints?: string[]; disagreementPoints?: string[]; openQuestions?: string[] } = {};
    try { synthesisData = JSON.parse(synthesisResponse.choices[0]?.message?.content ?? "{}"); } catch { /* empty */ }

    await db.update(debateSessionsTable)
      .set({
        status: "completed",
        finalReport: synthesisData.report ?? null,
        consensusPoints: synthesisData.consensusPoints ?? [],
        disagreementPoints: synthesisData.disagreementPoints ?? [],
        openQuestions: synthesisData.openQuestions ?? [],
        updatedAt: new Date(),
      })
      .where(eq(debateSessionsTable.id, sessionId));

    const [session] = await db.select().from(debateSessionsTable).where(eq(debateSessionsTable.id, sessionId)).limit(1);
    res.json({
      ...session,
      subTopics: (session?.subTopics as string[]) ?? [],
      roles: session?.roles ?? [],
      consensusPoints: (session?.consensusPoints as string[]) ?? [],
      disagreementPoints: (session?.disagreementPoints as string[]) ?? [],
      openQuestions: (session?.openQuestions as string[]) ?? [],
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to start debate");
    res.status(500).json({ error: "Failed to start debate" });
  }
});

// GET /debates/sessions/:sessionId/turns
router.get("/sessions/:sessionId/turns", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const turns = await db
      .select()
      .from(debateTurnsTable)
      .where(eq(debateTurnsTable.sessionId, sessionId!))
      .orderBy(debateTurnsTable.round, debateTurnsTable.createdAt);

    res.json({
      turns: turns.map((t) => ({
        ...t,
        claims: (t.claims as Array<{ claim: string; evidenceStrength: string; sourceIds: string[] }>) ?? [],
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get debate turns" });
  }
});

export default router;
