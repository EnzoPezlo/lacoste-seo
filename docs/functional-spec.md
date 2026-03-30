# Lacoste SEO Intelligence — Functional Specification

## 1. Purpose

Monitor Lacoste's organic search positioning against competitors across strategic keywords. Detect gaps, classify the competitive landscape, and generate actionable SEO recommendations — automatically, on a monthly cadence.

**Target users**: SEO team at Digilityx (agency managing Lacoste's digital presence).

---

## 2. System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions (cron)                     │
│                  1st of month, 06:00 UTC                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ triggers
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Pipeline (Node.js)                       │
│                                                             │
│  ┌────────┐ ┌───────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐│
│  │1. SERP │→│2.Scrap│→│3.Classif│→│4. Gap    │→│5. Move-  ││
│  │Collect │ │ Pages │ │ Actors  │ │ Analysis │ │ ment (*) ││
│  │(50 res)│ │       │ │  (LLM)  │ │Global+DD │ │          ││
│  └────────┘ └───────┘ └─────────┘ └──────────┘ └──────────┘│
│                                                             │
│  All steps log to run_logs (realtime → dashboard)           │
└──────────────────────────┬──────────────────────────────────┘
                           │ writes to
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Supabase (PostgreSQL)                      │
│  keywords | runs | serp_results | snapshots | analyses      │
│  lacoste_pages | lacoste_snapshots (référentiel)            │
└──────────────────────────┬──────────────────────────────────┘
                           │ reads from
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              React Dashboard (GitHub Pages)                  │
│  Runs | SERP Explorer | Analyses | Keyword Management       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Pipeline Workflow — Step by Step

### 3.1 Run Initialization

**Trigger**: GitHub Actions schedule (monthly) or manual dispatch.

**Process**:
1. Create a `runs` row with status `pending` and label `YYYY-MM-DD_type_HHhMM`
2. If `RESUME_RUN_ID` is set, skip steps 1-2 and jump to classification

**Output**: `run_id` (UUID) used as foreign key for all subsequent data.

---

### 3.2 Step 1 — SERP Collection (`collect-serp.ts`)

**Purpose**: Capture the current Google SERP landscape for tracked keywords.

**Input**:
- Active keywords from `keywords` table (each with category + target countries)

**Process**:
For each keyword × country × device (desktop, mobile):
1. Call Google Custom Search API five times (5 pages of 10 results):
   - Query 1: positions 1-10 (`start=1`)
   - Query 2: positions 11-20 (`start=11`)
   - Query 3: positions 21-30 (`start=21`)
   - Query 4: positions 31-40 (`start=31`)
   - Query 5: positions 41-50 (`start=41`)
2. For each result, extract:
   - `position` (1-50)
   - `url`, `domain`, `title`, `snippet`
   - `is_lacoste` — true if domain contains "lacoste"
3. Insert into `serp_results` with `serp_status: 'ok'`

**API details**:
- Endpoint: `https://www.googleapis.com/customsearch/v1`
- Parameters: `q` (keyword), `gl` (country code), `num=10`, `start` (1, 11, 21, 31, 41)
- Rate limit: 100 queries/day on free tier

**Output**: ~50 rows per keyword × country × device in `serp_results` table.

**Status update**: `runs.status → 'serp_done'`

---

### 3.3 Step 2 — Page Scraping (`scrape.ts`)

**Purpose**: Extract page content for LLM analysis.

**Input**: Unique URLs from `serp_results` where `scrap_status = 'pending'`.

**Process**:
For each unique URL:
1. **Markdown extraction** — Firecrawl `/scrape` with `formats: ['markdown']`
   - Returns clean text content (no boilerplate)
2. **HTML extraction** — Firecrawl `/scrape` with `formats: ['html']`
   - Extract `<head>` section (meta tags, title, canonical)
   - Parse JSON-LD structured data from `<script type="application/ld+json">`
3. Insert into `snapshots` table:
   - `markdown_content`: full markdown text
   - `head_html`: raw `<head>` HTML
   - `structured_data`: parsed JSON-LD object
4. Update all matching `serp_results` rows: `scrap_status → 'ok'`

**Deduplication**: Same URL appearing for multiple keywords is scraped once.

**Error handling**: Failed URLs get `scrap_status: 'error'`; pipeline continues.

**Output**: One `snapshots` row per unique URL.

**Status update**: `runs.status → 'scrap_done'`

---

### 3.4 Step 3 — Actor Classification (`classify.ts`)

**Purpose**: Identify who ranks and what type of page they use.

**Input**: `serp_results` grouped by keyword × country × device.

**Process**:
For each group:
1. Build prompt with all 20 SERP results (position, URL, domain, title, snippet)
2. Call LLM with classification prompt (French, JSON-only output)
3. LLM returns structured classification for each position:

```json
[
  {
    "position": 1,
    "actor": "Amazon France",
    "actor_category": "marketplace",
    "page_type": "listing"
  },
  {
    "position": 2,
    "actor": "Lacoste",
    "actor_category": "brand",
    "page_type": "category"
  }
]
```

4. Update each `serp_results` row with: `actor_name`, `actor_category`, `page_type`

**Classification taxonomy**:

| Field | Values | Description |
|-------|--------|-------------|
| `actor_category` | `brand` | Official brand website (e.g., lacoste.com, nike.com) |
| | `marketplace` | Multi-vendor platform (e.g., Amazon, Zalando) |
| | `media` | Editorial/magazine (e.g., GQ, Vogue) |
| | `retailer` | Single-brand retailer (e.g., Galeries Lafayette) |
| | `other` | Anything else |
| `page_type` | `product` | Single product page (PDP) |
| | `category` | Category/collection page |
| | `listing` | Search results or multi-product listing |
| | `editorial` | Article, blog post, review |
| | `guide` | Buying guide, how-to, comparison |
| | `other` | Anything else |

**LLM model**: Ollama (ministral-3:14b) with cloud fallback (OpenAI/Mistral).

---

### 3.5 Step 4 — Gap Analysis (`analyze-gap.ts`)

**Purpose**: Explain why Lacoste doesn't rank #1 and recommend improvements. Analyse bi-niveau : globale (top 20) + deep dive (top 3).

**Input**: Keyword × country × device combinations where Lacoste is NOT position 1.

**Filtering**:
- Skip combinations where Lacoste is already #1 (no gap to analyze)
- Skip already-analyzed combinations (idempotent)

**Process — Analyse globale** (`analysis_type: 'lacoste_gap'`) :
For each qualifying combination:
1. Collect page content:
   - Top 10 results + Lacoste (if present in top 50)
   - For each: `head_html` (300 chars), `structured_data` (résumé des schemas JSON-LD), `markdown_content` (1500 chars)
   - **Keyword density** : comptage automatique des occurrences du mot-clé (total, Hn, H1) via `keyword-counter.ts`
2. Build prompt with aggregated content (system prompt + user prompt with few-shot examples)
3. Call LLM with gap analysis prompt (French, JSON output, **paragraphes rédigés de 4-8 phrases**)
4. LLM returns structured analysis:

```json
[
  {
    "keyword": "polo homme",
    "country": "FR",
    "device": "desktop",
    "search_intent": "transactional",
    "lacoste_position": 4,
    "intent_match": "Les trois premiers résultats intègrent le mot-clé exact...",
    "content_gap": "L'analyse de la densité du mot-clé révèle un écart notable...",
    "structure_gap": "Les pages concurrentes du Top 3 adoptent une structure...",
    "meta_gap": "Le title de **Zalando** place le mot-clé exact en première position...",
    "schema_gap": "**Zalando** implémente un schema Product complet...",
    "recommendations": ["Action 1", "Action 2", "Action 3", "Action 4"],
    "tags": ["meta_title", "content_depth", "structured_data"],
    "opportunity_score": 7
  }
]
```

5. Insert into `analyses` table with `analysis_type: 'lacoste_gap'`

**Process — Deep dive top 3** (`analysis_type: 'top3_deep_dive'`) :
1. Top 3 results + Lacoste (if present) with more content per page (3000 chars)
2. Analyse comparative approfondie des meilleures pages
3. Si Lacoste absente du top 50 : analyse des best practices uniquement, sans comparaison Lacoste
4. Sections : Analyse des titles, Profondeur de contenu, Structure, Données structurées, Optimisation meta + Points clés

**Structured data detection** :
- `summarizeStructuredData()` parse tous les schemas JSON-LD (Product, BreadcrumbList, AggregateRating, Organization, etc.)
- Résumé lisible au lieu de JSON tronqué, pour ne pas manquer les schemas multiples

**Analysis dimensions** (on-site only, no backlinks/authority):
- **Intent alignment**: Correspondance mot-clé exact dans le `<title>` et H1
- **Semantic coverage**: Keyword density comparative (occurrences texte, Hn, H1)
- **HTML structure**: Hiérarchie Hn, sous-catégories, navigation facettée
- **Meta tags**: Title, description, longueur, CTA, placement du mot-clé
- **Structured data**: Présence et type de schemas JSON-LD vs concurrents

**Opportunity score** (1-10) : estime la facilité pour Lacoste de gagner des positions, basé sur les faiblesses des concurrents, la simplicité des actions, et l'écart de position.

**Available tags**:
`structure_hn`, `content_depth`, `content_coverage`, `meta_title`, `meta_description`, `structured_data`, `faq`, `search_intent_mismatch`, `page_type_mismatch`, `editorial_ux`

**Status update**: `runs.status → 'analysis_done'`

---

### 3.6 Step 5 — Movement Analysis (`analyze-movement.ts`) — DISABLED

**Purpose**: Detect and explain significant ranking changes between runs.

**Current status**: Disabled in `run.ts` — requires at least 2 completed runs to compare.

**When enabled, will**:
1. Find the previous completed run
2. Compare SERP positions: detect new entrants in Top 20 and gains > 2 positions
3. Fetch before/after page snapshots
4. Call LLM to identify concrete content changes that may explain the movement
5. Store in `analyses` with `analysis_type: 'position_movement'`

---

### 3.7 Run Completion

After all steps succeed:
- `runs.status → 'completed'`
- `runs.finished_at` set to current timestamp

On failure:
- Error logged to `run_logs`
- `runs.finished_at` set (but status stays at last successful step)
- Process exits with code 1

---

## 4. Dashboard — Page by Page

### 4.1 Runs Page (`/`)

**Purpose**: Monitor pipeline execution and trigger new runs.

**Features**:
- **KPI cards**: Total runs, Completed, In progress
- **Run list**: Sorted newest-first. Each shows label, UUID (copyable), status badge, duration
- **Status progression**: pending → serp_done → scrap_done → analysis_done → completed
- **Run detail panel**: Vertical timeline of pipeline steps with expandable logs
- **Real-time updates**: Supabase Realtime on `runs` and `run_logs` tables
- **Trigger button**: Launches new pipeline run via Edge Function (not yet deployed)

### 4.2 SERP Explorer (`/serp`)

**Purpose**: Browse and filter SERP data collected by the pipeline.

**Features**:
- **Filters**: Run selector, country, device (segmented toggle), keyword search
- **KPI cards**: Total results, Lacoste present count, Average Lacoste position, Top 3 count
- **Results table**: Position (color-coded), keyword, actor, domain, category, page type, country flag
- **Lacoste highlight**: Rows where `is_lacoste=true` have green background

### 4.3 Analyses Page (`/analyses`)

**Purpose**: Read and compare LLM-generated SEO analyses.

**Features**:
- **Regroupement par mot-clé** : analyses organisées par keyword avec sections collapsibles
- **Filtres** : Run, type d'analyse (gap/deep dive/movement) avec compteurs, mot-clé, device
- **Comparaison A/B** : toggle "Compare" pour sélectionner 2 runs et voir les analyses côte à côte, avec badges colorés A (bleu) / B (violet)
- **Sections structurées** : chaque analyse est découpée en sections collapsibles color-coded (Alignement intention, Couverture sémantique, Structure, Meta, Données structurées)
- **Sources** : section collapsible avec les URLs analysées et leur position SERP
- **Opportunity score** : badge coloré (vert ≥7, amber ≥4, rouge <4)
- **Visual coding** : bordure verte pour gaps, violette pour deep dives, amber pour movements
- **Mobile responsive** : filtres empilés, tags cachés sur petit écran, padding adaptatif

### 4.4 Keywords Page (`/keywords`)

**Purpose**: Manage the keyword universe tracked by the pipeline.

**Features**:
- **Add form**: Keyword, category, countries (comma-separated ISO codes)
- **Search filter**: Filters by keyword text and category
- **KPI cards**: Total keywords, Active count, Category count
- **Table**: Keyword, category, country flags, active toggle, delete button
- **Two-click delete**: First click shows confirmation, second click deletes

---

## 5. Data Model

### Entity Relationship

```
keywords (1) ←──── (N) serp_results (N) ────→ (1) runs
                         │
                         │ url match
                         ▼
                    snapshots (1 per URL per run)

runs (1) ←──── (N) analyses (with sources JSONB, opportunity_score 1-10)
runs (1) ←──── (N) run_logs
keywords (1) ←──── (N) analyses

lacoste_pages ←── lacoste_snapshots   (référentiel Lacoste, déconnecté)
```

### Tables principales

| Table | Colonnes clés | Notes |
|-------|--------------|-------|
| `keywords` | keyword, category, countries[], active | 7 actifs, 42 prévus |
| `runs` | run_label, type, status, started_at, finished_at | Statuts : pending → serp_done → scrap_done → analysis_done → completed |
| `serp_results` | position (1-50), url, domain, is_lacoste, actor_name, actor_category, page_type | 50 résultats par keyword × pays × device |
| `snapshots` | url, markdown_content, head_html, structured_data (JSONB) | 1 par URL par run |
| `analyses` | analysis_type, content (markdown), tags[], sources (JSONB), opportunity_score (1-10), lacoste_position | Types : lacoste_gap, top3_deep_dive, position_movement |
| `run_logs` | step, status, message, metadata | Realtime pour le dashboard |
| `lacoste_pages` | url, locale, path, page_type, is_new | 335 pages (170 FR, 165 US) — référentiel déconnecté |
| `lacoste_snapshots` | url, markdown_content, head_html, structured_data | Snapshots des pages Lacoste — déconnecté |

### Key Relationships

| From | To | Cardinality | Join |
|------|----|-------------|------|
| `keywords` | `serp_results` | 1:N | `keyword_id` |
| `runs` | `serp_results` | 1:N | `run_id` |
| `runs` | `snapshots` | 1:N | `run_id` |
| `runs` | `analyses` | 1:N | `run_id` |
| `runs` | `run_logs` | 1:N | `run_id` |
| `keywords` | `analyses` | 1:N | `keyword_id` |
| `serp_results` | `snapshots` | N:1 | `url` + `run_id` |

---

## 6. External Services

| Service | Purpose | Auth | Rate Limits |
|---------|---------|------|-------------|
| **Google Custom Search** | SERP data collection | API key + CX ID | 100 queries/day (free) |
| **Firecrawl** | Page scraping to markdown | API key | Depends on plan |
| **Ollama** | LLM inference (primary) | Basic auth (optional) | Self-hosted, no limit |
| **OpenAI / Mistral** | LLM inference (fallback) | Bearer token | Per-plan limits |
| **Supabase** | Database + Edge Functions + Realtime | Anon key (read) / Service key (write) | Per-plan limits |
| **GitHub Actions** | Pipeline orchestration + dashboard deploy | Built-in | 2000 min/month (free) |

---

## 7. Security Model

| Layer | Access | Key Type |
|-------|--------|----------|
| Dashboard (browser) | Read-only all tables | Supabase anon key |
| Edge Functions | Read + write (CRUD) | Supabase service role key |
| Pipeline (GitHub Actions) | Read + write (full) | Supabase service role key |
| Ollama | LLM inference | Basic auth (user:password) |

**RLS policies**: All tables have Row-Level Security enabled. Anon role has SELECT-only policies. Service role bypasses RLS.

---

## 8. Scheduling & Execution

### Automatic (monthly)
- **When**: 1st of each month at 06:00 UTC
- **Trigger**: GitHub Actions cron schedule
- **Type**: `auto`

### Manual
- **When**: On-demand via GitHub Actions `workflow_dispatch`
- **Options**:
  - `run_type`: manual or auto
  - `resume_run_id`: Skip SERP + scrape, restart from classify

### Execution Timeline (typical)
| Step | Duration | Notes |
|------|----------|-------|
| SERP Collection | ~5-10 min | 5 pages × keyword count × countries |
| Page Scraping | ~30-60 min | ~2-3s per URL, ~400 URLs pour 7 keywords |
| Classification | ~2-5 min | One LLM call per keyword group |
| Gap Analysis (global) | ~15-30 min | ~3 min per keyword (batch_size=1) |
| Deep Dive (top 3) | ~10-20 min | ~2 min per keyword |
| **Total** | **~60-120 min** | GitHub Actions timeout: 120 min |

**Resume mode** : `RESUME_RUN_ID=<uuid>` skip SERP + scrape → ~30-55 min.

---

## 9. Keyword Configuration

Keywords are stored in the `keywords` table with:
- `keyword`: The search query (e.g., "polo homme", "mens polo shirt")
- `category`: Grouping for batch analysis (e.g., "Polos", "Chaussures")
- `countries`: Array of ISO country codes (e.g., `["FR", "US"]`)
- `active`: Boolean toggle — inactive keywords are skipped by the pipeline

**Current active keywords** (as of March 2025):
| Keyword | Category | Countries |
|---------|----------|-----------|
| lacoste polo | Polos | FR, US |
| polo homme | Polos | FR |
| mens polo shirt | Polos | US |
| sacoche lacoste | Maroquinerie | FR |
| sacoche homme | Maroquinerie | FR |
| sneakers homme | Chaussures | FR |
| mens designer jacket | Vestes | US |

---

## 10. Roadmap

### Fait (v2 — mars 2026)
- [x] SERP élargi à 50 résultats (5 pages CSE)
- [x] Analyse bi-niveau (globale top 20 + deep dive top 3)
- [x] Keyword density injectée dans le contexte LLM
- [x] Opportunity score (1-10)
- [x] Sources JSONB avec liens cliquables dans le dashboard
- [x] Prompts rédactionnels (prose comparative 4-8 phrases au lieu de data dumps)
- [x] Résumé structured data (détection schemas multiples)
- [x] Dashboard : regroupement par mot-clé, comparaison A/B, mobile responsive
- [x] Script de génération d'analyses Claude (`generate-claude-analyses.ts`)
- [x] Référentiel Lacoste : 335 pages indexées (170 FR, 165 US)

### Prochaines étapes
1. **Edge Functions deployment** — Deploy `trigger-run` and `manage-keywords` to Supabase so dashboard buttons work end-to-end
2. **Full keyword activation** — Expand from 7 to 42+ keywords once pipeline is stable
3. **Movement analysis activation** — Once 2+ completed runs exist, enable `analyze-movement.ts` to track ranking changes over time
4. **Adapter prompts pour ministral** — Format markdown au lieu de JSON pour les petits modèles (taux de succès JSON : ~40%)
5. **Locales supplémentaires** — Ajouter GB, DE, ES, IT au sitemap et aux keywords
6. **Visualisations tendances** — Charts de positions dans le temps (Recharts)
7. **Backlink data integration** — Add off-site SEO factors (currently on-site only)
