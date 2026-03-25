import React from "react";
import { useListPapers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Skeleton } from "@/components/ui";
import { FileText, ExternalLink, Quote } from "lucide-react";

export function PapersList({ topic }: { topic: string }) {
  const { data, isLoading, error } = useListPapers({ topic, limit: 50, sortBy: "citationCount" });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return <div className="text-destructive font-mono text-sm p-4 border border-destructive/50 bg-destructive/10 rounded">Failed to load corpus data.</div>;
  }

  if (data.papers.length === 0) {
    return <div className="text-muted-foreground p-8 text-center glass-panel rounded">No papers found for this topic.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-mono text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Corpus Overview
        </h3>
        <Badge variant="primary" className="font-mono text-sm px-3 py-1">
          {data.total} Documents
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.papers.map((paper) => (
          <Card key={paper.id} className="hover:border-primary/50 transition-colors flex flex-col">
            <CardHeader className="pb-3 flex-none">
              <div className="flex justify-between items-start gap-4">
                <CardTitle className="text-base leading-snug line-clamp-2" title={paper.title}>
                  {paper.title}
                </CardTitle>
                <div className="flex items-center gap-2 flex-shrink-0 font-mono">
                  <Badge variant="outline">{paper.year || "N/A"}</Badge>
                  <Badge variant="primary" className="bg-primary/10">
                    <Quote className="w-3 h-3 mr-1" />
                    {paper.citationCount}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 flex-1 flex flex-col">
              <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1">
                {paper.tldr || paper.abstract || "No abstract available."}
              </p>
              
              <div className="flex flex-wrap gap-1.5 mt-auto pt-4 border-t border-border/50">
                {(paper.keywords || []).slice(0, 4).map((kw, idx) => (
                  <span key={idx} className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 bg-secondary text-secondary-foreground rounded">
                    {kw}
                  </span>
                ))}
                {paper.url && (
                  <a href={paper.url} target="_blank" rel="noreferrer" className="ml-auto flex items-center text-xs text-primary hover:underline">
                    Source <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
