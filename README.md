# Lacoste SEO Intelligence

Plateforme de veille SEO concurrentielle pour Lacoste. Collecte automatisée des positions Google, scraping des pages concurrentes, classification des acteurs par LLM, et analyse comparative avec recommandations actionnables.

**Dashboard** : https://enzopezlo.github.io/lacoste-seo/

## Architecture

```
Pipeline TypeScript (GitHub Actions)     →  Supabase PostgreSQL  →  Dashboard React (GitHub Pages)
  1. Collecte SERP (Google CSE, 50 résultats)
  2. Scraping pages (Firecrawl → markdown + meta + structured data)
  3. Classification acteurs (LLM → marque, marketplace, média, retailer)
  4. Analyse gap (LLM → prose comparative, recommandations, opportunity score)
  5. Analyse mouvement (LLM → détection et explication des changements de positions)
```

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Dashboard | React 19, Vite, Tailwind CSS v4, TypeScript |
| Base de données | Supabase (PostgreSQL + Realtime + RLS) |
| Pipeline | Node.js / TypeScript (GitHub Actions, cron mensuel) |
| LLM primaire | Ollama — Ministral 3 14B (auto-hébergé) |
| LLM fallback | OpenAI / Mistral (cloud) |
| Scraping | Firecrawl API |
| SERP | Google Custom Search API (50 résultats / requête) |
| Hébergement | GitHub Pages (dashboard), GitHub Actions (pipeline) |

## Fonctionnalités

### Pipeline de données
- **Collecte SERP** : 50 résultats Google (5 pages) par mot-clé × pays × device
- **Scraping intelligent** : extraction markdown, balises meta, données structurées JSON-LD
- **Classification LLM** : identification automatique des acteurs (marque, marketplace, média, retailer) et types de pages
- **Analyse gap bi-niveau** :
  - Analyse globale (top 20) : alignement intention, couverture sémantique, structure, meta, données structurées + recommandations
  - Deep dive (top 3) : analyse comparative approfondie des meilleures pages avec points clés
- **Keyword density** : comptage automatique des occurrences du mot-clé (texte, Hn, H1) injecté dans le contexte LLM
- **Opportunity score** : score 1-10 estimant la facilité pour Lacoste de gagner des positions
- **Résumé structured data** : détection de tous les schemas JSON-LD (Product, BreadcrumbList, AggregateRating, etc.)

### Dashboard
- **Runs** : suivi temps réel de l'exécution du pipeline (Supabase Realtime)
- **SERP Explorer** : navigation et filtrage des résultats Google collectés
- **Analyses** : visualisation des analyses LLM, groupées par mot-clé, avec sections collapsibles colorées
- **Comparaison A/B** : sélection de 2 runs pour comparer les analyses côte à côte (ex: ministral vs Claude)
- **Keywords** : gestion des mots-clés suivis (ajout, activation, suppression)
- **Mobile-friendly** : sidebar hamburger, filtres adaptés, layout responsive

### Référentiel Lacoste
- **Sitemap** : 335 pages Lacoste indexées (170 FR, 165 US) via crawl sitemap/Firecrawl
- **Matching** : système de correspondance mot-clé → page Lacoste (token-based + LLM fallback)
- Statut : code préservé, déconnecté du pipeline principal

## Mots-clés actifs (7)

| Mot-clé | Catégorie | Pays |
|---------|-----------|------|
| lacoste polo | Polos | FR, US |
| polo homme | Polos | FR |
| mens polo shirt | Polos | US |
| sacoche lacoste | Maroquinerie | FR |
| sacoche homme | Maroquinerie | FR |
| sneakers homme | Chaussures | FR |
| mens designer jacket | Vestes | US |

42 mots-clés supplémentaires prévus une fois le pipeline stabilisé.

## Runs disponibles

| Run | LLM | Analyses | Description |
|-----|-----|----------|-------------|
| Original (23/03) | Claude (manuel) | 10 | Analyses V1 de référence, haute qualité rédactionnelle |
| V2 ministral (26/03) | Ministral 14B | 8/20 | Pipeline V2 complet, taux de succès ~40% (JSON complexe) |
| V2 Claude (30/03) | Claude (script) | 20/20 | Prose comparative riche, données chiffrées intégrées |

## Développement local

```bash
# Dashboard
npm install
npm run dev           # localhost:5173

# Pipeline (nécessite .env.local avec les clés API)
set -a && source .env.local && set +a
npx tsx pipeline/run.ts                           # Run complet
RESUME_RUN_ID=<uuid> npx tsx pipeline/run.ts      # Reprendre (skip SERP + scrape)
npx tsx pipeline/generate-claude-analyses.ts      # Générer analyses Claude
npx tsx pipeline/refresh-sitemap.ts               # Rafraîchir le sitemap Lacoste
```

## Sécurité

- **Dashboard** : lecture seule (clé anon Supabase + RLS)
- **Pipeline** : écriture via service role key (GitHub Secrets)
- **LLM** : authentification basic auth pour Ollama
- **RLS** : activé sur toutes les tables

## Roadmap

- [ ] Edge Functions Supabase (trigger-run, manage-keywords)
- [ ] Activation des 42 keywords
- [ ] Movement analysis (code prêt, nécessite 2+ runs)
- [ ] Adaptation des prompts pour ministral (format markdown au lieu de JSON)
- [ ] Locales supplémentaires (GB, DE, ES, IT)
- [ ] Visualisations tendances (charts de positions dans le temps)

---

Développé par [Digilityx](https://digilityx.com) pour Lacoste.
