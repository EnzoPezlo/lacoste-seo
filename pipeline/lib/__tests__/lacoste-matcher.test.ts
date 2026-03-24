import { describe, it, expect } from 'vitest';
import { tokenize, tokenScore } from '../lacoste-matcher.js';

describe('tokenize', () => {
  it('splits on spaces, slashes, hyphens and lowercases', () => {
    expect(tokenize('polo homme')).toEqual(['polo', 'homme']);
    expect(tokenize('/fr/lacoste/homme/vetements/polos/')).toEqual(['lacoste', 'homme', 'vetement', 'polo']);
  });

  it('strips trailing s for tokens > 3 chars', () => {
    expect(tokenize('polos')).toEqual(['polo']);
    expect(tokenize('bas')).toEqual(['bas']);
  });

  it('removes stopwords', () => {
    expect(tokenize('polo pour homme')).toEqual(['polo', 'homme']);
    expect(tokenize('the best polo for men')).toEqual(['best', 'polo']);
  });

  it('removes tokens shorter than 3 chars', () => {
    expect(tokenize('le polo de homme')).toEqual(['polo', 'homme']);
  });
});

describe('tokenScore', () => {
  it('scores matching tokens', () => {
    expect(tokenScore('polo homme', '/fr/lacoste/homme/vetements/polos/')).toBe(2);
  });

  it('returns 0 for no match', () => {
    expect(tokenScore('sneakers femme', '/fr/lacoste/homme/vetements/polos/')).toBe(0);
  });

  it('handles plurals', () => {
    expect(tokenScore('sneakers homme', '/fr/homme/chaussures/sneakers/')).toBe(2);
  });
});
