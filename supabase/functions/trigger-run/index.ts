const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const githubPat = Deno.env.get('GITHUB_PAT');
    const githubOwner = Deno.env.get('GITHUB_OWNER');
    const githubRepo = Deno.env.get('GITHUB_REPO');

    if (!githubPat || !githubOwner || !githubRepo) {
      throw new Error('Missing GitHub configuration');
    }

    const response = await fetch(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/pipeline.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubPat}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { run_type: 'manual' },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API error: ${response.status} — ${body}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
