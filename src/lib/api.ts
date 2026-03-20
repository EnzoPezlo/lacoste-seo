const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function callEdgeFunction(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Edge function error');
  }
  return response.json();
}

export async function triggerRun() {
  return callEdgeFunction('trigger-run', {});
}

export async function createKeyword(data: {
  keyword: string;
  category: string;
  countries: string[];
  active?: boolean;
}) {
  return callEdgeFunction('manage-keywords', { action: 'create', ...data });
}

export async function updateKeyword(id: string, data: Record<string, unknown>) {
  return callEdgeFunction('manage-keywords', { action: 'update', id, ...data });
}

export async function deleteKeyword(id: string) {
  return callEdgeFunction('manage-keywords', { action: 'delete', id });
}
