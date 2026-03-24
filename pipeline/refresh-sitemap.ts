import { XMLParser } from 'fast-xml-parser';
import { supabase } from './lib/supabase.js';
import { config } from './lib/config.js';

const SITEMAP_URL = 'https://www.lacoste.com/sitemap.xml';

/** Locales to crawl via Firecrawl map when sitemap is blocked */
const MAP_LOCALES = [
  { locale: 'fr', url: 'https://www.lacoste.com/fr/' },
  { locale: 'us', url: 'https://www.lacoste.com/us/' },
];

interface SitemapUrl {
  loc: string;
  lastmod?: string;
}

/** Extract locale from URL path. E.g., /fr/... → 'fr', /de-de/... → 'de' */
function extractLocale(url: string): string {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/^\/([a-z]{2})(?:-[a-z]{2})?\//);
    return match ? match[1] : 'en';
  } catch {
    return 'en';
  }
}

/** Fetch and parse a sitemap XML (handles sitemap index + regular sitemaps) */
async function fetchSitemapUrls(url: string): Promise<SitemapUrl[]> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/xml, application/xml, */*',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Sitemap fetch failed: ${response.status}`);

  const xml = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);

  // Sitemap index — recurse into sub-sitemaps
  if (parsed.sitemapindex?.sitemap) {
    const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
      ? parsed.sitemapindex.sitemap
      : [parsed.sitemapindex.sitemap];

    const allUrls: SitemapUrl[] = [];
    for (const sm of sitemaps) {
      const smUrl = sm.loc;
      console.log(`  Fetching sub-sitemap: ${smUrl}`);
      try {
        const subUrls = await fetchSitemapUrls(smUrl);
        allUrls.push(...subUrls);
      } catch (err) {
        console.error(`  Failed to fetch ${smUrl}: ${(err as Error).message}`);
      }
    }
    return allUrls;
  }

  // Regular sitemap — extract URLs
  if (parsed.urlset?.url) {
    const urls = Array.isArray(parsed.urlset.url)
      ? parsed.urlset.url
      : [parsed.urlset.url];
    return urls.map((u: any) => ({ loc: u.loc, lastmod: u.lastmod }));
  }

  return [];
}

/** Discover URLs via Firecrawl's map endpoint (used when sitemap is blocked) */
async function fetchViaFirecrawlMap(siteUrl: string): Promise<string[]> {
  if (!config.firecrawl.key) throw new Error('FIRECRAWL_KEY required for map fallback');

  console.log(`  Using Firecrawl map for ${siteUrl}...`);
  const response = await fetch('https://api.firecrawl.dev/v1/map', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.firecrawl.key}`,
    },
    body: JSON.stringify({ url: siteUrl, limit: 5000, ignoreSitemap: true }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) throw new Error(`Firecrawl map ${response.status}`);
  const data = await response.json();
  if (!data.success) throw new Error(`Firecrawl map error: ${data.error || 'unknown'}`);
  return data.links || [];
}

export async function refreshSitemap(): Promise<void> {
  console.log(`\nFetching Lacoste sitemap...\n`);

  let allUrls: string[] = [];

  // Strategy 1: Try XML sitemap directly
  try {
    const sitemapUrls = await fetchSitemapUrls(SITEMAP_URL);
    allUrls = sitemapUrls.map((u) => u.loc);
    console.log(`Parsed ${allUrls.length} URLs from XML sitemap`);
  } catch (err) {
    console.log(`XML sitemap blocked (${(err as Error).message}), falling back to Firecrawl map`);

    // Strategy 2: Firecrawl map per locale
    for (const { locale, url } of MAP_LOCALES) {
      try {
        const links = await fetchViaFirecrawlMap(url);
        // Filter to only lacoste.com URLs with the right locale
        const localeLinks = links.filter((l) => {
          try { return new URL(l).hostname.includes('lacoste.com'); }
          catch { return false; }
        });
        console.log(`  ${locale}: ${localeLinks.length} URLs discovered`);
        allUrls.push(...localeLinks);
      } catch (err) {
        console.error(`  Failed to map ${locale}: ${(err as Error).message}`);
      }
    }
  }

  if (allUrls.length === 0) {
    console.log('No URLs found. Keeping existing data unchanged.');
    return;
  }

  // Deduplicate
  allUrls = [...new Set(allUrls)];
  console.log(`\nTotal unique URLs: ${allUrls.length}\n`);

  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;

  // Upsert in batches of 100
  for (let i = 0; i < allUrls.length; i += 100) {
    const batch = allUrls.slice(i, i + 100).map((url) => ({
      url,
      locale: extractLocale(url),
      path: new URL(url).pathname,
      sitemap_last_seen: now,
      removed_at: null,
    }));

    const { data, error } = await supabase
      .from('lacoste_pages')
      .upsert(batch, { onConflict: 'url', ignoreDuplicates: false })
      .select('is_new');

    if (error) {
      console.error(`Batch ${i} error:`, error.message);
      continue;
    }

    const newCount = (data || []).filter((r) => r.is_new).length;
    inserted += newCount;
    updated += (data?.length || 0) - newCount;
  }

  // Mark pages not seen in this refresh as removed
  const { count: removedCount } = await supabase
    .from('lacoste_pages')
    .update({ removed_at: now })
    .lt('sitemap_last_seen', now)
    .is('removed_at', null)
    .select('id', { count: 'exact', head: true });

  // Reset is_new flag from previous refresh
  await supabase
    .from('lacoste_pages')
    .update({ is_new: false })
    .eq('is_new', true)
    .lt('sitemap_last_seen', now);

  console.log(`Sitemap refresh complete:`);
  console.log(`   ${inserted} new pages`);
  console.log(`   ${updated} updated pages`);
  console.log(`   ${removedCount || 0} removed pages`);
}

// Allow standalone execution
if (process.argv[1]?.includes('refresh-sitemap')) {
  refreshSitemap().catch(console.error);
}
