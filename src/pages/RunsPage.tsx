import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { triggerRun } from '../lib/api';
import { RunDetail } from '../components/RunDetail';

interface Run {
  id: string;
  run_label: string;
  type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
}

export function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    supabase
      .from('runs')
      .select('*')
      .order('started_at', { ascending: false })
      .then(({ data }) => setRuns(data || []));

    // Realtime subscription for run status updates
    const channel = supabase
      .channel('runs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' }, (payload) => {
        setRuns((prev) => {
          const updated = payload.new as Run;
          const exists = prev.find((r) => r.id === updated.id);
          if (exists) return prev.map((r) => (r.id === updated.id ? updated : r));
          return [updated, ...prev];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerRun();
      alert('Run triggered! It will appear in the list shortly.');
    } catch (e) {
      alert(`Error: ${(e as Error).message}`);
    } finally {
      setTriggering(false);
    }
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    serp_done: 'bg-blue-100 text-blue-800',
    scrap_done: 'bg-blue-100 text-blue-800',
    analysis_done: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Runs</h1>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50"
        >
          {triggering ? 'Launching...' : 'Launch a run'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-2">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setSelectedRunId(run.id)}
              className={`w-full text-left p-3 rounded border ${
                selectedRunId === run.id ? 'border-gray-900 bg-white' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="font-medium text-sm">{run.run_label}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[run.status] || 'bg-gray-100'}`}>
                  {run.status}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(run.started_at).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
          {runs.length === 0 && (
            <p className="text-gray-400 text-sm">No runs yet. Launch your first run!</p>
          )}
        </div>

        <div className="col-span-2">
          {selectedRunId ? (
            <RunDetail runId={selectedRunId} />
          ) : (
            <p className="text-gray-400 text-sm">Select a run to see details.</p>
          )}
        </div>
      </div>
    </div>
  );
}
