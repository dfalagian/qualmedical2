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
        JSON.stringify({ error: 'Se requiere una imagen o PDF' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isPdf = mimeType === 'application/pdf';
    const effectiveMimeType = mimeType || 'image/jpeg';

    const GEMINI_API_KEY = Deno.env.get('GEMINIKEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINIKEY no estÃ¡ configurado');
    }

    console.log('Extrayendo informaciÃ³n de factura de proveedor...');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: `Eres un experto en anÃ¡lisis de facturas mexicanas (CFDI). Tu trabajo es extraer la informaciÃ³n del EMISOR de la factura (el proveedor que emite la factura, NO el receptor).

Extrae los siguientes campos del EMISOR:
- rfc: RFC del emisor (proveedor)
- razon_social: Nombre o razÃ³n social del emisor
- nombre_comercial: Nombre comercial si es diferente (opcional)
- direccion: DirecciÃ³n fiscal completa
- codigo_postal: CÃ³digo postal (puede aparecer en "Lugar de ExpediciÃ³n")
- telefono: TelÃ©fono si aparece
- email: Email si aparece
- regimen_fiscal: RÃ©gimen fiscal del emisor
- lugar_expedicion: CÃ³digo postal del lugar de expediciÃ³n

IMPORTANTE:
- El EMISOR es quien VENDE/FACTURA (ej: Costco)
- El RECEPTOR es quien COMPRA (ej: QualMedical)
- Extrae SOLO los datos del EMISOR

Responde ÃšNICAMENTE con un objeto JSON vÃ¡lido con los campos encontrados. Si un campo no estÃ¡ presente, omÃ­telo del JSON.` }]
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inline_data: {
                    mime_type: isPdf ? 'application/pdf' : effectiveMimeType,
                    data: imageBase64,
                  }
                },
                {
                  text: isPdf
                    ? 'Analiza este PDF de factura y extrae la informaciÃ³n del EMISOR (proveedor). Responde solo con JSON.'
                    : 'Analiza esta imagen de factura y extrae la informaciÃ³n del EMISOR (proveedor). Responde solo con JSON.'
                }
              ]
            }
          ],
          generationConfig: { maxOutputTokens: 2048 },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error de API:', errorText);
      throw new Error('Error al procesar la imagen con IA');
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

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
          error: 'No se pudo extraer informaciÃ³n de la imagen',
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
