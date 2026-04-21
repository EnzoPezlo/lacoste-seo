# Lacoste SEO Intelligence — Developer Guide

## Project Overview

Competitive SEO intelligence platform for Lacoste. Collects SERP data, scrapes competitor pages, classifies actors via LLM, and generates gap analyses — all surfaced through a real-time dashboard.

**Stack**: React 19 + Vite + Tailwind v4 + Recharts | Supabase (Postgres + Edge Functions + Realtime) | GitHub Actions | Ollama Gemma 4 31B (primary) / Claude Opus (manual)

## Architecture

```
src/           → React dashboard (Vite, deployed to GitHub Pages)
pipeline/      → Node.js data pipeline (runs via GitHub Actions)
supabase/      → Migrations, RLS policies, Edge Functions
.github/       → CI/CD workflows (deploy + pipeline)
```

### Frontend (`src/`)
- **Router**: React Router v7 with `basename="/lacoste-seo"` (GitHub Pages)
- **State**: Direct Supabase queries + Realtime subscriptions (no Redux/Zustand)
- **Styling**: Tailwind v4 with CSS theme tokens. Brand color: `#00573F`
- **Icons**: lucide-react. **Toasts**: sonner
- **Auth**: Anon key → read-only via RLS. Service role for writes via Edge Functions

### Pipeline (`pipeline/`)
- Entry point: `pipeline/run.ts` — orchestrates 5 sequential steps
- Each step is a standalone module: `collect-serp.ts`, `scrape.ts`, `classify.ts`, `analyze-gap.ts`, `analyze-movement.ts`
- **SERP collection** fetches 50 results (5 pages of 10)
- **Consolidated analysis** in `analyze-gap.ts`: single analysis per keyword merging gap + deep dive
  - Scope: top 10 results + Lacoste (if in top 50). Top 3 get 2500 chars content, positions 4-10 get 1500
  - Sections: intent_match, content_gap, structure_gap, meta_gap, schema_gap, top3_detail, recommendations, key_takeaways
  - Opportunity score 1-10 (10 = highest opportunity to gain positions)
  - Stored as `analysis_type='lacoste_gap'` in the `analyses` table
- `pipeline/lib/keyword-counter.ts` — counts keyword occurrences in text, H1, H2, H3, H4 (per-heading-level breakdown) (injected into LLM context)
- `pipeline/lib/link-counter.ts` — counts internal vs external links in markdown content
- `pipeline/lib/top1-keywords.ts` — extracts frequent keywords from top-1 competitor absent in Lacoste content
- LLM abstraction in `pipeline/lib/llm.ts` — tries Ollama first, falls back to cloud
- All prompts in `pipeline/prompts/` — French, JSON-only output, with strict guardrails (no hallucination on unobservable data)
- Consolidated prompt in `pipeline/prompts/analyze-consolidated.ts` — two modes via `PROMPT_MODE` env var: `ollama` (5-8 bullets per section, for Gemma 4 31B) and `claude` (8-12 bullets, for Claude Opus)
- Legacy prompt files preserved: `analyze-gap.ts` (old split prompts), `analyze-gap-claude.ts` (old Claude deep dive)
- Logs every step to `run_logs` table (consumed by dashboard via Realtime)

### Database (Supabase)
- 6 tables: `keywords`, `runs`, `serp_results` (positions 1-50), `snapshots`, `analyses` (with `opportunity_score` 1-10), `run_logs`
- Legacy tables: `lacoste_pages`, `lacoste_snapshots` (referentiel system — disconnected, code preserved)
- RLS: anon = read-only, service_role = full access
- Realtime enabled on `runs` and `run_logs`

## Commands

```bash
npm run dev          # Start Vite dev server (localhost:5173)
npm run build        # Build dashboard for production
npm test             # Run vitest tests
npx tsx pipeline/run.ts                        # Run full pipeline locally (serp → scrape → classify → analyze)
npx tsx pipeline/claude-full-analysis.ts       # Classify SERP + extract analysis contexts from a run
npx tsx pipeline/insert-consolidated-analyses.ts  # Insert Claude Opus consolidated analyses
npx tsx pipeline/insert-movement-analyses.ts   # Insert movement analyses (cross-run comparison)
npx tsx pipeline/refresh-sitemap.ts            # Refresh Lacoste sitemap reference (lacoste_pages)
```

