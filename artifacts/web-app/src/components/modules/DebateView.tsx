import React, { useState } from "react";
import { useGetDebates, useStartDebate, useGetDebateTurns } from "@workspace/api-client-react";
import { Card, CardHeader, CardContent, Button, Badge, Skeleton } from "@/components/ui";
import { MessageSquare, Play, ShieldAlert, CheckCircle2, XCircle, HelpCircle, Users, RefreshCw, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { DebateSession } from "@workspace/api-client-react";

const ROLE_STYLES: Record<string, { border: string; bg: string; text: string; align: string }> = {
  "Proponent":              { border: "border-border",     bg: "bg-secondary/40",   text: "text-foreground",     align: "ml-auto items-end" },
  "Methodological Critic":  { border: "border-border",     bg: "bg-secondary/20",   text: "text-foreground",     align: "mr-auto items-start" },
  "Empirical Analyst":      { border: "border-border",     bg: "bg-secondary/30",   text: "text-foreground",     align: "mr-auto items-start" },
  "Synthesist":             { border: "border-border",     bg: "bg-secondary/50",   text: "text-foreground",     align: "mx-auto items-center w-full max-w-full" },
};

const ROLE_COLORS = [
  "bg-foreground/80",
  "bg-foreground/50",
  "bg-foreground/60",
  "bg-foreground/30",
];

function RoleLegend() {
  const roles = Object.keys(ROLE_STYLES).filter((r) => r !== "Synthesist");
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      {roles.map((role, i) => {
        const s = ROLE_STYLES[role]!;
        return (
          <div key={role} className={cn("flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-mono text-muted-foreground border-border")}>
            <span className={cn("w-2 h-2 rounded-full", ROLE_COLORS[i]?.split(" ")[0])} />
            {role}
          </div>
        );
      })}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-border text-muted-foreground text-xs font-mono">
        <span className="w-2 h-2 rounded-full bg-secondary-foreground/50" />
        Synthesist
      </div>
    </div>
  );
}

