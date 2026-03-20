import { supabase } from './lib/supabase.js';
import { log } from './lib/logger.js';
import { collectSerp } from './collect-serp.js';
import { scrape } from './scrape.js';
import { classify } from './classify.js';
import { analyzeGap } from './analyze-gap.js';
import { analyzeMovement } from './analyze-movement.js';

async function updateRunStatus(runId: string, status: string): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (status === 'completed') {
    update.finished_at = new Date().toISOString();
  }
  await supabase.from('runs').update(update).eq('id', runId);
}

async function main(): Promise<void> {
  const runType = process.env.RUN_TYPE || 'manual';
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 16).replace(':', 'h'); // e.g. "06h30"
  const runLabel = `${today}_${runType}_${time}`; // e.g. "2026-04-01_manual_14h30"

  console.log(`\n🚀 Starting SEO pipeline run: ${runLabel}\n`);

  // Create the run
  const { data: run, error } = await supabase
    .from('runs')
    .insert({
      run_label: runLabel,
      type: runType,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !run) {
    console.error('Failed to create run:', error?.message);
    process.exit(1);
  }

  const runId = run.id;
  console.log(`Run created: ${runId}\n`);

  try {
    // Step 1: Collect SERP
    await collectSerp(runId);
    await updateRunStatus(runId, 'serp_done');

    // Step 2: Scrape pages
    await scrape(runId);
    await updateRunStatus(runId, 'scrap_done');

    // Step 3: Classify actors
    await classify(runId);

    // Step 4: Analyze Lacoste gaps
    await analyzeGap(runId);

    // Step 5: Analyze movements
    await analyzeMovement(runId);
    await updateRunStatus(runId, 'analysis_done');

    // Done
    await updateRunStatus(runId, 'completed');
    console.log(`\n✅ Pipeline completed: ${runLabel}\n`);
  } catch (error) {
    console.error(`\n❌ Pipeline failed:`, (error as Error).message);
    // Update run status to reflect failure — finished_at is set for duration tracking
    await supabase.from('runs').update({
      finished_at: new Date().toISOString(),
    }).eq('id', runId);
    process.exit(1);
  }
}

main();
