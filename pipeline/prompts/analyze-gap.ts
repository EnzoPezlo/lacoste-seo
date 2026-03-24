export const ANALYZE_GAP_SYSTEM = `Expert SEO. Analyse on-site uniquement. JSON obligatoire. Réponses courtes et factuelles.`;

export function analyzeGapUserPrompt(aggregatedContent: string): string {
  return `Analyse pourquoi Lacoste est derrière ses concurrents. Facteurs on-site uniquement.

Réponds en JSON array. Chaque champ doit être COURT (1-2 phrases max).

[
  {
    "keyword": "le mot-clé",
    "country": "FR",
    "device": "desktop",
    "search_intent": "transactional",
    "lacoste_position": 19,
    "intent_match": "Le Top 10 montre des pages catégorie e-commerce. Lacoste propose X.",
    "content_gap": "Les concurrents couvrent X thèmes. Lacoste manque Y.",
    "structure_gap": "Concurrent a H1+sous-catégories. Lacoste a seulement X.",
    "meta_gap": "Title concurrent: 55 chars avec mot-clé. Lacoste: 30 chars sans mot-clé.",
    "schema_gap": "Concurrent utilise Product+Rating. Lacoste: aucun schema.",
    "recommendations": ["Action 1", "Action 2", "Action 3"],
    "tags": ["meta_title", "content_depth"]
  }
]

Tags possibles: structure_hn, content_depth, content_coverage, meta_title, meta_description, structured_data, faq, search_intent_mismatch, page_type_mismatch, editorial_ux

DONNÉES :
${aggregatedContent}`;
}
