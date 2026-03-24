# Lacoste Reference & Links Enrichment — Design Spec

## Problem

Two gaps in the current pipeline and dashboard:

1. **Missing Lacoste context**: When Lacoste is absent from the SERP (e.g., "polo homme"), the pipeline has no Lacoste page to compare against competitors. Analyses either hallucinate Lacoste's state or skip the comparison entirely.

2. **No source links**: Analyses cite competitors by name but provide no clickable links to the actual pages. The SERP page shows domains but not clickable URLs.

## Solution Overview

- **Lacoste sitemap reference**: Monthly crawl of lacoste.com sitemap, stored as a lookup table. When Lacoste is absent from SERP, find the most relevant page, scrape it, and inject it into the LLM prompt.
- **Clickable citations**: Competitor names in analyses become clickable links. A "Sources" block lists all scraped pages per analysis.
- **SERP page links**: URLs become clickable in the existing SERP table.

---

## 1. Lacoste Pages Reference

### Table: `lacoste_pages`

```sql
CREATE TABLE lacoste_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL,
  locale TEXT NOT NULL,          -- 'fr', 'us', 'gb', etc.
  path TEXT NOT NULL,            -- URL path only (for matching)
  page_type TEXT,                -- 'category', 'product', 'editorial', 'other'
  is_new BOOLEAN DEFAULT true,   -- true if first seen in latest refresh
  sitemap_last_seen TIMESTAMPTZ, -- last time seen in sitemap
  removed_at TIMESTAMPTZ,        -- soft delete when disappears from sitemap
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lacoste_pages_locale_active
  ON lacoste_pages (locale)
  WHERE removed_at IS NULL;
```

RLS policy: anon = read-only, service_role = full access (same pattern as other tables).

### Sitemap Refresh Job

- **Module**: `pipeline/refresh-sitemap.ts`
- **Trigger**: Manual or scheduled monthly
- **Process**:
  1. Fetch `https://www.lacoste.com/sitemap.xml` and follow sub-sitemaps
  2. Parse all URLs, extract locale from path:
     - Match first path segment after domain: `/fr/` → `fr`, `/us/` → `us`, `/de-de/` → `de`
     - Normalize: strip country suffix if present (e.g., `fr-fr` → `fr`)
     - Fallback: if no locale segment found, use `en` as default
  3. Upsert into `lacoste_pages`:
     - Existing URLs: update `sitemap_last_seen`, clear `removed_at` if was soft-deleted
     - New URLs: insert with `is_new = true`
     - Missing URLs (in DB but not in sitemap): set `removed_at = now()`
  4. After processing: reset `is_new = false` on all rows from previous refresh
  5. Log summary: total URLs, new, removed
- **Error handling**: If sitemap fetch fails (403, 500, timeout), log error and keep existing data unchanged. Do not mark pages as removed on fetch failure.

### Scrape Cache

- Snapshots for Lacoste reference pages are stored in a dedicated **`lacoste_snapshots`** table (not the run-bound `snapshots` table, which has `run_id NOT NULL`):

```sql
CREATE TABLE lacoste_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL,
  markdown_content TEXT,
  head_html TEXT,
  structured_data JSONB,
  scraped_at TIMESTAMPTZ DEFAULT now()
);
```

- **TTL**: 1 month. A snapshot is "fresh" if `scraped_at` is within 30 days.
- **Skip rule**: Before scraping, also check the regular `snapshots` table — if the same URL was scraped in any recent run (< 30 days), copy its data to `lacoste_snapshots` instead of re-scraping.
- RLS: anon = read-only, service_role = full access.

---

## 2. Keyword → Lacoste Page Matching

### When It Runs

Only when `is_lacoste = true` is NOT found in `serp_results` for a given keyword/country/device combination.

### Matching Algorithm

**Step 1 — Filter by locale**:
- Map country to locale: FR → `fr`, US → `us`, GB → `gb`, DE → `de`, ES → `es`, IT → `it`
- Filter `lacoste_pages` where `locale` matches and `removed_at IS NULL`
- If 0 candidates after locale filter, return `null` immediately

**Step 2 — Token scoring**:
- Tokenize keyword: `"polo homme"` → `["polo", "homme"]`
- Tokenize URL path: split on `/` and `-`, e.g., `/fr/lacoste/homme/vetements/polos/` → `["fr", "lacoste", "homme", "vetements", "polos"]`
- **Stopwords** (excluded from both keyword and path tokens): `de`, `du`, `le`, `la`, `les`, `en`, `pour`, `des`, `un`, `une`, `the`, `for`, `and`, `men`, `women`
- **Stemming**: strip trailing `s` only if token length > 3 (avoids `bas` → `ba`, `les` → `le`)
- **Minimum token length**: ignore tokens with length < 3
- Score = count of matching stemmed tokens
- Return top 3 candidates sorted by score desc

**Step 3 — LLM fallback** (if ambiguous):
- Triggered when:
  - Best score < 2 AND at least 1 candidate exists, OR
  - Top 2 candidates have equal scores AND score >= 2
- If only 1 candidate exists with score >= 1, use it directly (no ambiguity)
- If 0 candidates with score > 0, return `null` (no LLM call)
- Send top 10 candidate URLs + keyword to ministral
- Prompt: "Quel URL correspond le mieux au mot-clé '{keyword}'? Réponds avec l'URL uniquement."
- Single short LLM call

**Step 4 — Result**:
- Returns best matching URL, or `null` if no match found