function DebateSessionView({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useGetDebateTurns(sessionId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-3/4 ml-auto" />
        <Skeleton className="h-24 w-3/4 mr-auto" />
        <Skeleton className="h-24 w-3/4 ml-auto" />
      </div>
    );
  }

  if (!data || data.turns.length === 0) {
    return <div className="text-muted-foreground text-sm font-mono">No debate transcript available.</div>;
  }

  const rounds = Array.from(new Set(data.turns.map((t) => t.round))).sort();

  return (
    <div className="space-y-8">
      {rounds.map((round) => {
        const roundTurns = data.turns.filter((t) => t.round === round);
        return (
          <div key={round}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-border/30" />
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Round {round}</span>
              <div className="h-px flex-1 bg-border/30" />
            </div>
            <div className="space-y-5">
              {roundTurns.map((turn) => {
                const isSynthesist = turn.role === "Synthesist";
                const style = ROLE_STYLES[turn.role] ?? ROLE_STYLES["Synthesist"]!;
                return (
                  <div
                    key={turn.id}
                    className={cn("flex flex-col max-w-[85%]", isSynthesist ? "mx-auto text-center items-center w-full max-w-full my-4" : style.align)}
                  >
                    <div className="text-xs font-mono mb-1.5 uppercase tracking-wider text-muted-foreground">
                      {turn.role}
                    </div>
                    <div className={cn("p-4 rounded-lg border shadow-sm text-sm leading-relaxed", style.border, style.bg, isSynthesist ? "w-full" : "")}>
                      <p className="text-foreground/90">{turn.content}</p>
                      {turn.claims && turn.claims.length > 0 && !isSynthesist && (
                        <div className="mt-3 pt-3 border-t border-current/20 space-y-2 text-left">
                          {turn.claims.map((claim, i) => (
                            <div key={i} className="flex flex-col gap-0.5">
                              <span className="text-xs font-medium">• {claim.claim}</span>
                              <span className={cn(
                                "text-[10px] font-mono opacity-70 ml-3",
                                claim.evidenceStrength === "strong_empirical" ? "text-foreground" :
                                claim.evidenceStrength === "indirect_inference" ? "text-muted-foreground/80" : "text-muted-foreground"
                              )}>
                                {claim.evidenceStrength.replace(/_/g, " ")}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SessionCard({ session, index, isActive, onClick }: { session: DebateSession; index: number; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 rounded border transition-all",
        isActive
          ? "border-foreground/30 bg-secondary"
          : "border-border bg-card hover:border-foreground/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-xs text-muted-foreground mb-1">
          Debate #{index + 1}
        </div>
        <Badge variant="outline" className={cn("text-[9px] font-mono uppercase shrink-0", session.status === "completed" ? "text-foreground border-border" : "text-muted-foreground border-border")}>
          {session.status}
        </Badge>
      </div>
      <p className="text-sm text-foreground leading-snug line-clamp-2">{session.controversialQuestion}</p>
      {isActive && <ChevronRight className="w-4 h-4 text-muted-foreground mt-2" />}
    </button>
  );
}

export function DebateView({ runId }: { runId: string }) {
  const { data, isLoading } = useGetDebates(runId);
  const startMutation = useStartDebate();
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center font-mono text-muted-foreground">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading controversy matrix...
        </div>
      </div>
    );
  }

  const sessions = data?.sessions || [];
  const activeSession = sessions.find((s) => s.id === selectedSessionId) ?? sessions[0] ?? null;

  const handleStartDebate = () => {
    startMutation.mutate({ runId }, {
      onSuccess: (newSession) => {
        queryClient.invalidateQueries({ queryKey: [`/api/debates/${runId}`] });
        if (newSession?.id) setSelectedSessionId(newSession.id);
      },
    });
  };

  if (sessions.length === 0 && !startMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center p-12 panel rounded text-center space-y-4 border-dashed border-border">
        <MessageSquare className="w-12 h-12 text-muted-foreground mb-2" />
        <h3 className="text-xl font-medium">Controversy Matrix Offline</h3>
        <p className="text-muted-foreground text-sm max-w-md">
          Instantiate a multi-agent debate to expose methodological flaws and empirical disagreements within the field.
        </p>
        <div className="text-xs text-muted-foreground/60 font-mono max-w-sm mt-2 space-y-1 text-left">
          <div className="flex items-center gap-2"><Users className="w-3 h-3" /> 4 AI debate roles: Proponent, Critic, Analyst, Synthesist</div>
          <div className="flex items-center gap-2"><MessageSquare className="w-3 h-3" /> 3 rounds of structured argumentation</div>
          <div className="flex items-center gap-2"><ShieldAlert className="w-3 h-3" /> AI-synthesized consensus and open questions</div>
        </div>
        <Button
          variant="primary"
          onClick={handleStartDebate}
          className="font-mono mt-4"
        >
          <Play className="w-4 h-4 mr-2" /> Initiate Debate
        </Button>
      </div>
    );
  }

  if (startMutation.isPending) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <div className="font-mono text-muted-foreground text-sm text-center">
          <p>Initializing multi-agent debate system...</p>
          <p className="text-xs mt-1 text-muted-foreground/60">Running 3 rounds × 4 roles — this takes ~2 minutes</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Session switcher + new debate button */}
      {sessions.length > 0 && (
        <div className="flex gap-3 items-start">
          <div className="flex-1 space-y-2">
            {sessions.length > 1 && (
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                {sessions.length} Debate Sessions
              </div>
            )}
            {sessions.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {sessions.map((s, i) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    index={i}
                    isActive={s.id === (activeSession?.id ?? null)}
                    onClick={() => setSelectedSessionId(s.id)}
                  />
                ))}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleStartDebate}
            disabled={startMutation.isPending}
            className="font-mono text-xs shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> New Debate
          </Button>
        </div>
      )}

      {activeSession && (
        <>
          {/* Controversy header */}
          <div className="panel p-6 rounded border border-border">
            <div className="flex items-center gap-3 mb-2">
              <ShieldAlert className="w-5 h-5 text-muted-foreground" />
              <h4 className="font-mono text-sm uppercase tracking-widest text-muted-foreground">Core Controversy</h4>
              <Badge variant="outline" className={cn("ml-auto text-[9px] font-mono uppercase", activeSession.status === "completed" ? "text-foreground border-border" : "text-muted-foreground border-border")}>
                {activeSession.status}
              </Badge>
            </div>
            <h2 className="text-xl font-bold text-foreground leading-tight">{activeSession.controversialQuestion}</h2>
            <div className="flex gap-2 mt-4 flex-wrap">
              {activeSession.subTopics.map((t, i) => (
                <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
              ))}
            </div>
          </div>

          {/* Role legend */}
          <RoleLegend />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Transcript */}
            <div className="xl:col-span-2">
              <h3 className="font-mono text-sm text-muted-foreground uppercase tracking-widest mb-4 border-b border-border/50 pb-2">Debate Transcript</h3>
              <div className="max-h-[700px] overflow-y-auto pr-2 no-scrollbar">
                <DebateSessionView sessionId={activeSession.id} />
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-5">
              {/* Synthesis report */}
              <Card className="border-border bg-card">
                <CardHeader className="pb-3 border-b border-border py-3 px-4">
                  <h4 className="font-mono text-sm text-muted-foreground uppercase tracking-widest">Synthesis Report</h4>
                </CardHeader>
                <CardContent className="pt-3 px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                  {activeSession.finalReport || (
                    <span className="italic text-muted-foreground/60">Synthesis report is generating...</span>
                  )}
                </CardContent>
              </Card>

              {/* Consensus points */}
              {activeSession.consensusPoints.length > 0 && (
                <div>
                  <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" /> Consensus Points
                  </h5>
                  <ul className="space-y-2">
                    {activeSession.consensusPoints.map((p, i) => (
                      <li key={i} className="text-xs text-foreground bg-secondary/50 p-2.5 rounded border-l-2 border-border leading-relaxed">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Disagreement points */}
              {activeSession.disagreementPoints.length > 0 && (
                <div>
                  <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
                    <XCircle className="w-3.5 h-3.5 text-muted-foreground" /> Disagreements
                  </h5>
                  <ul className="space-y-2">
                    {activeSession.disagreementPoints.map((p, i) => (
                      <li key={i} className="text-xs text-foreground bg-secondary/50 p-2.5 rounded border-l-2 border-border leading-relaxed">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Open questions */}
              {activeSession.openQuestions && activeSession.openQuestions.length > 0 && (
                <div>
                  <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
                    <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" /> Open Questions
                  </h5>
                  <ul className="space-y-2">
                    {activeSession.openQuestions.map((q, i) => (
                      <li key={i} className="text-xs text-foreground bg-secondary/50 p-2.5 rounded border-l-2 border-border leading-relaxed">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
