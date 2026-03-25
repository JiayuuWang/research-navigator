import React, { useState } from "react";
import { useGetDebates, useStartDebate, useGetDebateTurns } from "@workspace/api-client-react";
import { Card, CardHeader, CardContent, Button, Badge, Skeleton } from "@/components/ui";
import { MessageSquare, Play, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

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

  if (!data || data.turns.length === 0) return <div className="text-muted-foreground text-sm font-mono">No debate transcript available.</div>;

  const roleColors: Record<string, string> = {
    "Proponent": "border-primary/50 bg-primary/10 text-primary",
    "Methodological Critic": "border-destructive/50 bg-destructive/10 text-destructive",
    "Empirical Analyst": "border-accent/50 bg-accent/10 text-accent",
    "Synthesist": "border-secondary/80 bg-secondary/40 text-foreground"
  };

  return (
    <div className="space-y-6 max-h-[600px] overflow-y-auto pr-4 no-scrollbar">
      {data.turns.map(turn => {
        const isSynthesist = turn.role === "Synthesist";
        const roleStyle = roleColors[turn.role] || roleColors["Synthesist"];
        
        return (
          <div key={turn.id} className={cn("flex flex-col max-w-[85%]", isSynthesist ? "mx-auto text-center items-center w-full max-w-full my-8" : turn.role.includes("Critic") ? "mr-auto items-start" : "ml-auto items-end")}>
            <div className={cn("text-xs font-mono mb-1 uppercase tracking-wider", isSynthesist ? "text-muted-foreground" : "text-muted-foreground")}>
              Round {turn.round} • {turn.role}
            </div>
            <div className={cn("p-4 rounded-lg border shadow-sm text-sm leading-relaxed", roleStyle, isSynthesist ? "w-full max-w-3xl" : "")}>
              <p className={isSynthesist ? "text-foreground" : "text-foreground/90"}>{turn.content}</p>
              
              {turn.claims && turn.claims.length > 0 && !isSynthesist && (
                <div className="mt-3 pt-3 border-t border-current/20 space-y-2 text-left">
                  {turn.claims.map((claim, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <span className="text-xs font-medium">• {claim.claim}</span>
                      <span className="text-[10px] font-mono opacity-70 ml-3">Ev: {claim.evidenceStrength.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DebateView({ runId }: { runId: string }) {
  const { data, isLoading } = useGetDebates(runId);
  const startMutation = useStartDebate();
  const queryClient = useQueryClient();

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center font-mono text-muted-foreground">Loading controversy matrix...</div>;
  }

  const sessions = data?.sessions || [];
  const session = sessions[0]; // For MVP, show the most recent session

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center p-12 glass-panel rounded-lg text-center space-y-4 border border-dashed border-border">
        <MessageSquare className="w-12 h-12 text-muted-foreground mb-2" />
        <h3 className="text-xl font-medium">Controversy Matrix Offline</h3>
        <p className="text-muted-foreground text-sm max-w-md">Instantiate a multi-agent debate to expose methodological flaws and empirical disagreements within the field.</p>
        <Button 
          variant="primary" 
          onClick={() => startMutation.mutate({ runId }, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/debates/${runId}`] })
          })}
          disabled={startMutation.isPending}
          className="font-mono mt-4"
        >
          {startMutation.isPending ? "Initializing Agents..." : <><Play className="w-4 h-4 mr-2" /> Initiate Debate</>}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 rounded-lg border border-primary/20 bg-primary/5 mb-8">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-5 h-5 text-primary" />
          <h4 className="font-mono text-sm uppercase tracking-widest text-muted-foreground">Core Controversy</h4>
        </div>
        <h2 className="text-2xl font-bold text-foreground leading-tight">{session.controversialQuestion}</h2>
        <div className="flex gap-2 mt-4 flex-wrap">
          {session.subTopics.map((t, i) => <Badge key={i} variant="outline" className="bg-black/50 text-xs">{t}</Badge>)}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2">
          <h3 className="font-mono text-sm text-muted-foreground uppercase tracking-widest mb-4 border-b border-border/50 pb-2">Debate Transcript</h3>
          <DebateSessionView sessionId={session.id} />
        </div>

        <div className="space-y-6">
           <Card className="border-border/50 bg-black/40">
             <CardHeader className="pb-3 border-b border-border/30">
               <h4 className="font-mono text-sm text-primary uppercase tracking-widest">Synthesis Report</h4>
             </CardHeader>
             <CardContent className="pt-4 text-sm text-muted-foreground leading-relaxed">
               {session.finalReport || "Synthesis report is generating..."}
             </CardContent>
           </Card>

           <div className="space-y-4">
             <div>
               <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                 <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Consensus Points
               </h5>
               <ul className="space-y-2">
                 {session.consensusPoints.map((p, i) => (
                   <li key={i} className="text-xs text-foreground bg-secondary/50 p-2 rounded border-l-2 border-emerald-500/50">{p}</li>
                 ))}
               </ul>
             </div>

             <div>
               <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                 <XCircle className="w-3 h-3 text-destructive" /> Disagreement Points
               </h5>
               <ul className="space-y-2">
                 {session.disagreementPoints.map((p, i) => (
                   <li key={i} className="text-xs text-foreground bg-secondary/50 p-2 rounded border-l-2 border-destructive/50">{p}</li>
                 ))}
               </ul>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
