import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Analyses</h1>

      <div className="flex gap-3 mb-4">
        <select
          value={filters.run_id}
          onChange={(e) => setFilters({ ...filters, run_id: e.target.value })}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">Select a run</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>{r.run_label}</option>
          ))}
        </select>
        <select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">All types</option>
          <option value="lacoste_gap">Lacoste gap</option>
          <option value="position_movement">Position movement</option>
        </select>
      </div>

      {!filters.run_id ? (
        <p className="text-gray-400 text-sm">Select a run to view analyses.</p>
      ) : (
        <div className="space-y-3">
          {analyses.map((a) => (
            <div key={a.id} className="bg-white border rounded">
              <button
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                className="w-full text-left p-4 flex items-center justify-between"
              >
                <div>
                  <span className="font-medium text-sm">{(a as any).keywords.keyword}</span>
                  <span className="text-gray-400 text-sm ml-2">/ {a.country} / {a.device}</span>
                  {a.analysis_type === 'position_movement' && (
                    <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                      {a.actor} {a.position_before === null ? `NR → ${a.position_after}` : `+${a.variation}`}
                    </span>
                  )}
                  {a.analysis_type === 'lacoste_gap' && a.lacoste_position && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      Lacoste #{a.lacoste_position}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  {a.tags?.map((tag) => (
                    <span key={tag} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
              </button>
              {expanded === a.id && (
                <div className="border-t p-4 text-sm whitespace-pre-wrap text-gray-700">
                  {a.content}
                </div>
              )}
            </div>
          ))}
          {analyses.length === 0 && (
            <p className="text-gray-400 text-sm">No analyses found for this run.</p>
          )}
        </div>
      )}
    </div>
  );
}
