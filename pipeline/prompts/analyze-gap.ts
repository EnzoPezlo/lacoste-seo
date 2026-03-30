export const ANALYZE_GAP_SYSTEM = `Tu es un consultant SEO on-site senior. Tu rédiges des analyses concurrentielles claires, structurées et exploitables pour une équipe SEO.

STYLE RÉDACTIONNEL :
- Rédige en prose fluide et analytique, pas en listes de données brutes.
- Chaque section doit être un PARAGRAPHE RÉDIGÉ (4-8 phrases) qui COMPARE les concurrents entre eux ET avec Lacoste.
- Cite les données concrètes (titles exacts, métriques keyword density, schemas détectés) INTÉGRÉES dans ton analyse, pas en vrac.
- Commence chaque section par le constat principal, puis détaille les différences entre acteurs, puis conclus par l'implication pour Lacoste.
- Utilise le gras markdown (**mot**) pour mettre en valeur les noms de domaine et les chiffres clés.

RÈGLES STRICTES :
- Ne fais JAMAIS d'affirmation sur des éléments non fournis (maillage interne, backlinks, autres pages du site, Core Web Vitals).
- Si une donnée n'est pas dans le contexte, écris "Non observable dans les données fournies".
- Pour chaque affirmation, base-toi sur un élément concret du contenu fourni.
- Dans "intent_match", mentionne EXPLICITEMENT si les concurrents ont le mot-clé exact dans leur balise <title> et compare avec celle de Lacoste.
- Dans "content_gap", appuie-toi sur les métriques KEYWORD DENSITY fournies (occurrences dans le texte, les Hn, le H1).
- JSON obligatoire. Chaque champ texte est une STRING markdown (pas d'objets imbriqués).`;

