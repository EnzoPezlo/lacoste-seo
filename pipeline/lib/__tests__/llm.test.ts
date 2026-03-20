import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config
vi.mock('../config.js', () => ({
  config: {
    llm: {
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'mistral-small:14b',
      fallbackProvider: 'openai',
      fallbackApiKey: 'sk-test',
      fallbackModel: 'gpt-4.1-mini',
    },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { callLLM } from '../llm.js';

describe('callLLM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Ollama first when available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"result": "ok"}' } }],
      }),
    });

    const result = await callLLM({
      task: 'classify',
      prompt: 'Test prompt',
    });

    expect(result).toBe('{"result": "ok"}');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('localhost:11434');
  });

  it('falls back to cloud when Ollama fails', async () => {
    // Ollama fails
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
    // Cloud succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"result": "fallback"}' } }],
      }),
    });

    const result = await callLLM({
      task: 'classify',
      prompt: 'Test prompt',
    });

    expect(result).toBe('{"result": "fallback"}');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
