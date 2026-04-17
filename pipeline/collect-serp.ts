import { supabase } from './lib/supabase.js';
import { config } from './lib/config.js';
import { log } from './lib/logger.js';

interface SerpItem {
  position: number;
  url: string;
  domain: string;
  title: string;
  snippet: string;
  is_lacoste: boolean;
}

export async function collectSerpForKeyword(
  keyword: string,
  country: string,
  device: string,
): Promise<SerpItem[]> {
  const results: SerpItem[] = [];

  // Note: Google Custom Search API does not natively support device filtering.
  // We still store the device label for tracking purposes.
  // For true mobile SERP differentiation, a dedicated SERP API (e.g., SerpAPI,
  // ValueSERP) would be needed. For now, desktop and mobile store the same
  // results but are tracked separately for future upgrade.

  for (const start of [1, 11, 21, 31, 41]) {
    const params = new URLSearchParams({
      key: config.google.cseKey,
      cx: config.google.cseCx,
      q: keyword,
      num: '10',
      start: String(start),
      gl: country.toLowerCase(),
    });

    const response = await fetch(
      `https://customsearch.googleapis.com/customsearch/v1?${params}`,
    );

    if (!response.ok) {
      throw new Error(`Google CSE error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const items = data.items || [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      results.push({
        position: start + i,
        url: item.link,
        domain: item.displayLink,
        title: item.title || '',
        snippet: item.snippet || '',
        is_lacoste: item.displayLink?.toLowerCase().includes('lacoste') ?? false,
      });
    }
  }

  return results;
}

export async function collectSerp(runId: string): Promise<void> {
  await log(runId, 'serp', 'running', 'Starting SERP collection');

  // Fetch active keywords
  const { data: keywords, error: kwError } = await supabase
    .from('keywords')
    .select('*')
    .eq('active', true);

  if (kwError || !keywords) {
    await log(runId, 'serp', 'error', `Failed to fetch keywords: ${kwError?.message}`);
    throw new Error(`Failed to fetch keywords: ${kwError?.message}`);
  }

  await log(runId, 'serp', 'running', `Found ${keywords.length} active keywords`);

  let totalResults = 0;
  let errors = 0;

  for (const kw of keywords) {
    const countries: string[] = kw.countries;
    const devices = ['mobile'];

    for (const country of countries) {
      for (const device of devices) {
        try {
          await log(
            runId,
            'serp',
            'running',
            `Collecting: "${kw.keyword}" / ${country} / ${device}`,
          );

          const results = await collectSerpForKeyword(kw.keyword, country, device);

          // Insert results into DB
          const rows = results.map((r) => ({
            run_id: runId,
            keyword_id: kw.id,
            country,
            device,
            position: r.position,
            url: r.url,
            domain: r.domain,
            title: r.title,
            snippet: r.snippet,
            is_lacoste: r.is_lacoste,
            serp_status: 'ok' as const,
            scrap_status: 'pending' as const,
          }));

          const { error: insertError } = await supabase.from('serp_results').insert(rows);
          if (insertError) {
            throw new Error(`DB insert error: ${insertError.message}`);
          }

          totalResults += results.length;
        } catch (error) {
          errors++;
          await log(runId, 'serp', 'error', `Failed: "${kw.keyword}" / ${country} / ${device}`, {
            error: (error as Error).message,
          });
        }
      }
    }
  }

  await log(
    runId,
    'serp',
    'done',
    `SERP collection complete: ${totalResults} results, ${errors} errors`,
  );
}
