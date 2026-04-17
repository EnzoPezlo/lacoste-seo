export const ANALYZE_GAP_SYSTEM = `Tu es un consultant SEO on-site senior. Tu rédiges des analyses concurrentielles claires, structurées et exploitables pour une équipe SEO.

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
- Dans "intent_match", mentionne EXPLICITEMENT si les concurrents ont le mot-clé exact dans leur balise <title> et compare avec celle de Lacoste.
- Dans "content_gap", appuie-toi sur les métriques KEYWORD DENSITY fournies (occurrences dans le texte, les Hn, le H1).
- JSON obligatoire. Chaque champ texte est une STRING markdown (pas d'objets imbriqués).`;

export function analyzeGapUserPrompt(aggregatedContent: string): string {
  return `Analyse pourquoi Lacoste est derrière ses concurrents pour chaque mot-clé. Facteurs on-site uniquement, basés sur les données fournies.

Réponds en JSON array. Chaque champ texte doit être une LISTE DE 5-8 BULLET POINTS MARKDOWN (tiret + espace), PAS de paragraphes en prose. Chaque bullet cite une donnée concrète.

[
  {
    "keyword": "le mot-clé",
    "country": "FR",
    "device": "mobile",
    "search_intent": "transactional",
    "lacoste_position": 19,
    "intent_match": "- **Zalando** (Pos#1) : title \"Sacoche Homme | Livraison Gratuite\" — mot-clé exact en position 1, 52 caractères\n- **Amazon** (Pos#2) : title \"Sacoche Homme : Sacs et Pochettes\" — mot-clé exact en tête, 35 caractères\n- **Cdiscount** (Pos#3) : utilise une variante proche du mot-clé dans le title\n- Lacoste (Pos#19) : title \"Sacoches et pochettes | Lacoste\" — mot-clé exact absent, remplacé par le pluriel générique\n- Les 3 premiers résultats placent tous le mot-clé exact dans le <title>, Lacoste non\n- Implication : Google accorde un poids fort à la correspondance exacte dans le <title>, ce qui explique l'écart de positionnement",
    "content_gap": "- **Zalando** (Pos#1) : **18 occurrences** du mot-clé, dont 4 dans les Hn et 1 dans le H1\n- **Amazon** (Pos#2) : **12 occurrences**, 3 en Hn — descriptions produits riches en variantes sémantiques\n- Lacoste : seulement **3 occurrences**, 0 dans les Hn, 0 dans le H1\n- Le Top 3 intègre le mot-clé dans les sous-titres H2/H3 et les descriptions produits\n- Lacoste privilégie un vocabulaire de marque (\"collection\", \"nouveautés\") qui dilue la pertinence\n- Liens internes : les concurrents maillent vers des sous-catégories thématiques, renforçant la pertinence sémantique",
    "structure_gap": "- Le H1 du Top 3 contient systématiquement le mot-clé exact — celui de Lacoste non\n- **Zalando** : 5 sous-catégories en H2 (bandoulière, cuir, sport...) couvrant les mots-clés secondaires\n- Les H2-H4 des concurrents reprennent des variantes longue traîne du mot-clé principal\n- Lacoste : mise en page collection visuelle, pas de hiérarchie Hn exploitant les mots-clés secondaires\n- Filtres de navigation (marque, prix, matière) créent des points d'entrée sémantiques chez les concurrents\n- Implication : la cohérence mot-clé principal / H1 et mots-clés secondaires / H2-H4 est un facteur clé du Top 3",
    "meta_gap": "- **Zalando** : title de 52 caractères, mot-clé en position 1, argument commercial \"Livraison Gratuite\"\n- **Amazon** : mot-clé en tête du title, approche similaire\n- Lacoste : title \"Sacoches et pochettes | Lacoste\" — branding en fin, mot-clé transactionnel exact absent\n- Meta description concurrents : mot-clé + CTA intégrés\n- Meta description Lacoste : orientée image de marque, pas de mot-clé transactionnel\n- Le pattern gagnant du Top 3 : mot-clé exact + argument commercial + CTA en moins de 155 caractères",
    "schema_gap": "- **Zalando** et **Amazon** : données structurées Product + AggregateOffer (fourchette de prix) + AggregateRating (avis clients)\n- Ces schemas activent des rich snippets étoilés dans les SERP, augmentant le CTR\n- **Cdiscount** : Product + ItemList mais sans avis agrégés\n- Lacoste : aucune donnée structurée détectable dans les données fournies\n- Implication : absence de rich snippets = perte de visibilité SERP face aux concurrents",
    "recommendations": [
      "Réécrire le <title> pour inclure le mot-clé exact en position 1 : \"Sacoche Homme | Collection Lacoste\" au lieu de \"Sacoches et pochettes | Lacoste\"",
      "Intégrer le mot-clé exact dans le H1 et les mots-clés secondaires dans au moins 3 sous-titres H2/H3 pour atteindre une densité comparable au Top 3 (~10-15 occurrences)",
      "Ajouter des données structurées Product + AggregateOffer + AggregateRating pour activer les rich snippets",
      "Créer des sous-catégories navigables (sacoche bandoulière, sacoche cuir, etc.) pour couvrir la longue traîne",
      "Renforcer le maillage interne vers les sous-catégories thématiques pour améliorer la pertinence sémantique"
    ],
    "tags": ["meta_title", "content_depth"],
    "opportunity_score": 7
  }
]

IMPORTANT : chaque champ (intent_match, content_gap, structure_gap, meta_gap, schema_gap) doit être une STRING de 5-8 bullet points markdown (tiret + espace). Chaque bullet cite un domaine en **gras**, une donnée concrète (title exact entre guillemets, chiffre keyword density, nombre de liens internes), puis l'implication. Ne renvoie JAMAIS d'objet ou de tableau dans ces champs — uniquement du texte markdown.

Tags possibles: structure_hn, content_depth, content_coverage, meta_title, meta_description, structured_data, faq, search_intent_mismatch, page_type_mismatch, editorial_ux

opportunity_score (1-10) : estime la facilité pour Lacoste de gagner des positions. Basé sur :
- Les faiblesses observables des concurrents top 3 (score élevé si leurs pratiques sont faibles)
- La facilité de mise en place des leviers identifiés (score élevé si les actions sont simples)
- L'écart de position actuel (score plus bas si Lacoste est très loin)

DONNÉES :
${aggregatedContent}`;
}