### Module

`pipeline/lib/lacoste-matcher.ts` — exported function:
```typescript
async function findLacostePageForKeyword(
  keyword: string,
  country: string
): Promise<{ url: string; matchMethod: 'token' | 'llm' } | null>
```

---

## 3. Analyze-Gap Enrichment

### Changes to `pipeline/analyze-gap.ts`

When building the aggregated content for the LLM prompt:

1. **If Lacoste is in SERP**: no change — use existing SERP data and snapshot
2. **If Lacoste is absent from SERP**:
   a. Call `findLacostePageForKeyword(keyword, country)`
   b. If a URL is found:
      - Check `lacoste_snapshots` for fresh data (< 30 days). If stale or missing, also check `snapshots` table. If still nothing, scrape via Firecrawl and store in `lacoste_snapshots`.
      - Inject into prompt with label: `LACOSTE (Absent du Top 20 — page la plus pertinente : {url})`
   c. If no URL found:
      - Inject: `LACOSTE : aucune page pertinente trouvée sur lacoste.com`
      - LLM will analyze competitors only and recommend page creation

### URL Labels in Prompt

Change the result label format in `analyze-gap.ts` (line ~143, inside the `--- label ---` wrapper) from:
```
--- Position 3 : amazon.fr ---
```
to:
```
--- Position 3 : amazon.fr (https://www.amazon.fr/sacoche-homme/s?k=sacoche+homme) ---
```

The LLM sees the URLs for reference but is NOT asked to write them in the analysis text.

### Source Mapping Storage

Add a `sources` JSONB column to the `analyses` table:

```sql
ALTER TABLE analyses ADD COLUMN sources JSONB;
```

Populated at insert time with the list of sources used for the analysis:
```json
[
  { "position": 1, "domain": "galerieslafayette.com", "actor_name": "Galeries Lafayette", "url": "https://..." },
  { "position": 2, "domain": "zalando.fr", "actor_name": "Zalando", "url": "https://..." },
  { "position": "lacoste_ref", "domain": "lacoste.com", "actor_name": "Lacoste", "url": "https://...", "match_method": "token" }
]
```

`actor_name` is sourced from `serp_results.actor_name` (populated by the classification step). Fallback: use domain name if `actor_name` is null.

---

## 4. Dashboard — Clickable Citations

### StructuredAnalysis Component Changes

**Citation linking**:
- Receive `sources` array alongside `content`
- Build a lookup: map of `actor_name` → URL AND `domain` → URL (both keys, for maximum matching)
- When rendering each section's text via ReactMarkdown, use a custom text renderer that scans for known actor names/domains and wraps matches in `<a href={url} target="_blank">` tags
- Match on whole words only to avoid false positives (e.g., don't match "polo" inside a domain)

**New "Sources" collapsible block**:
- Added after the Recommandations block, same collapsible pattern
- Lists all sources grouped by position
- Display name: `actor_name` if available, otherwise `domain`
- Format: `#1 Galeries Lafayette — /c/homme/sacs/sacoches` (clickable, shows path only for readability)
- Lacoste reference page shown separately if from sitemap match: `Lacoste (référence) — /fr/homme/polos/` (clickable)
- If `sources` is null (old analyses), block is hidden

### SERP Page Changes

- Make the existing domain column in `SerpPage.tsx` a clickable `<a>` tag opening the full URL in a new tab
- Keep displaying the short domain name, just make it a link

---

## 5. Data Flow Summary

```
Monthly:
  sitemap.xml → parse → lacoste_pages table

Per analysis run:
  keyword + country + device
    ↓
  SERP results (top 20)
    ↓
  Lacoste in SERP? ──yes──→ use SERP snapshot
    │ no
    ↓
  findLacostePageForKeyword()
    ↓
  Match found? ──yes──→ check lacoste_snapshots (< 30 days)
    │ no                    ↓ stale/missing
    ↓                   check snapshots table → if fresh, copy
  Label: "aucune page"     ↓ still missing
    ↓                   scrape via Firecrawl → store in lacoste_snapshots
    ↓                       ↓
    ↓                   Label: "Absent — page pertinente"
    ↓                       ↓
  LLM prompt (competitors + Lacoste context + URLs)
    ↓
  Analysis stored with sources JSONB array
    ↓
  Dashboard renders with clickable citations + Sources block
```

---

## 6. Files to Create/Modify

### New files
- `pipeline/refresh-sitemap.ts` — sitemap parser and upsert job
- `pipeline/lib/lacoste-matcher.ts` — keyword → Lacoste page matching
- `supabase/migrations/XXXX_lacoste_pages.sql` — new tables (`lacoste_pages`, `lacoste_snapshots`) + RLS policies
- `supabase/migrations/XXXX_analyses_sources.sql` — `ALTER TABLE analyses ADD COLUMN sources JSONB`

### Modified files
- `pipeline/analyze-gap.ts` — Lacoste reference injection, URL labels in prompt, sources population at insert
- `src/pages/AnalysesPage.tsx` — clickable citations in text, Sources collapsible block, `sources` in Analysis interface
- `src/pages/SerpPage.tsx` — clickable domain URLs

### Not modified
- `pipeline/collect-serp.ts` — no secondary search needed
- `pipeline/scrape.ts` — reused as-is for on-demand Lacoste scraping
- `pipeline/prompts/analyze-gap.ts` — no change (URLs added in analyze-gap.ts code)
