import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useGetCitationGraph, useGetPaperAiSummary, useListPapers, getGetCitationGraphQueryKey } from "@workspace/api-client-react";
import ForceGraph2D from "react-force-graph-2d";
import { Card, Skeleton, Badge, Button } from "@/components/ui";
import { Network, Search, Zap, Loader2, X, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CLUSTER_COLORS = [
  "hsl(0,0%,80%)",
  "hsl(0,0%,65%)",
  "hsl(0,0%,50%)",
  "hsl(0,0%,38%)",
  "hsl(0,0%,28%)",
  "hsl(0,0%,72%)",
  "hsl(0,0%,44%)",
];

function PaperSummaryPanel({ paperId, onClose }: { paperId: string; onClose: () => void }) {
  const { data, isLoading } = useGetPaperAiSummary(paperId);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute top-4 right-4 w-80 bg-card border border-border rounded p-4 z-10 max-h-[80vh] flex flex-col"
    >
      <div className="flex justify-between items-start mb-4">
        <h4 className="font-mono text-sm text-foreground flex items-center gap-2">
          <Zap className="w-4 h-4" /> AI Analysis
        </h4>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-white/10 transition-colors">
          <X className="w-4 h-4" />
        </button>
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
              <div className="font-semibold text-foreground mb-1 text-xs leading-tight">{data.title}</div>
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
  const { data: papersData } = useListPapers({ topic, limit: 1, sortBy: "citationCount" });
  const seedId = papersData?.papers[0]?.id;

  const graphParams = { depth: 2, maxNodes: 200 };
  const { data: graphData, isLoading } = useGetCitationGraph(
    seedId || "",
    graphParams,
    { query: { queryKey: getGetCitationGraphQueryKey(seedId || "", graphParams), enabled: !!seedId } }
  );

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [yearRange, setYearRange] = useState<[number, number]>([2018, new Date().getFullYear()]);
  const [minCitations, setMinCitations] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setDimensions({ width: el.clientWidth, height: el.clientHeight });
    });
    obs.observe(el);
    setDimensions({ width: el.clientWidth, height: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  const maxCitations = useMemo(
    () => Math.max(...(graphData?.nodes.map((n) => n.citationCount ?? 0) ?? [0])),
    [graphData]
  );

  const minYear = useMemo(
    () => Math.min(...(graphData?.nodes.map((n) => n.year ?? new Date().getFullYear()).filter((y) => y > 1900) ?? [2018])),
    [graphData]
  );

  // Assign cluster colors deterministically
  const clusterColorMap = useMemo(() => {
    if (!graphData) return new Map<string, string>();
    const map = new Map<string, string>();
    const nodesSorted = [...graphData.nodes].sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
    // Simple spectral partition: assign by depth+hub/bridge combo
    nodesSorted.forEach((n, i) => {
      const key = n.isHub ? "hub" : n.isBridge ? "bridge" : `depth-${n.depth}`;
      if (!map.has(key)) map.set(key, CLUSTER_COLORS[map.size % CLUSTER_COLORS.length]!);
      map.set(n.id, map.get(key)!);
    });
    return map;
  }, [graphData]);

  // Build filtered graph data
  const filteredGData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };

    const q = searchQuery.toLowerCase().trim();
    const filteredNodes = graphData.nodes.filter((n) => {
      if ((n.year ?? 9999) < yearRange[0] || (n.year ?? 0) > yearRange[1]) return false;
      if ((n.citationCount ?? 0) < minCitations) return false;
      if (q && !n.title.toLowerCase().includes(q)) return false;
      return true;
    });

    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = graphData.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return {
      nodes: filteredNodes.map((n) => ({
        id: n.id,
        name: n.title,
        year: n.year,
        val: Math.max(Math.log((n.citationCount || 1) + 1) * 2.5, 2),
        isHub: n.isHub,
        isBridge: n.isBridge,
        citationCount: n.citationCount,
        depth: n.depth,
        highlighted: q ? n.title.toLowerCase().includes(q) : false,
        color: clusterColorMap.get(n.id),
      })),
      links: filteredEdges.map((e) => ({
        source: e.source,
        target: e.target,
        influential: e.isInfluential,
      })),
    };
  }, [graphData, searchQuery, yearRange, minCitations, clusterColorMap]);

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const size = node.val ?? 3;
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    // Glow for hub nodes
    if (node.isHub) {
      ctx.beginPath();
      ctx.arc(x, y, size + 3, 0, 2 * Math.PI);
      const grd = ctx.createRadialGradient(x, y, 0, x, y, size + 3);
      grd.addColorStop(0, "rgba(255,255,255,0.2)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grd;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, size, 0, 2 * Math.PI);
    ctx.fillStyle = node.isHub
      ? "hsl(0,0%,90%)"
      : node.isBridge
      ? "hsl(0,0%,70%)"
      : node.highlighted
      ? "hsl(0,0%,80%)"
      : (node.color ?? "hsl(0,0%,45%)");
    ctx.fill();

    // Label for larger nodes
    if (size > 5 || globalScale > 1.5) {
      const label = node.name?.substring(0, 30) ?? "";
      ctx.font = `${Math.max(8, 10 / globalScale)}px monospace`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.textAlign = "center";
      ctx.fillText(label, x, y + size + 6);
    }
  }, []);

  if (isLoading || !seedId) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center border border-border rounded bg-card relative overflow-hidden">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          <div className="font-mono text-sm text-muted-foreground">Building network graph…</div>
        </div>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return <div className="p-8 text-center text-muted-foreground panel rounded">Insufficient data to generate network graph. Try collecting more papers first.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-mono text-foreground flex items-center gap-2">
          <Network className="w-5 h-5 text-muted-foreground" />
          Citation Network Topology
        </h3>
        <div className="flex gap-2 items-center font-mono text-xs">
          <Badge variant="outline">{filteredGData.nodes.length}/{graphData.totalNodes} Nodes</Badge>
          <Badge variant="outline">{filteredGData.links.length} Edges</Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            className="font-mono text-xs h-7 px-2 gap-1"
          >
            <Filter className="w-3 h-3" />
            Filters
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="panel rounded border border-border p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2 block">Search Papers</label>
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by title..."
                    className="w-full pl-7 pr-3 py-1.5 text-xs bg-background border border-border rounded font-mono focus:outline-none focus:ring-1 focus:ring-border"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2 block">
                  Year Range: {yearRange[0]} – {yearRange[1]}
                </label>
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground">{minYear}</span>
                  <input
                    type="range"
                    min={minYear}
                    max={new Date().getFullYear()}
                    value={yearRange[0]}
                    onChange={(e) => setYearRange([Number(e.target.value), yearRange[1]])}
                    className="flex-1 accent-foreground h-1"
                  />
                  <input
                    type="range"
                    min={minYear}
                    max={new Date().getFullYear()}
                    value={yearRange[1]}
                    onChange={(e) => setYearRange([yearRange[0], Number(e.target.value)])}
                    className="flex-1 accent-foreground h-1"
                  />
                  <span className="text-xs text-muted-foreground">{new Date().getFullYear()}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2 block">
                  Min Citations: {minCitations}
                </label>
                <input
                  type="range"
                  min={0}
                  max={Math.max(maxCitations, 1)}
                  value={minCitations}
                  onChange={(e) => setMinCitations(Number(e.target.value))}
                  className="w-full accent-foreground h-1"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>0</span>
                  <span>{maxCitations.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-full h-[650px] border border-border rounded overflow-hidden bg-card" ref={containerRef}>
        <ForceGraph2D
          width={dimensions.width}
          height={dimensions.height}
          graphData={filteredGData}
          nodeLabel={(node) => `${(node as any).name} (${(node as any).year ?? "?"}) — ${(node as any).citationCount ?? 0} citations`}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => "replace"}
          linkColor={(link) => (link as any).influential ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.05)"}
          linkWidth={(link) => (link as any).influential ? 1.5 : 0.5}
          onNodeClick={(node) => setSelectedNode((node as any).id)}
          backgroundColor="#0a0a0a"
          enableNodeDrag={true}
          enableZoomInteraction={true}
          cooldownTicks={150}
        />

        <div className="absolute bottom-4 left-4 bg-card border border-border p-3 rounded text-xs font-mono flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[hsl(0,0%,90%)]" />
            Hub Paper
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[hsl(0,0%,70%)]" />
            Bridge Paper
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[hsl(0,0%,45%)]" />
            Standard Node
          </div>
          {searchQuery && (
            <div className="flex items-center gap-2 border-t border-border pt-2 mt-1">
              <div className="w-3 h-3 rounded-full bg-[hsl(0,0%,80%)]" />
              Search Match
            </div>
          )}
        </div>

        <AnimatePresence>
          {selectedNode && (
            <PaperSummaryPanel paperId={selectedNode} onClose={() => setSelectedNode(null)} />
          )}
        </AnimatePresence>
      </div>
      
      {graphData.lineages && graphData.lineages.length > 0 && (
        <div className="space-y-3 mt-6">
          <h4 className="font-mono text-sm text-muted-foreground uppercase tracking-widest border-b border-border pb-2">Key Research Lineages</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {graphData.lineages.map((lineage, i) => (
              <div
                key={lineage.id}
                className="p-3 border border-border rounded bg-secondary/30 cursor-pointer hover:border-foreground/30 transition-colors"
                onClick={() => {
                  const paperId = lineage.paperIds?.[0];
                  if (paperId) setSelectedNode(paperId);
                }}
              >
                <div
                  className="w-2 h-2 rounded-full mb-2 inline-block mr-1"
                  style={{ backgroundColor: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }}
                />
                <div className="font-semibold text-xs mb-1 text-foreground font-mono truncate">{lineage.name}</div>
                <p className="text-xs text-muted-foreground">{lineage.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
