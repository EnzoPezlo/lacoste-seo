import { supabase } from './lib/supabase.js';
import { log } from './lib/logger.js';
import { callLLM } from './lib/llm.js';
import {
  ANALYZE_MOVEMENT_SYSTEM,
  analyzeMovementUserPrompt,
} from './prompts/analyze-movement.js';

interface Movement {
  keyword: string;
  keywordId: string;
  country: string;
  device: string;
  actor: string;
  domain: string;
  url: string;
  positionBefore: number | null; // null = new entrant
  positionAfter: number;
  movementType: string;
}

interface MovementAnalysisResult {
  keyword: string;
  country: string;
  device: string;
  actor: string;
  movement: string;
  objective_changes: string;
  seo_hypotheses: string;
  tags: string[];
}

export async function analyzeMovement(runId: string): Promise<void> {
  await log(runId, 'analyze_movement', 'running', 'Starting movement analysis');

  // Find the previous completed run
  const { data: currentRun } = await supabase
    .from('runs')
    .select('started_at')
    .eq('id', runId)
    .single();

  const { data: previousRuns } = await supabase
    .from('runs')
    .select('id')
    .eq('status', 'completed')
    .lt('started_at', currentRun?.started_at)
    .order('started_at', { ascending: false })
    .limit(1);

  if (!previousRuns || previousRuns.length === 0) {
    await log(runId, 'analyze_movement', 'done', 'No previous run found — skipping movement analysis');
    return;
  }

  const previousRunId = previousRuns[0].id;
  await log(runId, 'analyze_movement', 'running', `Comparing with previous run ${previousRunId}`);

  // Fetch SERP results for both runs
  const { data: currentSerp } = await supabase
    .from('serp_results')
    .select('*, keywords!inner(keyword)')
    .eq('run_id', runId)
    .eq('serp_status', 'ok');

  const { data: previousSerp } = await supabase
    .from('serp_results')
    .select('*')
    .eq('run_id', previousRunId)
    .eq('serp_status', 'ok');

  if (!currentSerp || !previousSerp) {
    await log(runId, 'analyze_movement', 'error', 'Failed to fetch SERP results for comparison');
    return;
  }

  // Detect significant movements
  const movements: Movement[] = [];

  // Index previous results by keyword_id + country + device + domain
  const prevIndex = new Map<string, number>();
  for (const r of previousSerp) {
    const key = `${r.keyword_id}|${r.country}|${r.device}|${r.domain}`;
    prevIndex.set(key, r.position);
  }

  for (const curr of currentSerp) {
    const key = `${curr.keyword_id}|${curr.country}|${curr.device}|${curr.domain}`;
    const prevPosition = prevIndex.get(key) ?? null;

    let isSignificant = false;
    let movementType = '';

    if (prevPosition === null) {
      // New entrant in Top 20
      isSignificant = true;
      movementType = 'entrée Top 20';
    } else if (prevPosition - curr.position > 2) {
      // Gained more than 2 positions
      isSignificant = true;
      movementType = 'gain >2';
    }

    if (isSignificant) {
      movements.push({
        keyword: (curr as any).keywords.keyword,
        keywordId: curr.keyword_id,
        country: curr.country,
        device: curr.device,
        actor: curr.actor_name || curr.domain,
        domain: curr.domain,
        url: curr.url,
        positionBefore: prevPosition,
        positionAfter: curr.position,
        movementType,
      });
    }
  }

  if (movements.length === 0) {
    await log(runId, 'analyze_movement', 'done', 'No significant movements detected');
    return;
  }

  await log(runId, 'analyze_movement', 'running', `${movements.length} significant movements to analyze`);

  // Process movements in batches of 2-3
  let analyzed = 0;

  for (let i = 0; i < movements.length; i += 2) {
    const batch = movements.slice(i, i + 2);

    try {
      let movementData = '';

      for (const mov of batch) {
        const movLabel =
          mov.positionBefore === null
            ? `NR → ${mov.positionAfter}`
            : `+${mov.positionBefore - mov.positionAfter}`;

        movementData += `\n=== MOUVEMENT : ${mov.actor} | "${mov.keyword}" | ${mov.country} | ${mov.device} | ${movLabel} ===\n\n`;

        // Get current snapshot
        const { data: currentSnapshot } = await supabase
          .from('snapshots')
          .select('markdown_content, head_html, structured_data')
          .eq('run_id', runId)
          .eq('url', mov.url)
          .single();

        if (mov.positionBefore !== null) {
          // Get previous snapshot
          const { data: previousSnapshot } = await supabase
            .from('snapshots')
            .select('markdown_content, head_html, structured_data')
            .eq('run_id', previousRunId)
            .eq('url', mov.url)
            .single();

          movementData += `--- VERSION PRÉCÉDENTE (position ${mov.positionBefore}) ---\n`;
          if (previousSnapshot) {
            movementData += `META HEAD: ${previousSnapshot.head_html?.slice(0, 500) || '(no head)'}\n`;
            movementData += `CONTENU: ${previousSnapshot.markdown_content?.slice(0, 3000) || '(no content)'}\n\n`;
          } else {
            movementData += `(snapshot non disponible)\n\n`;
          }
        }

        movementData += `--- VERSION ACTUELLE (position ${mov.positionAfter}) ---\n`;
        if (currentSnapshot) {
          movementData += `META HEAD: ${currentSnapshot.head_html?.slice(0, 500) || '(no head)'}\n`;
          if (currentSnapshot.structured_data) {
            movementData += `STRUCTURED DATA: ${JSON.stringify(currentSnapshot.structured_data).slice(0, 500)}\n`;
          }
          movementData += `CONTENU: ${currentSnapshot.markdown_content?.slice(0, 3000) || '(no content)'}\n\n`;
        } else {
          movementData += `(snapshot non disponible)\n\n`;
        }
      }

      const prompt = analyzeMovementUserPrompt(movementData);
      const response = await callLLM({
        task: 'analyze_movement',
        prompt,
        systemPrompt: ANALYZE_MOVEMENT_SYSTEM,
        temperature: 0.2,
        maxTokens: 4000,
      });

      // Parse response
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      const analyses: MovementAnalysisResult[] = JSON.parse(jsonStr);

      for (const analysis of analyses) {
        const mov = batch.find(
          (b) => b.actor === analysis.actor && b.keyword === analysis.keyword,
        );
        if (!mov) continue;

        await supabase.from('analyses').insert({
          run_id: runId,
          keyword_id: mov.keywordId,
          country: mov.country,
          device: mov.device,
          analysis_type: 'position_movement',
          actor: mov.actor,
          content: `${analysis.objective_changes}\n\n## Hypothèses SEO\n${analysis.seo_hypotheses}`,
          tags: analysis.tags,
          position_before: mov.positionBefore,
          position_after: mov.positionAfter,
          variation: mov.positionBefore !== null ? mov.positionBefore - mov.positionAfter : null,
          movement_type: mov.movementType,
        });

        analyzed++;
      }

      await log(
        runId,
        'analyze_movement',
        'running',
        `Analyzed ${analyzed}/${movements.length} movements`,
      );
    } catch (error) {
      await log(runId, 'analyze_movement', 'error', `Failed batch`, {
        error: (error as Error).message,
      });
    }
  }

  await log(
    runId,
    'analyze_movement',
    'done',
    `Movement analysis complete: ${analyzed}/${movements.length} movements analyzed`,
  );
}
