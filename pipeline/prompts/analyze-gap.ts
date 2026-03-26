export const ANALYZE_GAP_SYSTEM = `Expert SEO on-site. Tu analyses UNIQUEMENT les données fournies. JSON obligatoire. Réponses factuelles.

RÈGLES STRICTES :
- Ne fais JAMAIS d'affirmation sur des éléments non fournis (maillage interne, backlinks, autres pages du site, Core Web Vitals).
- Si une donnée n'est pas dans le contexte, écris "Non observable dans les données fournies".
- Pour chaque affirmation, base-toi sur un élément concret du contenu fourni.
- Dans "intent_match", mentionne EXPLICITEMENT si les concurrents ont le mot-clé exact dans leur balise <title> et compare avec celle de Lacoste.
- Dans "content_gap", appuie-toi sur les métriques KEYWORD DENSITY fournies (occurrences dans le texte, les Hn, le H1).`;

export function analyzeGapUserPrompt(aggregatedContent: string): string {
  return `Analyse pourquoi Lacoste est derrière ses concurrents. Facteurs on-site uniquement, basés sur les données fournies.

Réponds en JSON array. Chaque champ doit être COURT (1-2 phrases max).

[
  {
    "keyword": "le mot-clé",
    "country": "FR",
    "device": "desktop",
    "search_intent": "transactional",
    "lacoste_position": 19,
    "intent_match": "Le Top 3 a le mot-clé exact dans le <title>: 'Sacoche Homme | Zalando'. Lacoste: 'Sacoches et pochettes | Lacoste' — mot-clé absent du title.",
    "content_gap": "Concurrent #1 : 12 occurrences du mot-clé, 3 dans les Hn. Lacoste : 2 occurrences, 0 dans les Hn.",
    "structure_gap": "Concurrent a H1+sous-catégories. Lacoste a seulement X.",
    "meta_gap": "Title concurrent: 55 chars avec mot-clé exact. Lacoste: 30 chars sans mot-clé.",
    "schema_gap": "Concurrent utilise Product+Rating. Lacoste: aucun schema. (ou: Non observable dans les données fournies)",
    "recommendations": ["Action 1", "Action 2", "Action 3"],
    "tags": ["meta_title", "content_depth"],
    "opportunity_score": 7
  }
]

Tags possibles: structure_hn, content_depth, content_coverage, meta_title, meta_description, structured_data, faq, search_intent_mismatch, page_type_mismatch, editorial_ux

opportunity_score (1-10) : estime la facilité pour Lacoste de gagner des positions. Basé sur :
- Les faiblesses observables des concurrents top 3 (score élevé si leurs pratiques sont faibles)
- La facilité de mise en place des leviers identifiés (score élevé si les actions sont simples)
- L'écart de position actuel (score plus bas si Lacoste est très loin)

DONNÉES :
${aggregatedContent}`;
}

export const DEEP_DIVE_SYSTEM = `Expert SEO on-site. Tu fais une analyse approfondie et comparative des meilleures pages. JSON obligatoire. Réponses détaillées.

RÈGLES STRICTES :
- Ne fais JAMAIS d'affirmation sur des éléments non fournis (maillage interne, backlinks, autres pages du site).
- Si une donnée n'est pas dans le contexte, écris "Non observable dans les données fournies".
- Pour chaque affirmation, cite un élément concret du contenu fourni.`;

export function deepDiveUserPrompt(aggregatedContent: string, hasLacoste: boolean): string {
  const comparison = hasLacoste
    ? `Compare en détail les pratiques du Top 3 avec la page Lacoste. Pour chaque critère, cite des éléments concrets (titres exacts, extraits de contenu, schemas détectés).`
    : `Analyse en détail les meilleures pratiques du Top 3. Pour chaque critère, cite des éléments concrets. Ne compare PAS avec Lacoste (absente du Top 50).`;

  return `Analyse approfondie du Top 3 pour ce mot-clé. ${comparison}

Réponds en JSON array (un objet par mot-clé).

[
  {
    "keyword": "le mot-clé",
    "country": "FR",
    "device": "desktop",
    "title_analysis": "Pos#1 'Sacoche Homme | Zalando' (52 chars, mot-clé en position 1). Pos#2 'Sacoche homme pas cher | Cdiscount' (36 chars). ${hasLacoste ? "Lacoste: 'Sacoches | Lacoste' — mot-clé absent." : ''}",
    "content_depth_analysis": "Pos#1 : 12 occurrences mot-clé, 3 en Hn, contenu de 2500 mots avec guides de taille. Pos#2 : 8 occurrences...",
    "structure_analysis": "Pos#1 : H1 contient mot-clé exact, 5 H2 thématiques. Pos#2 : ...",
    "structured_data_analysis": "Pos#1 : Product schema avec offers+aggregateRating. Pos#2 : BreadcrumbList uniquement.",
    "meta_analysis": "Pos#1 description 155 chars avec CTA et mot-clé. Pos#2 : ...",
    "key_takeaways": ["Le Top 3 utilise tous le mot-clé exact dans le title", "FAQ presente chez 2/3 du Top 3", "Schema Product est un standard du marché"],
    "tags": ["meta_title", "content_depth", "structured_data"]
  }
]

Tags possibles: structure_hn, content_depth, content_coverage, meta_title, meta_description, structured_data, faq, search_intent_mismatch, page_type_mismatch, editorial_ux

DONNÉES :
${aggregatedContent}`;
}
