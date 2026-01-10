import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXTERNAL_FUNCTION_URL = "https://pnlbrgaymruwygauehoq.supabase.co/functions/v1/get-purchase-orders";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const externalApiKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY');

    if (!externalApiKey) {
      console.error('Missing external function API key');
      return new Response(
        JSON.stringify({ error: 'External function credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching purchase orders from external system...');

    const response = await fetch(EXTERNAL_FUNCTION_URL, {
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
    console.log('Successfully fetched purchase orders');

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
