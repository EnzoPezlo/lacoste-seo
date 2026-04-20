import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, FileText, Brain, Target, TrendingUp, CheckCircle2, Loader2, AlertCircle, Circle } from 'lucide-react';

interface RunLog {
  id: string;
  step: string;
  status: string;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

const stepConfig: Record<string, { label: string; icon: typeof Search; description: string }> = {
  serp: { label: 'SERP Collection', icon: Search, description: 'Collecting search engine results' },
  scrape: { label: 'Page Scraping', icon: FileText, description: 'Extracting page content' },
  classify: { label: 'Actor Classification', icon: Brain, description: 'Classifying competitors via LLM' },
  analyze_gap: { label: 'Gap Analysis', icon: Target, description: 'Identifying Lacoste positioning gaps' },
  analyze_movement: { label: 'Movement Analysis', icon: TrendingUp, description: 'Tracking ranking changes' },
};

const STEPS = ['serp', 'scrape', 'classify', 'analyze_gap', 'analyze_movement'];

function StepStatusIcon({ status }: { status: 'done' | 'running' | 'error' | 'pending' }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 size={20} className="text-emerald-500" />;
    case 'running':
      return <Loader2 size={20} className="text-sky-500 animate-spin" />;
    case 'error':
      return <AlertCircle size={20} className="text-red-500" />;
    default:
      return <Circle size={20} className="text-zinc-300" />;
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' });
}

export function RunDetail({ runId }: { runId: string }) {
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from('run_logs')
      .select('*')
      .eq('run_id', runId)
      .order('created_at')
      .then(({ data }) => setLogs(data || []));

    // Fetch keywords analyzed in this run
    supabase
      .from('serp_results')
      .select('keyword_id, keywords!inner(keyword)')
      .eq('run_id', runId)
      .then(({ data }) => {
        const unique = new Set<string>();
        for (const r of data || []) {
          unique.add((r as any).keywords.keyword);
        }
        setKeywords([...unique].sort());
      });

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

  const logsByStep = new Map<string, RunLog[]>();
  for (const l of logs) {
    if (!logsByStep.has(l.step)) logsByStep.set(l.step, []);
    logsByStep.get(l.step)!.push(l);
  }

  function getStepStatus(step: string): 'done' | 'running' | 'error' | 'pending' {
    const stepLogs = logsByStep.get(step);
    if (!stepLogs || stepLogs.length === 0) return 'pending';
    if (stepLogs.some((l) => l.status === 'error')) return 'error';
    if (stepLogs.some((l) => l.status === 'done')) return 'done';
    return 'running';
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-6">
      {keywords.length > 0 && (
        <div className="mb-5">
          <span className="text-xs text-zinc-500 font-medium">Keywords</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {keywords.map((kw) => (
              <span key={kw} className="text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full font-medium">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold text-zinc-900 mb-6">Pipeline Progress</h2>

      {/* Vertical timeline */}
      <div className="relative">
        {STEPS.map((step, idx) => {
          const config = stepConfig[step];
          const status = getStepStatus(step);
          const stepLogs = logsByStep.get(step) || [];
          const isLast = idx === STEPS.length - 1;
          const isExpanded = expandedStep === step;
          const StepIcon = config.icon;

          return (
            <div key={step} className="relative flex gap-4">
              {/* Timeline line + dot */}
              <div className="flex flex-col items-center">
                <div className="shrink-0">
                  <StepStatusIcon status={status} />
                </div>
                {!isLast && (
                  <div className={`w-px flex-1 min-h-8 ${status === 'done' ? 'bg-emerald-200' : 'bg-zinc-200'}`} />
                )}
              </div>

              {/* Content */}
              <div className={`flex-1 ${isLast ? '' : 'pb-6'}`}>
                <button
                  onClick={() => setExpandedStep(isExpanded ? null : step)}
                  className="w-full text-left group"
                >
                  <div className="flex items-center gap-2">
                    <StepIcon size={14} className="text-zinc-400" />
                    <span className="font-medium text-sm text-zinc-900">{config.label}</span>
                    {stepLogs.length > 0 && (
                      <span className="text-xs text-zinc-400">
                        ({stepLogs.length} log{stepLogs.length > 1 ? 's' : ''})
                      </span>
                    )}
                    {status === 'error' && (
                      <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">Error</span>
                    )}
                  </div>
                  {status === 'pending' && (
                    <p className="text-xs text-zinc-400 mt-0.5">{config.description}</p>
                  )}
                  {stepLogs.length > 0 && !isExpanded && (
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">
                      {stepLogs[stepLogs.length - 1].message}
                    </p>
                  )}
                </button>

                {/* Expanded logs */}
                {isExpanded && stepLogs.length > 0 && (
                  <div className="mt-3 bg-zinc-50 rounded-lg p-3 space-y-1.5">
                    {stepLogs.map((l) => (
                      <div
                        key={l.id}
                        className={`flex items-start gap-2 text-xs ${
                          l.status === 'error' ? 'text-red-600' : 'text-zinc-600'
                        }`}
                      >
                        <span className="text-zinc-400 shrink-0 font-mono">{formatTime(l.created_at)}</span>
                        <span>{l.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {logs.length === 0 && (
        <div className="text-center py-8">
          <Loader2 size={24} className="mx-auto text-zinc-300 mb-2 animate-spin" />
          <p className="text-zinc-400 text-sm">Waiting for pipeline logs...</p>
        </div>
      )}
    </div>
  );
}
