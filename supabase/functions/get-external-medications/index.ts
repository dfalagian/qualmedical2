import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const externalFunctionUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalApiKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY');

    if (!externalFunctionUrl || !externalApiKey) {
      console.error('Missing external function credentials');
      return new Response(
        JSON.stringify({ error: 'External function credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calling external edge function:', externalFunctionUrl);

    // Call the external edge function directly with x-api-key header
    const response = await fetch(externalFunctionUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': externalApiKey,
      },
    });

    console.log('External function response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('External function error:', errorText);
      return new Response(
        JSON.stringify({ error: `External function error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log(`Successfully fetched data from external function`);

    return new Response(
      JSON.stringify({ data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Unexpected error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