## Environment Variables

### Frontend (build-time, prefixed `VITE_`)
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key

### Pipeline (runtime)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — DB access (service role for writes)
- `GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX` — Google Custom Search API
- `FIRECRAWL_KEY` — Firecrawl scraping API
- `OLLAMA_URL` — Ollama base URL (no trailing path! e.g. `https://ollama.example.com`)
- `OLLAMA_USER`, `OLLAMA_PASSWORD` — Optional basic auth for Ollama
- `OLLAMA_MODEL` — Model name (default: `gemma4:31b`)
- `LLM_FALLBACK_PROVIDER` — `openai` or `mistral` (stored as GitHub **variable**, not secret)
- `LLM_FALLBACK_API_KEY`, `LLM_FALLBACK_MODEL` — Cloud LLM fallback
- `PROMPT_MODE` — `ollama` (default) or `claude`. Selects simplified vs enriched prompt set
- `OLLAMA_NUM_CTX` — Ollama context window size (default: `32768`)

### GitHub Secrets vs Variables
- **Secrets** (`secrets.*`): all API keys, passwords, URLs containing credentials, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Variables** (`vars.*`): `LLM_FALLBACK_PROVIDER`

### Running pipeline locally
```bash
set -a && source .env.local && set +a && npx tsx pipeline/run.ts
# Or in resume mode:
set -a && source .env.local && set +a && RESUME_RUN_ID=<uuid> npx tsx pipeline/run.ts
```
Note: Google CSE and Firecrawl keys are optional — pipeline skips those steps in resume mode.

## Pipeline Resume

To restart from where it left off (skip SERP + scrape):
```
RESUME_RUN_ID=<uuid> npx tsx pipeline/run.ts
```
Or via GitHub Actions: set the `resume_run_id` input field when triggering manually.

Resume is fully idempotent — the pipeline auto-detects completed steps:
- **Classification**: skipped if `serp_results.actor_name` already populated
- **Gap analysis**: skips keyword/country/device combos that already have a `lacoste_gap` row in `analyses`

## Conventions

- **Language**: Code in English, LLM prompts in French (target audience is French SEO team)
- **Module system**: ESM (`"type": "module"` in package.json). Use `.js` extensions in imports
- **TypeScript**: Strict mode. Pipeline has its own `tsconfig.pipeline.json`
- **Error handling**: Pipeline logs errors to DB and continues (batch-level try/catch). Frontend shows errors via sonner toasts
- **Supabase client**: Frontend uses anon key (`src/lib/supabase.ts`), pipeline uses service role (`pipeline/lib/supabase.ts`)

## LLM JSON Handling

LLM responses (especially from small models like ministral-3:14b) often contain malformed JSON. The pipeline uses:
- `jsonrepair` to fix structural issues (missing commas, unclosed brackets, trailing commas)
- `parseLLMJsonArray<T>()` to extract JSON arrays from LLM responses (strips markdown fences, finds array boundaries, cleans control characters)
- Retry loop (3 attempts, escalating temperature 0.2→0.4) for resilience
- Type coercion via `str()` helper — never trust LLM field types (may return objects instead of strings)
- `lacoste_position` is sourced from SERP data, NOT from LLM output (LLM may return "absent" as string)

## Analysis Content Format

> **V4 consolidated format** — single analysis per keyword merging gap + deep dive. Bullet points (5-8 for gemma, 8-12 for claude mode).

### Consolidated analysis (`lacoste_gap`)
```
### Alignement intention
{bullet-point list — keyword presence in <title>, H1, search intent}

### Couverture sémantique
{bullet-point list — KEYWORD DENSITY metrics per Hn level, links}

### Structure
{bullet-point list — H1/H2-H4 hierarchy, navigation, filters}

### Optimisation meta
{bullet-point list — title exact, meta description, CTR}

### Données structurées
{bullet-point list — Product, BreadcrumbList, AggregateRating}

### Zoom Top 3
{bullet-point list — detailed comparison of top 3 results}

## Recommandations
1. {reco — ordered by impact, quick wins first}

## Points clés
1. {key takeaway with data}
```

