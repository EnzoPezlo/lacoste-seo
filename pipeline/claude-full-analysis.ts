/**
 * Claude Full Analysis Script
 *
 * Steps:
 * 1. Classify all SERP results (deterministic domain-based classification)
 * 2. Extract analysis contexts (snapshots + keyword density + structured data)
 * 3. Output context files for Claude to generate analyses
 *
 * Usage: set -a && source .env.local && set +a && npx tsx pipeline/claude-full-analysis.ts
 */
import { createClient } from '@supabase/supabase-js';
import { countKeywordOccurrences } from './lib/keyword-counter.js';
import { countLinks } from './lib/link-counter.js';
import { writeFileSync, mkdirSync } from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const RUN_ID = '864fad8b-ee94-4ade-a4a4-4a877d9c42c1';
const OUTPUT_DIR = 'pipeline/_claude-contexts';

// ─── Domain-based classification ──────────────────────────────────────────────

interface Classification {
  actor: string;
  actor_category: 'brand' | 'marketplace' | 'media' | 'retailer' | 'other';
  page_type: 'product' | 'category' | 'listing' | 'editorial' | 'guide' | 'other';
}

const DOMAIN_MAP: Record<string, Omit<Classification, 'page_type'>> = {
  // Brands
  'www.lacoste.com': { actor: 'Lacoste', actor_category: 'brand' },
  'lacoste.ma': { actor: 'Lacoste Maroc', actor_category: 'brand' },
  'corporate.lacoste.com': { actor: 'Lacoste Corporate', actor_category: 'brand' },
  'www.ralphlauren.com': { actor: 'Ralph Lauren', actor_category: 'brand' },
  'row.burberry.com': { actor: 'Burberry', actor_category: 'brand' },
  'fr.burberry.com': { actor: 'Burberry', actor_category: 'brand' },
  'www.hugo-boss.com': { actor: 'Hugo Boss', actor_category: 'brand' },
  'en.louisvuitton.com': { actor: 'Louis Vuitton', actor_category: 'brand' },
  'us.louisvuitton.com': { actor: 'Louis Vuitton', actor_category: 'brand' },
  'fr.louisvuitton.com': { actor: 'Louis Vuitton', actor_category: 'brand' },
  'www.tomfordfashion.com': { actor: 'Tom Ford', actor_category: 'brand' },
  'www.eden-park.com': { actor: 'Eden Park', actor_category: 'brand' },
  'vicomte-a.com': { actor: 'Vicomte A.', actor_category: 'brand' },
  'www.replayjeans.com': { actor: 'Replay', actor_category: 'brand' },
  'www.jules.com': { actor: 'Jules', actor_category: 'brand' },
  'www.celio.com': { actor: 'Celio', actor_category: 'brand' },
  'jmweston.com': { actor: 'J.M. Weston', actor_category: 'brand' },
  'www.lecoqsportif.com': { actor: 'Le Coq Sportif', actor_category: 'brand' },
  'www.skechers.fr': { actor: 'Skechers', actor_category: 'brand' },
  'www.berluti.com': { actor: 'Berluti', actor_category: 'brand' },
  'www.dunhill.com': { actor: 'Dunhill', actor_category: 'brand' },
  'us.sandro-paris.com': { actor: 'Sandro', actor_category: 'brand' },
  'www.musto.com': { actor: 'Musto', actor_category: 'brand' },
  'southerntide.com': { actor: 'Southern Tide', actor_category: 'brand' },
  'www.elganso.com': { actor: 'El Ganso', actor_category: 'brand' },
  'www.tentree.com': { actor: 'Tentree', actor_category: 'brand' },
  'www.northsails.com': { actor: 'North Sails', actor_category: 'brand' },
  'www.umitbenan.com': { actor: 'Umit Benan', actor_category: 'brand' },
  'www.lancaster.com': { actor: 'Lancaster', actor_category: 'brand' },
  'fr.tommy.com': { actor: 'Tommy Hilfiger', actor_category: 'brand' },
  'www.newbalance.fr': { actor: 'New Balance', actor_category: 'brand' },
  'www.nike.com': { actor: 'Nike', actor_category: 'brand' },
  'www.adidas.fr': { actor: 'Adidas', actor_category: 'brand' },
  'www.puma.com': { actor: 'Puma', actor_category: 'brand' },
  'www.veja-store.com': { actor: 'Veja', actor_category: 'brand' },
  'www.converse.com': { actor: 'Converse', actor_category: 'brand' },
  'boutique.rolandgarros.com': { actor: 'Roland-Garros Boutique', actor_category: 'brand' },
  'www.acanthe-paris.com': { actor: 'Acanthe', actor_category: 'brand' },
  'boutique.asm-rugby.com': { actor: 'ASM Clermont', actor_category: 'brand' },
  'boutique.stadetoulousain.fr': { actor: 'Stade Toulousain', actor_category: 'brand' },

  // Marketplaces
  'www.amazon.fr': { actor: 'Amazon', actor_category: 'marketplace' },
  'www.amazon.com': { actor: 'Amazon', actor_category: 'marketplace' },
  'www.ebay.fr': { actor: 'eBay', actor_category: 'marketplace' },
  'www.ebay.com': { actor: 'eBay', actor_category: 'marketplace' },
  'www.leboncoin.fr': { actor: 'Leboncoin', actor_category: 'marketplace' },
  'www.cdiscount.com': { actor: 'Cdiscount', actor_category: 'marketplace' },
  'www.etsy.com': { actor: 'Etsy', actor_category: 'marketplace' },

  // Retailers
  'www.zalando.fr': { actor: 'Zalando', actor_category: 'retailer' },
  'www.galerieslafayette.com': { actor: 'Galeries Lafayette', actor_category: 'retailer' },
  'www.macys.com': { actor: 'Macy\'s', actor_category: 'retailer' },
  'www.neimanmarcus.com': { actor: 'Neiman Marcus', actor_category: 'retailer' },
  'www.saksfifthavenue.com': { actor: 'Saks Fifth Avenue', actor_category: 'retailer' },
  'www.farfetch.com': { actor: 'Farfetch', actor_category: 'retailer' },
  'www.nordstrom.com': { actor: 'Nordstrom', actor_category: 'retailer' },
  'www.laboutiqueofficielle.com': { actor: 'La Boutique Officielle', actor_category: 'retailer' },
  'www.blackstore.fr': { actor: 'Blackstore', actor_category: 'retailer' },
  'www.decathlon.fr': { actor: 'Decathlon', actor_category: 'retailer' },
  'www.sport2000.fr': { actor: 'Sport 2000', actor_category: 'retailer' },
  'www.intersport.fr': { actor: 'Intersport', actor_category: 'retailer' },
  'www.citadium.com': { actor: 'Citadium', actor_category: 'retailer' },
  'wethenew.com': { actor: 'Wethenew', actor_category: 'retailer' },
  'www.sneakerdistrict.fr': { actor: 'Sneaker District', actor_category: 'retailer' },
  'www.fashiola.fr': { actor: 'Fashiola', actor_category: 'retailer' },

  // Media
  'www.gq.com': { actor: 'GQ', actor_category: 'media' },
  'www.vogue.fr': { actor: 'Vogue', actor_category: 'media' },
  'www.esquire.com': { actor: 'Esquire', actor_category: 'media' },
};

