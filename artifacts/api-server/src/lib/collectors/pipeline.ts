import { db } from "@workspace/db";
import {
  papersTable,
  authorsTable,
  paperAuthorsTable,
  collectionRunsTable,
  citationsTable,
} from "@workspace/db";
import { eq, or, inArray } from "drizzle-orm";
import { collectFromSemanticScholar, fetchSSCitations, fetchSSReferences } from "./semantic-scholar.js";
import type { CollectedPaper } from "./semantic-scholar.js";
import { collectFromOpenAlex } from "./open-alex.js";
import { logger } from "../logger.js";
import { randomUUID } from "crypto";

export interface PipelineOptions {
  topic: string;
  limit?: number;
  yearFrom?: number;
  yearTo?: number;
  sources?: Array<"semantic_scholar" | "open_alex">;
}

export interface PipelineResult {
  runId: string;
  papersCollected: number;
  papersSkipped: number;
  papersDeduplicated: number;
  topic: string;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

async function deduplicatePapers(papers: CollectedPaper[]): Promise<{
  unique: CollectedPaper[];
  duplicates: number;
}> {
  const seen = new Map<string, boolean>();
  const unique: CollectedPaper[] = [];
  let duplicates = 0;

  for (const p of papers) {
    // Dedup by DOI first
    if (p.doi) {
      if (seen.has(`doi:${p.doi}`)) {
        duplicates++;
        continue;
      }
      seen.set(`doi:${p.doi}`, true);
    }

    // Dedup by normalized title
    const key = `title:${normalizeTitle(p.title)}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.set(key, true);
    unique.push(p);
  }

  return { unique, duplicates };
}

async function persistPaper(paper: CollectedPaper, runId?: string): Promise<boolean> {
  try {
    // Check if already exists
    const existing = await db
      .select({ id: papersTable.id })
      .from(papersTable)
      .where(
        or(
          paper.semanticScholarId
            ? eq(papersTable.semanticScholarId, paper.semanticScholarId)
            : undefined,
          paper.openAlexId
            ? eq(papersTable.openAlexId, paper.openAlexId)
            : undefined
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return false; // Already exists, skip
    }

    await db.insert(papersTable).values({
      id: paper.id,
      semanticScholarId: paper.semanticScholarId,
      openAlexId: paper.openAlexId,
      doi: paper.doi,
      title: paper.title,
      abstract: paper.abstract,
      year: paper.year,
      publicationDate: paper.publicationDate,
      citationCount: paper.citationCount,
      referenceCount: paper.referenceCount,
      influentialCitationCount: paper.influentialCitationCount,
      venue: paper.venue,
      journal: paper.journal,
      fieldsOfStudy: paper.fieldsOfStudy,
      keywords: paper.keywords,
      tldr: paper.tldr,
      url: paper.url,
      pdfUrl: paper.pdfUrl,
      source: paper.source,
      collectionRunId: runId ?? null,
    }).onConflictDoNothing();

    // Persist authors
    for (const [i, author] of paper.authors.entries()) {
      await db.insert(authorsTable).values({
        id: author.id,
        name: author.name,
        affiliations: [],
      }).onConflictDoNothing();

      await db.insert(paperAuthorsTable).values({
        paperId: paper.id,
        authorId: author.id,
        position: i,
      }).onConflictDoNothing();
    }

    return true;
  } catch (err) {
    logger.error({ err, paperId: paper.id }, "Failed to persist paper");
    return false;
  }
}

export async function runCollectionPipeline(
  options: PipelineOptions,
  onProgress?: (msg: string, count: number) => void
): Promise<PipelineResult> {
  const {
    topic,
    limit = 200,
    yearFrom,
    yearTo,
    sources = ["semantic_scholar", "open_alex"],
  } = options;

  const runId = randomUUID();

  // Create collection run record
  await db.insert(collectionRunsTable).values({
    id: runId,
    topic,
    status: "running",
    sourcesUsed: sources,
    papersCollected: 0,
    papersSkipped: 0,
    papersDeduplicated: 0,
  });

  logger.info({ runId, topic, limit, sources }, "Collection pipeline started");

  try {
    const allPapers: CollectedPaper[] = [];
    const perSource = Math.ceil(limit / sources.length);

    // Collect from each source
    for (const source of sources) {
      onProgress?.(`Collecting from ${source}...`, allPapers.length);
      try {
        let collected: CollectedPaper[] = [];
        if (source === "semantic_scholar") {
          collected = await collectFromSemanticScholar(
            topic,
            perSource,
            yearFrom,
            yearTo,
            (count) => onProgress?.(`Semantic Scholar: ${count} papers collected`, count)
          );
        } else if (source === "open_alex") {
          const { collectFromOpenAlex } = await import("./open-alex.js");
          collected = await collectFromOpenAlex(
            topic,
            perSource,
            yearFrom,
            yearTo,
            (count) => onProgress?.(`OpenAlex: ${count} papers collected`, count)
          );
        }
        allPapers.push(...collected);
        logger.info({ source, count: collected.length }, "Source collection complete");
      } catch (err) {
        logger.error({ err, source }, "Failed to collect from source");
      }
    }

    onProgress?.("Deduplicating papers...", allPapers.length);
    const { unique, duplicates } = await deduplicatePapers(allPapers);

    logger.info({ total: allPapers.length, unique: unique.length, duplicates }, "Dedup complete");

    // Persist unique papers
    let persisted = 0;
    let skipped = 0;

    for (const paper of unique) {
      const saved = await persistPaper(paper, runId);
      if (saved) {
        persisted++;
      } else {
        skipped++;
      }

      if (persisted % 25 === 0) {
        onProgress?.(`Persisting papers: ${persisted} saved, ${skipped} skipped`, persisted);
      }
    }

    // Update run record
    await db.update(collectionRunsTable)
      .set({
        status: "completed",
        papersCollected: persisted,
        papersSkipped: skipped,
        papersDeduplicated: duplicates,
        completedAt: new Date(),
      })
      .where(eq(collectionRunsTable.id, runId));

    logger.info({ runId, persisted, skipped, duplicates }, "Collection pipeline complete");

    // Collect citation relationships asynchronously (best-effort, don't block completion)
    collectCitationRelationships(runId, unique).catch((err) => {
      logger.error({ err, runId }, "Citation collection failed (non-fatal)");
    });

    return {
      runId,
      papersCollected: persisted,
      papersSkipped: skipped,
      papersDeduplicated: duplicates,
      topic,
    };
  } catch (err) {
    await db.update(collectionRunsTable)
      .set({
        status: "failed",
        errorMessage: String(err),
        completedAt: new Date(),
      })
      .where(eq(collectionRunsTable.id, runId));

    throw err;
  }
}

/**
 * Collect citation relationships for papers that have Semantic Scholar IDs.
 * This runs after the main pipeline completes so the user sees "completed" quickly.
 * We fetch citations and references for the top papers by citation count.
 */
async function collectCitationRelationships(
  runId: string,
  papers: CollectedPaper[]
): Promise<void> {
  // Only process papers that came from Semantic Scholar (have SS IDs)
  const ssPapers = papers
    .filter((p) => p.semanticScholarId)
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));

  // Collect all paper IDs in this run for cross-referencing
  const allPaperIds = new Set(papers.map((p) => p.id));
  const allSSIds = new Set(ssPapers.map((p) => p.semanticScholarId!));

  // Fetch citations for top papers (limit to avoid excessive API calls)
  const topPapers = ssPapers.slice(0, 30);
  let citationCount = 0;

  for (const paper of topPapers) {
    try {
      const ssId = paper.semanticScholarId!;

      // Fetch both citations (papers that cite this one) and references (papers this one cites)
      const [citations, references] = await Promise.all([
        fetchSSCitations(ssId),
        fetchSSReferences(ssId),
      ]);

      const allRelations = [...citations, ...references];

      for (const rel of allRelations) {
        // Only store citations between papers in our corpus
        if (allPaperIds.has(rel.citingPaperId) && allPaperIds.has(rel.citedPaperId)) {
          try {
            await db.insert(citationsTable).values({
              id: randomUUID(),
              citingPaperId: rel.citingPaperId,
              citedPaperId: rel.citedPaperId,
              isInfluential: rel.isInfluential,
            }).onConflictDoNothing();
            citationCount++;
          } catch {
            // Ignore individual insertion errors
          }
        }
      }

      // Rate limit between papers
      await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
      logger.warn({ err, paperId: paper.id }, "Failed to fetch citations for paper");
    }
  }

  logger.info({ runId, citationCount, papersProcessed: topPapers.length }, "Citation collection complete");
}
