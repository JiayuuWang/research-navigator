import React from "react";
import { useGetTrends, useComputeTrends } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/ui";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { Activity, Play, TrendingUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function TrendAnalysisView({ runId }: { runId: string }) {
  const { data, isLoading } = useGetTrends(runId);
  const computeMutation = useComputeTrends();
  const queryClient = useQueryClient();

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center font-mono text-muted-foreground">Loading trend vectors...</div>;
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center p-12 glass-panel rounded-lg text-center space-y-4 border border-dashed border-border">
        <Activity className="w-12 h-12 text-muted-foreground mb-2" />
        <h3 className="text-xl font-medium">Trend Analysis Not Initialized</h3>
        <p className="text-muted-foreground text-sm max-w-md">Extract keyword vectors, compute growth velocities, and generate narrative insights across the corpus.</p>
        <Button 
          variant="primary" 
          onClick={() => computeMutation.mutate({ runId }, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/trends/${runId}`] })
          })}
          disabled={computeMutation.isPending}
          className="font-mono mt-4"
        >
          {computeMutation.isPending ? "Computing..." : <><Play className="w-4 h-4 mr-2" /> Execute Trend Analysis</>}
        </Button>
      </div>
    );
  }

  // Prepare chart data: Merge dataPoints from top keywords by year
  const yearsSet = new Set<number>();
  data.keywordTrends.forEach(kt => kw.dataPoints.forEach(dp => yearsSet.add(dp.year)));
  const years = Array.from(yearsSet).sort();

  const chartData = years.map(year => {
    const point: any = { year: year.toString() };
    data.keywordTrends.slice(0, 5).forEach(kt => {
      const dp = kt.dataPoints.find(d => d.year === year);
      point[kt.keyword] = dp ? dp.count : 0;
    });
    return point;
  });

  const colors = ["hsl(170 80% 50%)", "hsl(270 70% 60%)", "hsl(45 90% 50%)", "hsl(330 80% 60%)", "hsl(210 90% 60%)"];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end mb-4">
        <h3 className="text-xl font-mono text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Temporal Trend Vectors
        </h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border/50 bg-black/20">
          <CardHeader>
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Keyword Trajectories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.5)" vertical={false} />
                  <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12, fontFamily: 'monospace'}} />
                  <YAxis stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12, fontFamily: 'monospace'}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', fontFamily: 'monospace', paddingTop: '20px' }} />
                  {data.keywordTrends.slice(0, 5).map((kt, i) => (
                    <Line 
                      key={kt.keyword} 
                      type="monotone" 
                      dataKey={kt.keyword} 
                      stroke={colors[i % colors.length]} 
                      strokeWidth={2}
                      dot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                      activeDot={{ r: 6, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-sm font-mono text-primary uppercase tracking-widest flex items-center gap-2">
              <Zap className="w-4 h-4" /> AI Narrative Synthesis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-foreground/90 font-sans">
              {data.narrativeSummary}
            </p>
            <div className="mt-6 space-y-4">
              <h4 className="text-xs font-mono text-muted-foreground uppercase border-b border-border/50 pb-1">Emerging Clusters</h4>
              {data.clusters.slice(0,3).map(cluster => (
                <div key={cluster.id} className="text-xs">
                  <div className="font-semibold text-accent mb-1">{cluster.label}</div>
                  <div className="flex flex-wrap gap-1">
                    {cluster.keywords.slice(0,3).map((kw, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] py-0">{kw}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
