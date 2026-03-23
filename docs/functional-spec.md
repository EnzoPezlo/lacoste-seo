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
│  ┌──────────┐  ┌────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ 1. SERP  │→│2.Scrape│→│3.Classify│→│4. Gap Analysis│  │
│  │ Collect  │  │ Pages  │  │ Actors   │  │  (LLM)       │  │
│  └──────────┘  └────────┘  └──────────┘  └──────────────┘  │
│                                                             │
│  All steps log to run_logs (realtime → dashboard)           │
└──────────────────────────┬──────────────────────────────────┘
                           │ writes to
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Supabase (PostgreSQL)                      │
│  keywords | runs | serp_results | snapshots | analyses      │
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
1. Call Google Custom Search API twice:
   - Query 1: positions 1-10 (`start=1`)
   - Query 2: positions 11-20 (`start=11`)
2. For each result, extract:
   - `position` (1-20)
   - `url`, `domain`, `title`, `snippet`
   - `is_lacoste` — true if domain contains "lacoste"
3. Insert into `serp_results` with `serp_status: 'ok'`

**API details**:
- Endpoint: `https://www.googleapis.com/customsearch/v1`
- Parameters: `q` (keyword), `gl` (country code), `num=10`, `start` (1 or 11)
- Rate limit: 100 queries/day on free tier

**Output**: ~20 rows per keyword × country × device in `serp_results` table.

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

**Purpose**: Explain why Lacoste doesn't rank #1 and recommend improvements.

**Input**: Keyword × country × device combinations where Lacoste is NOT position 1.

**Filtering**:
- Skip combinations where Lacoste is already #1 (no gap to analyze)
- Skip combinations where Lacoste is absent from Top 20 (position = 'absent')

**Process**:
For each qualifying combination:
1. Collect page content:
   - Top 10 results + Lacoste (if present beyond Top 10)
   - For each: `head_html` (truncated to 300 chars), `structured_data` (300 chars), `markdown_content` (1500 chars)
2. Build prompt with aggregated content
3. Call LLM with gap analysis prompt (French)
4. LLM returns structured analysis:

```json
[
  {
    "keyword": "polo homme",
    "country": "FR",
    "device": "desktop",
    "search_intent": "transactional",
    "lacoste_position": 4,
    "diagnostic": "## Alignement d'intention\nLes 3 premiers résultats sont des pages catégorie...\n\n## Couverture sémantique\nLacoste manque de contenu éditorial...",
    "recommendations": "1. Enrichir la page catégorie avec du contenu éditorial\n2. Ajouter un FAQ structuré...",
    "tags": ["content_depth", "structure_hn", "faq_missing"]
  }
]
```

5. Insert into `analyses` table with `analysis_type: 'lacoste_gap'`

**Analysis dimensions** (on-site only, no backlinks/authority):
- **Intent alignment**: Does Lacoste's page type match the search intent?
- **Semantic coverage**: Does content cover the topic as thoroughly as competitors?
- **HTML structure**: Heading hierarchy (H1-H6), content organization
- **Meta tags**: Title, description, canonical URL optimization
- **Structured data**: JSON-LD presence and completeness vs competitors
- **Editorial UX**: Tables, comparison features, guides, FAQ sections

**Available tags**:
`content_depth`, `structure_hn`, `meta_title`, `meta_description`, `structured_data`, `faq_missing`, `internal_linking`, `page_speed`, `editorial_content`, `product_schema`, `breadcrumb`, `image_optimization`

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

**Purpose**: Read LLM-generated SEO analyses.

**Features**:
- **Filters**: Run selector, analysis type (gap/movement) with live counts
- **Analysis cards**: Keyword, country, device, Lacoste position, tags, expandable content
- **Content format**: Markdown with headings (diagnostic + recommendations)
- **Visual coding**: Green left border for gaps, amber for movements

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

runs (1) ←──── (N) analyses
runs (1) ←──── (N) run_logs
keywords (1) ←──── (N) analyses
```

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
| SERP Collection | ~2-5 min | Depends on keyword count × countries |
| Page Scraping | ~5-15 min | ~2-3s per URL, parallelized |
| Classification | ~2-5 min | One LLM call per keyword group |
| Gap Analysis | ~10-30 min | ~3 min per keyword (batch_size=1) |
| **Total** | **~20-55 min** | Within 60 min GitHub Actions timeout |

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

## 10. Future Roadmap

1. **Movement analysis activation** — Once 2+ completed runs exist, enable `analyze-movement.ts` to track ranking changes over time
2. **Edge Functions deployment** — Deploy `trigger-run` and `manage-keywords` to Supabase so dashboard buttons work end-to-end
3. **Full keyword activation** — Expand from 7 to 42+ keywords once pipeline is stable
4. **Better LLM model** — Upgrade from ministral-3:14b to a more capable model for gap analysis accuracy
5. **Recharts dashboards** — Add trend charts and competitive position visualizations
6. **Backlink data integration** — Add off-site SEO factors (currently on-site only)
