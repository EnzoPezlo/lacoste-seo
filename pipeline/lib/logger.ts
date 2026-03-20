import { supabase } from './supabase.js';

export type LogStep = 'serp' | 'scrape' | 'classify' | 'analyze_gap' | 'analyze_movement';
export type LogStatus = 'running' | 'done' | 'error';

export async function log(
  runId: string,
  step: LogStep,
  status: LogStatus,
  message: string,
  details: Record<string, unknown> | null = null,
): Promise<void> {
  // Console output for GitHub Actions logs
  const prefix = status === 'error' ? '❌' : status === 'done' ? '✅' : '⏳';
  console.log(`[${step}] ${prefix} ${message}`);

  // DB insert for realtime dashboard
  const { error } = await supabase.from('run_logs').insert({
    run_id: runId,
    step,
    status,
    message,
    details,
  });

  if (error) {
    console.error(`Failed to write log to DB:`, error.message);
  }
}
