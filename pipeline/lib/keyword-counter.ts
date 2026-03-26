export interface KeywordCounts {
  total: number;
  inHeadings: number;
  inH1: number;
}

export function countKeywordOccurrences(keyword: string, markdown: string): KeywordCounts {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');

  const total = (markdown.match(regex) || []).length;

  const headingLines = markdown.split('\n').filter(line => /^#{1,6}\s/.test(line));
  const headingText = headingLines.join('\n');
  const inHeadings = (headingText.match(regex) || []).length;

  const h1Lines = markdown.split('\n').filter(line => /^#\s/.test(line));
  const h1Text = h1Lines.join('\n');
  const inH1 = (h1Text.match(regex) || []).length;

  return { total, inHeadings, inH1 };
}
