import { supabase } from './lib/supabase.js';
import { log } from './lib/logger.js';
import { callLLM } from './lib/llm.js';
import { config } from './lib/config.js';
import {
  ANALYZE_GAP_SYSTEM as OLLAMA_GAP_SYSTEM,
  analyzeGapUserPrompt as ollamaGapPrompt,
  DEEP_DIVE_SYSTEM as OLLAMA_DEEP_SYSTEM,
  deepDiveUserPrompt as ollamaDeepPrompt,
} from './prompts/analyze-gap.js';
import {
  ANALYZE_GAP_SYSTEM_CLAUDE,
  analyzeGapUserPromptClaude,
  DEEP_DIVE_SYSTEM_CLAUDE,
  deepDiveUserPromptClaude,
} from './prompts/analyze-gap-claude.js';
import { jsonrepair } from 'jsonrepair';
import { countKeywordOccurrences } from './lib/keyword-counter.js';
import { countLinks } from './lib/link-counter.js';
import { extractTop1Keywords } from './lib/top1-keywords.js';
import { writeFile, mkdir } from 'fs/promises';

const isClaudeMode = config.llm.promptMode === 'claude';
const GAP_SYSTEM = isClaudeMode ? ANALYZE_GAP_SYSTEM_CLAUDE : OLLAMA_GAP_SYSTEM;
const gapUserPrompt = isClaudeMode ? analyzeGapUserPromptClaude : ollamaGapPrompt;
const DEEP_SYSTEM = isClaudeMode ? DEEP_DIVE_SYSTEM_CLAUDE : OLLAMA_DEEP_SYSTEM;
const deepUserPrompt = isClaudeMode ? deepDiveUserPromptClaude : ollamaDeepPrompt;

async function logPrompt(
  runId: string, keyword: string, type: string,
  system: string, user: string,
): Promise<void> {
  const dir = `pipeline/_prompt-logs/${runId}`;
  await mkdir(dir, { recursive: true });
  const slug = keyword.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 30);
  const content = [
    `# ${type} — ${keyword}`,
    `## Mode: ${config.llm.promptMode}`,
    `## System Prompt`,
    system,
    '',
    `## User Prompt`,
    user,
  ].join('\n');
  await writeFile(`${dir}/${slug}_${type}.md`, content);
}

/** Summarize structured data schemas into a concise, LLM-friendly string with counts */
function summarizeStructuredData(sd: unknown): string {
  if (!sd) return 'Aucune donnee structuree detectee';
  const schemas = Array.isArray(sd) ? sd : [sd];
  if (schemas.length === 0) return 'Aucune donnee structuree detectee';

  const typeCounts = new Map<string, number>();
  const typeDetails = new Map<string, Set<string>>();

  function processNode(node: Record<string, unknown>): void {
    const type = String(node['@type'] || 'unknown');
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    if (!typeDetails.has(type)) typeDetails.set(type, new Set());
    const details = typeDetails.get(type)!;
    if (node.aggregateRating) details.add('ratings');
    if (node.offers || node.hasOfferCatalog) details.add('offers');
    if (node.review) details.add('reviews');
    if (node.itemListElement) details.add(`${(node.itemListElement as unknown[]).length} items`);
    if (node.mainEntity) details.add('mainEntity');
  }

  for (const schema of schemas) {
    if (typeof schema !== 'object' || schema === null) continue;
    const s = schema as Record<string, unknown>;
    if (Array.isArray(s['@graph'])) {
      for (const node of s['@graph']) {
        if (typeof node === 'object' && node !== null) {
          processNode(node as Record<string, unknown>);
        }
      }
    } else {
      processNode(s);
    }
  }

  if (typeCounts.size === 0) return 'Aucune donnee structuree detectee';

  const parts: string[] = [];
  for (const [type, count] of typeCounts) {
    const details = typeDetails.get(type)!;
    let label = count > 1 ? `${type} x${count}` : type;
    if (details.size > 0) label += ` (${[...details].join(', ')})`;
    parts.push(label);
  }
  return parts.join(' | ');
}

