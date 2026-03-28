import { logger } from "../logger.js";
import type { CollectedPaper } from "./semantic-scholar.js";

const BASE_URL = "https://api.openalex.org";
const RATE_LIMIT_MS = 500;
const EMAIL = process.env.OPENALEX_EMAIL ?? "";

interface OAWork {
  id: string;
  title?: string;
  abstract_inverted_index?: Record<string, number[]> | null;
  publication_year?: number;
  publication_date?: string;
  cited_by_count?: number;
  doi?: string;
  primary_location?: {
    source?: { display_name?: string };
    pdf_url?: string;
  };
  authorships?: Array<{
    author?: { id: string; display_name: string };
    institutions?: Array<{ display_name: string }>;
  }>;
  keywords?: Array<{ display_name: string }>;
  concepts?: Array<{ display_name: string; level: number }>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (res.status === 429) {
        const waitMs = 5000 * (attempt + 1);
        logger.warn({ url, attempt }, `OpenAlex rate limited, waiting ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error(`Failed after ${maxRetries} retries: ${url}`);
}

function reconstructAbstract(invertedIndex: Record<string, number[]> | null | undefined): string | null {
  if (!invertedIndex) return null;
  const wordPositions: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      wordPositions.push([pos, word]);
    }
  }
  wordPositions.sort((a, b) => a[0] - b[0]);
  return wordPositions.map(([, w]) => w).join(" ");
}

function mapOAWork(w: OAWork): CollectedPaper {
  const oaId = w.id?.replace("https://openalex.org/", "") ?? w.id;
  const keywords = [
    ...(w.keywords ?? []).map((k) => k.display_name),
    ...(w.concepts ?? []).filter((c) => c.level <= 2).map((c) => c.display_name),
  ].slice(0, 20);

  return {
    id: `oa_${oaId}`,
    semanticScholarId: null,
    openAlexId: oaId,
    doi: w.doi?.replace("https://doi.org/", "") ?? null,
    title: w.title?.trim() || "Untitled",
    abstract: reconstructAbstract(w.abstract_inverted_index),
    year: w.publication_year ?? null,
    publicationDate: w.publication_date ? new Date(w.publication_date) : null,
    citationCount: w.cited_by_count ?? 0,
    referenceCount: 0,
    influentialCitationCount: 0,
    venue: w.primary_location?.source?.display_name ?? null,
    journal: w.primary_location?.source?.display_name ?? null,
    fieldsOfStudy: [],
    keywords,
    tldr: null,
    url: w.id ?? null,
    pdfUrl: w.primary_location?.pdf_url ?? null,
    source: "open_alex",
    authors: (w.authorships ?? []).map((a) => ({
      id: `oa_author_${a.author?.id?.replace("https://openalex.org/", "") ?? "unknown"}`,
      name: a.author?.display_name ?? "Unknown",
    })),
  };
}

export async function collectFromOpenAlex(
  topic: string,
  limit: number,
  yearFrom?: number,
  yearTo?: number,
  onProgress?: (count: number) => void
): Promise<CollectedPaper[]> {
  const papers: CollectedPaper[] = [];
  const currentYear = new Date().getFullYear();
  const maxYear = yearTo ?? currentYear;
  const minYear = yearFrom ?? currentYear - 1; // Default to last 2 years

  const perPage = 100;
  let cursor = "*";

  // Sort by publication_date descending to get newest papers first
  while (papers.length < limit) {
    const remaining = limit - papers.length;
    const fetchSize = Math.min(perPage, remaining);
    const url =
      `${BASE_URL}/works?search=${encodeURIComponent(topic)}` +
      `&filter=publication_year:${minYear}-${maxYear},type:article` +
      `&select=id,title,abstract_inverted_index,publication_year,publication_date,cited_by_count,doi,primary_location,authorships,keywords,concepts` +
      `&per-page=${fetchSize}&cursor=${cursor}${EMAIL ? `&mailto=${EMAIL}` : ""}&sort=publication_date:desc`;

    logger.info({ url, collected: papers.length }, "Fetching from OpenAlex");

    const res = await fetchWithRetry(url);
    if (!res.ok) {
      logger.error({ status: res.status }, "OpenAlex API error");
      break;
    }

    const data = (await res.json()) as {
      results: OAWork[];
      meta: { next_cursor?: string; count?: number };
    };

    const batch = data.results ?? [];
    if (batch.length === 0) break;

    for (const w of batch) {
      if (w.title && w.id) {
        papers.push(mapOAWork(w));
      }
    }

    onProgress?.(papers.length);

    const nextCursor = data.meta?.next_cursor;
    if (!nextCursor) break;
    cursor = nextCursor;

    await sleep(RATE_LIMIT_MS);
  }

  return papers;
}
