import React from "react";
import { useGetProposals, useGenerateProposals } from "@workspace/api-client-react";
import { Card, Button, Badge } from "@/components/ui";
import { Lightbulb, Play, BookOpen, AlertTriangle, PenTool } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatScore } from "@/lib/utils";

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
        </h3>
      </div>

      <div className="space-y-6">
        {proposals.map((prop, idx) => (
          <Card key={prop.id} className="p-6 border-l-4 border-l-border bg-card">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
              <div>
                <div className="font-mono text-xs text-muted-foreground mb-2">PROP_{idx.toString().padStart(3, '0')}</div>
                <h4 className="text-xl font-bold text-foreground leading-tight max-w-3xl">{prop.title}</h4>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="text-[10px] uppercase font-mono text-muted-foreground mb-1">Novelty Index</span>
                <Badge variant="outline" className="font-mono text-lg border-border text-foreground px-3">
                  {formatScore(prop.noveltyScore)}
                </Badge>
              </div>
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
          </Card>
        ))}
      </div>
    </div>
  );
}
