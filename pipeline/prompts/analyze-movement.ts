export const ANALYZE_MOVEMENT_SYSTEM = `Expert SEO senior. Analyse comparative avant/après. Facteurs on-site uniquement. Format JSON structuré obligatoire.`;

export function analyzeMovementUserPrompt(movementData: string): string {
  return `Tu es un expert SEO senior. Analyse les mouvements de position significatifs ci-dessous en comparant les versions avant et après des pages concernées.

Pour chaque mouvement, fournis :

1. **Changements objectifs détectés** : liste exhaustive de ce qui a concrètement changé entre les deux versions :
   - Contenu ajouté ou supprimé (sections, paragraphes, mots-clés)
   - Structure Hn modifiée (ajout/suppression/réorganisation de titres)
   - Méta modifiées (title, meta description)
   - Données structurées ajoutées/modifiées/supprimées
   - FAQ ajoutée ou modifiée
   - Éléments UX éditoriaux (tableaux, listes, guides, images)
   - Tout autre changement on-site observable

2. **Hypothèses d'impact SEO** : pour chaque changement détecté, explique pourquoi il a pu influencer positivement le ranking

3. **Tags** : liste de tags parmi les suivants (ou tout autre tag pertinent) :
   content_added, content_removed, structure_changed, meta_title_changed, meta_description_changed, faq_added, structured_data_changed

Cas spécial — Entrée dans le Top 20 :
Si c'est une entrée dans le Top 20 (pas de version précédente disponible), analyse uniquement ce que la page fait de bien pour mériter sa position actuelle.

Format du champ "movement" :
- Pour un gain de position : "+N" (ex: "+4")
- Pour une entrée dans le Top 20 : "NR → X" (ex: "NR → 8")

Contraintes :
- UNIQUEMENT des facteurs on-site observables
- Distingue clairement les changements objectifs des hypothèses
- Cite des éléments concrets

Réponds en JSON array (un objet par mouvement) :
[
  {
    "keyword": "...",
    "country": "...",
    "device": "...",
    "actor": "...",
    "movement": "+4",
    "objective_changes": "### Contenu\\n...\\n### Structure\\n...\\n### Méta\\n...",
    "seo_hypotheses": "1. ...\\n2. ...\\n3. ...",
    "tags": ["content_added", "faq_added"]
  }
]

DONNÉES :
${movementData}`;
}
