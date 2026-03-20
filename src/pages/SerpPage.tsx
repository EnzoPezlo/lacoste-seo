import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

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

export function SerpPage() {
  const [results, setResults] = useState<SerpResult[]>([]);
  const [runs, setRuns] = useState<Array<{ id: string; run_label: string }>>([]);
  const [filters, setFilters] = useState({ run_id: '', keyword: '', country: '', device: '' });

  useEffect(() => {
    supabase.from('runs').select('id, run_label').order('started_at', { ascending: false })
      .then(({ data }) => setRuns(data || []));
  }, []);

  useEffect(() => {
    if (!filters.run_id) return;
    let query = supabase
      .from('serp_results')
      .select('*, runs!inner(run_label), keywords!inner(keyword)')
      .eq('run_id', filters.run_id)
      .eq('serp_status', 'ok')
      .order('position');

    if (filters.country) query = query.eq('country', filters.country);
    if (filters.device) query = query.eq('device', filters.device);

    query.then(({ data }) => setResults(data || []));
  }, [filters]);

  const filteredResults = useMemo(() => {
    if (!filters.keyword) return results;
    return results.filter((r) =>
      (r as any).keywords.keyword.toLowerCase().includes(filters.keyword.toLowerCase()),
    );
  }, [results, filters.keyword]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">SERP Results</h1>

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
        <input
          placeholder="Filter keyword..."
          value={filters.keyword}
          onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
          className="border rounded px-3 py-1.5 text-sm"
        />
        <select
          value={filters.country}
          onChange={(e) => setFilters({ ...filters, country: e.target.value })}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">All countries</option>
          {[...new Set(results.map((r) => r.country))].sort().map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filters.device}
          onChange={(e) => setFilters({ ...filters, device: e.target.value })}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">All devices</option>
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
        </select>
      </div>

      {!filters.run_id ? (
        <p className="text-gray-400 text-sm">Select a run to view SERP results.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="p-2 w-12">#</th>
                <th className="p-2">Keyword</th>
                <th className="p-2">Actor</th>
                <th className="p-2">Domain</th>
                <th className="p-2">Category</th>
                <th className="p-2">Page Type</th>
                <th className="p-2">Country</th>
                <th className="p-2">Device</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b ${r.is_lacoste ? 'bg-green-50 font-medium' : 'hover:bg-gray-50'}`}
                >
                  <td className="p-2 text-gray-400">{r.position}</td>
                  <td className="p-2">{(r as any).keywords.keyword}</td>
                  <td className="p-2">{r.actor_name || r.domain}</td>
                  <td className="p-2 text-gray-500">{r.domain}</td>
                  <td className="p-2">
                    <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.actor_category || '—'}</span>
                  </td>
                  <td className="p-2">
                    <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.page_type || '—'}</span>
                  </td>
                  <td className="p-2">{r.country}</td>
                  <td className="p-2">{r.device}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredResults.length === 0 && (
            <p className="text-gray-400 text-sm p-4 text-center">No results found.</p>
          )}
        </div>
      )}
    </div>
  );
}
