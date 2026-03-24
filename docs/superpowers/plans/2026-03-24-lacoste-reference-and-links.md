# Lacoste Reference & Links Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable gap analysis when Lacoste is absent from SERP by maintaining a sitemap reference, and add clickable source links throughout the dashboard.

**Architecture:** Monthly sitemap crawl populates `lacoste_pages` table. At analysis time, if Lacoste is absent from SERP, a token-based matcher finds the best Lacoste page, scrapes it on demand into `lacoste_snapshots`, and injects it into the LLM prompt. The `analyses` table gains a `sources` JSONB column used by the dashboard to render clickable citations and a Sources block.

**Tech Stack:** TypeScript, Supabase (PostgreSQL), Firecrawl, Ollama/ministral-3:14b, React 19, Vite, vitest

**Spec:** `docs/superpowers/specs/2026-03-24-lacoste-reference-and-links-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/003_lacoste_reference.sql` | Create `lacoste_pages` + `lacoste_snapshots` tables, indexes, RLS |
| `supabase/migrations/004_analyses_sources.sql` | Add `sources JSONB` column to `analyses` |
| `pipeline/refresh-sitemap.ts` | Parse lacoste.com sitemap, upsert into `lacoste_pages` |
| `pipeline/lib/lacoste-matcher.ts` | Match keyword → best Lacoste page URL |
| `pipeline/lib/scrape-utils.ts` | Exported `firecrawlScrape` + `scrapeToLacostSnapshots` helpers |
| `pipeline/lib/__tests__/lacoste-matcher.test.ts` | Tests for token scoring and matching |

### Modified files
| File | Changes |
|------|---------|
| `pipeline/scrape.ts` | Export `firecrawlScrape` and `extractStructuredData` |
| `pipeline/analyze-gap.ts` | Lacoste reference lookup, URL labels in prompt, sources population |
| `src/pages/AnalysesPage.tsx` | `sources` in interface, clickable citations, Sources block |
| `src/pages/SerpPage.tsx` | Make domain column a clickable link |
| `package.json` | Add `fast-xml-parser` dependency |

---

## Task 1: Database Migrations

**Files:**
- Create: `supabase/migrations/003_lacoste_reference.sql`
- Create: `supabase/migrations/004_analyses_sources.sql`

- [ ] **Step 1: Create migration 003 — lacoste_pages + lacoste_snapshots**

```sql
-- 003_lacoste_reference.sql

-- Lacoste sitemap page index
CREATE TABLE lacoste_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL,
  locale TEXT NOT NULL,
  path TEXT NOT NULL,
  page_type TEXT,
  is_new BOOLEAN DEFAULT true,
  sitemap_last_seen TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lacoste_pages_locale_active
  ON lacoste_pages (locale)
  WHERE removed_at IS NULL;

-- Cached scrapes of Lacoste pages (independent of pipeline runs)
CREATE TABLE lacoste_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL,
  markdown_content TEXT,
  head_html TEXT,
  structured_data JSONB,
  scraped_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies (same pattern as existing tables)
ALTER TABLE lacoste_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lacoste_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read lacoste_pages" ON lacoste_pages
  FOR SELECT TO anon USING (true);
CREATE POLICY "service full lacoste_pages" ON lacoste_pages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon read lacoste_snapshots" ON lacoste_snapshots
  FOR SELECT TO anon USING (true);
CREATE POLICY "service full lacoste_snapshots" ON lacoste_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Create migration 004 — analyses sources column**

```sql
-- 004_analyses_sources.sql
ALTER TABLE analyses ADD COLUMN sources JSONB;
```

- [ ] **Step 3: Apply migrations via Supabase dashboard**

Go to Supabase SQL Editor and run both migrations. Verify tables exist:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('lacoste_pages', 'lacoste_snapshots');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_lacoste_reference.sql supabase/migrations/004_analyses_sources.sql
git commit -m "feat: add lacoste_pages, lacoste_snapshots tables and sources column on analyses"
```

