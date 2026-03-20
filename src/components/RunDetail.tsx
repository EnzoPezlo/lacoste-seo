import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface RunLog {
  id: string;
  step: string;
  status: string;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export function RunDetail({ runId }: { runId: string }) {
  const [logs, setLogs] = useState<RunLog[]>([]);

  useEffect(() => {
    // Fetch existing logs
    supabase
      .from('run_logs')
      .select('*')
      .eq('run_id', runId)
      .order('created_at')
      .then(({ data }) => setLogs(data || []));

    // Subscribe to new logs in real-time
    const channel = supabase
      .channel(`run-logs-${runId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'run_logs', filter: `run_id=eq.${runId}` },
        (payload) => {
          setLogs((prev) => [...prev, payload.new as RunLog]);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [runId]);

  const statusIcon: Record<string, string> = {
    running: '⏳',
    done: '✅',
    error: '❌',
  };

  // Group logs by step
  const steps = ['serp', 'scrape', 'classify', 'analyze_gap', 'analyze_movement'];
  const logsByStep = new Map<string, RunLog[]>();
  for (const l of logs) {
    if (!logsByStep.has(l.step)) logsByStep.set(l.step, []);
    logsByStep.get(l.step)!.push(l);
  }

  return (
    <div className="bg-white border border-gray-200 rounded p-4">
      <h2 className="font-semibold mb-4">Run logs</h2>
      {steps.map((step) => {
        const stepLogs = logsByStep.get(step);
        if (!stepLogs) return null;
        const lastLog = stepLogs[stepLogs.length - 1];
        const hasError = stepLogs.some((l) => l.status === 'error');

        return (
          <details key={step} className="mb-2">
            <summary className="cursor-pointer p-2 rounded hover:bg-gray-50 flex items-center gap-2">
              <span>{statusIcon[lastLog.status] || '⏳'}</span>
              <span className="font-medium text-sm">{step}</span>
              <span className="text-xs text-gray-500">{lastLog.message}</span>
              {hasError && <span className="text-xs text-red-500 ml-auto">errors</span>}
            </summary>
            <div className="ml-8 mt-1 space-y-1">
              {stepLogs.map((l) => (
                <div key={l.id} className={`text-xs py-1 ${l.status === 'error' ? 'text-red-600' : 'text-gray-600'}`}>
                  <span className="text-gray-400">{new Date(l.created_at).toLocaleTimeString()}</span>
                  {' '}{l.message}
                </div>
              ))}
            </div>
          </details>
        );
      })}
      {logs.length === 0 && <p className="text-gray-400 text-sm">No logs yet.</p>}
    </div>
  );
}
