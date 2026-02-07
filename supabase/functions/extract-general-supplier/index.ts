import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'Se requiere una imagen' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurado');
    }

    console.log('Extrayendo información de factura de proveedor...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Eres un experto en análisis de facturas mexicanas (CFDI). Tu trabajo es extraer la información del EMISOR de la factura (el proveedor que emite la factura, NO el receptor).

Extrae los siguientes campos del EMISOR:
- rfc: RFC del emisor (proveedor)
- razon_social: Nombre o razón social del emisor
- nombre_comercial: Nombre comercial si es diferente (opcional)
- direccion: Dirección fiscal completa
- codigo_postal: Código postal (puede aparecer en "Lugar de Expedición")
- telefono: Teléfono si aparece
- email: Email si aparece
- regimen_fiscal: Régimen fiscal del emisor
- lugar_expedicion: Código postal del lugar de expedición

IMPORTANTE: 
- El EMISOR es quien VENDE/FACTURA (ej: Costco)
- El RECEPTOR es quien COMPRA (ej: QualMedical)
- Extrae SOLO los datos del EMISOR

Responde ÚNICAMENTE con un objeto JSON válido con los campos encontrados. Si un campo no está presente, omítelo del JSON.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analiza esta factura y extrae la información del EMISOR (proveedor). Responde solo con JSON.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error de API:', errorText);
      throw new Error('Error al procesar la imagen con IA');
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    console.log('Respuesta de IA:', content);

    // Parsear JSON de la respuesta
    let extractedData: Record<string, string> = {};
    try {
      let cleanJson = content;
      if (content.includes('```json')) {
        cleanJson = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (content.includes('```')) {
        cleanJson = content.replace(/```\n?/g, '');
      }
      extractedData = JSON.parse(cleanJson.trim());
    } catch (parseError) {
      console.error('Error parseando respuesta:', parseError);
      return new Response(
        JSON.stringify({ 
          error: 'No se pudo extraer información de la imagen',
          raw_response: content 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en extract-general-supplier:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
