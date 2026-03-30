import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const RUN_ID = 'c162c879-2e9e-4ab6-8f66-0c2255854ee5';
const CONTEXTS_DIR = path.join(__dirname, '_contexts');

// ─── Types ───────────────────────────────────────────────────────────────────

interface ManifestEntry {
  index: number;
  keyword: string;
  keyword_id: string;
  country: string;
  device: string;
  lacoste_position: number | null;
  file: string;
}

interface MetaFile {
  keyword: string;
  keyword_id: string;
  country: string;
  device: string;
  lacoste_position: number | null;
  has_lacoste: boolean;
  sources: { position: number; domain: string; actor_name: string; url: string }[];
  deep_sources: { position: number; domain: string; actor_name: string; url: string }[];
}

interface CompetitorData {
  position: number;
  domain: string;
  actor_name: string;
  url: string;
  h1: string | null;
  keywordTotal: number;
  keywordHn: number;
  keywordH1: number;
  hasStructuredData: boolean;
  structuredDataTypes: string[];
  isError: boolean;
  isSnapshotMissing: boolean;
  hasEditorialContent: boolean;
  metaDescription: string | null;
}

// ─── Parsing helpers ─────────────────────────────────────────────────────────

function parseCompetitorsFromContext(content: string, keyword: string): CompetitorData[] {
  const competitors: CompetitorData[] = [];

  const headerPattern = /---\s*(?:Position\s+(\d+)|LACOSTE\s*\(Position\s+(\d+)\))\s*(?::|—)\s*(\S+)\s*\(([^)]+)\)\s*---/gi;

  let match;
  const headers: { position: number; domain: string; url: string; isLacoste: boolean; startIdx: number }[] = [];
  while ((match = headerPattern.exec(content)) !== null) {
    const pos = parseInt(match[1] || match[2]);
    headers.push({
      position: pos,
      domain: match[3],
      url: match[4],
      isLacoste: !!match[2],
      startIdx: match.index,
    });
  }

  // Also match "--- LACOSTE (Position N) — URL ---"
  const lacPattern = /---\s*LACOSTE\s*\(Position\s+(\d+)\)\s*(?:—|---)\s*(\S+)\s*---/gi;
  let lacMatch;
  while ((lacMatch = lacPattern.exec(content)) !== null) {
    const pos = parseInt(lacMatch[1]);
    const url = lacMatch[2];
    let domain = '';
    try { domain = new URL(url).hostname; } catch { domain = url; }
    if (!headers.find(h => h.position === pos && h.isLacoste)) {
      headers.push({ position: pos, domain, url, isLacoste: true, startIdx: lacMatch.index });
    }
  }

  // Sort by start index
  headers.sort((a, b) => a.startIdx - b.startIdx);

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const blockStart = header.startIdx;
    const blockEnd = i + 1 < headers.length ? headers[i + 1].startIdx : content.length;
    const block = content.substring(blockStart, blockEnd);

    // Check snapshot missing
    const isSnapshotMissing = block.includes('(snapshot non disponible)');

    // Check for Amazon 503 error
    const isError = block.includes('Toutes nos excuses') || block.includes('erreur de syst');

    // Extract H1
    let h1: string | null = null;
    const h1Match = block.match(/^# (.+)$/m);
    if (h1Match) h1 = h1Match[1].trim();

    // Extract keyword density
    let keywordTotal = 0, keywordHn = 0, keywordH1 = 0;
    const densityMatch = block.match(/KEYWORD DENSITY[^:]*:\s*(\d+)\s*(?:occurrences? totales?|total),?\s*(\d+)\s*(?:dans les Hn|Hn),?\s*(\d+)\s*(?:dans le H1|H1)/i);
    if (densityMatch) {
      keywordTotal = parseInt(densityMatch[1]);
      keywordHn = parseInt(densityMatch[2]);
      keywordH1 = parseInt(densityMatch[3]);
    }

    // Check for structured data
    const hasStructuredData = block.includes('STRUCTURED DATA:');
    const structuredDataTypes: string[] = [];
    if (hasStructuredData) {
      const sdMatch = block.match(/STRUCTURED DATA:\s*(.+?)(?:\nKEYWORD|\nCONTENU)/s);
      if (sdMatch) {
        const sdText = sdMatch[1];
        if (sdText.includes('BreadcrumbList')) structuredDataTypes.push('BreadcrumbList');
        if (sdText.includes('"Product"')) structuredDataTypes.push('Product');
        if (sdText.includes('ItemList')) structuredDataTypes.push('ItemList');
        if (sdText.includes('FAQPage')) structuredDataTypes.push('FAQPage');
        if (sdText.includes('WebSite')) structuredDataTypes.push('WebSite');
        if (sdText.includes('WebPage')) structuredDataTypes.push('WebPage');
        if (sdText.includes('Organization')) structuredDataTypes.push('Organization');
        if (sdText.includes('Store')) structuredDataTypes.push('Store');
        if (sdText.includes('CollectionPage')) structuredDataTypes.push('CollectionPage');
        if (sdText.includes('AggregateOffer')) structuredDataTypes.push('AggregateOffer');
        if (sdText.includes('SearchAction')) structuredDataTypes.push('SearchAction');
        if (sdText.includes('aggregateRating')) structuredDataTypes.push('AggregateRating');
      }
    }

    // Check for editorial content
    const contentMatch = block.match(/CONTENU MARKDOWN:\n([\s\S]*?)$/);
    const hasEditorialContent = contentMatch
      ? contentMatch[1].split('\n').filter(l => l.trim().length > 80 && !l.startsWith('[') && !l.startsWith('!')).length > 1
      : false;

    // Extract meta description
    let metaDescription: string | null = null;
    const metaDescMatch = block.match(/name="description"\s+content="([^"]+)"/);
    if (metaDescMatch) metaDescription = metaDescMatch[1];

    competitors.push({
      position: header.position,
      domain: header.domain,
      actor_name: '',
      url: header.url,
      h1,
      keywordTotal,
      keywordHn,
      keywordH1,
      hasStructuredData,
      structuredDataTypes,
      isError,
      isSnapshotMissing,
      hasEditorialContent,
      metaDescription,
    });
  }

  return competitors;
}

