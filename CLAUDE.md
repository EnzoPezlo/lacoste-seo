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
- LLM abstraction in `pipeline/lib/llm.ts` — tries Ollama first, falls back to cloud
- All prompts in `pipeline/prompts/` — French, JSON-only output
- Logs every step to `run_logs` table (consumed by dashboard via Realtime)

### Database (Supabase)
- 6 tables: `keywords`, `runs`, `serp_results`, `snapshots`, `analyses`, `run_logs`
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
- **Secrets** (`secrets.*`): all API keys, passwords, URLs containing credentials
- **Variables** (`vars.*`): `LLM_FALLBACK_PROVIDER`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Pipeline Resume

To restart from where it left off (skip SERP + scrape):
```
RESUME_RUN_ID=<uuid> npx tsx pipeline/run.ts
```
Or via GitHub Actions: set the `resume_run_id` input field when triggering manually.

Resume is fully idempotent — the pipeline auto-detects completed steps:
- **Classification**: skipped if `serp_results.actor_name` already populated
- **Gap analysis**: skips keyword/country/device combos that already have an `analyses` row

## Conventions

- **Language**: Code in English, LLM prompts in French (target audience is French SEO team)
- **Module system**: ESM (`"type": "module"` in package.json). Use `.js` extensions in imports
- **TypeScript**: Strict mode. Pipeline has its own `tsconfig.pipeline.json`
- **Error handling**: Pipeline logs errors to DB and continues (batch-level try/catch). Frontend shows errors via sonner toasts
- **Supabase client**: Frontend uses anon key (`src/lib/supabase.ts`), pipeline uses service role (`pipeline/lib/supabase.ts`)

## LLM JSON Handling

LLM responses (especially from small models like ministral-3:14b) often contain malformed JSON. The pipeline uses `jsonrepair` to fix common issues: missing commas, unclosed brackets, control characters in strings, trailing commas.

## Known Limitations

- **Movement analysis** is disabled — requires multi-run history (code exists in `analyze-movement.ts`, commented out in `run.ts`)
- **Device filtering** in SERP collection is not supported by Google CSE — desktop/mobile store identical results
- **Edge Functions** (`trigger-run`, `manage-keywords`) are defined but not yet deployed to Supabase
- **Gap analysis** processes keywords one at a time (batch_size=1) due to LLM context constraints with ministral-3:14b
- **Classification quality** with ministral-3:14b is ~85% on actor_category — inconsistencies between desktop/mobile for same URL, some boutiques misclassified as brands