export const DEEP_DIVE_SYSTEM = `Tu es un consultant SEO on-site senior. Tu rédiges des analyses approfondies et comparatives des meilleures pages, dans un style clair et exploitable pour une équipe SEO.

STYLE RÉDACTIONNEL :
- Rédige en bullet points structurés et comparatifs, PAS en paragraphes de prose.
- Chaque section doit être une LISTE DE 6-10 BULLET POINTS (tiret + espace) qui comparent les pages du Top 3 entre elles et identifient les patterns gagnants.
- Chaque bullet commence par un constat factuel, cite une donnée concrète (title exact entre guillemets, chiffre keyword density, domaine en **gras**), puis donne l'implication.
- Utilise le gras markdown (**mot**) pour mettre en valeur les noms de domaine et les chiffres clés.
- Dans les analyses de structure, analyse la cohérence mot-clé principal / H1 et mots-clés secondaires / H2-H4.
- Dans les analyses de contenu, utilise les métriques KEYWORD DENSITY par niveau (H1, H2, H3, H4) ET les métriques LIENS INTERNES fournies.
- Chaque champ texte doit être une STRING markdown, jamais un objet ou un tableau.

RÈGLES STRICTES :
- Ne fais JAMAIS d'affirmation sur des éléments non fournis (backlinks, autres pages du site). Pour les liens internes, base-toi UNIQUEMENT sur les métriques LIENS INTERNES fournies.
- Si une donnée n'est pas dans le contexte, écris "Non observable dans les données fournies".
- Pour chaque affirmation, cite un élément concret du contenu fourni.
- JSON obligatoire.`;

