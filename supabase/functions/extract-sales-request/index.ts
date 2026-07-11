import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { requestId } = await req.json();
    if (!requestId) {
      return new Response(JSON.stringify({ error: 'requestId es requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the sales request
    const { data: request, error: fetchError } = await supabase
      .from('sales_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !request) {
      return new Response(JSON.stringify({ error: 'Solicitud no encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark as processing
    await supabase
      .from('sales_requests')
      .update({ extraction_status: 'processing' })
      .eq('id', requestId);

    // Build prompt content
    const contentParts: any[] = [];
    let hasContent = false;

    // If there's a file, download and include it
    if (request.file_url) {
      try {
        // Extract path from URL
        let filePath = request.file_url;
        if (filePath.includes('/sales-requests/')) {
          filePath = filePath.split('/sales-requests/')[1];
        }

        const { data: fileData, error: dlError } = await supabase.storage
          .from('sales-requests')
          .download(filePath);

        if (!dlError && fileData) {
          const arrayBuffer = await fileData.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          let base64 = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8.length; i += chunkSize) {
            const chunk = uint8.subarray(i, Math.min(i + chunkSize, uint8.length));
            base64 += String.fromCharCode(...chunk);
          }
          base64 = btoa(base64);

          const mimeType = request.file_type || 'application/octet-stream';
          const isPdf = mimeType.includes('pdf') || request.file_name?.toLowerCase().endsWith('.pdf');
          const isImage = mimeType.startsWith('image/');

          if (isPdf) {
            contentParts.push({
              inline_data: { mime_type: 'application/pdf', data: base64 },
            });
            hasContent = true;
          } else if (isImage) {
            contentParts.push({
              inline_data: { mime_type: mimeType, data: base64 },
            });
            hasContent = true;
          } else {
            // For Word/Excel, try to decode as text; otherwise note the filename
            try {
              const textContent = new TextDecoder().decode(uint8);
              contentParts.push({
                type: 'text',
                text: `Contenido del archivo "${request.file_name}":\n${textContent.substring(0, 10000)}`,
              });
              hasContent = true;
            } catch {
              contentParts.push({
                type: 'text',
                text: `Se adjuntÃ³ un archivo "${request.file_name}" de tipo ${mimeType} que no se puede leer como texto.`,
              });
            }
          }
        }
      } catch (fileErr) {
        console.error('Error procesando archivo:', fileErr);
      }
    }

    // If there's raw text
    if (request.raw_text) {
      contentParts.push({
        text: `Texto proporcionado por el proveedor:\n${request.raw_text}`,
      });
      hasContent = true;
    }

    if (!hasContent) {
      await supabase.from('sales_requests').update({
        extraction_status: 'failed',
        extracted_data: { error: 'No se encontrÃ³ contenido para analizar' },
      }).eq('id', requestId);

      return new Response(JSON.stringify({ error: 'Sin contenido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Add instruction
    contentParts.unshift({
      text: `Analiza el siguiente documento o texto de un proveedor y extrae TODA la informaciÃ³n posible.

Responde ÃšNICAMENTE con un objeto JSON vÃ¡lido con las siguientes secciones (incluye solo las que apliquen):

{
  "tipo_documento": "factura | lista_productos | cotizacion | orden_compra | otro",
  "resumen": "Resumen breve del contenido",
  "datos_fiscales": {
    "emisor_rfc": "",
    "emisor_nombre": "",
    "receptor_rfc": "",
    "receptor_nombre": "",
    "uuid": "",
    "folio": "",
    "fecha_emision": "",
    "subtotal": 0,
    "total": 0,
    "moneda": "",
    "forma_pago": "",
    "metodo_pago": ""
  },
  "productos": [
    {
      "descripcion": "",
      "cantidad": 0,
      "precio_unitario": 0,
      "importe": 0,
      "unidad": ""
    }
  ],
  "texto_extraido": "Texto completo extraÃ­do del documento"
}

Si algÃºn campo no estÃ¡ disponible, omÃ­telo. No inventes datos.`,
    });

    console.log('Enviando a Gemini para extracciÃ³n...');

    const GEMINI_API_KEY = Deno.env.get('GEMINIKEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINIKEY no estÃ¡ configurado');

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: 'Eres un experto en anÃ¡lisis de documentos comerciales y fiscales mexicanos. Extraes informaciÃ³n estructurada de facturas, listas de productos, cotizaciones y otros documentos. Responde siempre en JSON vÃ¡lido.' }]
          },
          contents: [{ role: 'user', parts: contentParts }],
          generationConfig: { maxOutputTokens: 4096 },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('Error de AI gateway:', aiResponse.status, errText);

      const status = aiResponse.status;
      if (status === 429) {
        await supabase.from('sales_requests').update({
          extraction_status: 'failed',
          extracted_data: { error: 'LÃ­mite de solicitudes excedido' },
        }).eq('id', requestId);
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('Respuesta AI recibida, parseando...');

    // Parse JSON from response
    let extractedData: any = {};
    try {
      let cleanJson = responseContent;
      if (cleanJson.includes('```json')) {
        cleanJson = cleanJson.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (cleanJson.includes('```')) {
        cleanJson = cleanJson.replace(/```\n?/g, '');
      }
      extractedData = JSON.parse(cleanJson.trim());
    } catch {
      console.error('Error parseando JSON, guardando como texto');
      extractedData = { texto_extraido: responseContent, resumen: 'No se pudo estructurar la respuesta' };
    }

    // Update the request with extracted data
    await supabase.from('sales_requests').update({
      extraction_status: 'completed',
      extracted_data: extractedData,
    }).eq('id', requestId);

    return new Response(JSON.stringify({ success: true, extracted: extractedData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error en extract-sales-request:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Error interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
