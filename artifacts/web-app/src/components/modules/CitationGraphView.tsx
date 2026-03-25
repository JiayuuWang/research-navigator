import React, { useState, useEffect, useRef } from "react";
import { useGetCitationGraph, useGetPaperAiSummary, useListPapers } from "@workspace/api-client-react";
import ForceGraph2D from "react-force-graph-2d";
import { Card, Skeleton, Badge, Button } from "@/components/ui";
import { Network, Search, Zap, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function PaperSummaryPanel({ paperId, onClose }: { paperId: string; onClose: () => void }) {
  const { data, isLoading } = useGetPaperAiSummary(paperId);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute top-4 right-4 w-80 glass-panel rounded-lg border border-primary/30 p-4 shadow-2xl z-10 max-h-[80vh] flex flex-col"
    >
      <div className="flex justify-between items-start mb-4">
        <h4 className="font-mono text-sm text-primary flex items-center gap-2">
          <Zap className="w-4 h-4" /> AI Analysis
        </h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">×</button>
      </div>

      <div className="overflow-y-auto pr-2 space-y-4 text-sm no-scrollbar">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : data ? (
          <>
            <div>
              <div className="font-semibold text-foreground mb-1">{data.title}</div>
              <p className="text-muted-foreground text-xs leading-relaxed">{data.summary}</p>
            </div>
            
            <div>
              <div className="text-xs uppercase font-mono tracking-wider text-muted-foreground mb-1 border-b border-border/50 pb-1">Key Contributions</div>
              <ul className="list-disc pl-4 space-y-1 text-xs text-foreground">
                {data.keyContributions.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>

            <div>
              <div className="text-xs uppercase font-mono tracking-wider text-muted-foreground mb-1 border-b border-border/50 pb-1">Methodology</div>
              <p className="text-xs text-foreground">{data.methodology}</p>
            </div>

            <div>
              <div className="text-xs uppercase font-mono tracking-wider text-muted-foreground mb-1 border-b border-border/50 pb-1">Impact</div>
              <p className="text-xs text-foreground">{data.impact}</p>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground text-xs">Failed to load analysis.</div>
        )}
      </div>
    </motion.div>
  );
}

export function CitationGraphView({ topic }: { topic: string }) {
  // First get papers to find a seed
  const { data: papersData } = useListPapers({ topic, limit: 1, sortBy: "citationCount" });
  const seedId = papersData?.papers[0]?.id;

  const { data: graphData, isLoading } = useGetCitationGraph(
    seedId || "",
    { depth: 2, maxNodes: 150 },
    { query: { enabled: !!seedId } }
  );

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      setDimensions({ width: clientWidth, height: clientHeight });
    }
  }, []);

  if (isLoading || !seedId) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center border border-border/50 rounded-lg bg-card/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <div className="font-mono text-sm text-primary text-glow">Synthesizing Network Topology...</div>
        </div>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return <div className="p-8 text-center text-muted-foreground glass-panel">Insufficient data to generate network graph.</div>;
  }

  const gData = {
    nodes: graphData.nodes.map(n => ({ 
      id: n.id, 
      name: n.title, 
      val: Math.max(Math.log(n.citationCount || 1) * 2, 2),
      isHub: n.isHub,
      isBridge: n.isBridge,
      citationCount: n.citationCount
    })),
    links: graphData.edges.map(e => ({ source: e.source, target: e.target }))
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xl font-mono text-foreground flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          Citation Network Topology
        </h3>
        <div className="flex gap-2 font-mono text-xs">
          <Badge variant="outline">{graphData.totalNodes} Nodes</Badge>
          <Badge variant="outline">{graphData.totalEdges} Edges</Badge>
        </div>
      </div>

      <div className="relative w-full h-[650px] border border-border rounded-lg overflow-hidden bg-black/50" ref={containerRef}>
        <ForceGraph2D
          width={dimensions.width}
          height={dimensions.height}
          graphData={gData}
          nodeLabel="name"
          nodeColor={node => {
            if ((node as any).isHub) return 'hsl(170 80% 50%)'; // Cyan
            if ((node as any).isBridge) return 'hsl(270 70% 60%)'; // Purple
            return 'hsl(240 5% 50%)'; // Gray
          }}
          nodeRelSize={4}
          linkColor={() => 'rgba(255,255,255,0.1)'}
          linkWidth={1}
          onNodeClick={(node) => setSelectedNode((node as any).id)}
          backgroundColor="#0a0a0c"
        />

        <div className="absolute bottom-4 left-4 glass-panel p-3 rounded text-xs font-mono flex flex-col gap-2">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[hsl(170,80%,50%)] shadow-[0_0_8px_hsl(170,80%,50%)]"></div> Hub Paper</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[hsl(270,70%,60%)] shadow-[0_0_8px_hsl(270,70%,60%)]"></div> Bridge Paper</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[hsl(240,5%,50%)]"></div> Standard Node</div>
        </div>

        <AnimatePresence>
          {selectedNode && (
            <PaperSummaryPanel paperId={selectedNode} onClose={() => setSelectedNode(null)} />
          )}
        </AnimatePresence>
      </div>
      
      {graphData.lineages && graphData.lineages.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <h4 className="col-span-full font-mono text-sm text-muted-foreground uppercase tracking-widest border-b border-border pb-2">Key Research Lineages</h4>
          {graphData.lineages.map(lineage => (
             <div key={lineage.id} className="p-4 border border-border/50 rounded bg-secondary/30">
               <div className="font-semibold text-sm mb-1 text-primary">{lineage.name}</div>
               <p className="text-xs text-muted-foreground">{lineage.description}</p>
             </div>
          ))}
        </div>
      )}
    </div>
  );
}
