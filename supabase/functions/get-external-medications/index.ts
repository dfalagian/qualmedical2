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

    const method = req.method;
    let url = externalFunctionUrl;
    let body: string | undefined;

    // Handle different methods
    if (method === 'DELETE') {
      const requestBody = await req.json();
      const { id } = requestBody;
      if (!id) {
        return new Response(
          JSON.stringify({ error: 'ID is required for delete' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      url = `${externalFunctionUrl}?id=${encodeURIComponent(id)}`;
      console.log('Deleting medication:', id);
    } else if (method === 'PUT') {
      const requestBody = await req.json();
      body = JSON.stringify(requestBody);
      console.log('Updating medication:', requestBody.id);
    } else if (method === 'POST') {
      // POST is blocked by external API
      return new Response(
        JSON.stringify({ error: 'POST method is not allowed' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Calling external edge function [${method}]:`, url);

    const fetchOptions: RequestInit = {
      method: method === 'DELETE' ? 'DELETE' : method === 'PUT' ? 'PUT' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': externalApiKey,
      },
    };

    if (body) {
      fetchOptions.body = body;
    }

    const response = await fetch(url, fetchOptions);

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
    console.log(`Successfully completed ${method} request`);

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