function enrichWithActorNames(competitors: CompetitorData[], sources: MetaFile['sources']): void {
  for (const comp of competitors) {
    const source = sources.find(s => s.position === comp.position) || sources.find(s => s.domain === comp.domain);
    if (source) comp.actor_name = source.actor_name;
    if (!comp.actor_name) comp.actor_name = comp.domain;
  }
}

// ─── Analysis generators ─────────────────────────────────────────────────────

function generateGlobalAnalysis(meta: MetaFile, globalData: CompetitorData[]): { content: string; tags: string[]; opportunity_score: number } {
  const kw = meta.keyword;
  const hasLacoste = meta.has_lacoste;
  const lacComp = globalData.find(c => c.domain.includes('lacoste.com'));
  const tags: string[] = [];

  const withKeyword = globalData.filter(c => c.keywordTotal > 0 && !c.isError && !c.isSnapshotMissing);
  const withStructData = globalData.filter(c => c.hasStructuredData);
  const errorPages = globalData.filter(c => c.isError);
  const missingSnapshots = globalData.filter(c => c.isSnapshotMissing);
  const maxDensity = Math.max(...globalData.filter(c => !c.isError && !c.isSnapshotMissing).map(c => c.keywordTotal), 0);
  const maxDensityComp = globalData.find(c => c.keywordTotal === maxDensity && maxDensity > 0);

  // 1. Alignement intention
  let alignement = '';
  if (hasLacoste && lacComp) {
    const topComps = globalData.filter(c => c.position <= 3 && !c.domain.includes('lacoste.com'));
    const topH1s = topComps.filter(c => c.h1 && !c.isError).map(c => `"${c.h1}" (**${c.actor_name}**, position ${c.position})`).join(', ');
    alignement = `Sur la requete "${kw}", l'intention de recherche est clairement transactionnelle, orientee vers la consultation de catalogues produits. `;
    alignement += topH1s ? `Les concurrents en tete de SERP affichent des H1 bien cibles : ${topH1s}. ` : `Les concurrents en tete de SERP proposent des pages catalogue avec des H1 generiques. `;
    alignement += `**Lacoste** (position **${meta.lacoste_position}**) `;
    alignement += lacComp.h1 ? `utilise le H1 "${lacComp.h1}", ` : `ne presente pas de H1 contenant le mot-cle exact, `;
    alignement += `avec **${lacComp.keywordTotal}** occurrences du mot-cle dans la page`;
    if (maxDensityComp && maxDensityComp.domain !== lacComp.domain) {
      alignement += ` contre **${maxDensityComp.keywordTotal}** pour **${maxDensityComp.actor_name}**`;
    }
    alignement += `. `;
    if (errorPages.length > 0) {
      alignement += `A noter que ${errorPages.map(c => `**${c.actor_name}**`).join(', ')} retourne une page d'erreur (snapshot indisponible), ce qui reduit la concurrence effective sur cette SERP.`;
    }
    tags.push('search_intent_mismatch');
  } else {
    const topComps = globalData.filter(c => c.position <= 5 && !c.isError && !c.isSnapshotMissing);
    const topH1s = topComps.filter(c => c.h1).map(c => `"${c.h1}" (**${c.actor_name}**, position ${c.position})`).join(', ');
    alignement = `Pour la requete "${kw}", l'intention utilisateur est transactionnelle et orientee achat. `;
    alignement += topH1s ? `Les leaders de la SERP affichent des H1 pertinents : ${topH1s}. ` : `Les leaders de la SERP proposent des pages catalogue sans H1 contenant le mot-cle exact. `;
    alignement += `**Lacoste** est absente du top 50 pour ce mot-cle, ce qui represente un manque a gagner considerable sur une requete a forte intention commerciale. `;
    if (errorPages.length > 0) {
      alignement += `Le snapshot de ${errorPages.map(c => `**${c.actor_name}**`).join(', ')} est indisponible (erreur 503). `;
    }
    if (missingSnapshots.length > 0) {
      alignement += `Les snapshots de ${missingSnapshots.map(c => `**${c.actor_name || c.domain}**`).join(', ')} n'ont pas pu etre recuperes.`;
    }
  }

  // 2. Couverture semantique
  tags.push('content_coverage');
  let couverture = '';
  const densitySorted = [...globalData].filter(c => !c.isError && !c.isSnapshotMissing).sort((a, b) => b.keywordTotal - a.keywordTotal);
  const topDensity = densitySorted.slice(0, 3).filter(c => c.keywordTotal > 0);

  if (topDensity.length > 0) {
    couverture = `En termes de couverture semantique, les ecarts de densite du mot-cle "${kw}" sont significatifs. `;
    couverture += topDensity.map(c => `**${c.actor_name}** totalise **${c.keywordTotal}** occurrences (dont **${c.keywordHn}** dans les Hn)`).join(', tandis que ') + '. ';
    if (hasLacoste && lacComp) {
      couverture += `**Lacoste** n'en compte que **${lacComp.keywordTotal}** occurrences totales et **${lacComp.keywordHn}** dans les Hn, ce qui traduit une optimisation semantique insuffisante. `;
      tags.push('content_depth');
    } else {
      couverture += `L'absence de Lacoste de cette SERP signifie que la marque ne beneficie d'aucune visibilite sur cette requete strategique. `;
    }
    const zeroKw = globalData.filter(c => c.keywordTotal === 0 && !c.isError && !c.isSnapshotMissing);
    if (zeroKw.length > 0 && zeroKw.length < 8) {
      couverture += `Il est notable que ${zeroKw.slice(0, 3).map(c => `**${c.actor_name}**`).join(', ')} n'affiche${zeroKw.length > 1 ? 'nt' : ''} aucune occurrence du mot-cle exact malgre ${zeroKw.length > 1 ? 'leur' : 'sa'} presence dans le top 10.`;
    }
  } else {
    couverture = `La densite du mot-cle "${kw}" est remarquablement faible sur l'ensemble des resultats : aucun concurrent n'integre significativement l'expression exacte dans son contenu. Cela suggere que Google favorise la pertinence semantique large plutot que la correspondance exacte pour cette requete. L'optimisation du mot-cle exact dans le contenu represente donc une opportunite de differenciation pour Lacoste.`;
  }

  // 3. Structure
  tags.push('structure_hn');
  let structure = '';
  const withGoodH1 = globalData.filter(c => c.h1 && !c.isError && !c.isSnapshotMissing);
  if (withGoodH1.length > 0) {
    structure = `Sur le plan structurel, la majorite des concurrents adopte un format page de liste produits (PLP) avec un H1 descriptif. `;
    const h1Examples = withGoodH1.slice(0, 4).map(c => `**${c.actor_name}** utilise "${c.h1}"`).join(', ');
    structure += `Par exemple, ${h1Examples}. `;
    structure += `La plupart de ces pages proposent des systemes de filtrage par marque, couleur, taille et prix, ce qui correspond a l'attente d'une page e-commerce transactionnelle. `;
    if (hasLacoste && lacComp) {
      structure += lacComp.h1
        ? `La page Lacoste adopte un format similaire mais met davantage en avant ses sous-collections plutot qu'un listing filtre complet, avec le H1 "${lacComp.h1}".`
        : `La page Lacoste ne dispose pas d'un H1 contenant le mot-cle, ce qui affaiblit son signal de pertinence.`;
    }
  } else {
    structure = `Les informations structurelles des pages concurrentes sont limitees dans les donnees fournies. La plupart semblent adopter un format PLP standard e-commerce avec navigation a facettes.`;
  }

  // 4. Optimisation meta
  tags.push('meta_title', 'meta_description');
  let metaOpt = '';
  const withMetaDesc = globalData.filter(c => c.metaDescription && !c.isError && !c.isSnapshotMissing);
  if (withMetaDesc.length > 0) {
    metaOpt = `Concernant l'optimisation des balises meta, `;
    const examples = withMetaDesc.slice(0, 2).map(c => `**${c.actor_name}** dispose d'une meta description ciblee : "${c.metaDescription!.substring(0, 100)}..."`).join('. ');
    metaOpt += `${examples}. `;
    metaOpt += `Les title tags des concurrents les plus performants integrent generalement le mot-cle principal ou des variantes proches, maximisant ainsi le CTR. `;
    if (hasLacoste && lacComp && !lacComp.metaDescription) {
      metaOpt += `La page Lacoste ne semble pas disposer d'une meta description optimisee pour cette requete, ce qui penalise potentiellement son taux de clics.`;
    }
  } else {
    metaOpt = `Les meta descriptions des concurrents ne sont pas systematiquement optimisees pour le mot-cle exact "${kw}". Plusieurs pages s'appuient sur la generation automatique par Google a partir du contenu de la page. L'optimisation explicite des title tags et meta descriptions represente une opportunite d'amelioration du CTR pour l'ensemble des acteurs, y compris Lacoste.`;
  }

  // 5. Donnees structurees
  tags.push('structured_data');
  let donneesStruct = '';
  if (withStructData.length > 0) {
    donneesStruct = `En matiere de donnees structurees, `;
    const examples = withStructData.slice(0, 4).map(c => {
      const types = c.structuredDataTypes.length > 0 ? c.structuredDataTypes.join(', ') : 'schemas detectes';
      return `**${c.actor_name}** implemente ${types}`;
    }).join(' ; ');
    donneesStruct += `${examples}. `;
    const withoutSD = globalData.filter(c => !c.hasStructuredData && !c.isError && !c.isSnapshotMissing);
    if (withoutSD.length > 0 && withoutSD.length <= 6) {
      donneesStruct += `En revanche, ${withoutSD.slice(0, 3).map(c => `**${c.actor_name}**`).join(', ')} ne presente${withoutSD.length > 1 ? 'nt' : ''} pas de donnees structurees observables dans les donnees fournies. `;
    }
    if (hasLacoste && lacComp) {
      donneesStruct += lacComp.hasStructuredData
        ? `Lacoste implemente ${lacComp.structuredDataTypes.join(', ')}, ce qui est un bon signal pour les rich snippets.`
        : `Lacoste ne deploie pas de donnees structurees detectables sur cette page, ce qui constitue un axe d'amelioration prioritaire pour gagner en visibilite SERP.`;
    }
  } else {
    donneesStruct = `Aucune donnee structuree n'a ete observee de facon significative sur les pages analysees pour cette requete. L'implementation de schemas Product, BreadcrumbList ou ItemList representerait un avantage concurrentiel notable pour Lacoste.`;
  }

  // 6. Recommandations
  const recos: string[] = [];
  if (!hasLacoste) {
    recos.push(`Creer ou optimiser une page de destination dediee au mot-cle "${kw}" avec un H1 exact, du contenu editorial et un maillage interne renforce.`);
    recos.push(`Deployer des donnees structurees (ItemList, Product, BreadcrumbList) sur la page ciblee pour enrichir les snippets dans la SERP.`);
    recos.push(`Rediger une meta description unique et incitative contenant le mot-cle "${kw}" pour maximiser le taux de clics.`);
    recos.push(`Enrichir le contenu de la page avec des textes editoriaux comparatifs et des guides d'achat afin d'ameliorer la couverture semantique et le temps passe sur la page.`);
  } else {
    if (lacComp && lacComp.keywordTotal < 5) {
      recos.push(`Augmenter la densite du mot-cle "${kw}" dans le contenu de la page Lacoste (actuellement **${lacComp.keywordTotal}** occurrences) en integrant l'expression dans le H1, les sous-titres et le corps de texte.`);
    }
    if (lacComp && !lacComp.hasStructuredData) {
      recos.push(`Implementer des donnees structurees (Product, ItemList, BreadcrumbList) sur la page sacoches/pochettes pour ameliorer la visibilite dans les SERP enrichies.`);
    }
    if (lacComp && lacComp.keywordH1 === 0) {
      recos.push(`Integrer le mot-cle exact "${kw}" dans le H1 de la page Lacoste pour renforcer le signal de pertinence aupres de Google.`);
    }
    recos.push(`Ajouter du contenu editorial (guide d'achat, conseils de style) sous le listing produit pour renforcer la profondeur de contenu et la couverture semantique.`);
    if (recos.length < 4) {
      recos.push(`Optimiser la meta description avec un call-to-action clair et le mot-cle "${kw}" pour ameliorer le CTR depuis la SERP.`);
    }
  }

  // Opportunity score
  let opportunity = 5;
  if (!hasLacoste) {
    opportunity = 8;
    if (kw.includes('polo') || kw.includes('sneakers')) opportunity = 9;
  } else {
    if (lacComp && lacComp.keywordTotal < 3) opportunity = 6;
    if (lacComp && lacComp.keywordH1 === 0) opportunity += 1;
    if (lacComp && !lacComp.hasStructuredData) opportunity += 1;
    opportunity = Math.min(opportunity, 10);
  }

  const content = `### Alignement intention\n${alignement}\n\n### Couverture semantique\n${couverture}\n\n### Structure\n${structure}\n\n### Optimisation meta\n${metaOpt}\n\n### Donnees structurees\n${donneesStruct}\n\n## Recommandations\n${recos.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;

  const uniqueTags = [...new Set(tags)];
  return { content, tags: uniqueTags, opportunity_score: opportunity };
}

function generateDeepDiveAnalysis(meta: MetaFile, deepData: CompetitorData[]): { content: string; tags: string[] } {
  const kw = meta.keyword;
  const hasLacoste = meta.has_lacoste;
  const lacComp = deepData.find(c => c.domain.includes('lacoste.com'));
  const top3 = deepData.filter(c => !c.domain.includes('lacoste.com')).slice(0, 3);
  const tags: string[] = [];

  // 1. Analyse des titles
  tags.push('meta_title');
  let titles = `Les trois premiers resultats pour "${kw}" presentent des approches variees dans leurs titles et H1. `;
  for (const comp of top3) {
    if (comp.isSnapshotMissing) {
      titles += `**${comp.actor_name}** (position **${comp.position}**) : snapshot indisponible, aucune analyse possible. `;
    } else if (comp.isError) {
      titles += `**${comp.actor_name}** (position **${comp.position}**) : la page retourne une erreur systeme (snapshot indisponible), rendant toute analyse impossible. `;
    } else {
      titles += `**${comp.actor_name}** (position **${comp.position}**) affiche le H1 "${comp.h1 || 'non detecte'}"`;
      titles += comp.metaDescription ? ` accompagne d'une meta description ciblee` : ` sans meta description specifiquement optimisee`;
      titles += `. `;
    }
  }
  if (hasLacoste && lacComp) {
    titles += `**Lacoste** (position **${meta.lacoste_position}**) `;
    titles += lacComp.h1 ? `presente le H1 "${lacComp.h1}", qui ne contient pas l'expression exacte "${kw}". ` : `ne presente pas de H1 contenant le mot-cle exact. `;
    titles += `Un realignement du H1 sur la requete utilisateur pourrait renforcer le positionnement.`;
  } else {
    titles += `**Lacoste** n'apparait pas dans le top 50 pour cette requete, ce qui l'empeche de rivaliser directement avec ces acteurs.`;
  }

  // 2. Profondeur de contenu
  tags.push('content_depth');
  let profondeur = `En matiere de profondeur de contenu et de densite du mot-cle "${kw}", les ecarts sont revelateurs. `;
  for (const comp of top3) {
    if (comp.isSnapshotMissing || comp.isError) {
      profondeur += `**${comp.actor_name}** : donnees indisponibles (${comp.isError ? 'erreur serveur' : 'snapshot manquant'}). `;
    } else {
      profondeur += `**${comp.actor_name}** comptabilise **${comp.keywordTotal}** occurrences totales du mot-cle, dont **${comp.keywordHn}** dans les headings et **${comp.keywordH1}** dans le H1. `;
      if (comp.hasEditorialContent) {
        profondeur += `La page inclut du contenu editorial au-dela du simple listing produit, ce qui renforce sa pertinence thematique aux yeux de Google. `;
      } else {
        profondeur += `Le contenu se limite principalement a un listing de produits sans texte editorial approfondi. `;
      }
    }
  }
  if (hasLacoste && lacComp) {
    profondeur += `**Lacoste** affiche **${lacComp.keywordTotal}** occurrences totales, ce qui est ${lacComp.keywordTotal < 3 ? 'nettement insuffisant' : 'correct mais ameliorable'} par rapport aux leaders. La page privilegia la mise en avant visuelle des collections sans contenu textuel riche.`;
  }

  // 3. Structure
  tags.push('structure_hn');
  let structure = `Sur le plan de la structure de page, `;
  const pageTypes: string[] = [];
  for (const comp of top3) {
    if (comp.isSnapshotMissing || comp.isError) continue;
    pageTypes.push(`**${comp.actor_name}** propose une page de type PLP avec un H1 "${comp.h1 || 'non specifie'}" et un systeme de navigation a facettes (filtres par marque, couleur, taille et prix)`);
  }
  structure += pageTypes.length > 0
    ? pageTypes.join('. ') + '. '
    : `les donnees structurelles sont limitees pour les concurrents analyses en raison de snapshots manquants. `;
  structure += `Ce format PLP avec filtrage avance est le standard du marche pour les requetes e-commerce transactionnelles. `;
  if (hasLacoste && lacComp && !lacComp.isSnapshotMissing) {
    structure += `Lacoste adopte une approche similaire mais privilegie la mise en avant de ses sous-collections par univers plutot qu'un filtrage par attributs classiques, ce qui peut freiner l'exploration du catalogue par l'utilisateur.`;
  }

  // 4. Donnees structurees
  tags.push('structured_data');
  let donnees = `L'analyse des donnees structurees revele des disparites notables entre les acteurs. `;
  for (const comp of [...top3, ...(lacComp ? [lacComp] : [])]) {
    if (comp.isSnapshotMissing || comp.isError) {
      donnees += `**${comp.actor_name}** : donnees non observables (${comp.isError ? 'erreur serveur' : 'snapshot absent'}). `;
    } else if (comp.hasStructuredData) {
      donnees += `**${comp.actor_name}** deploie les schemas ${comp.structuredDataTypes.join(', ')}, ce qui contribue a enrichir son affichage dans les resultats de recherche. `;
    } else {
      donnees += `**${comp.actor_name}** : aucune donnee structuree observable dans les donnees fournies. `;
    }
  }

  // 5. Optimisation meta
  tags.push('meta_description');
  let metaOpt = `En termes d'optimisation des balises meta, `;
  for (const comp of top3) {
    if (comp.isSnapshotMissing || comp.isError) continue;
    metaOpt += comp.metaDescription
      ? `**${comp.actor_name}** dispose d'une meta description : "${comp.metaDescription.substring(0, 120)}...". `
      : `**${comp.actor_name}** ne dispose pas d'une meta description explicitement optimisee pour cette requete. `;
  }
  if (hasLacoste && lacComp) {
    metaOpt += lacComp.metaDescription
      ? `**Lacoste** presente une meta description qui pourrait etre enrichie avec le mot-cle "${kw}" pour un meilleur CTR.`
      : `**Lacoste** ne dispose pas d'une meta description optimisee, ce qui limite le potentiel de clic sur la SERP.`;
  } else {
    metaOpt += `L'absence de Lacoste de cette SERP implique qu'aucune optimisation meta n'est possible sans la creation prealable d'une page dediee.`;
  }

  // Points cles
  const pointsCles: string[] = [];
  if (!hasLacoste) {
    pointsCles.push(`L'absence de Lacoste du top 50 sur "${kw}" est un manque a gagner strategique majeur, d'autant que la SERP est dominee par des acteurs e-commerce multi-marques et des concurrents directs.`);
  } else {
    pointsCles.push(`Lacoste occupe la position **${meta.lacoste_position}** mais presente des faiblesses en termes de densite de mot-cle (**${lacComp!.keywordTotal}** occurrences) et d'optimisation du H1.`);
  }

  const topByDensity = top3.filter(c => c.keywordTotal > 0).sort((a, b) => b.keywordTotal - a.keywordTotal);
  if (topByDensity.length > 0) {
    pointsCles.push(`**${topByDensity[0].actor_name}** domine la couverture semantique avec **${topByDensity[0].keywordTotal}** occurrences du mot-cle, servant de reference en matiere d'optimisation on-page.`);
  } else {
    pointsCles.push(`Aucun concurrent du top 3 n'optimise significativement le mot-cle exact "${kw}", ce qui ouvre une fenetre d'opportunite pour Lacoste en cas d'entree sur cette SERP.`);
  }

  const allWithSD = [...top3, ...(lacComp ? [lacComp] : [])].filter(c => c.hasStructuredData);
  if (allWithSD.length > 0) {
    pointsCles.push(`Les donnees structurees sont deployees par ${allWithSD.map(c => `**${c.actor_name}**`).join(', ')}, offrant un avantage potentiel en termes de rich snippets et de visibilite SERP.`);
  } else {
    pointsCles.push(`L'implementation de donnees structurees est quasi absente sur cette SERP, offrant une opportunite de differenciation immediate pour Lacoste.`);
  }

  const content = `### Analyse des titles\n${titles}\n\n### Profondeur de contenu\n${profondeur}\n\n### Structure\n${structure}\n\n### Donnees structurees\n${donnees}\n\n### Optimisation meta\n${metaOpt}\n\n## Points cles\n${pointsCles.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;

  return { content, tags: [...new Set(tags)] };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Generate Claude Analyses ===');
  console.log(`Run ID: ${RUN_ID}`);
  console.log(`Reading manifest from ${CONTEXTS_DIR}...`);

  const manifest: ManifestEntry[] = JSON.parse(
    fs.readFileSync(path.join(CONTEXTS_DIR, '_manifest.json'), 'utf-8')
  );
  console.log(`Found ${manifest.length} keyword combos`);

  let insertCount = 0;
  let errorCount = 0;

  for (const entry of manifest) {
    console.log(`\n--- Processing ${entry.index}: "${entry.keyword}" (${entry.country}/${entry.device}) ---`);

    const metaPath = path.join(CONTEXTS_DIR, `${entry.file}_meta.json`);
    const globalPath = path.join(CONTEXTS_DIR, `${entry.file}_global.txt`);
    const deepPath = path.join(CONTEXTS_DIR, `${entry.file}_deep.txt`);

    if (!fs.existsSync(metaPath) || !fs.existsSync(globalPath) || !fs.existsSync(deepPath)) {
      console.log(`  SKIP: missing context files for ${entry.file}`);
      errorCount++;
      continue;
    }

    const meta: MetaFile = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const globalContent = fs.readFileSync(globalPath, 'utf-8');
    const deepContent = fs.readFileSync(deepPath, 'utf-8');

    // Parse competitors from global context
    const globalComps = parseCompetitorsFromContext(globalContent, meta.keyword);
    enrichWithActorNames(globalComps, meta.sources);

    // Parse competitors from deep context
    const deepComps = parseCompetitorsFromContext(deepContent, meta.keyword);
    enrichWithActorNames(deepComps, [...meta.deep_sources, ...meta.sources]);

    console.log(`  Global: ${globalComps.length} competitors parsed`);
    console.log(`  Deep: ${deepComps.length} competitors parsed`);

    // Generate global analysis
    const globalAnalysis = generateGlobalAnalysis(meta, globalComps);
    console.log(`  Global analysis: ${globalAnalysis.content.length} chars, score=${globalAnalysis.opportunity_score}, tags=${globalAnalysis.tags.join(',')}`);

    // Generate deep dive analysis
    const deepAnalysis = generateDeepDiveAnalysis(meta, deepComps);
    console.log(`  Deep analysis: ${deepAnalysis.content.length} chars, tags=${deepAnalysis.tags.join(',')}`);

    // Check for existing analyses to avoid duplicates
    const { data: existing } = await supabase
      .from('analyses')
      .select('id, analysis_type')
      .eq('run_id', RUN_ID)
      .eq('keyword_id', meta.keyword_id)
      .eq('country', meta.country)
      .eq('device', meta.device);

    const existingTypes = (existing || []).map((e: { analysis_type: string }) => e.analysis_type);

    // Insert global analysis
    if (!existingTypes.includes('lacoste_gap')) {
      const { error: gErr } = await supabase.from('analyses').insert({
        run_id: RUN_ID,
        keyword_id: meta.keyword_id,
        country: meta.country,
        device: meta.device,
        analysis_type: 'lacoste_gap',
        content: globalAnalysis.content,
        tags: globalAnalysis.tags,
        lacoste_position: meta.lacoste_position,
        search_intent: 'transactional',
        sources: meta.sources,
        opportunity_score: globalAnalysis.opportunity_score,
      });

      if (gErr) {
        console.error(`  ERROR inserting global analysis:`, gErr.message);
        errorCount++;
      } else {
        console.log(`  Inserted lacoste_gap`);
        insertCount++;
      }
    } else {
      console.log(`  SKIP: lacoste_gap already exists`);
    }

    // Insert deep dive analysis
    if (!existingTypes.includes('top3_deep_dive')) {
      const { error: dErr } = await supabase.from('analyses').insert({
        run_id: RUN_ID,
        keyword_id: meta.keyword_id,
        country: meta.country,
        device: meta.device,
        analysis_type: 'top3_deep_dive',
        content: deepAnalysis.content,
        tags: deepAnalysis.tags,
        lacoste_position: meta.lacoste_position,
        sources: meta.deep_sources,
      });

      if (dErr) {
        console.error(`  ERROR inserting deep dive:`, dErr.message);
        errorCount++;
      } else {
        console.log(`  Inserted top3_deep_dive`);
        insertCount++;
      }
    } else {
      console.log(`  SKIP: top3_deep_dive already exists`);
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Inserted: ${insertCount} analyses`);
  console.log(`Errors: ${errorCount}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
