import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { papersTable, authorsTable, paperAuthorsTable } from "@workspace/db";
import { eq, desc, asc, sql, and, gte, lte } from "drizzle-orm";
import { z } from "zod";

const ListPapersQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sortBy: z.enum(["citationCount", "year", "title", "influentialCitationCount"]).optional().default("citationCount"),
  year: z.coerce.number().int().optional(),
  topic: z.string().optional(),
  runId: z.string().uuid().optional(),
});

const router: IRouter = Router();

// GET /papers
router.get("/", async (req, res) => {
  try {
    const parsed = ListPapersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
      return;
    }
    const { limit, offset, sortBy, year, runId } = parsed.data;

    const conditions = [];
    if (year) {
      conditions.push(eq(papersTable.year, year));
    }
    if (runId) {
      conditions.push(eq(papersTable.collectionRunId, runId));
    }

    let orderCol;
    if (sortBy === "year") {
      orderCol = desc(papersTable.year);
    } else if (sortBy === "title") {
      orderCol = asc(papersTable.title);
    } else {
      orderCol = desc(papersTable.citationCount);
    }

    const papers = await db
      .select()
      .from(papersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderCol)
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(papersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({
      papers: papers.map((p) => ({
        ...p,
        citationCount: p.citationCount ?? 0,
        influentialCitationCount: p.influentialCitationCount ?? 0,
        keywords: p.keywords ?? [],
      })),
      total: Number(count),
      limit,
      offset,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to list papers" });
  }
});

// GET /papers/:id
router.get("/:id", async (req, res) => {
  try {
    const [paper] = await db
      .select()
      .from(papersTable)
      .where(eq(papersTable.id, req.params.id!))
      .limit(1);

    if (!paper) {
      res.status(404).json({ error: "Paper not found" });
      return;
    }

    // Get authors
    const authorRows = await db
      .select({ author: authorsTable })
      .from(paperAuthorsTable)
      .innerJoin(authorsTable, eq(paperAuthorsTable.authorId, authorsTable.id))
      .where(eq(paperAuthorsTable.paperId, paper.id))
      .orderBy(asc(paperAuthorsTable.position));

    res.json({
      ...paper,
      citationCount: paper.citationCount ?? 0,
      influentialCitationCount: paper.influentialCitationCount ?? 0,
      keywords: paper.keywords ?? [],
      authors: authorRows.map((r) => ({
        id: r.author.id,
        name: r.author.name,
        affiliations: r.author.affiliations ?? [],
        citationCount: r.author.citationCount ?? 0,
        paperCount: r.author.paperCount ?? 0,
        hIndex: r.author.hIndex ?? 0,
      })),
      references: [],
      citations: [],
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get paper" });
  }
});

export default router;