---

## Task 2: Install XML Parser

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install fast-xml-parser**

```bash
npm install fast-xml-parser
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add fast-xml-parser for sitemap parsing"
```

---

## Task 3: Sitemap Refresh Job

**Files:**
- Create: `pipeline/refresh-sitemap.ts`

- [ ] **Step 1: Create refresh-sitemap.ts**

```typescript
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
  console.log(`\n🗺️  Fetching Lacoste sitemap: ${SITEMAP_URL}\n`);

  let urls: SitemapUrl[];
  try {
    urls = await fetchSitemapUrls(SITEMAP_URL);
  } catch (err) {
    console.error(`❌ Sitemap fetch failed: ${(err as Error).message}`);
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
      removed_at: null, // clear soft-delete if re-appeared
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

  console.log(`✅ Sitemap refresh complete:`);
  console.log(`   ${inserted} new pages`);
  console.log(`   ${updated} updated pages`);
  console.log(`   ${removedCount || 0} removed pages`);
}

// Allow standalone execution
if (process.argv[1]?.includes('refresh-sitemap')) {
  refreshSitemap().catch(console.error);
}
```

- [ ] **Step 2: Test manually**

```bash
set -a && source .env.local && set +a && npx tsx pipeline/refresh-sitemap.ts
```

Expected: fetches sitemap, inserts URLs into `lacoste_pages`, logs summary.

- [ ] **Step 3: Commit**

```bash
git add pipeline/refresh-sitemap.ts
git commit -m "feat: add sitemap refresh job for Lacoste page reference"
```

---

## Task 4: Scrape Utils (Extract Reusable Functions)

**Files:**
- Modify: `pipeline/scrape.ts` (lines 5-52)
- Create: `pipeline/lib/scrape-utils.ts`

- [ ] **Step 1: Create scrape-utils.ts extracting reusable functions**

