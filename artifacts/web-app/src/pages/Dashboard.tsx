import React, { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useGetCollectionRun } from "@workspace/api-client-react";
import { Tabs, Progress, Badge } from "@/components/ui";
import { Activity, Terminal, ArrowLeft } from "lucide-react";
import { PapersList } from "@/components/modules/PapersList";
import { CitationGraphView } from "@/components/modules/CitationGraphView";
import { TrendAnalysisView } from "@/components/modules/TrendAnalysisView";
import { ResearchGapsView } from "@/components/modules/ResearchGapsView";
import { ProposalsView } from "@/components/modules/ProposalsView";
import { DebateView } from "@/components/modules/DebateView";
import { ReportView } from "@/components/modules/ReportView";
import { motion, AnimatePresence } from "framer-motion";

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
        <div className="flex flex-col items-center gap-4 text-primary font-mono text-glow">
          <Activity className="w-8 h-8 animate-pulse" />
          Establishing Secure Connection...
        </div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="border border-destructive/50 bg-destructive/10 text-destructive p-6 rounded-lg font-mono text-center max-w-md shadow-2xl">
          <Terminal className="w-8 h-8 mx-auto mb-4 opacity-80" />
          <h2 className="text-xl mb-2 font-bold">CRITICAL ERROR</h2>
          <p className="text-sm opacity-80">Failed to establish connection to intelligence run {id}. Sequence terminated.</p>
          <Link href="/" className="mt-6 inline-flex items-center text-sm hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> Return to Main Terminal
          </Link>
        </div>
      </div>
    );
  }

  const isRunning = run.status === 'pending' || run.status === 'running';
  const progressPct = Math.min((run.papersCollected / 200) * 100, 100) || 5;

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Background Image Element declared in requirements */}
      <img src={`${import.meta.env.BASE_URL}images/abstract-grid.png`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-overlay pointer-events-none z-0" />
      
      {/* Header */}
      <header className="relative z-10 border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="h-6 w-[1px] bg-border mx-2"></div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-primary mb-0.5">Topic Target</div>
              <h1 className="font-bold text-foreground leading-none">{run.topic}</h1>
            </div>
          </div>
          <div className="flex items-center gap-4 font-mono text-xs">
            <div className="text-right hidden sm:block">
              <div className="text-muted-foreground">Run ID</div>
              <div className="text-foreground">{run.id.substring(0,8)}</div>
            </div>
            <Badge variant={isRunning ? "default" : run.status === "failed" ? "default" : "primary"} 
                   className={isRunning ? "bg-accent text-accent-foreground animate-pulse" : ""}>
              {run.status.toUpperCase()}
            </Badge>
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {isRunning ? (
          <div className="h-[60vh] flex items-center justify-center">
            <div className="w-full max-w-lg glass-panel p-8 rounded-lg space-y-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse"></div>
              
              <div className="flex justify-between items-center font-mono">
                <span className="text-primary text-glow font-bold">Data Ingestion Protocol</span>
                <span className="text-muted-foreground text-xs">{progressPct.toFixed(0)}%</span>
              </div>
              
              <Progress value={progressPct} className="h-1 bg-black" />
              
              <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-4 border-t border-border/50">
                <div>
                  <div className="text-muted-foreground mb-1">Sources</div>
                  <div className="text-foreground">{(run.sourcesUsed || []).join(" | ")}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Collected / Deduped</div>
                  <div className="text-accent">{run.papersCollected} <span className="text-muted-foreground">/</span> {run.papersDeduplicated}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
            
            <div className="pt-4 min-h-[60vh]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === "papers" && <PapersList topic={run.topic} />}
                  {activeTab === "graph" && <CitationGraphView topic={run.topic} />}
                  {activeTab === "trends" && <TrendAnalysisView runId={run.id} />}
                  {activeTab === "gaps" && <ResearchGapsView runId={run.id} />}
                  {activeTab === "proposals" && <ProposalsView runId={run.id} />}
                  {activeTab === "debate" && <DebateView runId={run.id} />}
                  {activeTab === "report" && <ReportView runId={run.id} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
