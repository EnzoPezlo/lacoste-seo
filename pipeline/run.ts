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
  // Debug: log key env vars to diagnose OLLAMA_MODEL issue
  const model = process.env.OLLAMA_MODEL || '';
  const url = process.env.OLLAMA_URL || '';
  const pass = process.env.OLLAMA_PASSWORD || '';
  console.log(`[env] OLLAMA_MODEL length=${model.length} chars=[${model.split('').join(',')}]`);
  console.log(`[env] OLLAMA_URL length=${url.length} last5="${url.slice(-5)}"`);
  console.log(`[env] OLLAMA_PASSWORD length=${pass.length}`);

  const runType = process.env.RUN_TYPE || 'manual';
  const resumeRunId = process.env.RESUME_RUN_ID;

  let runId: string;

  if (resumeRunId) {
    // Resume an existing run from classification step
    runId = resumeRunId;
    console.log(`\n🔄 Resuming pipeline run: ${runId} (skipping SERP + scrape)\n`);
  } else {
    // Create a new run
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const time = now.toISOString().slice(11, 16).replace(':', 'h');
    const runLabel = `${today}_${runType}_${time}`;

    console.log(`\n🚀 Starting SEO pipeline run: ${runLabel}\n`);

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

    runId = run.id;
    console.log(`Run created: ${runId}\n`);
  }

  try {
    if (!resumeRunId) {
      // Step 1: Collect SERP
      await collectSerp(runId);
      await updateRunStatus(runId, 'serp_done');

      // Step 2: Scrape pages
      await scrape(runId);
      await updateRunStatus(runId, 'scrap_done');
    }

    // Step 3: Classify actors
    await classify(runId);

    // Step 4: Analyze Lacoste gaps
    await analyzeGap(runId);

    // Step 5: Analyze movements
    await analyzeMovement(runId);
    await updateRunStatus(runId, 'analysis_done');

    // Done
    await updateRunStatus(runId, 'completed');
    console.log(`\n✅ Pipeline completed: ${runId}\n`);
  } catch (error) {
    console.error(`\n❌ Pipeline failed:`, (error as Error).message);
    await supabase.from('runs').update({
      finished_at: new Date().toISOString(),
    }).eq('id', runId);
    process.exit(1);
  }
}

main();
