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

    // Parse request body to determine action
    let action = 'GET';
    let requestBody: any = {};
    
    try {
      const bodyText = await req.text();
      if (bodyText) {
        requestBody = JSON.parse(bodyText);
        action = requestBody.action || 'GET';
      }
    } catch {
      // No body or invalid JSON, default to GET
    }

    let url = externalFunctionUrl;
    let fetchMethod = 'GET';
    let body: string | undefined;

    // Handle different actions
    if (action === 'DELETE') {
      const { id } = requestBody;
      if (!id) {
        return new Response(
          JSON.stringify({ error: 'ID is required for delete' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      url = `${externalFunctionUrl}?id=${encodeURIComponent(id)}`;
      fetchMethod = 'DELETE';
      console.log('Deleting medication:', id);
    } else if (action === 'PUT') {
      const { id, ...updateData } = requestBody;
      if (!id) {
        return new Response(
          JSON.stringify({ error: 'ID is required for update' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      body = JSON.stringify({ id, ...updateData });
      fetchMethod = 'PUT';
      console.log('Updating medication:', id);
    } else {
      fetchMethod = 'GET';
      console.log('Fetching medications list');
    }

    console.log(`Calling external edge function [${fetchMethod}]:`, url);

    const fetchOptions: RequestInit = {
      method: fetchMethod,
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
    console.log(`Successfully completed ${fetchMethod} request`);

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
