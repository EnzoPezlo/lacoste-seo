import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Monitor, Smartphone, ChevronDown } from 'lucide-react';

interface SerpResult {
  id: string;
  run_id: string;
  country: string;
  device: string;
  position: number;
  url: string;
  domain: string;
  title: string;
  is_lacoste: boolean;
  actor_name: string | null;
  actor_category: string | null;
  page_type: string | null;
  runs: { run_label: string };
  keywords: { keyword: string };
}

function positionBadge(pos: number) {
  if (pos <= 3) return 'bg-emerald-50 text-emerald-700 font-bold';
  if (pos <= 10) return 'bg-sky-50 text-sky-700';
  return 'bg-zinc-100 text-zinc-500';
}

const countryFlags: Record<string, string> = { FR: '🇫🇷', US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', ES: '🇪🇸', IT: '🇮🇹' };

export function SerpPage() {
  const [results, setResults] = useState<SerpResult[]>([]);
  const [runs, setRuns] = useState<Array<{ id: string; run_label: string }>>([]);
  const [filters, setFilters] = useState({ run_id: '', keyword: '', country: '', device: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('runs').select('id, run_label').order('started_at', { ascending: false })
      .then(({ data }) => setRuns(data || []));
  }, []);

  useEffect(() => {
    if (!filters.run_id) return;
    setLoading(true);
    let query = supabase
      .from('serp_results')
      .select('*, runs!inner(run_label), keywords!inner(keyword)')
      .eq('run_id', filters.run_id)
      .eq('serp_status', 'ok')
      .order('position');

    if (filters.country) query = query.eq('country', filters.country);
    if (filters.device) query = query.eq('device', filters.device);

    query.then(({ data }) => {
      setResults(data || []);
      setLoading(false);
    });
  }, [filters.run_id, filters.country, filters.device]);

  const filteredResults = useMemo(() => {
    if (!filters.keyword) return results;
    return results.filter((r) =>
      (r as any).keywords.keyword.toLowerCase().includes(filters.keyword.toLowerCase()),
    );
  }, [results, filters.keyword]);

  const lacosteCount = filteredResults.filter((r) => r.is_lacoste).length;
  const avgPosition = filteredResults.length
    ? (filteredResults.reduce((s, r) => s + r.position, 0) / filteredResults.length).toFixed(1)
    : '—';
  const top3Count = filteredResults.filter((r) => r.position <= 3).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">SERP Results</h1>
        <p className="text-sm text-zinc-500 mt-1">Search engine ranking data across keywords and markets</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
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
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              placeholder="Filter keyword..."
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-700 placeholder:text-zinc-400 hover:border-zinc-300 transition-colors"
            />
          </div>
          <div className="relative">
            <select
              value={filters.country}
              onChange={(e) => setFilters({ ...filters, country: e.target.value })}
              className="appearance-none bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-zinc-700 hover:border-zinc-300 transition-colors"
            >
              <option value="">All countries</option>
              {[...new Set(results.map((r) => r.country))].sort().map((c) => (
                <option key={c} value={c}>{countryFlags[c] || ''} {c}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>
          <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-lg p-1">
            <button
              onClick={() => setFilters({ ...filters, device: '' })}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                !filters.device ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilters({ ...filters, device: 'desktop' })}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filters.device === 'desktop' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Monitor size={12} /> Desktop
            </button>
            <button
              onClick={() => setFilters({ ...filters, device: 'mobile' })}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filters.device === 'mobile' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Smartphone size={12} /> Mobile
            </button>
          </div>
        </div>
      </div>

      {!filters.run_id ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <Search size={32} className="mx-auto text-zinc-300 mb-3" />
          <p className="text-zinc-400 text-sm">Select a run to view SERP results.</p>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <p className="text-zinc-400 text-sm">Loading...</p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-zinc-200 p-4">
              <div className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Results</div>
              <div className="text-2xl font-bold text-zinc-900 mt-1">{filteredResults.length}</div>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-4">
              <div className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Lacoste present</div>
              <div className="text-2xl font-bold text-brand mt-1">{lacosteCount}</div>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-4">
              <div className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Avg position</div>
              <div className="text-2xl font-bold text-zinc-900 mt-1">{avgPosition}</div>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 p-4">
              <div className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Top 3</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">{top3Count}</div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/50">
                    <th className="text-left p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide w-14">#</th>
                    <th className="text-left p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Keyword</th>
                    <th className="text-left p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Actor</th>
                    <th className="text-left p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Domain</th>
                    <th className="text-left p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Category</th>
                    <th className="text-left p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Type</th>
                    <th className="text-left p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide w-16">Mkt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredResults.map((r) => (
                    <tr
                      key={r.id}
                      className={`transition-colors ${
                        r.is_lacoste
                          ? 'bg-brand-light/40 hover:bg-brand-light/60'
                          : 'hover:bg-zinc-50'
                      }`}
                    >
                      <td className="p-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs ${positionBadge(r.position)}`}>
                          {r.position}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-zinc-900">{(r as any).keywords.keyword}</td>
                      <td className="p-3 text-zinc-700">{r.actor_name || r.domain}</td>
                      <td className="p-3 text-zinc-400 text-xs">{r.domain}</td>
                      <td className="p-3">
                        {r.actor_category && (
                          <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">{r.actor_category}</span>
                        )}
                      </td>
                      <td className="p-3">
                        {r.page_type && (
                          <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">{r.page_type}</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span title={r.country}>{countryFlags[r.country] || r.country}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredResults.length === 0 && (
              <div className="p-8 text-center text-zinc-400 text-sm">No results found.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