const MAX_RETRIES = 3;

/**
 * Extract and parse a JSON array from an LLM response.
 * Steps: strip markdown fences → extract [...] boundaries → jsonrepair → JSON.parse
 */
function parseLLMJsonArray<T>(raw: string): T[] {
  let str = raw.trim();

  // Strip markdown code fences
  if (str.startsWith('```')) {
    str = str.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  // Extract JSON array boundaries — find first [ and last ]
  const firstBracket = str.indexOf('[');
  const lastBracket = str.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    str = str.slice(firstBracket, lastBracket + 1);
  }

  // Clean control characters inside string values (common with small LLMs)
  str = str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ');

  return JSON.parse(jsonrepair(str));
}

interface SourceRef {
  position: number | 'lacoste_ref';
  domain: string;
  actor_name: string;
  url: string;
  match_method?: 'token' | 'llm';
}


interface GapAnalysisResult {
  keyword: string;
  country: string;
  device: string;
  search_intent: string;
  lacoste_position: number;
  intent_match: string;
  content_gap: string;
  structure_gap: string;
  meta_gap: string;
  schema_gap: string;
  recommendations: string[];
  tags: string[];
  opportunity_score: number;
}

interface DeepDiveResult {
  keyword: string;
  country: string;
  device: string;
  title_analysis: string;
  content_depth_analysis: string;
  structure_analysis: string;
  structured_data_analysis: string;
  meta_analysis: string;
  key_takeaways: string[];
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

  // Get already-completed analyses for this run
  const { data: existingAnalyses } = await supabase
    .from('analyses')
    .select('keyword_id, country, device')
    .eq('run_id', runId)
    .eq('analysis_type', 'lacoste_gap');

  const doneSet = new Set(
    (existingAnalyses || []).map((a) => `${a.keyword_id}|${a.country}|${a.device}`),
  );

  // Filter: skip combinations where Lacoste is #1 or already analyzed
  const toAnalyze: Array<{ key: string; results: typeof serpResults; keyword: any }> = [];
  let skippedLacoste1 = 0;
  let skippedDone = 0;
  for (const [key, results] of groups) {
    const lacostePosResult = results.find((r) => r.is_lacoste);
    if (lacostePosResult && lacostePosResult.position === 1) { skippedLacoste1++; continue; }
    if (doneSet.has(key)) { skippedDone++; continue; }
    toAnalyze.push({ key, results, keyword: (results[0] as any).keywords });
  }

