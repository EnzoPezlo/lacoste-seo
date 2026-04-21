import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

interface Props {
  keywordId: string;
  keyword: string;
  country?: string;
}

interface SerpRow {
  run_id: string;
  position: number;
  domain: string;
  is_lacoste: boolean;
  country: string;
  device: string;
  runs: { run_label: string; started_at: string };
}

const COLORS = [
  '#00573F', // Lacoste brand green (always first if present)
  '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#10b981', '#f97316',
  '#64748b', '#a855f7', '#14b8a6', '#e11d48',
];

export function PositionChart({ keywordId, keyword, country }: Props) {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [actors, setActors] = useState<string[]>([]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      let query = supabase
        .from('serp_results')
        .select('run_id, position, domain, is_lacoste, country, device, runs!inner(run_label, started_at)')
        .eq('keyword_id', keywordId)
        .eq('device', 'mobile')
        .lte('position', 10)
        .order('position');

      if (country) {
        query = query.eq('country', country);
      }

      const { data, error } = await query;

      if (error || !data) {
        setLoading(false);
        return;
      }

      const rows = data as unknown as SerpRow[];

      // Group by run, sorted by date
      const runMap = new Map<string, { label: string; date: string; results: SerpRow[] }>();
      for (const r of rows) {
        const runId = r.run_id;
        if (!runMap.has(runId)) {
          runMap.set(runId, {
            label: r.runs.run_label,
            date: r.runs.started_at,
            results: [],
          });
        }
        runMap.get(runId)!.results.push(r);
      }

      // Sort runs by date
      const sortedRuns = [...runMap.entries()].sort((a, b) =>
        a[1].date.localeCompare(b[1].date)
      );

      // Collect all unique actors across all runs (top 10 only)
      const actorSet = new Map<string, boolean>(); // domain -> isLacoste
      for (const [, run] of sortedRuns) {
        for (const r of run.results) {
          if (!actorSet.has(r.domain)) {
            actorSet.set(r.domain, r.is_lacoste);
          }
        }
      }

      // Sort actors: Lacoste first, then by best average position
      const actorPositions = new Map<string, number[]>();
      for (const [, run] of sortedRuns) {
        for (const r of run.results) {
          if (!actorPositions.has(r.domain)) actorPositions.set(r.domain, []);
          actorPositions.get(r.domain)!.push(r.position);
        }
      }

      const sortedActors = [...actorSet.entries()]
        .sort((a, b) => {
          // Lacoste always first
          if (a[1]) return -1;
          if (b[1]) return 1;
          // Then by average position
          const avgA = (actorPositions.get(a[0]) || []).reduce((s, v) => s + v, 0) / (actorPositions.get(a[0])?.length || 1);
          const avgB = (actorPositions.get(b[0]) || []).reduce((s, v) => s + v, 0) / (actorPositions.get(b[0])?.length || 1);
          return avgA - avgB;
        })
        .map(([domain]) => domain);

      // Build chart data: one point per run
      const points = sortedRuns.map(([, run]) => {
        const point: any = {
          name: formatLabel(run.label),
          fullLabel: run.label,
        };
        for (const actor of sortedActors) {
          const result = run.results.find(r => r.domain === actor);
          point[actor] = result ? result.position : null;
        }
        return point;
      });

      setChartData(points);
      setActors(sortedActors);
      setLoading(false);
    }

    fetchData();
  }, [keywordId, country]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  if (chartData.length < 2) {
    return (
      <div className="text-center py-6 text-zinc-400 text-sm">
        Pas assez de runs pour afficher l'évolution (minimum 2 runs nécessaires).
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-700 mb-3">
        Évolution des positions — {keyword} {country ? `(${country})` : ''}
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
          />
          <YAxis
            reversed
            domain={[1, 10]}
            ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            label={{ value: 'Position', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#94a3b8' } }}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white border border-zinc-200 rounded-lg shadow-lg p-3 text-xs max-w-xs">
                  <div className="font-medium text-zinc-700 mb-2">{payload[0]?.payload?.fullLabel || label}</div>
                  <div className="space-y-1">
                    {payload
                      .filter((p: any) => p.value !== null)
                      .sort((a: any, b: any) => (a.value as number) - (b.value as number))
                      .map((p: any) => (
                        <div key={p.dataKey} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                          <span className="text-zinc-600 truncate">{simplifyDomain(p.dataKey as string)}</span>
                          <span className="font-semibold text-zinc-800 ml-auto">#{p.value}</span>
                        </div>
                      ))}
                  </div>
                </div>
              );
            }}
          />
          <Legend
            formatter={(value: string) => simplifyDomain(value)}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          {actors.map((actor, i) => {
            const isLacoste = actor.includes('lacoste.com');
            return (
              <Line
                key={actor}
                type="monotone"
                dataKey={actor}
                stroke={isLacoste ? COLORS[0] : COLORS[(i % (COLORS.length - 1)) + 1]}
                strokeWidth={isLacoste ? 3 : 1.5}
                dot={{ r: isLacoste ? 5 : 3 }}
                connectNulls={false}
                strokeDasharray={isLacoste ? undefined : undefined}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function simplifyDomain(domain: string): string {
  return domain
    .replace(/^www\./, '')
    .replace(/\.(com|fr|co\.uk|de|es|it|eu|net|org|ma)$/, '');
}

function formatLabel(label: string): string {
  // "17/04/26 - 7 kw - claude opus" → "17/04"
  const match = label.match(/^(\d{2})\/(\d{2})/);
  if (match) return `${match[1]}/${match[2]}`;
  // Old format fallback
  const old = label.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (old) return `${old[3]}/${old[2]}`;
  return label.slice(0, 10);
}
