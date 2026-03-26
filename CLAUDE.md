# Lacoste SEO Intelligence — Developer Guide

## Project Overview

Competitive SEO intelligence platform for Lacoste. Collects SERP data, scrapes competitor pages, classifies actors via LLM, and generates gap analyses — all surfaced through a real-time dashboard.

**Stack**: React 19 + Vite + Tailwind v4 | Supabase (Postgres + Edge Functions + Realtime) | GitHub Actions | Ollama/OpenAI LLM

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
- **SERP collection** fetches 50 results (5 pages of 10). Analysis runs on top 20, deep dive on top 3
- **Two-level analysis** in `analyze-gap.ts`:
  - **Global analysis** (`lacoste_gap`): top 20 overview with opportunity score
  - **Deep dive** (`top3_deep_dive`): detailed top 3 analysis. Compares with Lacoste only if present in top 50
- `pipeline/lib/keyword-counter.ts` — counts keyword occurrences in text, headings, H1 (injected into LLM context)
- LLM abstraction in `pipeline/lib/llm.ts` — tries Ollama first, falls back to cloud
- All prompts in `pipeline/prompts/` — French, JSON-only output, with strict guardrails (no hallucination on unobservable data)
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
npx tsx pipeline/run.ts   # Run full pipeline locally
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
- `OLLAMA_MODEL` — Model name (default: `ministral-3:14b`)
- `LLM_FALLBACK_PROVIDER` — `openai` or `mistral` (stored as GitHub **variable**, not secret)
- `LLM_FALLBACK_API_KEY`, `LLM_FALLBACK_MODEL` — Cloud LLM fallback

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
- **Gap analysis**: skips keyword/country/device combos that already have an `analyses` row (both `lacoste_gap` and `top3_deep_dive`)

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

## Analysis Content Formats

### Global analysis (`lacoste_gap`)
```
### Alignement intention
{text — must mention keyword presence in <title>}

### Couverture sémantique
{text — must reference KEYWORD DENSITY metrics}

### Structure
{text}

### Optimisation meta
{text}

### Données structurées
{text}

## Recommandations
1. {reco}
2. {reco}
```

### Deep dive (`top3_deep_dive`)
```
### Analyse des titles
{text — exact titles cited}

### Profondeur de contenu
{text — keyword counts, word counts}

### Structure
{text}

### Données structurées
{text}

### Optimisation meta
{text}

## Points clés
1. {takeaway}
2. {takeaway}
```

The dashboard parses these formats and renders them as collapsible sections with color-coded icons. Deep dive cards have a violet left border.

## Known Limitations

- **Movement analysis** is disabled — requires multi-run history (code exists in `analyze-movement.ts`, commented out in `run.ts`)
- **Device filtering** in SERP collection is not supported by Google CSE — desktop/mobile store identical results
- **Gap analysis** processes keywords one at a time (batch_size=1) due to LLM context constraints with ministral-3:14b
- **Classification quality** with ministral-3:14b is ~85% on actor_category — inconsistencies between desktop/mobile for same URL, some boutiques misclassified as brands
- **Lacoste absent from top 50**: When Lacoste is not in the top 50 Google results, the deep dive analysis runs without Lacoste comparison (best practices only). The Lacoste reference system code is preserved but disconnected (in `pipeline/lib/lacoste-matcher.ts`, `pipeline/refresh-sitemap.ts`)
