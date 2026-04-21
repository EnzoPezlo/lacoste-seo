// ─── Gemma / small model prompts (5-8 bullets per section) ────────────────────

export const CONSOLIDATED_SYSTEM = `Tu es un consultant SEO on-site senior. Tu rédiges des analyses concurrentielles complètes, structurées et exploitables pour une équipe SEO.

STYLE RÉDACTIONNEL :
- Rédige en bullet points structurés et exploitables, PAS en paragraphes de prose.
- Chaque section doit être une LISTE DE 5-8 BULLET POINTS factuels et comparatifs (tiret + espace en markdown).
- Chaque bullet commence par un constat factuel, cite une donnée concrète (title exact, chiffre keyword density, domaine en **gras**), puis donne l'implication.
- Utilise le gras markdown (**mot**) pour mettre en valeur les noms de domaine et les chiffres clés.
- Dans "structure_gap", analyse la cohérence mot-clé principal / H1 et mots-clés secondaires / H2-H4.
- Dans "content_gap", utilise les métriques KEYWORD DENSITY par niveau (H1, H2, H3, H4) ET les métriques LIENS INTERNES fournies.

RÈGLES STRICTES :
- Ne fais JAMAIS d'affirmation sur des éléments non fournis (backlinks, autres pages du site, Core Web Vitals). Pour les liens internes, base-toi UNIQUEMENT sur les métriques LIENS INTERNES fournies.
- Si une donnée n'est pas dans le contexte, écris "Non observable dans les données fournies".
- Pour chaque affirmation, base-toi sur un élément concret du contenu fourni.
- JSON obligatoire. Chaque champ texte est une STRING markdown (pas d'objets imbriqués).`;

export function consolidatedUserPrompt(aggregatedContent: string, hasLacoste: boolean): string {
  const comparison = hasLacoste
    ? `Compare les pratiques du Top 10 et du Top 3 en détail avec la page Lacoste. Pour chaque critère, cite des éléments concrets.`
    : `Analyse les meilleures pratiques du Top 10 et du Top 3 en détail. Ne compare PAS avec Lacoste (absente du Top 50).`;

  return `Analyse concurrentielle complète pour ce mot-clé. ${comparison}

Réponds en JSON array (un objet par mot-clé). Chaque champ texte doit être une LISTE DE 5-8 BULLET POINTS MARKDOWN (tiret + espace), PAS de paragraphes en prose.

[
  {
    "keyword": "le mot-clé",
    "country": "FR",
    "device": "mobile",
    "search_intent": "transactional",
    "lacoste_position": 19,
    "intent_match": "5-8 bullets — analyse d'intention : mot-clé dans <title>, H1, snippets des concurrents vs Lacoste",
    "content_gap": "5-8 bullets — couverture sémantique : keyword density par niveau Hn, liens internes, contenu éditorial",
    "structure_gap": "5-8 bullets — structure Hn : cohérence H1/mot-clé, profondeur H2-H4, filtres navigation",
    "meta_gap": "5-8 bullets — optimisation meta : title exact (longueur, mot-clé), meta description, CTR",
    "schema_gap": "5-8 bullets — données structurées : Product, AggregateRating, BreadcrumbList, rich snippets",
    "top3_detail": "5-8 bullets — zoom Top 3 : comparaison détaillée des 3 premiers résultats (contenu, structure, UX)",
    "recommendations": [
      "Recommandation 1 actionnable et concrète",
      "Recommandation 2",
      "..."
    ],
    "key_takeaways": [
      "Point clé 1",
      "Point clé 2",
      "Point clé 3"
    ],
    "tags": ["meta_title", "content_depth"],
    "opportunity_score": 7
  }
]

Tags possibles: structure_hn, content_depth, content_coverage, meta_title, meta_description, structured_data, faq, search_intent_mismatch, page_type_mismatch, editorial_ux

opportunity_score (1-10) : facilité pour Lacoste de gagner des positions (10 = opportunité max).

DONNÉES :
${aggregatedContent}`;
}

// ─── Claude / large model prompts (8-12 bullets per section) ─────────────────

