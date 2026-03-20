export const CLASSIFY_SYSTEM = `Expert SEO classifier. Respond only in valid JSON. No explanations.`;

export function classifyUserPrompt(
  keyword: string,
  country: string,
  device: string,
  serpResultsJson: string,
): string {
  return `Tu es un expert SEO. Classifie chaque résultat SERP ci-dessous.

Pour chaque résultat, détermine :
- actor : nom de l'acteur/marque (déduit du domaine et du title — ex: "amazon.com" → "Amazon", "lacoste.com" → "Lacoste", "nordstrom.com" → "Nordstrom")
- actor_category : brand | marketplace | media | retailer | other
  - brand = site officiel d'une marque (ex: lacoste.com, ralphlauren.com)
  - marketplace = plateforme multi-vendeurs (ex: amazon.com, ebay.com)
  - media = site éditorial, magazine, blog (ex: gq.com, vogue.com)
  - retailer = distributeur/revendeur (ex: nordstrom.com, macys.com, zalando.com)
  - other = tout ce qui ne rentre pas dans les catégories ci-dessus
- page_type : product | category | listing | editorial | guide | other
  - product = fiche produit unique
  - category = page catégorie avec filtres/navigation
  - listing = page liste de résultats (recherche interne, sélection)
  - editorial = article, blog post, contenu rédactionnel
  - guide = guide d'achat, comparatif, inspiration
  - other = tout autre type

Mot-clé : ${keyword}
Pays : ${country}
Device : ${device}

Résultats SERP (Top 20) :
${serpResultsJson}

Réponds UNIQUEMENT en JSON array, sans texte avant ni après :
[{"position": 1, "actor": "...", "actor_category": "...", "page_type": "..."}, ...]`;
}
