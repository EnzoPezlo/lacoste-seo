/**
 * Extract frequent meaningful words from top-1 content that are absent/rare in Lacoste content.
 * Returns up to 10 keywords sorted by relevance.
 */
export function extractTop1Keywords(
  top1Markdown: string,
  lacosteMarkdown: string | null,
  mainKeyword: string,
): string[] {
  const stopWords = new Set([
    'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'au', 'aux',
    'pour', 'par', 'sur', 'avec', 'dans', 'est', 'son', 'ses', 'qui', 'que',
    'ce', 'cette', 'ces', 'nous', 'vous', 'ils', 'elle', 'elles', 'pas', 'plus',
    'tout', 'tous', 'toute', 'toutes', 'bien', 'aussi', 'mais', 'ou',
    'donc', 'car', 'ni', 'ne', 'se', 'si', 'peut', 'comme', 'votre', 'notre',
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'has',
    'you', 'your', 'our', 'all', 'can', 'will', 'not', 'more',
    'http', 'https', 'www', 'com', 'html', 'php', 'jpg', 'png',
  ]);

  const mainKwWords = new Set(mainKeyword.toLowerCase().split(/\s+/));

  function extractWords(text: string): Map<string, number> {
    const counts = new Map<string, number>();
    const clean = text
      .replace(/[#*_\[\](){}|`>]/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .toLowerCase();
    for (const word of clean.split(/\s+/)) {
      if (word.length < 3) continue;
      if (stopWords.has(word)) continue;
      if (/^\d+$/.test(word)) continue;
      if (mainKwWords.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    return counts;
  }

  const top1Words = extractWords(top1Markdown);
  const lacosteWords = lacosteMarkdown ? extractWords(lacosteMarkdown) : new Map<string, number>();

  const suggestions: Array<{ word: string; score: number }> = [];
  for (const [word, count] of top1Words) {
    if (count < 2) continue;
    const lacosteCount = lacosteWords.get(word) || 0;
    if (lacosteCount >= count) continue;
    suggestions.push({ word, score: count - lacosteCount });
  }

  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(s => s.word);
}
