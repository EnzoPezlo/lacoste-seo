import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      data: null,
    })),
  },
}));

vi.mock('../lib/logger.js', () => ({
  log: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  config: {
    google: { cseKey: 'test-key', cseCx: 'test-cx' },
    supabase: { url: 'http://test', serviceRoleKey: 'test' },
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { collectSerpForKeyword } from '../collect-serp.js';

describe('collectSerpForKeyword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('makes 2 Google API calls (page 1 + page 2) and returns 20 results', async () => {
    const makeItems = (start: number) =>
      Array.from({ length: 10 }, (_, i) => ({
        link: `https://example${start + i}.com/page`,
        displayLink: `example${start + i}.com`,
        title: `Result ${start + i}`,
        snippet: `Snippet ${start + i}`,
      }));

    // Page 1
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: makeItems(1) }),
    });
    // Page 2
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: makeItems(11) }),
    });

    const results = await collectSerpForKeyword('polo shirt', 'US', 'desktop');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(20);
    expect(results[0].position).toBe(1);
    expect(results[19].position).toBe(20);
    expect(results[0].domain).toBe('example1.com');
  });
});
