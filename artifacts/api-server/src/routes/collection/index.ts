import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { collectionRunsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { runCollectionPipeline } from "../../lib/collectors/pipeline.js";
import { z } from "zod";

const StartCollectionRequestSchema = z.object({
  topic: z.string().min(1),
  limit: z.number().int().positive().max(1000).optional().default(200),
  yearFrom: z.number().int().optional(),
  yearTo: z.number().int().optional(),
  sources: z.array(z.enum(["semantic_scholar", "open_alex"])).optional().default(["semantic_scholar", "open_alex"]),
});

const router: IRouter = Router();

// GET /collection/runs
router.get("/runs", async (_req, res) => {
  try {
    const runs = await db
      .select()
      .from(collectionRunsTable)
      .orderBy(desc(collectionRunsTable.startedAt))
      .limit(50);
    res.json({ runs });
  } catch (err) {
    res.status(500).json({ error: "Failed to list collection runs" });
  }
});

// POST /collection/runs
router.post("/runs", async (req, res) => {
  try {
    const body = StartCollectionRequestSchema.parse(req.body);

    // Start collection asynchronously
    const runPromise = runCollectionPipeline({
      topic: body.topic,
      limit: body.limit ?? 200,
      yearFrom: body.yearFrom,
      yearTo: body.yearTo,
      sources: (body.sources as Array<"semantic_scholar" | "open_alex">) ?? ["semantic_scholar", "open_alex"],
    });

    // Get the run ID immediately
    runPromise.catch((err) => {
      console.error("Collection pipeline failed:", err);
    });

    // Return the initial run record
    await new Promise((r) => setTimeout(r, 100)); // small delay for DB write
    const [run] = await db
      .select()
      .from(collectionRunsTable)
      .orderBy(desc(collectionRunsTable.startedAt))
      .limit(1);

    res.status(201).json(run);
  } catch (err: unknown) {
    res.status(400).json({ error: String(err) });
  }
});

// GET /collection/runs/:id
router.get("/runs/:id", async (req, res) => {
  try {
    const [run] = await db
      .select()
      .from(collectionRunsTable)
      .where(eq(collectionRunsTable.id, req.params.id!))
      .limit(1);

    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: "Failed to get collection run" });
  }
});

export default router;
