export interface KeywordCounts {
  total: number;
  inHeadings: number;
  inH1: number;
  inH2: number;
  inH3: number;
  inH4: number;
}

export function countKeywordOccurrences(keyword: string, markdown: string): KeywordCounts {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');

  const total = (markdown.match(regex) || []).length;

  const lines = markdown.split('\n');
  const headingLines = lines.filter(line => /^#{1,6}\s/.test(line));
  const inHeadings = (headingLines.join('\n').match(regex) || []).length;

  const countForLevel = (prefix: RegExp): number => {
    const matched = lines.filter(line => prefix.test(line));
    return (matched.join('\n').match(regex) || []).length;
  };

  return {
    total,
    inHeadings,
    inH1: countForLevel(/^#\s/),
    inH2: countForLevel(/^##\s(?!#)/),
    inH3: countForLevel(/^###\s(?!#)/),
    inH4: countForLevel(/^####\s(?!#)/),
  };
}
