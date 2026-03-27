import React, { useState } from "react";
import { useGetProposals, useGenerateProposals, useListPapers } from "@workspace/api-client-react";
import { Card, Button, Badge } from "@/components/ui";
import { Lightbulb, Play, BookOpen, AlertTriangle, PenTool, FileText, ChevronDown, ChevronUp, ExternalLink, Info, Quote } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatScore, cn } from "@/lib/utils";

const NOVELTY_FRAMEWORK = [
  { dimension: "Methodological Originality", weight: "30%", desc: "Does the proposal introduce new methods or novel combinations of existing techniques?" },
  { dimension: "Problem Space Coverage", weight: "25%", desc: "Does it address an underexplored region in the research landscape identified from citation/topic analysis?" },
  { dimension: "Cross-domain Bridging", weight: "20%", desc: "Does the work connect disparate sub-fields or apply methods from one domain to another?" },
  { dimension: "Evidence Gap Alignment", weight: "15%", desc: "How directly does the proposal target gaps identified by corpus analysis?" },
  { dimension: "Potential Impact", weight: "10%", desc: "Expected significance based on citation patterns of related work and field growth rate." },
];

function NoveltyFramework({ score, explanation }: { score: number; explanation?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(score * 100);

  return (
    <div className="border border-border rounded bg-secondary/20 p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Novelty Scoring Framework
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground/60 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-sm font-bold text-foreground">{formatScore(score)}</span>
          </div>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {explanation && (
            <p className="text-xs text-foreground/80 leading-relaxed border-l-2 border-border pl-3 italic">
              {explanation}
            </p>
          )}
          <div className="space-y-2">
            {NOVELTY_FRAMEWORK.map((dim) => (
              <div key={dim.dimension} className="flex items-start gap-3 text-xs">
                <span className="font-mono text-muted-foreground w-10 shrink-0 text-right">{dim.weight}</span>
                <div>
                  <span className="font-semibold text-foreground">{dim.dimension}</span>
                  <span className="text-muted-foreground ml-1">— {dim.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SupportingPapers({ paperIds, runId }: { paperIds: string[]; runId: string }) {
  const { data } = useListPapers({ runId, limit: 500 });
  if (!paperIds || paperIds.length === 0) return null;

  const papers = data?.papers?.filter((p) => paperIds.includes(p.id)) ?? [];
  if (papers.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
        <FileText className="w-3 h-3" /> Evidence Chain ({papers.length} supporting papers)
      </h5>
      <div className="space-y-2">
        {papers.map((paper) => (
          <div
            key={paper.id}
            className="flex items-start gap-3 p-2.5 rounded border border-border/30 bg-secondary/10 hover:border-foreground/20 transition-colors group"
          >
            <Quote className="w-3 h-3 text-muted-foreground mt-1 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground leading-snug line-clamp-1">
                {paper.title}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono text-muted-foreground">{paper.year ?? "N/A"}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{paper.citationCount ?? 0} citations</span>
                {paper.url && (
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProposalsView({ runId }: { runId: string }) {
  const { data, isLoading } = useGetProposals(runId);
  const generateMutation = useGenerateProposals();
  const queryClient = useQueryClient();

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center font-mono text-muted-foreground">Generating theoretical frameworks...</div>;
  }

  const proposals = data?.proposals || [];

  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 panel rounded text-center space-y-4 border-dashed border-border">
        <Lightbulb className="w-12 h-12 text-muted-foreground mb-2" />
        <h3 className="text-xl font-medium">No Proposals Generated</h3>
        <p className="text-muted-foreground text-sm max-w-md">Synthesize identified gaps into structured research proposals suitable for funding bodies.</p>
        <Button
          variant="primary"
          onClick={() => generateMutation.mutate({ runId }, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/proposals/${runId}`] })
          })}
          disabled={generateMutation.isPending}
          className="font-mono mt-4"
        >
          {generateMutation.isPending ? "Synthesizing..." : <><Play className="w-4 h-4 mr-2" /> Generate Proposals</>}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end mb-2">
        <h3 className="text-xl font-mono text-foreground flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-muted-foreground" />
          Generated Research Proposals
          <Badge variant="outline" className="font-mono text-xs ml-2">{proposals.length} proposals</Badge>
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => generateMutation.mutate({ runId }, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/proposals/${runId}`] })
          })}
          disabled={generateMutation.isPending}
          className="font-mono text-xs"
        >
          {generateMutation.isPending ? "..." : "Regenerate"}
        </Button>
      </div>

      <div className="space-y-6">
        {proposals.map((prop, idx) => (
          <Card key={prop.id} className="p-6 border-l-4 border-l-border bg-card">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
              <div>
                <div className="font-mono text-xs text-muted-foreground mb-2">PROP_{idx.toString().padStart(3, '0')}</div>
                <h4 className="text-xl font-bold text-foreground leading-tight max-w-3xl">{prop.title}</h4>
              </div>
            </div>

            {/* Novelty Framework */}
            <div className="mb-6">
              <NoveltyFramework score={prop.noveltyScore} explanation={prop.noveltyExplanation} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
              <div className="space-y-6">
                <div>
                  <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2 border-b border-border/50 pb-1">
                    <BookOpen className="w-3 h-3" /> Motivation
                  </h5>
                  <p className="text-foreground/90 leading-relaxed">{prop.motivation}</p>
                </div>

                <div>
                  <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2 border-b border-border/50 pb-1">
                    <PenTool className="w-3 h-3" /> Methodology
                  </h5>
                  <p className="text-foreground/90 leading-relaxed">{prop.methodology}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 border-b border-border/50 pb-1">
                    Research Questions
                  </h5>
                  <ul className="list-decimal pl-4 space-y-1.5 text-foreground/90">
                    {prop.researchQuestions.map((rq, i) => <li key={i}>{rq}</li>)}
                  </ul>
                </div>

                <div>
                  <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 border-b border-border/50 pb-1">
                    Expected Contributions
                  </h5>
                  <ul className="list-none space-y-1.5 text-foreground/80">
                    {prop.expectedContributions.map((ec, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-muted-foreground mt-0.5">•</span> <span>{ec}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2 border-b border-border/50 pb-1">
                    <AlertTriangle className="w-3 h-3 text-destructive" /> Challenges
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {prop.challenges.map((chal, i) => (
                      <Badge key={i} variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 rounded-sm font-normal py-1">
                        {chal}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Supporting Papers / Evidence Chain */}
            <SupportingPapers paperIds={prop.supportingPaperIds} runId={runId} />
          </Card>
        ))}
      </div>
    </div>
  );
}
