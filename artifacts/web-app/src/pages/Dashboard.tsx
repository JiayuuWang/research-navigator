import React, { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useGetCollectionRun } from "@workspace/api-client-react";
import { Tabs, Progress } from "@/components/ui";
import { Activity, Terminal, ArrowLeft } from "lucide-react";
import { PapersList } from "@/components/modules/PapersList";
import { CitationGraphView } from "@/components/modules/CitationGraphView";
import { TrendAnalysisView } from "@/components/modules/TrendAnalysisView";
import { ResearchGapsView } from "@/components/modules/ResearchGapsView";
import { ProposalsView } from "@/components/modules/ProposalsView";
import { DebateView } from "@/components/modules/DebateView";
import { ReportView } from "@/components/modules/ReportView";
const TABS = [
  { id: "papers", label: "01. Corpus" },
  { id: "graph", label: "02. Topology" },
  { id: "trends", label: "03. Vectors" },
  { id: "gaps", label: "04. Anomalies" },
  { id: "proposals", label: "05. Synthesis" },
  { id: "debate", label: "06. Matrix" },
  { id: "report", label: "07. Dossier" }
];

export default function Dashboard() {
  const params = useParams();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  const { data: run, isLoading, error, refetch } = useGetCollectionRun(id);

  useEffect(() => {
    if (run?.status === 'pending' || run?.status === 'running') {
      const interval = setInterval(() => refetch(), 3000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [run?.status, refetch]);

  if (isLoading && !run) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-muted-foreground font-mono">
          <Activity className="w-5 h-5 animate-pulse" />
          Loading...
        </div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="border border-destructive/30 bg-destructive/5 text-destructive p-6 rounded font-mono text-center max-w-md">
          <Terminal className="w-6 h-6 mx-auto mb-3 opacity-60" />
          <h2 className="text-sm font-bold mb-1">Error loading run {id}</h2>
          <Link href="/" className="mt-4 inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back
          </Link>
        </div>
      </div>
    );
  }

  const isRunning = run.status === 'pending' || run.status === 'running';
  const progressPct = Math.min((run.papersCollected / 200) * 100, 100) || 5;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="h-5 w-px bg-border" />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Research Navigator</div>
              <h1 className="font-semibold text-sm text-foreground leading-none mt-0.5">{run.topic}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-muted-foreground hidden sm:block">{run.id.substring(0, 8)}</span>
            <span
              className={[
                "px-2 py-0.5 rounded text-[10px] uppercase tracking-wider",
                isRunning ? "bg-secondary text-muted-foreground animate-pulse" :
                run.status === "failed" ? "bg-destructive/10 text-destructive" :
                "bg-secondary text-foreground"
              ].join(" ")}
            >
              {run.status}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {isRunning ? (
          <div className="h-[60vh] flex items-center justify-center">
            <div className="w-full max-w-md panel p-8 rounded space-y-5">
              <div className="flex justify-between items-center font-mono text-sm">
                <span className="text-foreground">Collecting papers…</span>
                <span className="text-muted-foreground">{progressPct.toFixed(0)}%</span>
              </div>

              <Progress value={progressPct} className="h-px bg-border" />

              <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-4 border-t border-border">
                <div>
                  <div className="text-muted-foreground mb-1">Sources</div>
                  <div className="text-foreground">{(run.sourcesUsed || []).join(", ")}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Collected / Deduped</div>
                  <div className="text-foreground">{run.papersCollected} / {run.papersDeduplicated}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

            <div className="pt-2 min-h-[60vh]">
              {activeTab === "papers" && <PapersList topic={run.topic} runId={run.id} />}
              {activeTab === "graph" && <CitationGraphView topic={run.topic} />}
              {activeTab === "trends" && <TrendAnalysisView runId={run.id} />}
              {activeTab === "gaps" && <ResearchGapsView runId={run.id} />}
              {activeTab === "proposals" && <ProposalsView runId={run.id} />}
              {activeTab === "debate" && <DebateView runId={run.id} />}
              {activeTab === "report" && <ReportView runId={run.id} />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
