import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { triggerRun } from '../lib/api';
import { RunDetail } from '../components/RunDetail';
import { toast } from 'sonner';
import { Play, Clock, CheckCircle2, AlertCircle, Loader2, Copy } from 'lucide-react';

interface Run {
  id: string;
  run_label: string;
  type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
}

const statusConfig: Record<string, { label: string; color: string; border: string; icon: typeof CheckCircle2 }> = {
  pending: { label: 'Pending', color: 'bg-amber-50 text-amber-700', border: 'border-l-amber-400', icon: Clock },
  serp_done: { label: 'SERP done', color: 'bg-sky-50 text-sky-700', border: 'border-l-sky-400', icon: Loader2 },
  scrap_done: { label: 'Scraped', color: 'bg-sky-50 text-sky-700', border: 'border-l-sky-400', icon: Loader2 },
  analysis_done: { label: 'Analyzed', color: 'bg-violet-50 text-violet-700', border: 'border-l-violet-400', icon: Loader2 },
  completed: { label: 'Completed', color: 'bg-emerald-50 text-emerald-700', border: 'border-l-emerald-400', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-50 text-red-700', border: 'border-l-red-400', icon: AlertCircle },
};

function formatRunLabel(label: string): string {
  // Old format: "2026-03-26_manual_14h30" -> "26/03/2026 14h30 (manual)"
  const oldMatch = label.match(/^(\d{4})-(\d{2})-(\d{2})_(\w+)_(\d{2}h\d{2})$/);
  if (oldMatch) {
    const [, y, m, d, type, time] = oldMatch;
    return `${d}/${m}/${y} ${time} (${type})`;
  }
  return label;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function duration(start: string, end: string | null) {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
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
      toast.success('Pipeline triggered — it will appear in the list shortly.');
    } catch (e) {
      toast.error(`Failed to trigger: ${(e as Error).message}`);
    } finally {
      setTriggering(false);
    }
  };

  const completedRuns = runs.filter((r) => r.status === 'completed').length;
  const inProgressRuns = runs.filter((r) => !['completed', 'failed'].includes(r.status)).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Pipeline Runs</h1>
          <p className="text-sm text-zinc-500 mt-1">Monitor and manage SEO pipeline executions</p>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors shadow-sm"
        >
          {triggering ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {triggering ? 'Launching...' : 'Launch a run'}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="text-sm text-zinc-500 font-medium">Total runs</div>
          <div className="text-3xl font-bold text-zinc-900 mt-1">{runs.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="text-sm text-zinc-500 font-medium">Completed</div>
          <div className="text-3xl font-bold text-emerald-600 mt-1">{completedRuns}</div>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="text-sm text-zinc-500 font-medium">In progress</div>
          <div className="text-3xl font-bold text-sky-600 mt-1">{inProgressRuns}</div>
        </div>
      </div>

      {/* Run list + Detail */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-2">
          {runs.map((run) => {
            const cfg = statusConfig[run.status] || statusConfig.pending;
            const StatusIcon = cfg.icon;
            return (
              <button
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
                className={`w-full text-left p-4 rounded-xl border-l-4 bg-white border border-zinc-200 transition-all ${cfg.border} ${
                  selectedRunId === run.id
                    ? 'ring-2 ring-brand/30 border-zinc-300'
                    : 'hover:border-zinc-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-zinc-900">{formatRunLabel(run.run_label)}</span>
                  <span className="text-xs text-zinc-400 uppercase">{run.type}</span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <code className="text-[10px] text-zinc-400 font-mono truncate">{run.id}</code>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(run.id);
                      toast.success('Run ID copied');
                    }}
                    className="text-zinc-300 hover:text-zinc-500 transition-colors shrink-0"
                    title="Copy run ID"
                  >
                    <Copy size={10} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                    <StatusIcon size={12} />
                    {cfg.label}
                  </span>
                  <span className="text-xs text-zinc-400">{formatDate(run.started_at)}</span>
                  {run.finished_at && (
                    <span className="text-xs text-zinc-400 ml-auto">{duration(run.started_at, run.finished_at)}</span>
                  )}
                </div>
              </button>
            );
          })}
          {runs.length === 0 && (
            <div className="text-center py-12">
              <Play size={32} className="mx-auto text-zinc-300 mb-3" />
              <p className="text-zinc-400 text-sm">No runs yet. Launch your first run!</p>
            </div>
          )}
        </div>

        <div className="col-span-2">
          {selectedRunId ? (
            <RunDetail runId={selectedRunId} />
          ) : (
            <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
              <Clock size={32} className="mx-auto text-zinc-300 mb-3" />
              <p className="text-zinc-400 text-sm">Select a run to see its details and logs.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