function classifyDomain(domain: string, url: string, title: string): Classification {
  // Check exact domain match
  const mapped = DOMAIN_MAP[domain];
  if (mapped) {
    const pageType = guessPageType(url, title);
    return { ...mapped, page_type: pageType };
  }

  // Fuzzy matching for subdomains/variants
  for (const [knownDomain, info] of Object.entries(DOMAIN_MAP)) {
    if (domain.endsWith(knownDomain.replace('www.', '')) || knownDomain.endsWith(domain.replace('www.', ''))) {
      return { ...info, page_type: guessPageType(url, title) };
    }
  }

  // Fallback: try to extract actor name from domain
  const actor = domain
    .replace(/^www\./, '')
    .replace(/\.(com|fr|co\.uk|de|es|it|eu|net|org|ma)$/, '')
    .replace(/-/g, ' ')
    .split('.')
    .pop()!;

  const actorName = actor.charAt(0).toUpperCase() + actor.slice(1);

  // Guess category from URL patterns
  let category: Classification['actor_category'] = 'other';
  if (url.includes('/blog') || url.includes('/article') || url.includes('/magazine')) {
    category = 'media';
  }

  return {
    actor: actorName,
    actor_category: category,
    page_type: guessPageType(url, title),
  };
}

function guessPageType(url: string, title: string): Classification['page_type'] {
  const lUrl = url.toLowerCase();
  const lTitle = (title || '').toLowerCase();

  // Product detail page indicators
  if (lUrl.match(/\/p\/|\/product\/|\/pdp\/|-p-\d|\/dp\//) ||
      lTitle.match(/^(polo|sacoche|sac|basket|sneaker|veste|jacket)\s/i)) {
    return 'product';
  }

  // Editorial/guide indicators
  if (lUrl.includes('/blog') || lUrl.includes('/article') || lUrl.includes('/guide') ||
      lUrl.includes('/conseil') || lUrl.includes('/best-') || lUrl.includes('/top-') ||
      lTitle.match(/\b(guide|best|top \d|meilleur|comment|how to)\b/i)) {
    return lTitle.match(/\b(guide|best|meilleur|comment|how to)\b/i) ? 'guide' : 'editorial';
  }

  // Category/listing (default for e-commerce URLs)
  if (lUrl.match(/\/c\/|\/categor|\/collection|\/men|\/homme|\/femme|\/women/) ||
      lTitle.match(/(polo|sacoche|sneaker|jacket|sac|baskets?)\s*(homme|femme|men|women)/i) ||
      lTitle.match(/\||\-.*\|/)) {
    return 'category';
  }

  // Listing (search results, filtered views)
  if (lUrl.includes('/search') || lUrl.includes('/s?') || lUrl.includes('/s/')) {
    return 'listing';
  }

  return 'category'; // default for e-commerce SERP results
}

// ─── Structured data summarizer ───────────────────────────────────────────────

function summarizeStructuredData(sd: any): string {
  if (!sd) return '(aucune)';

  try {
    const raw = typeof sd === 'string' ? sd : JSON.stringify(sd);
    const types: Record<string, number> = {};

    // Extract @type occurrences
    const typeMatches = raw.match(/"@type"\s*:\s*"([^"]+)"/g) || [];
    for (const m of typeMatches) {
      const t = m.match(/"@type"\s*:\s*"([^"]+)"/)?.[1];
      if (t) types[t] = (types[t] || 0) + 1;
    }

    if (Object.keys(types).length === 0) return '(aucune)';

    return Object.entries(types)
      .map(([t, c]) => c > 1 ? `${t} x${c}` : t)
      .join(', ');
  } catch {
    return '(erreur parsing)';
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('=== Step 1: Classification ===');

  // Fetch all SERP results
  const { data: serpResults, error: serpError } = await supabase
    .from('serp_results')
    .select('id, keyword_id, position, domain, url, title, snippet, is_lacoste, country, device')
    .eq('run_id', RUN_ID)
    .order('position');

  if (serpError || !serpResults) {
    console.error('Failed to fetch SERP:', serpError?.message);
    process.exit(1);
  }

  console.log(`Classifying ${serpResults.length} results...`);

  // Classify and update in batches
  let classified = 0;
  for (const result of serpResults) {
    const cls = classifyDomain(result.domain, result.url, result.title || '');

    const { error } = await supabase
      .from('serp_results')
      .update({
        actor_name: cls.actor,
        actor_category: cls.actor_category,
        page_type: cls.page_type,
      })
      .eq('id', result.id);

    if (error) {
      console.error(`Failed to update ${result.id}:`, error.message);
    } else {
      classified++;
    }
  }
  console.log(`Classified: ${classified}/${serpResults.length}`);

  // ─── Step 2: Extract contexts ────────────────────────────────────────────
  console.log('\n=== Step 2: Extract analysis contexts ===');

  // Get keywords
  const keywordIds = [...new Set(serpResults.map(r => r.keyword_id))];
  const { data: keywords } = await supabase
    .from('keywords')
    .select('id, keyword, category')
    .in('id', keywordIds);
  const kwMap = new Map(keywords!.map(k => [k.id, k]));

  // Group by keyword_id + country + device
  const groups = new Map<string, typeof serpResults>();
  for (const result of serpResults) {
    const key = `${result.keyword_id}|${result.country}|${result.device}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(result);
  }

  let comboIndex = 0;
  const manifest: Array<{
    index: number;
    keyword: string;
    keyword_id: string;
    country: string;
    device: string;
    lacoste_position: number | null;
    file: string;
  }> = [];

  for (const [key, results] of groups) {
    const [keywordId, country, device] = key.split('|');
    const kw = kwMap.get(keywordId)!;
    const lacostePosResult = results.find(r => r.is_lacoste);

    // Skip if Lacoste is #1
    if (lacostePosResult && lacostePosResult.position === 1) {
      console.log(`Skipping ${kw.keyword}/${country}/${device} — Lacoste #1`);
      continue;
    }

    comboIndex++;
    const lacostePos = lacostePosResult?.position ?? null;

    // ─── Global context (top 10 + Lacoste) ───────────────────────────────
    const top10 = results.filter(r => r.position <= 10 || r.is_lacoste);
    const cls = classifyDomain(results[0].domain, results[0].url, results[0].title || '');

    let globalContext = `=== MOT-CLÉ : ${kw.keyword} | PAYS : ${country} | DEVICE : ${device} | LACOSTE : position ${lacostePos ?? 'absent du top 50'} ===\n\n`;
    const sources: Array<{ position: number; domain: string; actor_name: string; url: string }> = [];

    for (const result of top10) {
      const resultCls = classifyDomain(result.domain, result.url, result.title || '');

      const { data: snapshot } = await supabase
        .from('snapshots')
        .select('markdown_content, head_html, structured_data')
        .eq('run_id', RUN_ID)
        .eq('url', result.url)
        .single();

      const label = result.is_lacoste
        ? `LACOSTE (Position ${result.position}) — ${result.url}`
        : `Position ${result.position} : ${resultCls.actor} [${resultCls.actor_category}] (${result.url})`;

      sources.push({
        position: result.position,
        domain: result.domain,
        actor_name: resultCls.actor,
        url: result.url,
      });

      globalContext += `--- ${label} ---\n`;
      globalContext += `TITLE: ${result.title || '(non disponible)'}\n`;
      globalContext += `SNIPPET: ${result.snippet || '(non disponible)'}\n`;
      globalContext += `ACTOR: ${resultCls.actor} | CATÉGORIE: ${resultCls.actor_category} | PAGE: ${resultCls.page_type}\n`;

      if (snapshot) {
        const md = snapshot.markdown_content?.slice(0, 1500) || '(no content)';
        globalContext += `META HEAD: ${snapshot.head_html?.slice(0, 400) || '(no head)'}\n`;

        const sdSummary = summarizeStructuredData(snapshot.structured_data);
        globalContext += `STRUCTURED DATA: ${sdSummary}\n`;

        if (snapshot.markdown_content) {
          const counts = countKeywordOccurrences(kw.keyword, snapshot.markdown_content);
          globalContext += `KEYWORD DENSITY ("${kw.keyword}"): ${counts.total} occurrences totales, H1=${counts.inH1}, H2=${counts.inH2}, H3=${counts.inH3}, H4=${counts.inH4}, Hn total=${counts.inHeadings}\n`;

          const links = countLinks(snapshot.markdown_content, result.url);
          globalContext += `LINKS: ${links.internal} internes, ${links.external} externes\n`;
        }
        globalContext += `CONTENU MARKDOWN:\n${md}\n\n`;
      } else {
        globalContext += `(snapshot non disponible)\n\n`;
      }
    }

    if (!lacostePosResult) {
      globalContext += `--- LACOSTE : absente du Top 50 pour ce mot-clé ---\n\n`;
    }

    // ─── Deep dive context (top 3 + Lacoste) ─────────────────────────────
    let deepContext = `=== DEEP DIVE — MOT-CLÉ : ${kw.keyword} | PAYS : ${country} | DEVICE : ${device} ===\n\n`;
    const top3 = results.filter(r => r.position <= 3);
    const deepSources: typeof sources = [];

    for (const result of [...top3, ...(lacostePosResult && lacostePosResult.position > 3 ? [lacostePosResult] : [])]) {
      const resultCls = classifyDomain(result.domain, result.url, result.title || '');

      const { data: snapshot } = await supabase
        .from('snapshots')
        .select('markdown_content, head_html, structured_data')
        .eq('run_id', RUN_ID)
        .eq('url', result.url)
        .single();

      deepSources.push({
        position: result.position,
        domain: result.domain,
        actor_name: resultCls.actor,
        url: result.url,
      });

      const label = result.is_lacoste
        ? `LACOSTE (Position ${result.position}) — ${result.url}`
        : `Position ${result.position} : ${resultCls.actor} [${resultCls.actor_category}] (${result.url})`;

      deepContext += `--- ${label} ---\n`;
      deepContext += `TITLE: ${result.title || '(non disponible)'}\n`;
      deepContext += `SNIPPET: ${result.snippet || '(non disponible)'}\n`;

      if (snapshot) {
        const md = snapshot.markdown_content?.slice(0, 3000) || '(no content)';
        deepContext += `META HEAD: ${snapshot.head_html?.slice(0, 600) || '(no head)'}\n`;

        const sdSummary = summarizeStructuredData(snapshot.structured_data);
        globalContext += `STRUCTURED DATA: ${sdSummary}\n`;

        if (snapshot.markdown_content) {
          const counts = countKeywordOccurrences(kw.keyword, snapshot.markdown_content);
          deepContext += `KEYWORD DENSITY ("${kw.keyword}"): ${counts.total} total, H1=${counts.inH1}, H2=${counts.inH2}, H3=${counts.inH3}, H4=${counts.inH4}, Hn=${counts.inHeadings}\n`;

          const links = countLinks(snapshot.markdown_content, result.url);
          deepContext += `LINKS: ${links.internal} internes, ${links.external} externes\n`;
        }
        deepContext += `CONTENU MARKDOWN:\n${md}\n\n`;
      } else {
        deepContext += `(snapshot non disponible)\n\n`;
      }
    }

    // Write context files
    const slug = `${comboIndex}_${kw.keyword.replace(/\s+/g, '_')}_${country}_${device}`;
    writeFileSync(`${OUTPUT_DIR}/${slug}_global.txt`, globalContext, 'utf-8');
    writeFileSync(`${OUTPUT_DIR}/${slug}_deep.txt`, deepContext, 'utf-8');
    writeFileSync(`${OUTPUT_DIR}/${slug}_meta.json`, JSON.stringify({
      keyword: kw.keyword,
      keyword_id: keywordId,
      country,
      device,
      lacoste_position: lacostePos,
      has_lacoste: !!lacostePosResult,
      sources,
      deep_sources: deepSources,
    }, null, 2), 'utf-8');

    manifest.push({
      index: comboIndex,
      keyword: kw.keyword,
      keyword_id: keywordId,
      country,
      device,
      lacoste_position: lacostePos,
      file: slug,
    });

    console.log(`[${comboIndex}] ${kw.keyword} / ${country} / ${device} — Lacoste: ${lacostePos ?? 'absent'}`);
  }

  writeFileSync(`${OUTPUT_DIR}/_manifest.json`, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\n=== Done! ${comboIndex} contexts written to ${OUTPUT_DIR}/ ===`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