```typescript
import { config } from './config.js';

/** Scrape a single URL via Firecrawl API */
export async function firecrawlScrape(
  url: string,
  format: 'markdown' | 'rawHtml',
  options: Record<string, unknown> = {},
): Promise<string> {
  const response = await fetch(`${config.firecrawl.key ? 'https://api.firecrawl.dev/v1' : ''}/scrape`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.firecrawl.key}`,
    },
    body: JSON.stringify({
      url,
      formats: [format],
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
  if (!data.success) throw new Error(`Firecrawl error: ${data.error || 'unknown'}`);
  return data.data?.[format] || '';
}

/** Extract JSON-LD structured data from HTML head */
export function extractStructuredData(headHtml: string): unknown[] {
  const ldJsonRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const results: unknown[] = [];
  let match;
  while ((match = ldJsonRegex.exec(headHtml)) !== null) {
    try {
      results.push(JSON.parse(match[1]));
    } catch { /* skip malformed */ }
  }
  return results;
}
```

- [ ] **Step 2: Update scrape.ts to import from scrape-utils**

In `pipeline/scrape.ts`, replace the local `firecrawlScrape` and `extractStructuredData` functions with imports:

Replace lines 1-52 with:
```typescript
import { supabase } from './lib/supabase.js';
import { log } from './lib/logger.js';
import { firecrawlScrape, extractStructuredData } from './lib/scrape-utils.js';
```

Keep the rest of the file unchanged (the `scrape(runId)` function starting at the original line 54).

- [ ] **Step 3: Verify pipeline still works**

```bash
set -a && source .env.local && set +a && npx tsx -e "import './pipeline/scrape.js'"
```

Expected: no import errors.

- [ ] **Step 4: Commit**

```bash
git add pipeline/lib/scrape-utils.ts pipeline/scrape.ts
git commit -m "refactor: extract firecrawlScrape and extractStructuredData to scrape-utils"
```

---

## Task 5: Lacoste Page Matcher

**Files:**
- Create: `pipeline/lib/lacoste-matcher.ts`
- Create: `pipeline/lib/__tests__/lacoste-matcher.test.ts`

- [ ] **Step 1: Write tests for the token scorer**

```typescript
// pipeline/lib/__tests__/lacoste-matcher.test.ts
import { describe, it, expect } from 'vitest';
import { tokenize, tokenScore } from '../lacoste-matcher.js';

describe('tokenize', () => {
  it('splits on spaces, slashes, hyphens and lowercases', () => {
    expect(tokenize('polo homme')).toEqual(['polo', 'homme']);
    expect(tokenize('/fr/lacoste/homme/vetements/polos/')).toEqual(['lacoste', 'homme', 'vetements', 'polos']);
  });

  it('strips trailing s for tokens > 3 chars', () => {
    expect(tokenize('polos')).toEqual(['polo']);
    expect(tokenize('bas')).toEqual(['bas']); // length 3, no strip
  });

  it('removes stopwords', () => {
    expect(tokenize('polo pour homme')).toEqual(['polo', 'homme']);
    expect(tokenize('the best polo for men')).toEqual(['best', 'polo']);
  });

  it('removes tokens shorter than 3 chars', () => {
    expect(tokenize('le polo de homme')).toEqual(['polo', 'homme']);
  });
});

describe('tokenScore', () => {
  it('scores matching tokens', () => {
    expect(tokenScore('polo homme', '/fr/lacoste/homme/vetements/polos/')).toBe(2);
  });

  it('returns 0 for no match', () => {
    expect(tokenScore('sneakers femme', '/fr/lacoste/homme/vetements/polos/')).toBe(0);
  });

  it('handles plurals', () => {
    expect(tokenScore('sneakers homme', '/fr/homme/chaussures/sneakers/')).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run pipeline/lib/__tests__/lacoste-matcher.test.ts
```

Expected: FAIL — `tokenize` and `tokenScore` not found.

- [ ] **Step 3: Implement lacoste-matcher.ts**

```typescript
// pipeline/lib/lacoste-matcher.ts
import { supabase } from './supabase.js';
import { callLLM } from './llm.js';

const STOPWORDS = new Set([
  'de', 'du', 'le', 'la', 'les', 'en', 'pour', 'des', 'un', 'une',
  'the', 'for', 'and', 'men', 'women', 'homme', 'femme',
]);

const COUNTRY_TO_LOCALE: Record<string, string> = {
  FR: 'fr', US: 'us', GB: 'gb', DE: 'de', ES: 'es', IT: 'it',
};

/** Tokenize a string: split on spaces/slashes/hyphens, stem, remove stopwords */
export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[\s/\-_]+/)
    .map((t) => t.replace(/[^a-zà-ÿ0-9]/g, ''))
    .filter((t) => t.length >= 3)
    .filter((t) => !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}

/** Score how many tokens a keyword shares with a URL path */
export function tokenScore(keyword: string, urlPath: string): number {
  const kwTokens = new Set(tokenize(keyword));
  const pathTokens = tokenize(urlPath);
  return pathTokens.filter((t) => kwTokens.has(t)).length;
}

/** Find the most relevant Lacoste page for a keyword + country */
export async function findLacostePageForKeyword(
  keyword: string,
  country: string,
): Promise<{ url: string; matchMethod: 'token' | 'llm' } | null> {
  const locale = COUNTRY_TO_LOCALE[country] || 'en';

  // Step 1: Filter by locale
  const { data: pages } = await supabase
    .from('lacoste_pages')
    .select('url, path')
    .eq('locale', locale)
    .is('removed_at', null);

  if (!pages || pages.length === 0) return null;

  // Step 2: Score all pages
  const scored = pages
    .map((p) => ({ url: p.url, path: p.path, score: tokenScore(keyword, p.path) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  // Step 3: Decide if LLM fallback is needed
  const best = scored[0];
  const second = scored[1];

  const needsLLM =
    (best.score < 2 && scored.length > 1) ||
    (second && best.score === second.score && best.score >= 2);

  if (!needsLLM) {
    return { url: best.url, matchMethod: 'token' };
  }

  // Step 4: LLM fallback
  const top10 = scored.slice(0, 10).map((p) => p.url);
  try {
    const response = await callLLM({
      task: 'analyze_gap',
      prompt: `Quel URL correspond le mieux au mot-clé "${keyword}" ?\n\nURLs:\n${top10.join('\n')}\n\nRéponds avec l'URL uniquement, rien d'autre.`,
      temperature: 0.1,
      maxTokens: 200,
    });

    const matchedUrl = response.trim();
    if (top10.includes(matchedUrl)) {
      return { url: matchedUrl, matchMethod: 'llm' };
    }
  } catch (err) {
    console.error('[lacoste-matcher] LLM fallback failed:', (err as Error).message);
  }

  // Fallback to best token match
  return { url: best.url, matchMethod: 'token' };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run pipeline/lib/__tests__/lacoste-matcher.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/lacoste-matcher.ts pipeline/lib/__tests__/lacoste-matcher.test.ts
git commit -m "feat: add Lacoste page matcher with token scoring and LLM fallback"
```

---

## Task 6: Enrich analyze-gap.ts

**Files:**
- Modify: `pipeline/analyze-gap.ts` (lines 89, 124-145, 230-240)

- [ ] **Step 1: Add imports at top of analyze-gap.ts**

After existing imports (line 5), add:
```typescript
import { findLacostePageForKeyword } from './lib/lacoste-matcher.js';
import { firecrawlScrape, extractStructuredData } from './lib/scrape-utils.js';
```

- [ ] **Step 2: Add helper to get or scrape a Lacoste reference snapshot**

After the `parseLLMJsonArray` function (after line 32), add:

```typescript
interface SourceRef {
  position: number | 'lacoste_ref';
  domain: string;
  actor_name: string;
  url: string;
  match_method?: 'token' | 'llm';
}

/** Get a fresh snapshot for a Lacoste reference page, scraping if needed */
async function getLacostRefSnapshot(url: string): Promise<{
  markdown_content: string | null;
  head_html: string | null;
  structured_data: unknown | null;
} | null> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Check lacoste_snapshots cache
  const { data: cached } = await supabase
    .from('lacoste_snapshots')
    .select('markdown_content, head_html, structured_data, scraped_at')
    .eq('url', url)
    .single();

  if (cached && cached.scraped_at > thirtyDaysAgo) return cached;

  // Check regular snapshots table (may have been scraped in a SERP run)
  const { data: serpSnap } = await supabase
    .from('snapshots')
    .select('markdown_content, head_html, structured_data, created_at')
    .eq('url', url)
    .gt('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (serpSnap) {
    // Copy to lacoste_snapshots for future use
    await supabase.from('lacoste_snapshots').upsert({
      url,
      markdown_content: serpSnap.markdown_content,
      head_html: serpSnap.head_html,
      structured_data: serpSnap.structured_data,
    }, { onConflict: 'url' });
    return serpSnap;
  }

  // Scrape fresh
  try {
    const markdownContent = await firecrawlScrape(url, 'markdown');
    const headHtml = await firecrawlScrape(url, 'rawHtml');
    const structuredData = extractStructuredData(headHtml);

    const snapshot = {
      markdown_content: markdownContent,
      head_html: headHtml,
      structured_data: structuredData.length > 0 ? structuredData : null,
    };

    await supabase.from('lacoste_snapshots').upsert({
      url,
      ...snapshot,
    }, { onConflict: 'url' });

    return snapshot;
  } catch (err) {
    console.error(`[analyze_gap] Failed to scrape Lacoste ref ${url}:`, (err as Error).message);
    return null;
  }
}
```

- [ ] **Step 3: Update the content building loop to include URLs and Lacoste reference**

In the content building loop (around lines 119-158), replace the label building and add Lacoste reference lookup. Find the block starting with `for (const item of batch)` and replace it entirely:

```typescript
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
                aggregatedContent += `STRUCTURED DATA: ${JSON.stringify(snapshot.structured_data).slice(0, 300)}\n`;
              }
              aggregatedContent += `CONTENU MARKDOWN:\n${md}\n\n`;
            } else {
              aggregatedContent += `(snapshot non disponible — scraping en erreur)\n\n`;
            }
          }

          // If Lacoste absent, find and inject reference page
          if (!lacostePosResult) {
            const match = await findLacostePageForKeyword(keyword, country);
            if (match) {
              const refSnapshot = await getLacostRefSnapshot(match.url);
              batchSources.push({
                position: 'lacoste_ref',
                domain: 'lacoste.com',
                actor_name: 'Lacoste',
                url: match.url,
                match_method: match.matchMethod,
              });

              aggregatedContent += `--- LACOSTE (Absent du Top 20 — page la plus pertinente : ${match.url}) ---\n`;
              if (refSnapshot) {
                const md = refSnapshot.markdown_content?.slice(0, 1500) || '(no content)';
                aggregatedContent += `META HEAD: ${refSnapshot.head_html?.slice(0, 300) || '(no head)'}\n`;
                if (refSnapshot.structured_data) {
                  aggregatedContent += `STRUCTURED DATA: ${JSON.stringify(refSnapshot.structured_data).slice(0, 300)}\n`;
                }
                aggregatedContent += `CONTENU MARKDOWN:\n${md}\n\n`;
              } else {
                aggregatedContent += `(scraping en erreur)\n\n`;
              }
            } else {
              aggregatedContent += `--- LACOSTE : aucune page pertinente trouvée sur lacoste.com ---\n\n`;
            }
          }
        }
```

- [ ] **Step 4: Update the insert to include sources**

In the insert block (around line 230), add `sources: batchSources` to the insert object:

```typescript
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
          });
```

- [ ] **Step 5: Verify compilation**

```bash
npx tsc --noEmit --project tsconfig.pipeline.json
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add pipeline/analyze-gap.ts
git commit -m "feat: enrich gap analysis with Lacoste reference pages and source tracking"
```

---

## Task 7: Dashboard — Clickable Citations & Sources Block

**Files:**
- Modify: `src/pages/AnalysesPage.tsx`

- [ ] **Step 1: Update Analysis interface (line 6-22)**

Add `sources` field:
```typescript
interface SourceRef {
  position: number | 'lacoste_ref';
  domain: string;
  actor_name: string;
  url: string;
  match_method?: 'token' | 'llm';
}

interface Analysis {
  // ... existing fields ...
  sources: SourceRef[] | null;
}
```

- [ ] **Step 2: Add a CitationText component for linking names to URLs**

After the `findSectionConfig` function, add:

```typescript
/** Replace known actor names in text with clickable links */
function CitationText({ text, sources }: { text: string; sources: SourceRef[] | null }) {
  if (!sources || sources.length === 0) {
    return <>{text}</>;
  }

  // Build lookup: actor_name → url, domain → url
  const lookup = new Map<string, string>();
  for (const s of sources) {
    if (s.actor_name) lookup.set(s.actor_name.toLowerCase(), s.url);
    if (s.domain) lookup.set(s.domain.toLowerCase(), s.url);
  }

  // Sort keys by length desc so longer names match first
  const keys = [...lookup.keys()].sort((a, b) => b.length - a.length);
  if (keys.length === 0) return <>{text}</>;

  // Build regex matching whole words only
  const escaped = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

  const parts: Array<string | { text: string; url: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = lookup.get(match[0].toLowerCase());
    if (url) {
      parts.push({ text: match[0], url });
    } else {
      parts.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline decoration-brand/30 hover:decoration-brand/60 transition-colors"
          >
            {part.text}
          </a>
        ),
      )}
    </>
  );
}
```

- [ ] **Step 3: Update StructuredAnalysis to accept and pass sources**

Change the component signature and pass sources down:

```typescript
function StructuredAnalysis({ content, sources }: { content: string; sources: SourceRef[] | null }) {
```

Update the `CollapsibleSection` to accept sources:
```typescript
function CollapsibleSection({ section, sources }: { section: ParsedSection; sources: SourceRef[] | null }) {
```

In the section body rendering, replace `<ReactMarkdown>` with `CitationText` wrapping:
```typescript
{open && (
  <div className="px-3 py-2.5 border-t border-inherit bg-white prose prose-sm max-w-none text-zinc-700">
    <CitationText text={section.content} sources={sources} />
  </div>
)}
```

- [ ] **Step 4: Add Sources collapsible block**

In `StructuredAnalysis`, after the recommendations block, add:

```typescript
      {sources && sources.length > 0 && (
        <div className="rounded-lg border border-zinc-200 overflow-hidden">
          <button
            onClick={() => setSourcesOpen(!sourcesOpen)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-zinc-50 transition-colors hover:bg-zinc-100"
          >
            {sourcesOpen ? (
              <ChevronDown size={14} className="text-zinc-400" />
            ) : (
              <ChevronRight size={14} className="text-zinc-400" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Sources ({sources.length})
            </span>
          </button>
          {sourcesOpen && (
            <div className="px-3 py-2.5 border-t border-zinc-100 bg-white">
              <ul className="space-y-1">
                {sources.map((s, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <span className="shrink-0 text-xs text-zinc-400 w-6 text-right">
                      {s.position === 'lacoste_ref' ? 'ref' : `#${s.position}`}
                    </span>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline truncate"
                    >
                      {s.actor_name || s.domain}
                    </a>
                    <span className="text-xs text-zinc-400 truncate hidden md:inline">
                      {new URL(s.url).pathname}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
```

Add `const [sourcesOpen, setSourcesOpen] = useState(false);` in `StructuredAnalysis`.

- [ ] **Step 5: Pass sources from the parent component**

In the expanded analysis render (around line 345), update:
```typescript
<StructuredAnalysis content={a.content} sources={a.sources} />
```

- [ ] **Step 6: Verify build**

```bash
npx tsc --noEmit --project tsconfig.app.json && npm run build
```

Expected: no errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AnalysesPage.tsx
git commit -m "feat: add clickable citations and Sources block in analyses dashboard"
```

---

## Task 8: SERP Page — Clickable URLs

**Files:**
- Modify: `src/pages/SerpPage.tsx` (line 211)

- [ ] **Step 1: Make domain column clickable**

Replace line 211:
```typescript
<td className="p-3 text-zinc-400 text-xs">{r.domain}</td>
```
with:
```typescript
<td className="p-3 text-xs">
  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
    {r.domain}
  </a>
</td>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/SerpPage.tsx
git commit -m "feat: make SERP domains clickable links"
```

---

## Task 9: Final Integration Test & Push

- [ ] **Step 1: Run all tests**

```bash
npm test
```

- [ ] **Step 2: Run full build**

```bash
npm run build
```

- [ ] **Step 3: Test pipeline resume with reference system**

```bash
set -a && source .env.local && set +a && npx tsx pipeline/refresh-sitemap.ts
```

Then test gap analysis on a keyword where Lacoste is absent:
```bash
set -a && source .env.local && set +a && RESUME_RUN_ID=677b31a9-27ca-46e3-a795-f50b5fe18a9b npx tsx pipeline/run.ts
```

- [ ] **Step 4: Verify in dashboard**

Open `http://localhost:5173/lacoste-seo/`, select a run, expand an analysis:
- Sources block should appear with clickable links
- Competitor names in text should be clickable
- SERP page domains should be clickable

- [ ] **Step 5: Push**

```bash
git push origin main
```
