import { supabase } from './supabase.js';
import { callLLM } from './llm.js';

const STOPWORDS = new Set([
  'de', 'du', 'le', 'la', 'les', 'en', 'pour', 'des', 'un', 'une',
  'the', 'for', 'and', 'men', 'women',
]);

const COUNTRY_TO_LOCALE: Record<string, string> = {
  FR: 'fr', US: 'us', GB: 'gb', DE: 'de', ES: 'es', IT: 'it',
};

/** Tokenize a string: split on spaces/slashes/hyphens, stem, remove stopwords */
export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[\s/\-_]+/)
    .map((t) => t.replace(/[^a-zà-ÿ0-9]/g, ''))
    .filter((t) => t.length >= 3)
    .filter((t) => !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}

/** Score how many tokens a keyword shares with a URL path */
export function tokenScore(keyword: string, urlPath: string): number {
  const kwTokens = new Set(tokenize(keyword));
  const pathTokens = tokenize(urlPath);
  return pathTokens.filter((t) => kwTokens.has(t)).length;
}

/** Find the most relevant Lacoste page for a keyword + country */
export async function findLacostePageForKeyword(
  keyword: string,
  country: string,
): Promise<{ url: string; matchMethod: 'token' | 'llm' } | null> {
  const locale = COUNTRY_TO_LOCALE[country] || 'en';

  // Step 1: Filter by locale
  const { data: pages } = await supabase
    .from('lacoste_pages')
    .select('url, path')
    .eq('locale', locale)
    .is('removed_at', null);

  if (!pages || pages.length === 0) return null;

  // Step 2: Score all pages
  const scored = pages
    .map((p) => ({ url: p.url, path: p.path, score: tokenScore(keyword, p.path) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  // Step 3: Decide if LLM fallback is needed
  const best = scored[0];
  const second = scored[1];

  const needsLLM =
    (best.score < 2 && scored.length > 1) ||
    (second && best.score === second.score && best.score >= 2);

  if (!needsLLM) {
    return { url: best.url, matchMethod: 'token' };
  }

  // Step 4: LLM fallback
  const top10 = scored.slice(0, 10).map((p) => p.url);
  try {
    const response = await callLLM({
      task: 'analyze_gap',
      prompt: `Quel URL correspond le mieux au mot-clé "${keyword}" ?\n\nURLs:\n${top10.join('\n')}\n\nRéponds avec l'URL uniquement, rien d'autre.`,
      temperature: 0.1,
      maxTokens: 200,
    });

    const matchedUrl = response.trim();
    if (top10.includes(matchedUrl)) {
      return { url: matchedUrl, matchMethod: 'llm' };
    }
  } catch (err) {
    console.error('[lacoste-matcher] LLM fallback failed:', (err as Error).message);
  }

  // Fallback to best token match
  return { url: best.url, matchMethod: 'token' };
}
