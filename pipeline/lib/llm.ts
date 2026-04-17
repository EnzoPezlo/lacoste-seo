import { config } from './config.js';

export type LLMTask = 'classify' | 'analyze_gap' | 'analyze_movement' | 'deep_dive_top3';

interface CallLLMOptions {
  task: LLMTask;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

interface OpenAICompatibleResponse {
  choices: Array<{ message: { content: string } }>;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
}

async function callOllama(options: CallLLMOptions): Promise<string> {
  const { ollamaUrl, ollamaModel, ollamaUser, ollamaPassword } = config.llm;
  if (!ollamaUrl) throw new Error('OLLAMA_URL not configured');

  const messages = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system' as const, content: options.systemPrompt });
  }
  messages.push({ role: 'user' as const, content: options.prompt });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ollamaUser && ollamaPassword) {
    headers['Authorization'] = `Basic ${btoa(`${ollamaUser}:${ollamaPassword}`)}`;
  }

  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: ollamaModel,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.1,
        num_predict: options.maxTokens ?? 4000,
        num_ctx: config.llm.ollamaNumCtx,
      },
    }),
    signal: AbortSignal.timeout(300_000), // 5 min timeout
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Ollama error: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  return data.message.content;
}

async function callCloudLLM(options: CallLLMOptions): Promise<string> {
  const { fallbackProvider, fallbackApiKey, fallbackModel } = config.llm;
  if (!fallbackApiKey) throw new Error('LLM_FALLBACK_API_KEY not configured');

  // Only OpenAI-compatible providers are supported via this unified path.
  // Anthropic uses a different API format and is NOT supported as a fallback.
  const baseUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    mistral: 'https://api.mistral.ai/v1',
  };

  const baseUrl = baseUrls[fallbackProvider];
  if (!baseUrl) {
    throw new Error(`Unsupported LLM fallback provider: ${fallbackProvider}. Use "openai" or "mistral".`);
  }

  const messages = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system' as const, content: options.systemPrompt });
  }
  messages.push({ role: 'user' as const, content: options.prompt });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${fallbackApiKey}`,
    },
    body: JSON.stringify({
      model: fallbackModel,
      messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 4000,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloud LLM error: ${response.status} — ${body}`);
  }

  const data = (await response.json()) as OpenAICompatibleResponse;
  return data.choices[0].message.content;
}

export async function callLLM(options: CallLLMOptions): Promise<string> {
  // Try Ollama first
  if (config.llm.ollamaUrl) {
    try {
      return await callOllama(options);
    } catch (error) {
      console.warn(
        `[llm] Ollama failed for task "${options.task}": ${(error as Error).message}.`,
      );
      if (!config.llm.fallbackApiKey) {
        throw new Error(`Ollama failed and no fallback LLM configured: ${(error as Error).message}`);
      }
      console.warn('[llm] Falling back to cloud.');
    }
  }

  // Fallback to cloud
  return callCloudLLM(options);
}
