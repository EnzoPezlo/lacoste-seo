import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const { action } = body;

    let result;

    switch (action) {
      case 'create': {
        const { keyword, category, countries, active } = body;
        const { data, error } = await supabase
          .from('keywords')
          .insert({ keyword, category, countries, active: active ?? true })
          .select()
          .single();
        if (error) throw error;
        result = data;
        break;
      }
      case 'update': {
        const { id, action: _, ...fields } = body;
        const { data, error } = await supabase
          .from('keywords')
          .update(fields)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        result = data;
        break;
      }
      case 'delete': {
        const { id } = body;
        const { error } = await supabase.from('keywords').delete().eq('id', id);
        if (error) throw error;
        result = { deleted: true };
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
