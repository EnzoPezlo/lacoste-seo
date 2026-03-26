import { describe, it, expect } from 'vitest';
import { countKeywordOccurrences } from '../keyword-counter.js';

describe('countKeywordOccurrences', () => {
  it('counts keyword in full text (case-insensitive)', () => {
    const result = countKeywordOccurrences('sacoche homme', 'Découvrez notre collection de Sacoche Homme. La sacoche homme idéale.');
    expect(result.total).toBe(2);
  });

  it('counts keyword in headings (## and ### markdown) but not H1', () => {
    const md = '# Page\n## Sacoche Homme tendance\n### Meilleures sacoche homme\nTexte sans mot-clé.';
    const result = countKeywordOccurrences('sacoche homme', md);
    expect(result.inHeadings).toBe(2);
    expect(result.inH1).toBe(0);
  });

  it('counts keyword in H1 specifically and includes in total', () => {
    const md = '# Sacoche Homme : Guide\n## Autre titre\nContenu sacoche homme.';
    const result = countKeywordOccurrences('sacoche homme', md);
    expect(result.inH1).toBe(1);
    expect(result.total).toBe(2);
  });

  it('returns zero for absent keyword', () => {
    const result = countKeywordOccurrences('sneakers femme', 'Des polos pour homme.');
    expect(result.total).toBe(0);
    expect(result.inHeadings).toBe(0);
    expect(result.inH1).toBe(0);
  });

  it('handles multi-word keywords case-insensitively', () => {
    const result = countKeywordOccurrences('polo lacoste', 'Le Polo Lacoste classique. Un polo lacoste incontournable.');
    expect(result.total).toBe(2);
  });

  it('handles keywords with special regex characters', () => {
    const result = countKeywordOccurrences('polo (homme)', 'Le polo (homme) est populaire.');
    expect(result.total).toBe(1);
  });
});
