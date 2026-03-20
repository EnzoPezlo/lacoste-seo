import { supabase } from './lib/supabase.js';
import { log } from './lib/logger.js';
import { callLLM } from './lib/llm.js';
import { ANALYZE_GAP_SYSTEM, analyzeGapUserPrompt } from './prompts/analyze-gap.js';

interface GapAnalysisResult {
  keyword: string;
  country: string;
  device: string;
  search_intent: string;
  lacoste_position: number;
  diagnostic: string;
  recommendations: string;
  tags: string[];
}

export async function analyzeGap(runId: string): Promise<void> {
  await log(runId, 'analyze_gap', 'running', 'Starting gap analysis');

  // Get all SERP results with classification done
  const { data: serpResults, error } = await supabase
    .from('serp_results')
    .select('*, keywords!inner(keyword, category)')
    .eq('run_id', runId)
    .eq('serp_status', 'ok')
    .order('position');

  if (error || !serpResults) {
    await log(runId, 'analyze_gap', 'error', `Failed to fetch SERP results: ${error?.message}`);
    throw new Error(`Failed to fetch SERP results: ${error?.message}`);
  }

  // Group by keyword_id + country + device
  const groups = new Map<string, typeof serpResults>();
  for (const result of serpResults) {
    const key = `${result.keyword_id}|${result.country}|${result.device}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(result);
  }

  // Filter: skip combinations where Lacoste is #1
  const toAnalyze: Array<{ key: string; results: typeof serpResults; keyword: any }> = [];
  for (const [key, results] of groups) {
    const lacostePosResult = results.find((r) => r.is_lacoste);
    if (lacostePosResult && lacostePosResult.position === 1) continue; // Skip: Lacoste is #1
    toAnalyze.push({ key, results, keyword: (results[0] as any).keywords });
  }

  await log(
    runId,
    'analyze_gap',
    'running',
    `${toAnalyze.length} combinations to analyze (${groups.size - toAnalyze.length} skipped — Lacoste #1)`,
  );

  // Batch by category (2-3 keywords per batch)
  const byCategory = new Map<string, typeof toAnalyze>();
  for (const item of toAnalyze) {
    const cat = item.keyword.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  let analyzed = 0;

  for (const [category, items] of byCategory) {
    // Process in batches of 2-3
    for (let i = 0; i < items.length; i += 2) {
      const batch = items.slice(i, i + 2);

      try {
        // Build aggregated content for the batch
        let aggregatedContent = '';

        for (const item of batch) {
          const [keywordId, country, device] = item.key.split('|');
          const keyword = item.keyword.keyword;
          const lacostePosResult = item.results.find((r) => r.is_lacoste);
          const lacostePos = lacostePosResult?.position ?? 'absent';

          aggregatedContent += `\n=== MOT-CLÉ : ${keyword} | PAYS : ${country} | DEVICE : ${device} | LACOSTE : position ${lacostePos} ===\n\n`;

          // Get Top 10 + Lacoste page content from snapshots
          const top10 = item.results.filter((r) => r.position <= 10 || r.is_lacoste);

          for (const result of top10) {
            // Fetch snapshot for this URL
            const { data: snapshot } = await supabase
              .from('snapshots')
              .select('markdown_content, head_html, structured_data')
              .eq('run_id', runId)
              .eq('url', result.url)
              .single();

            const label = result.is_lacoste
              ? `LACOSTE (Position ${result.position})`
              : `Position ${result.position} : ${result.domain}`;

            aggregatedContent += `--- ${label} ---\n`;
            if (snapshot) {
              // Truncate markdown to ~3000 chars per page to fit context
              const md = snapshot.markdown_content?.slice(0, 3000) || '(no content)';
              aggregatedContent += `META HEAD: ${snapshot.head_html?.slice(0, 500) || '(no head)'}\n`;
              if (snapshot.structured_data) {
                aggregatedContent += `STRUCTURED DATA: ${JSON.stringify(snapshot.structured_data).slice(0, 500)}\n`;
              }
              aggregatedContent += `CONTENU MARKDOWN:\n${md}\n\n`;
            } else {
              aggregatedContent += `(snapshot non disponible — scraping en erreur)\n\n`;
            }
          }
        }

        const prompt = analyzeGapUserPrompt(aggregatedContent);
        const response = await callLLM({
          task: 'analyze_gap',
          prompt,
          systemPrompt: ANALYZE_GAP_SYSTEM,
          temperature: 0.2,
          maxTokens: 4000,
        });

        // Parse response
        let jsonStr = response.trim();
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        const analyses: GapAnalysisResult[] = JSON.parse(jsonStr);

        // Store each analysis
        for (const analysis of analyses) {
          const matchingItem = batch.find(
            (b) => b.keyword.keyword === analysis.keyword,
          );
          if (!matchingItem) continue;

          const [keywordId] = matchingItem.key.split('|');

          await supabase.from('analyses').insert({
            run_id: runId,
            keyword_id: keywordId,
            country: analysis.country,
            device: analysis.device,
            analysis_type: 'lacoste_gap',
            content: `${analysis.diagnostic}\n\n## Recommandations\n${analysis.recommendations}`,
            tags: analysis.tags,
            lacoste_position: analysis.lacoste_position,
            search_intent: analysis.search_intent,
          });

          analyzed++;
        }

        await log(
          runId,
          'analyze_gap',
          'running',
          `Analyzed ${analyzed}/${toAnalyze.length} combinations`,
        );
      } catch (error) {
        await log(
          runId,
          'analyze_gap',
          'error',
          `Failed batch in category "${category}"`,
          { error: (error as Error).message },
        );
      }
    }
  }

  await log(
    runId,
    'analyze_gap',
    'done',
    `Gap analysis complete: ${analyzed}/${toAnalyze.length} analyses`,
  );
}