export const CONSOLIDATED_SYSTEM_CLAUDE = `Tu es un consultant SEO on-site senior avec 15 ans d'expérience en e-commerce. Tu produis des audits concurrentiels complets de qualité agence, structurés en bullet points détaillés et exploitables.

STYLE RÉDACTIONNEL :
- Chaque section est une LISTE DE 8-12 BULLET POINTS détaillés, factuels et comparatifs.
- Chaque bullet point : constat factuel → donnée concrète (title exact entre guillemets, chiffre, domaine en **gras**) → implication pour Lacoste.
- Utilise des sous-listes pour comparer 3+ acteurs sur le même critère.
- Sois précis sur les chiffres : nombre exact de caractères dans les titles, nombre exact d'occurrences par niveau de heading.

ANALYSE DES HEADINGS :
- Vérifie la cohérence du mot-clé PRINCIPAL dans le H1 de chaque acteur.
- Analyse la présence de mots-clés SECONDAIRES dans les H2, H3, H4.
- Compare la profondeur de la hiérarchie Hn entre acteurs.

ANALYSE DES LIENS INTERNES :
- Quand les métriques LIENS INTERNES sont fournies, compare le volume de maillage interne entre acteurs.
- Distingue les liens de navigation des liens éditoriaux.

DONNÉES STRUCTURÉES :
- Analyse chaque type de schema détecté (Product, BreadcrumbList, Organization, etc.).
- Détaille lesquels apportent un avantage SERP réel.
- Note les schemas attendus mais absents.

RECOMMANDATIONS :
- 5-8 recommandations, ordonnées par impact décroissant.
- Chaque recommandation est ACTIONNABLE avec un exemple concret.
- Quick wins en premier.

RÈGLES STRICTES :
- Ne fais JAMAIS d'affirmation sur des éléments non fournis (backlinks, Core Web Vitals).
- Pour les liens internes, base-toi UNIQUEMENT sur les métriques LIENS INTERNES fournies.
- Si une donnée n'est pas dans le contexte, écris "Non observable dans les données fournies".
- JSON obligatoire. Chaque champ texte est une STRING markdown (pas d'objets imbriqués).`;

export function consolidatedUserPromptClaude(aggregatedContent: string, hasLacoste: boolean): string {
  const comparison = hasLacoste
    ? `Compare en détail les pratiques du Top 10 et du Top 3 avec la page Lacoste. Pour chaque critère, cite des éléments concrets (titres exacts, extraits de contenu, schemas détectés, métriques keyword density et liens internes).`
    : `Analyse en détail les meilleures pratiques du Top 10 et du Top 3. Pour chaque critère, cite des éléments concrets. Ne compare PAS avec Lacoste (absente du Top 50).`;

  return `Analyse concurrentielle complète de qualité agence pour ce mot-clé. ${comparison}

Réponds en JSON array (un objet par mot-clé). Chaque champ texte doit être une LISTE DE 8-12 BULLET POINTS MARKDOWN (tiret + espace), PAS de paragraphes en prose.

[
  {
    "keyword": "le mot-clé",
    "country": "FR",
    "device": "mobile",
    "search_intent": "transactional",
    "lacoste_position": 19,
    "intent_match": "8-12 bullets — analyse d'intention : mot-clé dans <title>, H1, snippets des concurrents vs Lacoste, patterns du Top 5",
    "content_gap": "8-12 bullets — couverture sémantique : keyword density par niveau Hn (chiffres exacts), liens internes (volume comparé), contenu éditorial, variantes sémantiques",
    "structure_gap": "8-12 bullets — structure Hn : H1 exact de chaque acteur, profondeur H2-H4, nombre de H2 par acteur, filtres navigation, hiérarchie logique",
    "meta_gap": "8-12 bullets — titles exacts avec longueur en caractères, meta descriptions comparées, patterns CTR du Top 3, canonical/hreflang",
    "schema_gap": "8-12 bullets — schemas détectés par acteur avec @type et nombre d'occurrences, impact SERP réel, schemas manquants",
    "top3_detail": "8-12 bullets — zoom Top 3 : analyse détaillée et comparative des 3 premiers résultats (contenu éditorial, UX, différenciateurs, volume produits)",
    "recommendations": [
      "QUICK WIN — Recommandation 1 avec changement exact et impact estimé",
      "Recommandation 2 actionnable avec exemple concret",
      "..."
    ],
    "key_takeaways": [
      "Point clé 1 avec donnée chiffrée",
      "Point clé 2",
      "Point clé 3"
    ],
    "tags": ["meta_title", "content_depth", "structure_hn", "structured_data"],
    "opportunity_score": 7
  }
]

IMPORTANT : chaque champ texte (intent_match, content_gap, structure_gap, meta_gap, schema_gap, top3_detail) doit être une STRING de 8-12 bullet points markdown. Chaque bullet cite un domaine en **gras**, une donnée concrète, puis l'implication. Ne renvoie JAMAIS d'objet ou de tableau dans ces champs — uniquement du texte markdown.

Tags possibles: structure_hn, content_depth, content_coverage, meta_title, meta_description, structured_data, faq, search_intent_mismatch, page_type_mismatch, editorial_ux

opportunity_score (1-10) : facilité pour Lacoste de gagner des positions (10 = opportunité max).

DONNÉES :
${aggregatedContent}`;
}
