import { supabase } from './lib/supabase.js';
import { log } from './lib/logger.js';
import { callLLM } from './lib/llm.js';
import { CLASSIFY_SYSTEM, classifyUserPrompt } from './prompts/classify.js';

interface ClassificationResult {
  position: number;
  actor: string;
  actor_category: string;
  page_type: string;
}

export async function classify(runId: string): Promise<void> {
  await log(runId, 'classify', 'running', 'Starting classification');

  // Get all SERP results for this run, grouped by keyword/country/device
  const { data: serpResults, error } = await supabase
    .from('serp_results')
    .select('*, keywords!inner(keyword)')
    .eq('run_id', runId)
    .eq('serp_status', 'ok')
    .order('position');

  if (error || !serpResults) {
    await log(runId, 'classify', 'error', `Failed to fetch SERP results: ${error?.message}`);
    throw new Error(`Failed to fetch SERP results: ${error?.message}`);
  }

  // Group by keyword_id + country + device
  const groups = new Map<string, typeof serpResults>();
  for (const result of serpResults) {
    const key = `${result.keyword_id}|${result.country}|${result.device}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(result);
  }

  await log(runId, 'classify', 'running', `${groups.size} combinations to classify`);

  let classified = 0;

  for (const [groupKey, results] of groups) {
    const [keywordId, country, device] = groupKey.split('|');
    const keyword = (results[0] as any).keywords.keyword;

    try {
      const serpJson = JSON.stringify(
        results.map((r) => ({
          position: r.position,
          url: r.url,
          domain: r.domain,
          title: r.title,
          snippet: r.snippet,
        })),
      );

      const prompt = classifyUserPrompt(keyword, country, device, serpJson);
      const response = await callLLM({
        task: 'classify',
        prompt,
        systemPrompt: CLASSIFY_SYSTEM,
        temperature: 0.1,
        maxTokens: 2000,
      });

      // Parse JSON response — handle markdown code blocks
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      const classifications: ClassificationResult[] = JSON.parse(jsonStr);

      // Update each SERP result with classification
      for (const cls of classifications) {
        const matchingResult = results.find((r) => r.position === cls.position);
        if (matchingResult) {
          await supabase
            .from('serp_results')
            .update({
              actor_name: cls.actor,
              actor_category: cls.actor_category,
              page_type: cls.page_type,
            })
            .eq('id', matchingResult.id);
        }
      }

      classified++;
      await log(
        runId,
        'classify',
        'running',
        `Classified ${classified}/${groups.size}: "${keyword}" / ${country} / ${device}`,
      );
    } catch (error) {
      await log(
        runId,
        'classify',
        'error',
        `Failed to classify "${keyword}" / ${country} / ${device}`,
        { error: (error as Error).message },
      );
    }
  }

  await log(runId, 'classify', 'done', `Classification complete: ${classified}/${groups.size}`);
}
