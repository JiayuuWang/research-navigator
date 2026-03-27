import React, { useState } from "react";
import { useGetResearchGaps, useAnalyzeResearchGaps } from "@workspace/api-client-react";
import { Card, CardContent, Button, Badge } from "@/components/ui";
import { Target, Play, TrendingUp, Zap, Search, ArrowUpDown, Info, ChevronDown, ChevronUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatScore, cn } from "@/lib/utils";

type SortKey = "noveltyScore" | "impactScore" | "feasibilityScore";

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="text-muted-foreground">{formatScore(value)}</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all bg-foreground/60"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const EVIDENCE_LABELS: Record<string, string> = {
  topic_modeling: "Topic Modeling",
  citation_network: "Citation Network",
  method_problem_matrix: "Method-Problem",
};

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "noveltyScore", label: "Novelty" },
  { key: "impactScore", label: "Impact" },
  { key: "feasibilityScore", label: "Feasibility" },
];

function ScoringMethodology() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded bg-secondary/20 p-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Scoring Methodology</span>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-2 border border-border/30 rounded">
              <div className="font-semibold text-foreground mb-1">Novelty (0-1)</div>
              <p>Measures how distinct this gap is from existing work. Based on topic model distance from existing clusters and absence in citation network dense regions.</p>
            </div>
            <div className="p-2 border border-border/30 rounded">
              <div className="font-semibold text-foreground mb-1">Impact (0-1)</div>
              <p>Estimated potential impact based on citation patterns of neighboring research, field growth velocity, and number of downstream applications.</p>
            </div>
            <div className="p-2 border border-border/30 rounded">
              <div className="font-semibold text-foreground mb-1">Feasibility (0-1)</div>
              <p>Assesses practical feasibility considering available methods, data accessibility, and existing methodological foundations in the corpus.</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/60 pt-1">
            Scores are AI-generated based on corpus analysis using topic modeling, citation network density, and method-problem matrix analysis.
          </p>
        </div>
      )}
    </div>
  );
}

export function ResearchGapsView({ runId }: { runId: string }) {
  const { data, isLoading } = useGetResearchGaps(runId);
  const analyzeMutation = useAnalyzeResearchGaps();
  const queryClient = useQueryClient();
  const [sortKey, setSortKey] = useState<SortKey>("noveltyScore");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center font-mono text-muted-foreground">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Scanning corpus for research anomalies...
        </div>
      </div>
    );
  }

  const gaps = data?.gaps || [];

  if (gaps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 panel rounded text-center space-y-4 border-dashed border-border">
        <Target className="w-12 h-12 text-muted-foreground mb-2" />
        <h3 className="text-xl font-medium">Gap Analysis Not Initialized</h3>
        <p className="text-muted-foreground text-sm max-w-md">
          Run AI-driven topic modeling and network density analysis to identify unexplored research territories.
        </p>
        <Button
          variant="primary"
          onClick={() =>
            analyzeMutation.mutate({ runId }, {
              onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/gaps/${runId}`] }),
            })
          }
          disabled={analyzeMutation.isPending}
          className="font-mono mt-4"
        >
          {analyzeMutation.isPending ? (
            <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" /> Analyzing Spaces...</>
          ) : (
            <><Play className="w-4 h-4 mr-2" /> Execute Gap Analysis</>
          )}
        </Button>
      </div>
    );
  }

  const filtered = gaps
    .filter((g) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return g.title.toLowerCase().includes(q) || g.description.toLowerCase().includes(q);
    })
    .sort((a, b) => ((b[sortKey] as number) ?? 0) - ((a[sortKey] as number) ?? 0));

  const avgNovelty = gaps.reduce((acc, g) => acc + (g.noveltyScore ?? 0), 0) / gaps.length;
  const avgImpact = gaps.reduce((acc, g) => acc + (g.impactScore ?? 0), 0) / gaps.length;

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="panel p-4 rounded text-center">
          <div className="text-2xl font-mono font-bold text-foreground">{gaps.length}</div>
          <div className="text-xs uppercase font-mono text-muted-foreground mt-1">Gaps Detected</div>
        </div>
        <div className="panel p-4 rounded text-center">
          <div className="text-2xl font-mono font-bold text-foreground">{formatScore(avgNovelty)}</div>
          <div className="text-xs uppercase font-mono text-muted-foreground mt-1">Avg Novelty</div>
        </div>
        <div className="panel p-4 rounded text-center">
          <div className="text-2xl font-mono font-bold text-foreground">{formatScore(avgImpact)}</div>
          <div className="text-xs uppercase font-mono text-muted-foreground mt-1">Avg Impact</div>
        </div>
      </div>

      {/* Scoring Framework */}
      <ScoringMethodology />

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter gaps..."
            className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded text-sm focus:outline-none focus:border-foreground/30 font-mono placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="flex gap-2 items-center">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-mono uppercase">Sort by:</span>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={cn(
                "px-3 py-1 rounded text-xs font-mono uppercase tracking-wider transition-colors",
                sortKey === key
                  ? "bg-secondary text-foreground border border-border"
                  : "bg-card text-muted-foreground border border-border hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              analyzeMutation.mutate({ runId }, {
                onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/gaps/${runId}`] }),
              })
            }
            disabled={analyzeMutation.isPending}
            className="font-mono text-xs ml-2"
          >
            {analyzeMutation.isPending ? "..." : "Re-analyze"}
          </Button>
        </div>
      </div>

      {/* Gap cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filtered.map((gap, idx) => {
          const isExpanded = expandedId === gap.id;
          return (
            <Card
              key={gap.id}
              className={cn(
                "relative overflow-hidden group transition-all duration-200 bg-card cursor-pointer",
                isExpanded ? "border-border shadow-sm" : "hover:border-foreground/30"
              )}
              onClick={() => setExpandedId(isExpanded ? null : gap.id)}
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-border group-hover:bg-foreground/30 transition-colors" />
              <CardContent className="p-5 pt-5">
                {/* ID + type badge */}
                <div className="flex justify-between items-start mb-3">
                  <div className="font-mono text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                    GAP_{idx.toString().padStart(3, "0")}
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    {EVIDENCE_LABELS[gap.evidenceType] ?? gap.evidenceType.replace("_", " ")}
                  </Badge>
                </div>

                <h4 className="text-base font-semibold mb-2 leading-tight">{gap.title}</h4>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  {isExpanded ? gap.description : gap.description.length > 120 ? gap.description.substring(0, 120) + "…" : gap.description}
                </p>

                {/* Score bars */}
                <div className="space-y-2 pt-3 border-t border-border/50">
                  <ScoreBar label="Novelty" value={gap.noveltyScore ?? 0} color="text-muted-foreground" />
                  <ScoreBar label="Impact" value={gap.impactScore ?? 0} color="text-muted-foreground" />
                  <ScoreBar label="Feasibility" value={gap.feasibilityScore ?? 0} color="text-muted-foreground" />
                </div>

                {/* Expanded: supporting evidence */}
                {isExpanded && (gap as any).metadata?.supportingEvidence && (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <div className="text-xs uppercase font-mono tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Supporting Evidence
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      {(gap as any).metadata.supportingEvidence}
                    </p>
                  </div>
                )}

                {/* Expand hint */}
                <div className="mt-3 text-right">
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    {isExpanded ? "▲ Collapse" : "▼ Expand details"}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && searchQuery && (
        <div className="text-center py-8 text-muted-foreground font-mono text-sm">
          No gaps matching "{searchQuery}"
        </div>
      )}
    </div>
  );
}
