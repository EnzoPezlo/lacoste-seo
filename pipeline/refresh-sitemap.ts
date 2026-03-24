import { XMLParser } from 'fast-xml-parser';
import { supabase } from './lib/supabase.js';

const SITEMAP_URL = 'https://www.lacoste.com/sitemap.xml';

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
    headers: { 'User-Agent': 'Lacoste-SEO-Bot/1.0' },
    signal: AbortSignal.timeout(30_000),
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

export async function refreshSitemap(): Promise<void> {
  console.log(`\nFetching Lacoste sitemap: ${SITEMAP_URL}\n`);

  let urls: SitemapUrl[];
  try {
    urls = await fetchSitemapUrls(SITEMAP_URL);
  } catch (err) {
    console.error(`Sitemap fetch failed: ${(err as Error).message}`);
    console.log('Keeping existing data unchanged.');
    return;
  }

  console.log(`Found ${urls.length} URLs in sitemap\n`);

  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;

  // Upsert in batches of 100
  for (let i = 0; i < urls.length; i += 100) {
    const batch = urls.slice(i, i + 100).map((u) => ({
      url: u.loc,
      locale: extractLocale(u.loc),
      path: new URL(u.loc).pathname,
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