export function analyzeGapUserPrompt(aggregatedContent: string): string {
  return `Analyse pourquoi Lacoste est derrière ses concurrents pour chaque mot-clé. Facteurs on-site uniquement, basés sur les données fournies.

Réponds en JSON array. Chaque champ texte doit être un PARAGRAPHE RÉDIGÉ (4-8 phrases), PAS une liste de bullet points. Intègre les données chiffrées dans ta prose.

[
  {
    "keyword": "le mot-clé",
    "country": "FR",
    "device": "desktop",
    "search_intent": "transactional",
    "lacoste_position": 19,
    "intent_match": "Les trois premiers résultats intègrent le mot-clé exact \"sacoche homme\" dans leur balise <title> : **Zalando** avec \"Sacoche Homme | Livraison Gratuite | Zalando\" (52 caractères), **Amazon** avec \"Sacoche Homme : Sacs et Pochettes\" (35 caractères), et **Cdiscount** qui utilise une variante proche. La page Lacoste, en position 19, affiche le title \"Sacoches et pochettes | Lacoste\" — le mot-clé exact est absent, remplacé par le pluriel générique. Cette différence de ciblage dans le <title> est significative car Google accorde un poids important à la correspondance exacte du mot-clé dans cette balise.",
    "content_gap": "L'analyse de la densité du mot-clé révèle un écart notable : **Zalando** (Pos#1) totalise **18 occurrences** dont 4 dans les Hn et 1 dans le H1, tandis que **Amazon** (Pos#2) en compte 12 avec 3 en Hn. En comparaison, la page Lacoste ne cumule que **3 occurrences** avec 0 dans les Hn et 0 dans le H1. Les concurrents du Top 3 renforcent la pertinence sémantique en intégrant le mot-clé dans leurs sous-titres (H2/H3) et dans les descriptions de produits. Lacoste privilégie un vocabulaire de marque (\"collection\", \"nouveautés\") qui dilue la pertinence pour cette requête générique.",
    "structure_gap": "Les pages concurrentes du Top 3 adoptent une structure de page catégorie e-commerce avec un H1 contenant le mot-clé exact, suivi de filtres de navigation (marque, prix, matière, taille) et de sous-catégories thématiques. **Zalando** propose par exemple 5 sous-catégories (sacoches bandoulière, sacoches cuir, etc.) qui créent autant de points d'entrée sémantiques. La page Lacoste utilise une mise en page collection visuelle sans navigation par type de produit, ce qui réduit la couverture des requêtes longue traîne associées.",
    "meta_gap": "Le title de **Zalando** (52 caractères) place le mot-clé exact en première position, suivi d'un argument commercial (\"Livraison Gratuite\"). **Amazon** adopte une approche similaire avec le mot-clé en tête. Le title Lacoste (\"Sacoches et pochettes | Lacoste\") privilégie le branding en fin de title mais omet le mot-clé transactionnel exact. La meta description des concurrents intègre également le mot-clé avec un CTA, alors que celle de Lacoste est orientée image de marque.",
    "schema_gap": "**Zalando** et **Amazon** implémentent des données structurées Product avec AggregateOffer (fourchette de prix) et AggregateRating (avis clients), ce qui leur permet d'afficher des rich snippets dans les SERP. La page Lacoste ne présente aucune donnée structurée détectable dans les données fournies, ce qui représente un manque à gagner en termes de visibilité SERP.",
    "recommendations": [
      "Réécrire le <title> pour inclure le mot-clé exact en position 1 : \"Sacoche Homme | Collection Lacoste\" au lieu de \"Sacoches et pochettes | Lacoste\"",
      "Intégrer le mot-clé exact dans le H1 et dans au moins 3 sous-titres H2/H3 pour atteindre une densité comparable au Top 3 (~10-15 occurrences)",
      "Ajouter des données structurées Product + AggregateOffer + AggregateRating pour activer les rich snippets",
      "Créer des sous-catégories navigables (sacoche bandoulière, sacoche cuir, etc.) pour couvrir la longue traîne"
    ],
    "tags": ["meta_title", "content_depth"],
    "opportunity_score": 7
  }
]

IMPORTANT : chaque champ (intent_match, content_gap, structure_gap, meta_gap, schema_gap) doit être une STRING de 4-8 phrases rédigées. Cite les titles exacts entre guillemets, les domaines en gras, et les chiffres de keyword density. Ne renvoie JAMAIS d'objet ou de tableau dans ces champs — uniquement du texte markdown.

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
- Rédige en prose fluide et comparative, pas en listes de données brutes.
- Chaque section doit être un PARAGRAPHE RÉDIGÉ (5-10 phrases) qui compare les pages du Top 3 entre elles et identifie les patterns gagnants.
- Cite les données concrètes (titles exacts entre guillemets, métriques keyword density, schemas détectés) INTÉGRÉES dans ton analyse.
- Utilise le gras markdown (**mot**) pour mettre en valeur les noms de domaine et les chiffres clés.
- Chaque champ texte doit être une STRING markdown, jamais un objet ou un tableau.

RÈGLES STRICTES :
- Ne fais JAMAIS d'affirmation sur des éléments non fournis (maillage interne, backlinks, autres pages du site).
- Si une donnée n'est pas dans le contexte, écris "Non observable dans les données fournies".
- Pour chaque affirmation, cite un élément concret du contenu fourni.
- JSON obligatoire.`;

export function deepDiveUserPrompt(aggregatedContent: string, hasLacoste: boolean): string {
  const comparison = hasLacoste
    ? `Compare en détail les pratiques du Top 3 avec la page Lacoste. Pour chaque critère, cite des éléments concrets (titres exacts, extraits de contenu, schemas détectés).`
    : `Analyse en détail les meilleures pratiques du Top 3. Pour chaque critère, cite des éléments concrets. Ne compare PAS avec Lacoste (absente du Top 50).`;

  return `Analyse approfondie du Top 3 pour ce mot-clé. ${comparison}

Réponds en JSON array (un objet par mot-clé). Chaque champ texte doit être un PARAGRAPHE RÉDIGÉ (5-10 phrases comparatives), PAS une liste de bullet points.

[
  {
    "keyword": "le mot-clé",
    "country": "FR",
    "device": "desktop",
    "title_analysis": "Le title de **Zalando** (Pos#1) — \"Sacoche Homme | Livraison Gratuite | Zalando\" (52 caractères) — place le mot-clé exact en tête, suivi d'un argument commercial qui incite au clic. **Amazon** (Pos#2) adopte une approche similaire avec \"Sacoche Homme : Sacs et Pochettes\" (35 caractères), plus concis mais toujours centré sur le mot-clé. **Cdiscount** (Pos#3) enrichit son title avec une variante longue traîne \"pas cher\" qui cible une intention prix. ${hasLacoste ? 'En comparaison, le title Lacoste — \"Sacoches et pochettes | Lacoste\" — utilise le pluriel générique au lieu du mot-clé exact transactionnel, et place la marque en fin de title sans argument différenciant.' : "Lacoste étant absente du Top 50, aucune comparaison directe n'est possible."} Le pattern commun du Top 3 est clair : mot-clé exact en position 1 du title, complété par un avantage concurrentiel (livraison, prix, choix).",
    "content_depth_analysis": "L'analyse de la densité du mot-clé révèle des stratégies de contenu très différentes parmi le Top 3. **Zalando** (Pos#1) domine avec **18 occurrences** totales du mot-clé, dont 4 dans les balises Hn et 1 dans le H1, ce qui témoigne d'une intégration systématique dans la structure de la page. **Amazon** (Pos#2) affiche 12 occurrences avec 3 en Hn, et enrichit son contenu avec des descriptions produits détaillées incluant des variantes sémantiques. **Cdiscount** (Pos#3) mise sur un volume de contenu important avec des guides d'achat intégrés. ${hasLacoste ? 'La page Lacoste ne cumule que **3 occurrences** du mot-clé avec 0 dans les Hn, ce qui suggère une page orientée catalogue visuel plutôt que contenu textuel optimisé.' : ''} Le Top 3 partage un point commun : un contenu textuel riche autour de la catégorie, au-delà du simple listing produit.",
    "structure_analysis": "**Zalando** structure sa page avec un H1 contenant le mot-clé exact, suivi de 5 sous-catégories thématiques (bandoulière, cuir, sport, etc.) en H2, puis des filtres latéraux par marque, prix et matière. Cette architecture crée une hiérarchie sémantique profonde que Google valorise. **Amazon** adopte un schéma similaire avec un H1 + breadcrumb catégoriel + filtres dynamiques, mais y ajoute un système de \"recherches associées\" qui enrichit le maillage interne. **Cdiscount** se distingue par un contenu éditorial en bas de page (guide d'achat) structuré en H2/H3 qui couvre les questions fréquentes. ${hasLacoste ? 'La page Lacoste utilise une mise en page collection visuelle, élégante mais peu structurée en termes de hiérarchie Hn — le H1 ne contient pas le mot-clé exact et les sous-sections ne sont pas balisées en H2/H3.' : ''}",
    "structured_data_analysis": "**Zalando** implémente un schema Product complet sur chaque produit listé, avec AggregateOffer (fourchette de prix) et AggregateRating (note moyenne + nombre d'avis), ce qui lui permet d'afficher des rich snippets étoilés dans les SERP. **Amazon** va encore plus loin avec Product + Offer + Review + BreadcrumbList, maximisant sa surface SERP. **Cdiscount** utilise Product et ItemList mais sans les avis agrégés. ${hasLacoste ? 'La page Lacoste ne présente aucune donnée structurée détectable dans les données fournies, ce qui la prive des rich snippets que ses concurrents affichent.' : ''} Le schema Product avec avis clients est devenu un standard du marché pour les pages catégorie e-commerce sur cette requête.",
    "meta_analysis": "La meta description de **Zalando** (155 caractères) intègre le mot-clé dès la première phrase, suivi d'un CTA (\"Découvrez notre sélection\") et d'arguments commerciaux (livraison gratuite, retours). **Amazon** utilise une description auto-générée mais optimisée, mentionnant le nombre de résultats et les marques disponibles. **Cdiscount** mise sur le prix avec une accroche \"à petit prix\". ${hasLacoste ? 'La meta description Lacoste est orientée image de marque et ne mentionne pas le mot-clé transactionnel, ce qui réduit le CTR potentiel depuis la SERP.' : ''} Le pattern gagnant est une meta description qui combine mot-clé exact + argument commercial + CTA en moins de 155 caractères.",
    "key_takeaways": [
      "Les 3 premiers résultats intègrent systématiquement le mot-clé exact dans le <title>, le H1 et au moins 3 sous-titres Hn",
      "Le schema Product avec AggregateRating est un standard du marché — son absence pénalise la visibilité SERP",
      "Les pages catégorie performantes combinent listing produit + contenu éditorial (guides, FAQ) + navigation facettée"
    ],
    "tags": ["meta_title", "content_depth", "structured_data"]
  }
]

IMPORTANT : chaque champ (title_analysis, content_depth_analysis, structure_analysis, structured_data_analysis, meta_analysis) doit être une STRING de 5-10 phrases rédigées en prose comparative. Cite les titles exacts entre guillemets, les domaines en gras, et les chiffres de keyword density. Ne renvoie JAMAIS d'objet ou de tableau dans ces champs — uniquement du texte markdown.

Tags possibles: structure_hn, content_depth, content_coverage, meta_title, meta_description, structured_data, faq, search_intent_mismatch, page_type_mismatch, editorial_ux

DONNÉES :
${aggregatedContent}`;
}
