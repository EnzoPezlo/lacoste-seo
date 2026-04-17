import { config } from './config.js';

/** Scrape a single URL via Firecrawl API */
export async function firecrawlScrape(
  url: string,
  format: 'markdown' | 'rawHtml',
  options: Record<string, unknown> = {},
): Promise<string> {
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.firecrawl.key}`,
    },
    body: JSON.stringify({
      url,
      formats: [format],
      onlyMainContent: format === 'markdown',
      blockAds: true,
      removeBase64Images: true,
      timeout: 30000,
      ...options,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Firecrawl ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  if (format === 'markdown') {
    return data.data?.markdown || '';
  }
  return data.data?.rawHtml || data.data?.html || '';
}

/** Extract JSON-LD structured data from HTML (searches full document, deduplicates) */
export function extractStructuredData(html: string): unknown[] {
  const ldJsonRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const results: unknown[] = [];
  const seen = new Set<string>();
  let match;
  while ((match = ldJsonRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const key = JSON.stringify(parsed);
      if (!seen.has(key)) {
        seen.add(key);
        results.push(parsed);
      }
    } catch { /* skip malformed */ }
  }
  return results;
}
