import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing logger
vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

import { log } from '../logger.js';
import { supabase } from '../supabase.js';

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a log entry into run_logs', async () => {
    const runId = '550e8400-e29b-41d4-a716-446655440000';
    await log(runId, 'serp', 'running', 'Collecting SERP for keyword 1/3');

    expect(supabase.from).toHaveBeenCalledWith('run_logs');
    const insertCall = (supabase.from as any).mock.results[0].value.insert;
    expect(insertCall).toHaveBeenCalledWith({
      run_id: runId,
      step: 'serp',
      status: 'running',
      message: 'Collecting SERP for keyword 1/3',
      details: null,
    });
  });

  it('includes details when provided', async () => {
    const runId = '550e8400-e29b-41d4-a716-446655440000';
    const details = { url: 'https://example.com', error: 'timeout' };
    await log(runId, 'scrape', 'error', 'Failed to scrape', details);

    const insertCall = (supabase.from as any).mock.results[0].value.insert;
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({ details }),
    );
  });
});
