import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Target, TrendingUp, ChevronDown, ChevronRight, BarChart3, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface Analysis {
  id: string;
  analysis_type: string;
  actor: string | null;
  content: string;
  tags: string[];
  lacoste_position: number | null;
  position_before: number | null;
  position_after: number | null;
  variation: number | null;
  movement_type: string | null;
  search_intent: string | null;
  country: string;
  device: string;
  keywords: { keyword: string };
  runs: { run_label: string };
}

const countryFlags: Record<string, string> = { FR: '🇫🇷', US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', ES: '🇪🇸', IT: '🇮🇹' };

function MovementBadge({ analysis }: { analysis: Analysis }) {
  if (analysis.analysis_type !== 'position_movement') return null;

  const v = analysis.variation ?? 0;
  if (analysis.position_before === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-medium">
        <ArrowUpRight size={12} /> New entry #{analysis.position_after}
      </span>
    );
  }
  if (v > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
        <ArrowDownRight size={12} /> -{v} pos
      </span>
    );
  }
  if (v < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
        <ArrowUpRight size={12} /> +{Math.abs(v)} pos
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-medium">
      <Minus size={12} /> Stable
    </span>
  );
}

export function AnalysesPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [runs, setRuns] = useState<Array<{ id: string; run_label: string }>>([]);
  const [filters, setFilters] = useState({ run_id: '', type: '' });
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('runs').select('id, run_label').order('started_at', { ascending: false })
      .then(({ data }) => setRuns(data || []));
  }, []);

  useEffect(() => {
    if (!filters.run_id) return;
    let query = supabase
      .from('analyses')
      .select('*, keywords!inner(keyword), runs!inner(run_label)')
      .eq('run_id', filters.run_id)
      .order('created_at');

    if (filters.type) query = query.eq('analysis_type', filters.type);

    query.then(({ data }) => setAnalyses(data || []));
  }, [filters]);

  const gapCount = analyses.filter((a) => a.analysis_type === 'lacoste_gap').length;
  const movementCount = analyses.filter((a) => a.analysis_type === 'position_movement').length;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Analyses</h1>
        <p className="text-sm text-zinc-500 mt-1">LLM-generated competitive insights and ranking movements</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={filters.run_id}
              onChange={(e) => setFilters({ ...filters, run_id: e.target.value })}
              className="appearance-none bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-zinc-700 hover:border-zinc-300 transition-colors"
            >
              <option value="">Select a run</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>{r.run_label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>
          <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-lg p-1">
            <button
              onClick={() => setFilters({ ...filters, type: '' })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                !filters.type ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <BarChart3 size={12} /> All
            </button>
            <button
              onClick={() => setFilters({ ...filters, type: 'lacoste_gap' })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filters.type === 'lacoste_gap' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Target size={12} /> Gaps ({gapCount})
            </button>
            <button
              onClick={() => setFilters({ ...filters, type: 'position_movement' })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filters.type === 'position_movement' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <TrendingUp size={12} /> Movements ({movementCount})
            </button>
          </div>
        </div>
      </div>

      {!filters.run_id ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <BarChart3 size={32} className="mx-auto text-zinc-300 mb-3" />
          <p className="text-zinc-400 text-sm">Select a run to view analyses.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {analyses.map((a) => {
            const isGap = a.analysis_type === 'lacoste_gap';
            const isExpanded = expanded === a.id;

            return (
              <div
                key={a.id}
                className={`bg-white rounded-xl border overflow-hidden transition-all ${
                  isGap ? 'border-l-4 border-l-brand border-zinc-200' : 'border-l-4 border-l-amber-400 border-zinc-200'
                }`}
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : a.id)}
                  className="w-full text-left p-4 flex items-center gap-3 hover:bg-zinc-50/50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-zinc-400 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-zinc-900">
                        {(a as any).keywords.keyword}
                      </span>
                      <span className="text-zinc-400 text-xs">
                        {countryFlags[a.country] || a.country} {a.device}
                      </span>
                      {isGap && a.lacoste_position && (
                        <span className="text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full font-medium">
                          Lacoste #{a.lacoste_position}
                        </span>
                      )}
                      {!isGap && a.actor && (
                        <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                          {a.actor}
                        </span>
                      )}
                      <MovementBadge analysis={a} />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {a.tags?.map((tag) => (
                      <span key={tag} className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">
                        {tag}
                      </span>
                    ))}
                    {isGap ? (
                      <Target size={14} className="text-brand ml-1" />
                    ) : (
                      <TrendingUp size={14} className="text-amber-500 ml-1" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-zinc-100 p-5 bg-zinc-50/30">
                    <div className="prose prose-sm max-w-none text-zinc-700 whitespace-pre-wrap leading-relaxed">
                      {a.content}
                    </div>
                    {a.search_intent && (
                      <div className="mt-3 pt-3 border-t border-zinc-100">
                        <span className="text-xs text-zinc-500 font-medium">Search intent: </span>
                        <span className="text-xs text-zinc-700">{a.search_intent}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {analyses.length === 0 && (
            <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
              <AlertTriangle size={24} className="mx-auto text-zinc-300 mb-2" />
              <p className="text-zinc-400 text-sm">No analyses found for this run.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
