import React from "react";
import { useGetReport, useGenerateReport } from "@workspace/api-client-react";
import { Card, Button } from "@/components/ui";
import { FileText, Download, Play, CheckCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export function ReportView({ runId }: { runId: string }) {
  const { data, isLoading } = useGetReport(runId);
  const generateMutation = useGenerateReport();
  const queryClient = useQueryClient();

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center font-mono text-muted-foreground">Compiling master dossier...</div>;
  }

  if (!data || data.overview.includes("Analysis of 0 papers")) {
    return (
      <div className="flex flex-col items-center justify-center p-12 glass-panel rounded-lg text-center space-y-4 border border-dashed border-border">
        <FileText className="w-12 h-12 text-muted-foreground mb-2" />
        <h3 className="text-xl font-medium">Final Report Not Compiled</h3>
        <p className="text-muted-foreground text-sm max-w-md">Compile all generated insights into a final, exportable intelligence dossier.</p>
        <Button 
          variant="primary" 
          onClick={() => generateMutation.mutate({ runId }, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/report/${runId}`] })
          })}
          disabled={generateMutation.isPending}
          className="font-mono mt-4"
        >
          {generateMutation.isPending ? "Compiling..." : <><Play className="w-4 h-4 mr-2" /> Generate Report</>}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <div className="font-mono text-primary text-xs uppercase tracking-widest mb-2">Intelligence Dossier</div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">{data.topic}</h2>
          <div className="text-sm text-muted-foreground mt-2 font-mono flex gap-4">
             <span>ID: {data.runId.split('-')[0]}</span>
             <span>Generated: {format(new Date(data.generatedAt), 'MMM dd, yyyy HH:mm')}</span>
             <span>Corpus: {data.totalPapers} documents</span>
          </div>
        </div>
        <Button variant="outline" className="font-mono">
          <Download className="w-4 h-4 mr-2" /> Export PDF
        </Button>
      </div>

      <Card className="p-8 space-y-8 bg-black/40 border-border shadow-2xl printable-area font-serif leading-relaxed">
        
        <section>
          <h3 className="text-lg font-mono font-bold uppercase tracking-widest text-primary mb-3 border-b border-primary/20 pb-2">I. Executive Overview</h3>
          <p className="text-foreground/90">{data.overview}</p>
        </section>

        <section>
          <h3 className="text-lg font-mono font-bold uppercase tracking-widest text-primary mb-3 border-b border-primary/20 pb-2">II. Network Topology</h3>
          <p className="text-foreground/90">{data.graphInsights}</p>
        </section>

        <section>
          <h3 className="text-lg font-mono font-bold uppercase tracking-widest text-primary mb-3 border-b border-primary/20 pb-2">III. Temporal Trend Vectors</h3>
          <p className="text-foreground/90">{data.trendsSummary}</p>
        </section>

        <section>
          <h3 className="text-lg font-mono font-bold uppercase tracking-widest text-primary mb-3 border-b border-primary/20 pb-2">IV. Identified Anomalies & Gaps</h3>
          <p className="text-foreground/90">{data.gapsSummary}</p>
        </section>

        <section>
          <h3 className="text-lg font-mono font-bold uppercase tracking-widest text-primary mb-3 border-b border-primary/20 pb-2">V. Core Controversies</h3>
          <p className="text-foreground/90">{data.controversySummary}</p>
        </section>

        <section>
          <h3 className="text-lg font-mono font-bold uppercase tracking-widest text-accent mb-3 border-b border-accent/20 pb-2">Strategic Recommendations</h3>
          <ul className="space-y-3">
            {data.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <span className="text-foreground/90">{rec}</span>
              </li>
            ))}
          </ul>
        </section>

      </Card>
    </div>
  );
}
