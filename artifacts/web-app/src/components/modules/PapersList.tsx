import React, { useState } from "react";
import { useListPapers } from "@workspace/api-client-react";
import { Card, CardContent, Badge, Skeleton } from "@/components/ui";
import { FileText, ExternalLink, Quote, User, Search, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type SortBy = "citationCount" | "year";

export function PapersList({ topic, runId }: { topic: string; runId?: string }) {
  const [sortBy, setSortBy] = useState<SortBy>("citationCount");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useListPapers({
    runId,
    topic: runId ? undefined : topic,
    limit: 100,
    sortBy,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-36 w-full" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-destructive font-mono text-sm p-4 border border-destructive/50 bg-destructive/10 rounded">
        Failed to load corpus data.
      </div>
    );
  }

  const filtered = search
    ? data.papers.filter((p) => {
        const q = search.toLowerCase();
        return p.title?.toLowerCase().includes(q) || (p.tldr ?? p.abstract ?? "").toLowerCase().includes(q);
      })
    : data.papers;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-xl font-mono text-foreground">Corpus Overview</h3>
          <Badge variant="primary" className="font-mono text-sm px-3 py-0.5">
            {data.total} Documents
          </Badge>
        </div>
        <div className="flex gap-2 items-center">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
          {(["citationCount", "year"] as SortBy[]).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider transition-colors border",
                sortBy === s
                  ? "bg-secondary text-foreground border-border"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {s === "citationCount" ? "Citations" : "Year"}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search papers by title or abstract..."
          className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded text-sm focus:outline-none focus:border-foreground/30 font-mono placeholder:text-muted-foreground/50"
        />
        {search && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
            {filtered.length} / {data.papers.length}
          </span>
        )}
      </div>

      {/* Papers grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((paper) => (
          <Card
            key={paper.id}
            className="hover:border-foreground/20 transition-colors flex flex-col group bg-card"
          >
            <CardContent className="p-5 flex flex-col h-full">
              {/* Title + year/citations */}
              <div className="flex justify-between items-start gap-3 mb-2">
                <h4 className="text-sm font-semibold leading-snug line-clamp-2 text-foreground flex-1" title={paper.title}>
                  {paper.title}
                </h4>
                <div className="flex flex-col items-end gap-1 shrink-0 font-mono">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">{paper.year || "N/A"}</Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                    <Quote className="w-2.5 h-2.5 mr-1" />
                    {paper.citationCount ?? 0}
                  </Badge>
                </div>
              </div>

              {/* Abstract / tldr */}
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3 flex-1 leading-relaxed">
                {paper.tldr || paper.abstract || "No abstract available."}
              </p>

              {/* Keywords + link */}
              <div className="flex flex-wrap gap-1 pt-3 border-t border-border/40 items-center">
                {(paper.keywords || []).slice(0, 3).map((kw, idx) => (
                  <span
                    key={idx}
                    className="text-[9px] uppercase font-mono tracking-wider px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded"
                  >
                    {kw}
                  </span>
                ))}
                {paper.url && (
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline font-mono transition-colors"
                  >
                    Paper <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && search && (
        <div className="text-center py-8 text-muted-foreground font-mono text-sm">
          No papers matching "{search}"
        </div>
      )}
    </div>
  );
}