### Movement analysis (`position_movement`)
- One per keyword/country combo, comparing current run vs previous run
- Sections: movement description, objective SERP changes, SEO hypotheses
- Fields: `actor`, `movement_type`, `position_before`, `position_after`

The dashboard parses these formats and renders them as collapsible sections with color-coded icons.

### Run naming convention
Format: `dd/MM/yy - X kw - llm_name` (e.g., "17/04/26 - 7 kw - claude opus")
- Runs page strips the LLM suffix for cleaner display
- Analyses page dropdown shows the full label including LLM name

## Known Limitations

- **Pipeline timeout**: GitHub Actions workflow has `timeout-minutes: 120`. Scraping 400+ URLs takes ~1h, so fresh runs need the full 2h. Resume runs skip SERP+scrape and finish in ~55min.
- **Movement analysis** compares SERP positions across runs. First analysis done manually (Claude Opus) for 23/03→17/04 comparison. Pipeline code in `analyze-movement.ts` (auto-detection of previous run)
- **Mobile only**: SERP collection is restricted to mobile device (Google mobile-first indexing). Desktop collection was removed in V3.
- **Gap analysis** processes keywords one at a time (batch_size=1). Context window configurable via `OLLAMA_NUM_CTX` (default: 32768). Gemma 4 31B handles the consolidated prompt well
- **Lacoste absent from top 50**: When Lacoste is not in the top 50, analysis runs without Lacoste comparison (best practices only). The reference system code is preserved but disconnected (`pipeline/lib/lacoste-matcher.ts`, `pipeline/refresh-sitemap.ts`)
- **Structured data summarization**: `summarizeStructuredData()` in `analyze-gap.ts` searches full HTML (not just `<head>`), deduplicates schemas by content, counts occurrences by `@type` (e.g., "Product x3 | BreadcrumbList"), and parses JSON-LD schemas (@type, @graph, aggregateRating, offers, reviews) into a concise string instead of truncating raw JSON
- **LLM JSON reliability**: Gemma 4 31B is more reliable than ministral-3:14b for JSON output. Claude Opus can also generate analyses directly (see `insert-consolidated-analyses.ts`)
- **Prompt logging**: Full prompts (system + user) are logged to `pipeline/_prompt-logs/{runId}/` for debugging (gitignored)

## Dashboard Features

- **Keyword grouping**: Analyses grouped by keyword in collapsible sections
- **Keyword pill filters**: Clickable keyword buttons (brand-colored when active) to filter analyses
- **Position evolution chart**: Recharts line chart per keyword showing position evolution across runs. Y-axis inverted (1 at top), Lacoste highlighted in brand green with thicker line. Component: `src/components/PositionChart.tsx`
- **Run detail with keywords**: RunDetail panel shows keyword tags above pipeline progress. Component: `src/components/RunDetail.tsx`
- **Opportunity score**: Displayed as "Opportunité X/10" badge on keyword headers (10 = highest opportunity)
- **A/B Compare mode**: Select 2 runs to see analyses side-by-side with A/B badges
- **Mobile responsive**: Hamburger sidebar, stacked filters, hidden tags on small screens
- **Structured rendering**: Color-coded collapsible sections (Alignement intention, Couverture sémantique, Structure, Meta, Données structurées, Zoom Top 3)
- **Sources panel**: Collapsible list of analyzed URLs with position badges
- **CitationText**: Auto-links actor names/domains in analysis text to source URLs

## Lacoste Reference System

Code preserved but disconnected from active pipeline:
- `pipeline/refresh-sitemap.ts` — crawls Lacoste sitemaps (XML + Firecrawl fallback), populates `lacoste_pages` (335 pages: 170 FR, 165 US)
- `pipeline/lib/lacoste-matcher.ts` — token-based + LLM keyword→page matching
- Tables: `lacoste_pages`, `lacoste_snapshots` (migration 003)
- To reconnect: import matcher in `analyze-gap.ts` and inject Lacoste page content when absent from SERP
