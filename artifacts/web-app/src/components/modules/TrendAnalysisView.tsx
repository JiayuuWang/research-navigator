import React, { useMemo } from "react";
import { useGetTrends, useComputeTrends } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/ui";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ScatterChart, Scatter, ZAxis, Cell,
} from "recharts";
import { Activity, Play, TrendingUp, Zap, Users, Layers, Building2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const TREND_COLORS = [
  "hsl(0,0%,85%)",
  "hsl(0,0%,65%)",
  "hsl(0,0%,50%)",
  "hsl(0,0%,38%)",
  "hsl(0,0%,28%)",
];

const CLUSTER_COLORS = [
  "#e0e0e0", "#b0b0b0", "#888888", "#606060", "#404040",
  "#d0d0d0", "#989898", "#707070",
];

function ClusterBubbleChart({ clusters }: { clusters: Array<{ id: string; label: string; paperCount: number; growthRate: number }> }) {
  const data = clusters.map((c, i) => ({
    x: (i % 4) * 25 + 12,
    y: Math.max(c.growthRate * 100, -50),
    z: Math.max(c.paperCount, 1),
    label: c.label,
    paperCount: c.paperCount,
    growthRate: Math.round(c.growthRate * 100),
    fill: CLUSTER_COLORS[i % CLUSTER_COLORS.length]!,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded p-2 text-xs font-mono">
        <div className="font-bold text-foreground mb-1">{d.label}</div>
        <div className="text-muted-foreground">{d.paperCount} papers</div>
        <div className={d.growthRate >= 0 ? "text-foreground" : "text-muted-foreground"}>
          {d.growthRate >= 0 ? "+" : ""}{d.growthRate}% growth
        </div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
        <XAxis type="number" dataKey="x" domain={[0, 100]} hide />
        <YAxis type="number" dataKey="y" domain={[-60, 150]} tickFormatter={(v) => `${v}%`} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10, fontFamily: "monospace" }} label={{ value: "Growth Rate", angle: -90, position: "insideLeft", style: { fontSize: 10, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" } }} />
        <ZAxis type="number" dataKey="z" range={[100, 2000]} />
        <Tooltip content={<CustomTooltip />} />
        <Scatter data={data}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} fillOpacity={0.85} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function TrendAnalysisView({ runId }: { runId: string }) {
  const { data, isLoading } = useGetTrends(runId);
  const computeMutation = useComputeTrends();
  const queryClient = useQueryClient();

  const chartData = useMemo(() => {
    if (!data?.keywordTrends?.length) return [];
    const yearsSet = new Set<number>();
    data.keywordTrends.forEach((kt) => kt.dataPoints.forEach((dp) => yearsSet.add(dp.year)));
    const years = Array.from(yearsSet).sort();

    return years.map((year) => {
      const point: Record<string, any> = { year: year.toString() };
      data.keywordTrends.slice(0, 5).forEach((kt) => {
        const dp = kt.dataPoints.find((d) => d.year === year);
        point[kt.keyword] = dp ? dp.count : 0;
      });
      return point;
    });
  }, [data]);

  const authorChartData = useMemo(() => {
    if (!data?.topAuthors?.length) return [];
    return data.topAuthors.slice(0, 10).map((a) => ({
      name: a.name.length > 20 ? a.name.substring(0, 20) + "…" : a.name,
      fullName: a.name,
      paperCount: a.paperCount,
      citationCount: a.citationCount,
      hIndex: a.hIndex ?? 0,
    }));
  }, [data]);

  const institutionChartData = useMemo(() => {
    if (!data?.topInstitutions?.length) return [];
    return data.topInstitutions.slice(0, 10).map((inst) => ({
      name: inst.institution.length > 28 ? inst.institution.substring(0, 28) + "…" : inst.institution,
      fullName: inst.institution,
      paperCount: inst.paperCount,
      citationCount: inst.citationCount,
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center font-mono text-muted-foreground">
        <Activity className="w-5 h-5 animate-pulse mr-2" /> Loading trend vectors...
      </div>
    );
  }

  if (!data || data.keywordTrends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 panel rounded text-center space-y-4 border-dashed border-border">
        <Activity className="w-12 h-12 text-muted-foreground mb-2" />
        <h3 className="text-xl font-medium">Trend Analysis Not Initialized</h3>
        <p className="text-muted-foreground text-sm max-w-md">
          Extract keyword vectors, compute growth velocities, and generate narrative insights across the corpus.
        </p>
        <Button
          variant="primary"
          onClick={() =>
            computeMutation.mutate({ runId }, {
              onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/trends/${runId}`] }),
            })
          }
          disabled={computeMutation.isPending}
          className="font-mono mt-4"
        >
          {computeMutation.isPending
            ? "Computing..."
            : <><Play className="w-4 h-4 mr-2" /> Execute Trend Analysis</>}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <h3 className="text-xl font-mono text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-muted-foreground" />
          Temporal Trend Vectors
        </h3>
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span>{data.totalPapersAnalyzed} papers analyzed</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs font-mono"
            onClick={() =>
              computeMutation.mutate({ runId }, {
                onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/trends/${runId}`] }),
              })
            }
            disabled={computeMutation.isPending}
          >
            {computeMutation.isPending ? "Recomputing…" : "↺ Recompute"}
          </Button>
        </div>
      </div>

      {/* Row 1: Keyword trajectories + AI narrative */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
              Keyword Trajectories (Top 5)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" vertical={false} />
                  <XAxis
                    dataKey="year"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 11, fontFamily: "monospace" }}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 11, fontFamily: "monospace" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                      fontFamily: "monospace",
                      fontSize: "11px",
                    }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "monospace", paddingTop: "16px" }} />
                  {data.keywordTrends.slice(0, 5).map((kt, i) => (
                    <Line
                      key={kt.keyword}
                      type="monotone"
                      dataKey={kt.keyword}
                      stroke={TREND_COLORS[i % TREND_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 1, fill: "hsl(var(--background))" }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Zap className="w-4 h-4" /> AI Narrative Synthesis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-foreground/90">
              {data.narrativeSummary}
            </p>
            <div className="mt-5 space-y-3">
              <h4 className="text-xs font-mono text-muted-foreground uppercase border-b border-border/50 pb-1">Emerging Clusters</h4>
              {data.clusters.slice(0, 4).map((cluster, i) => (
                <div key={cluster.id} className="text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground mb-0.5">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }}
                    />
                    {cluster.label}
                    <span className="text-muted-foreground font-normal ml-auto">{cluster.paperCount} papers</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pl-3.5">
                    {cluster.keywords.slice(0, 3).map((kw, j) => (
                      <Badge key={j} variant="outline" className="text-[10px] py-0 h-4">{kw}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Cluster bubble chart + Author bar chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" /> Cluster Landscape
              <span className="text-muted-foreground/60 font-normal normal-case tracking-normal ml-1">
                (bubble size = paper count, y = growth rate)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.clusters.length > 0 ? (
              <ClusterBubbleChart clusters={data.clusters} />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                No clusters computed yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> Active Researchers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {authorChartData.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={authorChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" horizontal={false} />
                    <XAxis
                      type="number"
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 10, fontFamily: "monospace" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={130}
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 10, fontFamily: "monospace" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                        fontFamily: "monospace",
                        fontSize: "11px",
                      }}
                      formatter={(value: number, name: string) => [value, name === "paperCount" ? "Papers" : "Citations"]}
                      labelFormatter={(label) => authorChartData.find((a) => a.name === label)?.fullName ?? label}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "monospace" }} />
                    <Bar dataKey="paperCount" name="Papers in Run" fill="hsl(0,0%,70%)" radius={[0, 3, 3, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
                <div>
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No author data available. Authors are populated when collecting papers.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Institution Rankings */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5" /> Institution Rankings
            <span className="text-muted-foreground/60 font-normal normal-case tracking-normal ml-1">
              (by paper count in corpus)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {institutionChartData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={institutionChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 10, fontFamily: "monospace" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={180}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 10, fontFamily: "monospace" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                      fontFamily: "monospace",
                      fontSize: "11px",
                    }}
                    formatter={(value: number, name: string) => [value, name === "paperCount" ? "Papers" : "Citations"]}
                    labelFormatter={(label) => institutionChartData.find((i) => i.name === label)?.fullName ?? label}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "monospace" }} />
                  <Bar dataKey="paperCount" name="Papers" fill="hsl(0,0%,70%)" radius={[0, 3, 3, 0]} maxBarSize={22} />
                  <Bar dataKey="citationCount" name="Citations" fill="hsl(0,0%,50%)" radius={[0, 3, 3, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
              <div>
                <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No institution affiliation data available. Affiliations are sourced from author metadata.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 3: Growth ranking table */}
      {data.keywordTrends.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
              Keyword Growth Rankings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {data.keywordTrends.slice(0, 20).map((kt, i) => (
                <div key={kt.keyword} className="p-2 border border-border/30 rounded text-xs bg-secondary/20">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-mono text-muted-foreground text-[10px]">#{i + 1}</span>
                    <span
                      className="font-semibold text-foreground truncate"
                      title={kt.keyword}
                    >
                      {kt.keyword}
                    </span>
                  </div>
                  <div className={`font-mono text-[10px] ${kt.growthRate > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {kt.growthRate > 0 ? "+" : ""}{(kt.growthRate * 100).toFixed(0)}% growth
                  </div>
                  <div className="text-muted-foreground text-[10px]">Peak: {kt.peakYear}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
