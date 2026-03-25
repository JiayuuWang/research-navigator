import React from "react";
import { useGetResearchGaps, useAnalyzeResearchGaps } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/ui";
import { Target, Play, Lightbulb, Activity, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatScore } from "@/lib/utils";

export function ResearchGapsView({ runId }: { runId: string }) {
  const { data, isLoading } = useGetResearchGaps(runId);
  const analyzeMutation = useAnalyzeResearchGaps();
  const queryClient = useQueryClient();

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center font-mono text-muted-foreground">Scanning corpus for anomalies...</div>;
  }

  const gaps = data?.gaps || [];

  if (gaps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 glass-panel rounded-lg text-center space-y-4 border border-dashed border-border">
        <Target className="w-12 h-12 text-muted-foreground mb-2" />
        <h3 className="text-xl font-medium">Gap Analysis Not Initialized</h3>
        <p className="text-muted-foreground text-sm max-w-md">Run AI-driven topic modeling and network density analysis to identify unexplored research territories.</p>
        <Button 
          variant="primary" 
          onClick={() => analyzeMutation.mutate({ runId }, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/gaps/${runId}`] })
          })}
          disabled={analyzeMutation.isPending}
          className="font-mono mt-4"
        >
          {analyzeMutation.isPending ? "Analyzing Spaces..." : <><Play className="w-4 h-4 mr-2" /> Execute Gap Analysis</>}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end mb-4 border-b border-border/50 pb-4">
        <h3 className="text-xl font-mono text-foreground flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Identified Research Gaps
        </h3>
        <Badge variant="outline" className="font-mono">{gaps.length} Anomalies Detected</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {gaps.map((gap, idx) => (
          <Card key={gap.id} className="relative overflow-hidden group hover:border-primary/50 transition-colors bg-secondary/20">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary/50 group-hover:bg-primary transition-colors"></div>
            <CardContent className="p-6 pt-6 flex flex-col h-full">
              <div className="flex justify-between items-start mb-3">
                <div className="font-mono text-xs text-primary bg-primary/10 px-2 py-1 rounded">GAP_{idx.toString().padStart(3, '0')}</div>
                <Badge variant="outline" className="text-[10px] uppercase font-mono">{gap.evidenceType.replace('_', ' ')}</Badge>
              </div>
              
              <h4 className="text-lg font-semibold mb-2 leading-tight">{gap.title}</h4>
              <p className="text-sm text-muted-foreground flex-1 mb-6">{gap.description}</p>
              
              <div className="grid grid-cols-3 gap-2 mt-auto pt-4 border-t border-border/50">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-mono text-muted-foreground">Novelty</span>
                  <span className="font-mono text-accent font-medium text-sm">{formatScore(gap.noveltyScore)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-mono text-muted-foreground">Impact</span>
                  <span className="font-mono text-primary font-medium text-sm">{formatScore(gap.impactScore)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-mono text-muted-foreground">Feasibility</span>
                  <span className="font-mono text-foreground font-medium text-sm">{formatScore(gap.feasibilityScore)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