  await log(
    runId,
    'analyze_gap',
    'running',
    `${toAnalyze.length} combinations to analyze (${skippedLacoste1} skipped — Lacoste #1, ${skippedDone} already done)`,
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
    for (let i = 0; i < items.length; i += 1) {
      const batch = items.slice(i, i + 1);

      try {
        // Build aggregated content for the batch
        let aggregatedContent = '';
        const batchSources: SourceRef[] = [];

        for (const item of batch) {
          const [keywordId, country, device] = item.key.split('|');
          const keyword = item.keyword.keyword;
          const lacostePosResult = item.results.find((r) => r.is_lacoste);
          const lacostePos = lacostePosResult?.position ?? 'absent';

          aggregatedContent += `\n=== MOT-CLÉ : ${keyword} | PAYS : ${country} | DEVICE : ${device} | LACOSTE : position ${lacostePos} ===\n\n`;

          // Get Top 10 + Lacoste page content from snapshots
          const top10 = item.results.filter((r) => r.position <= 10 || r.is_lacoste);

          for (const result of top10) {
            const { data: snapshot } = await supabase
              .from('snapshots')
              .select('markdown_content, head_html, structured_data')
              .eq('run_id', runId)
              .eq('url', result.url)
              .single();

            const label = result.is_lacoste
              ? `LACOSTE (Position ${result.position}) — ${result.url}`
              : `Position ${result.position} : ${result.domain} (${result.url})`;

            // Track source
            batchSources.push({
              position: result.position,
              domain: result.domain,
              actor_name: result.actor_name || result.domain,
              url: result.url,
            });

            aggregatedContent += `--- ${label} ---\n`;
            if (snapshot) {
              const md = snapshot.markdown_content?.slice(0, 1500) || '(no content)';
              aggregatedContent += `META HEAD: ${snapshot.head_html?.slice(0, 300) || '(no head)'}\n`;
              if (snapshot.structured_data) {
                aggregatedContent += `STRUCTURED DATA: ${summarizeStructuredData(snapshot.structured_data)}\n`;
              }
              // Inject keyword density metrics
              if (snapshot.markdown_content) {
                const counts = countKeywordOccurrences(keyword, snapshot.markdown_content);
                aggregatedContent += `KEYWORD DENSITY ("${keyword}"): ${counts.total} total, H1: ${counts.inH1}, H2: ${counts.inH2}, H3: ${counts.inH3}, H4: ${counts.inH4}, tous Hn: ${counts.inHeadings}\n`;
                const links = countLinks(snapshot.markdown_content, result.domain);
                aggregatedContent += `LIENS INTERNES: ${links.internalLinks} | LIENS EXTERNES: ${links.externalLinks}\n`;
              }
              aggregatedContent += `CONTENU MARKDOWN:\n${md}\n\n`;
            } else {
              aggregatedContent += `(snapshot non disponible — scraping en erreur)\n\n`;
            }
          }

          // If Lacoste absent from this SERP, note it (no reference injection)
          if (!lacostePosResult) {
            aggregatedContent += `--- LACOSTE : absente du Top 50 pour ce mot-clé ---\n\n`;
          }
        }

        // Extract top-1 keyword suggestions for recommendations
        const top1Result = batch[0]?.results.find((r: any) => r.position === 1);
        const lacosteResult = batch[0]?.results.find((r: any) => r.is_lacoste);
        if (top1Result) {
          const { data: top1Snap } = await supabase
            .from('snapshots')
            .select('markdown_content')
            .eq('run_id', runId)
            .eq('url', top1Result.url)
            .single();

          const { data: lacSnap } = lacosteResult
            ? await supabase.from('snapshots').select('markdown_content')
                .eq('run_id', runId).eq('url', lacosteResult.url).single()
            : { data: null };

          if (top1Snap?.markdown_content) {
            const keyword = batch[0]?.keyword.keyword;
            const suggestions = extractTop1Keywords(
              top1Snap.markdown_content,
              lacSnap?.markdown_content || null,
              keyword,
            );
            if (suggestions.length > 0) {
              aggregatedContent += `\nMOTS-CLES SECONDAIRES (frequents chez Top 1, absents/rares chez Lacoste): ${suggestions.join(', ')}\n`;
            }
          }
        }

        const keyword = batch[0]?.keyword.keyword;
        const prompt = gapUserPrompt(aggregatedContent);

        await logPrompt(runId, keyword, 'gap', GAP_SYSTEM, prompt);

        // Retry loop: LLM may produce invalid JSON, retry with fresh generation
        let analyses: GapAnalysisResult[] | null = null;
        let lastError = '';

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            const response = await callLLM({
              task: 'analyze_gap',
              prompt,
              systemPrompt: GAP_SYSTEM,
              temperature: 0.2 + (attempt - 1) * 0.1, // slightly increase temp on retries
              maxTokens: 8000,
            });

            analyses = parseLLMJsonArray<GapAnalysisResult>(response);
            break; // success
          } catch (parseError) {
            lastError = (parseError as Error).message;
            console.error(
              `[analyze_gap] Attempt ${attempt}/${MAX_RETRIES} failed for "${category}":`,
              lastError.slice(0, 200),
            );
            if (attempt < MAX_RETRIES) {
              console.log(`[analyze_gap] Retrying "${category}" (attempt ${attempt + 1})...`);
            }
          }
        }

        if (!analyses) {
          console.error(`[analyze_gap] All ${MAX_RETRIES} attempts failed for "${category}"`);
          await log(
            runId,
            'analyze_gap',
            'error',
            `Failed batch in category "${category}" after ${MAX_RETRIES} retries`,
            { error: lastError },
          );
          continue; // skip to next batch
        }

        // Store each analysis — use original data for keyword_id/country/device
        // (LLM may return inconsistent values like "France" vs "FR")
        for (const analysis of analyses) {
          const matchingItem = batch.find(
            (b) => b.keyword.keyword === analysis.keyword,
          );
          if (!matchingItem) continue;

          const [keywordId, country, device] = matchingItem.key.split('|');

          // Coerce fields: LLM may return objects/arrays instead of strings, or "absent" instead of null
          const str = (v: unknown): string => {
            if (typeof v === 'string') return v;
            if (Array.isArray(v)) {
              return v.map((item, i) => {
                if (typeof item === 'string') return `- ${item}`;
                if (typeof item === 'object' && item) {
                  const o = item as Record<string, unknown>;
                  const site = o.site || o.domain || o.actor_name || '';
                  const fields = Object.entries(o)
                    .filter(([k]) => !['site', 'domain', 'actor_name'].includes(k))
                    .map(([, val]) => typeof val === 'string' ? val : '')
                    .filter(Boolean);
                  return `- **${site}** : ${fields.join(' — ')}`;
                }
                return `- ${String(item)}`;
              }).join('\n');
            }
            if (typeof v === 'object' && v) {
              const o = v as Record<string, unknown>;
              return Object.entries(o)
                .map(([key, val]) => {
                  if (Array.isArray(val)) return `**${key}** :\n${str(val)}`;
                  return `**${key}** : ${typeof val === 'string' ? val : String(val ?? '')}`;
                })
                .join('\n');
            }
            return String(v ?? '');
          };
          const recoList = (Array.isArray(analysis.recommendations) ? analysis.recommendations : [])
            .map((r: unknown, idx: number) => `${idx + 1}. ${str(r)}`)
            .join('\n');

          const content = `### Alignement intention\n${str(analysis.intent_match)}\n\n### Couverture sémantique\n${str(analysis.content_gap)}\n\n### Structure\n${str(analysis.structure_gap)}\n\n### Optimisation meta\n${str(analysis.meta_gap)}\n\n### Données structurées\n${str(analysis.schema_gap)}\n\n## Recommandations\n${recoList}`;

          // Use original SERP data for lacoste_position (LLM may return "absent" or wrong type)
          const lacostePosResult = matchingItem.results.find((r) => r.is_lacoste);
          const lacostePosition = lacostePosResult?.position ?? null;

          const searchIntent = typeof analysis.search_intent === 'string'
            ? analysis.search_intent : null;
          const tags = Array.isArray(analysis.tags)
            ? analysis.tags.filter((t: unknown) => typeof t === 'string') : [];

          const { error: insertError } = await supabase.from('analyses').insert({
            run_id: runId,
            keyword_id: keywordId,
            country,
            device,
            analysis_type: 'lacoste_gap',
            content,
            tags,
            lacoste_position: lacostePosition,
            search_intent: searchIntent,
            sources: batchSources,
            opportunity_score: typeof analysis.opportunity_score === 'number'
              ? Math.min(10, Math.max(1, analysis.opportunity_score)) : null,
          });

          if (insertError) {
            console.error(`[analyze_gap] Insert failed for "${analysis.keyword}":`, insertError.message);
            continue;
          }

          analyzed++;
        }

        await log(
          runId,
          'analyze_gap',
          'running',
          `Analyzed ${analyzed}/${toAnalyze.length} combinations`,
        );
      } catch (error) {
        const errMsg = (error as Error).message;
        console.error(`[analyze_gap] Error in "${category}":`, errMsg.slice(0, 300));
        await log(
          runId,
          'analyze_gap',
          'error',
          `Failed batch in category "${category}"`,
          { error: errMsg },
        );
      }
    }
  }

  // === DEEP DIVE: Top 3 analysis ===
  await log(runId, 'analyze_gap', 'running', 'Starting Top 3 deep dive analysis');

  let deepDiveCount = 0;

  for (const item of toAnalyze) {
    const [keywordId, country, device] = item.key.split('|');
    const keyword = item.keyword.keyword;

    // Check if deep dive already done for this combo
    const { data: existingDeep } = await supabase
      .from('analyses')
      .select('id')
      .eq('run_id', runId)
      .eq('keyword_id', keywordId)
      .eq('country', country)
      .eq('device', device)
      .eq('analysis_type', 'top3_deep_dive')
      .limit(1);

    if (existingDeep && existingDeep.length > 0) continue;

    // Determine if Lacoste is in the top 50
    const lacostePosResult = item.results.find((r) => r.is_lacoste);
    const hasLacoste = !!lacostePosResult;

    // Build content for top 3 + optionally Lacoste (more content per page: 3000 chars)
    let deepContent = `\n=== MOT-CLÉ : ${keyword} | PAYS : ${country} | DEVICE : ${device} ===\n\n`;
    const top3 = item.results.filter((r) => r.position <= 3);
    const deepSources: SourceRef[] = [];

    for (const result of top3) {
      const { data: snapshot } = await supabase
        .from('snapshots')
        .select('markdown_content, head_html, structured_data')
        .eq('run_id', runId)
        .eq('url', result.url)
        .single();

      const label = `Position ${result.position} : ${result.domain} (${result.url})`;
      deepSources.push({
        position: result.position,
        domain: result.domain,
        actor_name: result.actor_name || result.domain,
        url: result.url,
      });

      deepContent += `--- ${label} ---\n`;
      if (snapshot) {
        const md = snapshot.markdown_content?.slice(0, 3000) || '(no content)';
        deepContent += `META HEAD: ${snapshot.head_html?.slice(0, 500) || '(no head)'}\n`;
        if (snapshot.structured_data) {
          deepContent += `STRUCTURED DATA: ${summarizeStructuredData(snapshot.structured_data)}\n`;
        }
        if (snapshot.markdown_content) {
          const counts = countKeywordOccurrences(keyword, snapshot.markdown_content);
          deepContent += `KEYWORD DENSITY ("${keyword}"): ${counts.total} total, H1: ${counts.inH1}, H2: ${counts.inH2}, H3: ${counts.inH3}, H4: ${counts.inH4}, tous Hn: ${counts.inHeadings}\n`;
          const links = countLinks(snapshot.markdown_content, result.domain);
          deepContent += `LIENS INTERNES: ${links.internalLinks} | LIENS EXTERNES: ${links.externalLinks}\n`;
        }
        deepContent += `CONTENU MARKDOWN:\n${md}\n\n`;
      } else {
        deepContent += `(snapshot non disponible)\n\n`;
      }
    }

    // Add Lacoste page if present in top 50
    if (hasLacoste) {
      const lacResult = lacostePosResult!;
      const { data: lacSnapshot } = await supabase
        .from('snapshots')
        .select('markdown_content, head_html, structured_data')
        .eq('run_id', runId)
        .eq('url', lacResult.url)
        .single();

      deepSources.push({
        position: lacResult.position,
        domain: lacResult.domain,
        actor_name: 'Lacoste',
        url: lacResult.url,
      });

      deepContent += `--- LACOSTE (Position ${lacResult.position}) — ${lacResult.url} ---\n`;
      if (lacSnapshot) {
        const md = lacSnapshot.markdown_content?.slice(0, 3000) || '(no content)';
        deepContent += `META HEAD: ${lacSnapshot.head_html?.slice(0, 500) || '(no head)'}\n`;
        if (lacSnapshot.structured_data) {
          deepContent += `STRUCTURED DATA: ${summarizeStructuredData(lacSnapshot.structured_data)}\n`;
        }
        if (lacSnapshot.markdown_content) {
          const counts = countKeywordOccurrences(keyword, lacSnapshot.markdown_content);
          deepContent += `KEYWORD DENSITY ("${keyword}"): ${counts.total} total, H1: ${counts.inH1}, H2: ${counts.inH2}, H3: ${counts.inH3}, H4: ${counts.inH4}, tous Hn: ${counts.inHeadings}\n`;
          const lacLinks = countLinks(lacSnapshot.markdown_content, lacResult.domain);
          deepContent += `LIENS INTERNES: ${lacLinks.internalLinks} | LIENS EXTERNES: ${lacLinks.externalLinks}\n`;
        }
        deepContent += `CONTENU MARKDOWN:\n${md}\n\n`;
      }
    }

    // Call LLM for deep dive
    try {
      const prompt = deepUserPrompt(deepContent, hasLacoste);

      await logPrompt(runId, keyword, 'deep_dive', DEEP_SYSTEM, prompt);

      let deepAnalyses: DeepDiveResult[] | null = null;
      let lastError = '';

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await callLLM({
            task: 'deep_dive_top3',
            prompt,
            systemPrompt: DEEP_SYSTEM,
            temperature: 0.2 + (attempt - 1) * 0.1,
            maxTokens: 4000,
          });
          deepAnalyses = parseLLMJsonArray<DeepDiveResult>(response);
          break;
        } catch (parseError) {
          lastError = (parseError as Error).message;
          if (attempt < MAX_RETRIES) continue;
        }
      }

      if (!deepAnalyses) {
        console.error(`[deep_dive] All retries failed for "${keyword}"`);
        continue;
      }

      for (const analysis of deepAnalyses) {
        const str = (v: unknown): string => {
          if (typeof v === 'string') return v;
          if (Array.isArray(v)) {
            return v.map((item) => {
              if (typeof item === 'string') return `- ${item}`;
              if (typeof item === 'object' && item) {
                const o = item as Record<string, unknown>;
                const site = o.site || o.domain || o.actor_name || '';
                const fields = Object.entries(o)
                  .filter(([k]) => !['site', 'domain', 'actor_name'].includes(k))
                  .map(([, val]) => typeof val === 'string' ? val : '')
                  .filter(Boolean);
                return `- **${site}** : ${fields.join(' — ')}`;
              }
              return `- ${String(item)}`;
            }).join('\n');
          }
          if (typeof v === 'object' && v) {
            const o = v as Record<string, unknown>;
            return Object.entries(o)
              .map(([key, val]) => {
                if (Array.isArray(val)) return `**${key}** :\n${str(val)}`;
                return `**${key}** : ${typeof val === 'string' ? val : String(val ?? '')}`;
              })
              .join('\n');
          }
          return String(v ?? '');
        };

        const takeaways = (Array.isArray(analysis.key_takeaways) ? analysis.key_takeaways : [])
          .map((t: unknown, idx: number) => `${idx + 1}. ${str(t)}`)
          .join('\n');

        const content = `### Analyse des titles\n${str(analysis.title_analysis)}\n\n### Profondeur de contenu\n${str(analysis.content_depth_analysis)}\n\n### Structure\n${str(analysis.structure_analysis)}\n\n### Données structurées\n${str(analysis.structured_data_analysis)}\n\n### Optimisation meta\n${str(analysis.meta_analysis)}\n\n## Points clés\n${takeaways}`;

        const tags = Array.isArray(analysis.tags)
          ? analysis.tags.filter((t: unknown) => typeof t === 'string') : [];

        const { error: insertError } = await supabase.from('analyses').insert({
          run_id: runId,
          keyword_id: keywordId,
          country,
          device,
          analysis_type: 'top3_deep_dive',
          content,
          tags,
          lacoste_position: lacostePosResult?.position ?? null,
          sources: deepSources,
        });

        if (insertError) {
          console.error(`[deep_dive] Insert failed for "${keyword}":`, insertError.message);
          continue;
        }
        deepDiveCount++;
      }
    } catch (error) {
      console.error(`[deep_dive] Error for "${keyword}":`, (error as Error).message);
    }
  }

  await log(runId, 'analyze_gap', 'running', `Deep dive complete: ${deepDiveCount} analyses`);

  await log(
    runId,
    'analyze_gap',
    'done',
    `Gap analysis complete: ${analyzed}/${toAnalyze.length} analyses`,
  );
}
