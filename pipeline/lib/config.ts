function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optionalEnv(name: string, fallback: string = ''): string {
  return process.env[name] || fallback;
}

export const config = {
  supabase: {
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },
  google: {
    cseKey: optionalEnv('GOOGLE_CSE_KEY'),
    cseCx: optionalEnv('GOOGLE_CSE_CX'),
  },
  firecrawl: {
    key: optionalEnv('FIRECRAWL_KEY'),
  },
  llm: {
    ollamaUrl: optionalEnv('OLLAMA_URL'),
    ollamaUser: optionalEnv('OLLAMA_USER'),
    ollamaPassword: optionalEnv('OLLAMA_PASSWORD'),
    fallbackProvider: optionalEnv('LLM_FALLBACK_PROVIDER', 'openai'),
    fallbackApiKey: optionalEnv('LLM_FALLBACK_API_KEY'),
    ollamaModel: optionalEnv('OLLAMA_MODEL', 'ministral-3:14b'),
    fallbackModel: optionalEnv('LLM_FALLBACK_MODEL', 'gpt-4.1-mini'),
  },
} as const;
