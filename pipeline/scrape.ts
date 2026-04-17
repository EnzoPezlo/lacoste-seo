import { supabase } from './lib/supabase.js';
import { log } from './lib/logger.js';
import { firecrawlScrape, extractStructuredData } from './lib/scrape-utils.js';

export async function scrape(runId: string): Promise<void> {
  await log(runId, 'scrape', 'running', 'Starting scraping');

  // Get unique URLs from SERP results for this run
  const { data: serpResults, error: serpError } = await supabase
    .from('serp_results')
    .select('url')
    .eq('run_id', runId)
    .eq('serp_status', 'ok')
    .eq('scrap_status', 'pending');

  if (serpError || !serpResults) {
    await log(runId, 'scrape', 'error', `Failed to fetch SERP results: ${serpError?.message}`);
    throw new Error(`Failed to fetch SERP results: ${serpError?.message}`);
  }

  // Deduplicate URLs
  const uniqueUrls = [...new Set(serpResults.map((r) => r.url))];
  await log(runId, 'scrape', 'running', `${uniqueUrls.length} unique URLs to scrape`);

  let scraped = 0;
  let errors = 0;

  for (const url of uniqueUrls) {
    try {
      await log(
        runId,
        'scrape',
        'running',
        `Scraping ${scraped + 1}/${uniqueUrls.length}: ${new URL(url).hostname}`,
      );

      // Call 1: Markdown content
      const markdownContent = await firecrawlScrape(url, 'markdown');

      // Call 2: Full HTML (we extract <head> ourselves since Firecrawl's
      // includeTags may not be supported in all API versions)
      const fullHtml = await firecrawlScrape(url, 'rawHtml', {
        onlyMainContent: false,
      });
      // Extract <head> section from full HTML
      const headMatch = fullHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
      const headHtml = headMatch ? headMatch[0] : fullHtml.slice(0, 5000);

      // Extract structured data from full HTML (JSON-LD can be in head or body)
      const structuredData = extractStructuredData(fullHtml);

      // Insert snapshot
      const { error: insertError } = await supabase.from('snapshots').insert({
        run_id: runId,
        url,
        markdown_content: markdownContent,
        head_html: headHtml,
        structured_data: structuredData.length > 0 ? structuredData : null,
        status: 'ok',
      });

      if (insertError) {
        throw new Error(`DB insert error: ${insertError.message}`);
      }

      // Update scrap_status for all serp_results with this URL
      await supabase
        .from('serp_results')
        .update({ scrap_status: 'ok' })
        .eq('run_id', runId)
        .eq('url', url);

      scraped++;
    } catch (error) {
      errors++;
      await log(runId, 'scrape', 'error', `Failed to scrape ${url}`, {
        error: (error as Error).message,
      });

      // Mark as error in serp_results
      await supabase
        .from('serp_results')
        .update({ scrap_status: 'error' })
        .eq('run_id', runId)
        .eq('url', url);
    }
  }

  await log(
    runId,
    'scrape',
    'done',
    `Scraping complete: ${scraped}/${uniqueUrls.length} URLs scraped, ${errors} errors`,
  );
}
