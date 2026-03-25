import { logger } from "../logger.js";

const BASE_URL = "https://api.semanticscholar.org/graph/v1";
const RATE_LIMIT_MS = 1100;

interface SSPaper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  citationCount?: number;
  referenceCount?: number;
  influentialCitationCount?: number;
  venue?: string;
  externalIds?: { DOI?: string };
  authors?: Array<{ authorId: string; name: string }>;
  publicationDate?: string;
  tldr?: { text: string } | null;
  fieldsOfStudy?: string[];
  openAccessPdf?: { url: string } | null;
  url?: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "Accept": "application/json" },
      });
      if (res.status === 429) {
        const waitMs = 5000 * (attempt + 1);
        logger.warn({ url, attempt }, `Rate limited, waiting ${waitMs}ms`);
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

export interface CollectedPaper {
  id: string;
  semanticScholarId: string | null;
  openAlexId: string | null;
  doi: string | null;
  title: string;
  abstract: string | null;
  year: number | null;
  publicationDate: Date | null;
  citationCount: number;
  referenceCount: number;
  influentialCitationCount: number;
  venue: string | null;
  journal: string | null;
  fieldsOfStudy: string[];
  keywords: string[];
  tldr: string | null;
  url: string | null;
  pdfUrl: string | null;
  source: string;
  authors: Array<{ id: string; name: string }>;
}

function mapSSPaper(p: SSPaper): CollectedPaper {
  const ssId = p.paperId;
  return {
    id: `ss_${ssId}`,
    semanticScholarId: ssId,
    openAlexId: null,
    doi: p.externalIds?.DOI ?? null,
    title: p.title?.trim() || "Untitled",
    abstract: p.abstract?.trim() || null,
    year: p.year ?? null,
    publicationDate: p.publicationDate ? new Date(p.publicationDate) : null,
    citationCount: p.citationCount ?? 0,
    referenceCount: p.referenceCount ?? 0,
    influentialCitationCount: p.influentialCitationCount ?? 0,
    venue: p.venue?.trim() || null,
    journal: p.venue?.trim() || null,
    fieldsOfStudy: p.fieldsOfStudy ?? [],
    keywords: [],
    tldr: p.tldr?.text ?? null,
    url: p.url ?? null,
    pdfUrl: p.openAccessPdf?.url ?? null,
    source: "semantic_scholar",
    authors: (p.authors ?? []).map((a) => ({ id: `ss_author_${a.authorId}`, name: a.name })),
  };
}

const FIELDS = [
  "paperId",
  "title",
  "abstract",
  "year",
  "citationCount",
  "referenceCount",
  "influentialCitationCount",
  "venue",
  "externalIds",
  "authors",
  "publicationDate",
  "tldr",
  "fieldsOfStudy",
  "openAccessPdf",
  "url",
].join(",");

export async function collectFromSemanticScholar(
  topic: string,
  limit: number,
  yearFrom?: number,
  yearTo?: number,
  onProgress?: (count: number) => void
): Promise<CollectedPaper[]> {
  const papers: CollectedPaper[] = [];
  let offset = 0;
  const pageSize = 100;
  const maxYear = yearTo ?? new Date().getFullYear();
  const minYear = yearFrom ?? maxYear - 2;

  while (papers.length < limit) {
    const remaining = limit - papers.length;
    const fetchSize = Math.min(pageSize, remaining);
    const url = `${BASE_URL}/paper/search?query=${encodeURIComponent(topic)}&fields=${FIELDS}&offset=${offset}&limit=${fetchSize}&year=${minYear}-${maxYear}`;

    logger.info({ url, offset, collected: papers.length }, "Fetching from Semantic Scholar");

    const res = await fetchWithRetry(url);
    if (!res.ok) {
      logger.error({ status: res.status }, "Semantic Scholar API error");
      break;
    }

    const data = (await res.json()) as { data: SSPaper[]; next?: number; total?: number };
    const batch = data.data ?? [];
    if (batch.length === 0) break;

    for (const p of batch) {
      if (p.title && p.paperId) {
        papers.push(mapSSPaper(p));
      }
    }

    onProgress?.(papers.length);
    offset += batch.length;

    if (!data.next || offset >= (data.total ?? Infinity)) break;
    await sleep(RATE_LIMIT_MS);
  }

  return papers;
}

export async function fetchSSCitations(
  paperId: string
): Promise<Array<{ citingPaperId: string; citedPaperId: string; isInfluential: boolean }>> {
  const url = `${BASE_URL}/paper/${paperId}/citations?fields=paperId,isInfluential&limit=500`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return [];

  const data = (await res.json()) as {
    data: Array<{ citingPaper?: { paperId: string }; isInfluential?: boolean }>;
  };

  return (data.data ?? []).map((c) => ({
    citingPaperId: `ss_${c.citingPaper?.paperId}`,
    citedPaperId: `ss_${paperId}`,
    isInfluential: c.isInfluential ?? false,
  }));
}

export async function fetchSSReferences(
  paperId: string
): Promise<Array<{ citingPaperId: string; citedPaperId: string; isInfluential: boolean }>> {
  const url = `${BASE_URL}/paper/${paperId}/references?fields=paperId,isInfluential&limit=500`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return [];

  const data = (await res.json()) as {
    data: Array<{ citedPaper?: { paperId: string }; isInfluential?: boolean }>;
  };

  return (data.data ?? []).map((r) => ({
    citingPaperId: `ss_${paperId}`,
    citedPaperId: `ss_${r.citedPaper?.paperId}`,
    isInfluential: r.isInfluential ?? false,
  }));
}

export async function fetchSSPaperById(paperId: string): Promise<CollectedPaper | null> {
  const url = `${BASE_URL}/paper/${paperId}?fields=${FIELDS}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;
  const p = (await res.json()) as SSPaper;
  if (!p.paperId) return null;
  return mapSSPaper(p);
}