export function deepDiveUserPrompt(aggregatedContent: string, hasLacoste: boolean): string {
  const comparison = hasLacoste
    ? `Compare en détail les pratiques du Top 3 avec la page Lacoste. Pour chaque critère, cite des éléments concrets (titres exacts, extraits de contenu, schemas détectés).`
    : `Analyse en détail les meilleures pratiques du Top 3. Pour chaque critère, cite des éléments concrets. Ne compare PAS avec Lacoste (absente du Top 50).`;

  return `Analyse approfondie du Top 3 pour ce mot-clé. ${comparison}

Réponds en JSON array (un objet par mot-clé). Chaque champ texte doit être une LISTE DE 6-10 BULLET POINTS comparatifs (tiret + espace), PAS de paragraphes en prose.

[
  {
    "keyword": "le mot-clé",
    "country": "FR",
    "device": "mobile",
    "title_analysis": "- **Zalando** (Pos#1) : title \"Sacoche Homme | Livraison Gratuite | Zalando\" — 52 caractères, mot-clé exact en tête\n- **Amazon** (Pos#2) : title \"Sacoche Homme : Sacs et Pochettes\" — 35 caractères, mot-clé exact en tête\n- **Cdiscount** (Pos#3) : variante longue traîne \"pas cher\" dans le title, cible l'intention prix\n- ${hasLacoste ? 'Lacoste : title \"Sacoches et pochettes | Lacoste\" — pluriel générique, mot-clé exact absent, marque en fin sans argument différenciant' : "Lacoste absente du Top 50, aucune comparaison directe possible"}\n- Pattern commun du Top 3 : mot-clé exact en position 1 du title + avantage concurrentiel (livraison, prix, choix)\n- Le title est le premier signal de pertinence pour Google sur cette requête transactionnelle",
    "content_depth_analysis": "- **Zalando** (Pos#1) : **18 occurrences** du mot-clé, dont 4 dans les Hn et 1 dans le H1 — intégration systématique\n- **Amazon** (Pos#2) : **12 occurrences**, 3 en Hn — descriptions produits riches en variantes sémantiques\n- **Cdiscount** (Pos#3) : volume de contenu important avec guides d'achat intégrés\n- ${hasLacoste ? 'Lacoste : seulement **3 occurrences**, 0 dans les Hn, 0 dans le H1 — page orientée catalogue visuel' : ''}\n- Point commun du Top 3 : contenu textuel riche autour de la catégorie, au-delà du simple listing produit\n- Les liens internes du Top 3 maillent vers des sous-catégories, renforçant la pertinence thématique\n- Implication : la densité du mot-clé dans les Hn est un facteur différenciant fort entre le Top 3 et les positions inférieures",
    "structure_analysis": "- **Zalando** : H1 avec mot-clé exact, 5 sous-catégories en H2 (bandoulière, cuir, sport...) couvrant les mots-clés secondaires\n- Les H2-H4 de **Zalando** reprennent des variantes longue traîne, créant une hiérarchie sémantique profonde\n- **Amazon** : H1 + breadcrumb catégoriel + filtres dynamiques + \"recherches associées\" enrichissant le maillage interne\n- **Cdiscount** : contenu éditorial en bas de page (guide d'achat) structuré en H2/H3 couvrant les questions fréquentes\n- ${hasLacoste ? 'Lacoste : mise en page collection visuelle, H1 sans mot-clé exact, sous-sections non balisées en H2/H3' : ''}\n- Cohérence mot-clé principal / H1 : 100% du Top 3 respecte cette règle\n- Cohérence mots-clés secondaires / H2-H4 : le Top 3 exploite les variantes longue traîne dans la hiérarchie Hn",
    "structured_data_analysis": "- **Zalando** : schema Product complet + AggregateOffer (fourchette de prix) + AggregateRating (note + nombre d'avis) — rich snippets étoilés\n- **Amazon** : Product + Offer + Review + BreadcrumbList — surface SERP maximisée\n- **Cdiscount** : Product + ItemList, mais sans avis agrégés\n- ${hasLacoste ? 'Lacoste : aucune donnée structurée détectable — privée des rich snippets que ses concurrents affichent' : ''}\n- Le schema Product avec avis clients est un standard du marché pour les pages catégorie e-commerce\n- Implication : l'absence de données structurées réduit le CTR potentiel face aux résultats enrichis",
    "meta_analysis": "- **Zalando** : meta description de 155 caractères, mot-clé en première phrase + CTA \"Découvrez notre sélection\" + arguments commerciaux\n- **Amazon** : description auto-générée mais optimisée, nombre de résultats + marques disponibles\n- **Cdiscount** : accroche prix \"à petit prix\" ciblant l'intention transactionnelle\n- ${hasLacoste ? 'Lacoste : meta description orientée image de marque, mot-clé transactionnel absent — CTR potentiel réduit' : ''}\n- Pattern gagnant : mot-clé exact + argument commercial + CTA en moins de 155 caractères\n- La meta description n'est pas un facteur de ranking direct mais impacte fortement le CTR",
    "key_takeaways": [
      "Les 3 premiers résultats intègrent systématiquement le mot-clé exact dans le <title>, le H1 et au moins 3 sous-titres Hn",
      "Le schema Product avec AggregateRating est un standard du marché — son absence pénalise la visibilité SERP",
      "Les pages catégorie performantes combinent listing produit + contenu éditorial (guides, FAQ) + navigation facettée"
    ],
    "tags": ["meta_title", "content_depth", "structured_data"]
  }
]

IMPORTANT : chaque champ (title_analysis, content_depth_analysis, structure_analysis, structured_data_analysis, meta_analysis) doit être une STRING de 6-10 bullet points markdown (tiret + espace). Chaque bullet cite un domaine en **gras**, une donnée concrète (title exact entre guillemets, chiffre keyword density, nombre de liens internes), puis l'implication. Ne renvoie JAMAIS d'objet ou de tableau dans ces champs — uniquement du texte markdown.

Tags possibles: structure_hn, content_depth, content_coverage, meta_title, meta_description, structured_data, faq, search_intent_mismatch, page_type_mismatch, editorial_ux

DONNÉES :
${aggregatedContent}`;
}
