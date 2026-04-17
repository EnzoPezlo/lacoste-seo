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
  const resumeRunId = process.env.RESUME_RUN_ID;

  let runId: string;

  if (resumeRunId) {
    // Resume an existing run from classification step
    runId = resumeRunId;
    console.log(`\n🔄 Resuming pipeline run: ${runId} (skipping SERP + scrape)\n`);
  } else {
    // Create a new run
    const now = new Date();
    const day = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = now.toISOString().slice(11, 16).replace(':', 'h');
    const { count: kwCount } = await supabase
      .from('keywords')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);
    const runLabel = `${day} ${time} — ${kwCount || '?'} kw (${runType})`;

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

    // Step 3: Classify actors — skip if already done for this run
    const { count: classifiedCount } = await supabase
      .from('serp_results')
      .select('*', { count: 'exact', head: true })
      .eq('run_id', runId)
      .not('actor_name', 'is', null);

    if (classifiedCount && classifiedCount > 0) {
      console.log(`⏭️  Classification already done (${classifiedCount} results classified), skipping`);
    } else {
      await classify(runId);
    }

    // Step 4: Analyze Lacoste gaps
    await analyzeGap(runId);

    // Step 5: Analyze movements (disabled — needs multi-run history)
    // await analyzeMovement(runId);
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
