import React, { useState } from "react";
import { useLocation } from "wouter";
import { useStartCollection } from "@workspace/api-client-react";
import { Input, Button } from "@/components/ui";
import { Terminal, Database, Shield, Zap, Search } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const [, setLocation] = useLocation();
  const [topic, setTopic] = useState("");
  const startMutation = useStartCollection();

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    
    startMutation.mutate({
      data: {
        topic: topic.trim(),
        limit: 200,
        sources: ["semantic_scholar", "open_alex"]
      }
    }, {
      onSuccess: (run) => {
        setLocation(`/run/${run.id}`);
      }
    });
  };

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center overflow-hidden">
      {/* Background Image Element declared in requirements */}
      <img src={`${import.meta.env.BASE_URL}images/abstract-grid.png`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none z-0 mix-blend-screen" />
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl pointer-events-none z-0"></div>

      <main className="relative z-10 w-full max-w-3xl px-6 flex flex-col items-center">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center p-2 mb-6 rounded-2xl bg-card border border-border shadow-2xl shadow-primary/20">
            <Terminal className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-foreground mb-4 font-sans">
            Research <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Navigator</span>
          </h1>
          <p className="text-lg text-muted-foreground font-mono max-w-xl mx-auto leading-relaxed">
            Automated scientific intelligence platform. Input a query to synthesize global research networks, extract temporal vectors, and identify critical anomalies.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full glass-panel p-2 rounded-xl shadow-2xl shadow-black/50"
        >
          <form onSubmit={handleStart} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input 
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Initialize targeting sequence (e.g. LLM attention mechanisms)"
                className="h-14 pl-12 bg-black/50 border-transparent focus-visible:border-primary text-base font-mono rounded-lg"
                disabled={startMutation.isPending}
              />
            </div>
            <Button 
              type="submit" 
              variant="primary" 
              size="lg" 
              disabled={startMutation.isPending || !topic.trim()}
              className="h-14 px-8 rounded-lg font-mono tracking-wide uppercase font-bold"
            >
              {startMutation.isPending ? "Connecting..." : "Execute"}
            </Button>
          </form>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20 w-full"
        >
          {[
             { icon: Database, title: "Multi-Source Ingestion", desc: "Parallel aggregation across Semantic Scholar and OpenAlex via asynchronous pipelines." },
             { icon: Zap, title: "Algorithmic Synthesis", desc: "LLM-driven anomaly detection identifying critical research gaps and theoretical vectors." },
             { icon: Shield, title: "Controversy Mapping", desc: "Instantiate autonomous multi-agent debates to stress-test methodological consensus." }
          ].map((feature, i) => (
            <div key={i} className="flex flex-col items-center text-center p-4 border border-border/30 rounded-lg bg-black/20 backdrop-blur-sm">
              <feature.icon className="w-6 h-6 text-muted-foreground mb-3" />
              <h3 className="font-mono text-sm font-semibold text-foreground mb-2 uppercase tracking-wide">{feature.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
