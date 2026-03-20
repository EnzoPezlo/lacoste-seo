export const ANALYZE_GAP_SYSTEM = `Expert SEO senior. Analyse on-site uniquement. Pas de backlinks, autorité de domaine, ou facteurs off-site. Cite des éléments concrets et observables. Format JSON structuré obligatoire.`;

export function analyzeGapUserPrompt(aggregatedContent: string): string {
  return `Tu es un expert SEO senior. Analyse pourquoi Lacoste est derrière ses concurrents sur les mots-clés suivants, en te basant UNIQUEMENT sur des facteurs on-site observables dans les données fournies.

Pour chaque mot-clé, fournis :

1. **Intention de recherche** : transactional | informational | navigational | mix
   - Justifie par les signaux observés dans le Top 10 (types de pages dominants, contenu)

2. **Diagnostic détaillé** — analyse l'écart entre le Top 3 et Lacoste selon ces catégories :
   - **Alignement intention & type de page** : est-ce que Lacoste propose le bon type de page ?
   - **Couverture sémantique & profondeur** : thèmes couverts, granularité, FAQ, guides, comparatifs
   - **Structure & lisibilité** : hiérarchie Hn, sections, sommaire, scannabilité
   - **Optimisation head/meta** : title (longueur, mots-clés), meta description, canonical
   - **Données structurées** : types de schema.org, richesse, cohérence avec le contenu
   - **UX éditoriale** : présence de tableaux, étapes, ancrages, éléments d'aide

3. **Recommandations** : 3 à 5 actions concrètes et prioritaires pour améliorer le positionnement de Lacoste

4. **Tags** : liste de tags parmi les suivants (ou tout autre tag pertinent) :
   structure_hn, content_depth, content_coverage, meta_title, meta_description, structured_data, faq, search_intent_mismatch, page_type_mismatch, editorial_ux

Contraintes :
- UNIQUEMENT des facteurs on-site observables dans les données fournies
- Cite des éléments concrets (ex: "title de 15 caractères vs 60 chez le concurrent")
- Ne mentionne PAS de facteurs off-site (backlinks, autorité, E-E-A-T supposé, popularité)
- Si une information manque, dis-le ("non observable dans les données")

Réponds en JSON array (un objet par mot-clé) :
[
  {
    "keyword": "...",
    "country": "...",
    "device": "...",
    "search_intent": "transactional",
    "lacoste_position": 19,
    "diagnostic": "### Alignement intention\\n...\\n### Couverture sémantique\\n...",
    "recommendations": "1. ...\\n2. ...\\n3. ...",
    "tags": ["structure_hn", "content_depth"]
  }
]

DONNÉES :
${aggregatedContent}`;
}
