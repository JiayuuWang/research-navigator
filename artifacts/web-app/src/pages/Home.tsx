import React, { useState } from "react";
import { useLocation, Link } from "wouter";
import { useStartCollection, useListCollectionRuns } from "@workspace/api-client-react";
import { Input, Button, Badge } from "@/components/ui";
import { Search, Clock, ArrowRight, ArrowUpRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function RecentRuns() {
  const { data, isLoading } = useListCollectionRuns();
  const runs = data?.runs?.slice(0, 6) ?? [];

  if (isLoading || runs.length === 0) return null;

  return (
    <div className="w-full mt-12 border-t border-border pt-8">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Recent</span>
      </div>
      <div className="space-y-1">
        {runs.map((run) => (
          <Link key={run.id} href={`/run/${run.id}`}>
            <div className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-secondary/60 transition-colors cursor-pointer group">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={[
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    run.status === "completed" ? "bg-foreground/70" :
                    run.status === "running" || run.status === "pending" ? "bg-foreground/40 animate-pulse" :
                    "bg-destructive/60"
                  ].join(" ")}
                />
                <span className="font-mono text-sm text-foreground/80 truncate group-hover:text-foreground transition-colors">{run.topic}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-3">
                <span className="text-[11px] font-mono text-muted-foreground hidden sm:block">
                  {run.papersCollected} papers
                </span>
                <span className="text-[11px] font-mono text-muted-foreground hidden md:block">
                  {formatDistanceToNow(new Date(run.startedAt ?? Date.now()), { addSuffix: true })}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground/60 transition-colors" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [topic, setTopic] = useState("");
  const startMutation = useStartCollection();

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    startMutation.mutate(
      { data: { topic: topic.trim(), limit: 200, sources: ["semantic_scholar", "open_alex"] } },
      { onSuccess: (run) => setLocation(`/run/${run.id}`) }
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <main className="w-full max-w-2xl flex flex-col items-start py-24">

        {/* Logo / wordmark */}
        <div className="mb-10">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Research Navigator</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground mb-4 leading-[1.1]">
          Scientific intelligence,<br />automated.
        </h1>
        <p className="text-base text-muted-foreground leading-relaxed mb-10 max-w-lg">
          Enter a research topic to collect papers, map citation networks, surface trends, identify gaps, and generate structured reports.
        </p>

        {/* Search form */}
        <form onSubmit={handleStart} className="w-full flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. LLM attention mechanisms"
              className="h-11 pl-10 bg-card border-border focus-visible:border-foreground/30 text-sm font-mono placeholder:text-muted-foreground/50 rounded-md"
              disabled={startMutation.isPending}
            />
          </div>
          <Button
            type="submit"
            disabled={startMutation.isPending || !topic.trim()}
            className="h-11 px-5 rounded-md text-sm font-mono bg-foreground text-background hover:bg-foreground/90 border-0"
          >
            {startMutation.isPending ? "Starting…" : "Analyze"}
          </Button>
        </form>

        <RecentRuns />

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2 mt-10">
          {[
            "Paper collection",
            "Citation graph",
            "Trend analysis",
            "Gap detection",
            "Research proposals",
            "Structured debate",
            "Exportable report",
          ].map((f) => (
            <span
              key={f}
              className="text-[11px] font-mono text-muted-foreground border border-border rounded px-2.5 py-1"
            >
              {f}
            </span>
          ))}
        </div>
      </main>
    </div>
  );
}
