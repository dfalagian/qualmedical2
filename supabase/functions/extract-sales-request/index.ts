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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurado');
    }

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
              type: 'image_url',
              image_url: { url: `data:application/pdf;base64,${base64}` },
            });
            hasContent = true;
          } else if (isImage) {
            contentParts.push({
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
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
                text: `Se adjuntó un archivo "${request.file_name}" de tipo ${mimeType} que no se puede leer como texto.`,
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
        type: 'text',
        text: `Texto proporcionado por el proveedor:\n${request.raw_text}`,
      });
      hasContent = true;
    }

    if (!hasContent) {
      await supabase.from('sales_requests').update({
        extraction_status: 'failed',
        extracted_data: { error: 'No se encontró contenido para analizar' },
      }).eq('id', requestId);

      return new Response(JSON.stringify({ error: 'Sin contenido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Add instruction
    contentParts.unshift({
      type: 'text',
      text: `Analiza el siguiente documento o texto de un proveedor y extrae TODA la información posible.

Responde ÚNICAMENTE con un objeto JSON válido con las siguientes secciones (incluye solo las que apliquen):

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
  "texto_extraido": "Texto completo extraído del documento"
}

Si algún campo no está disponible, omítelo. No inventes datos.`,
    });

    console.log('Enviando a Gemini para extracción...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: 'Eres un experto en análisis de documentos comerciales y fiscales mexicanos. Extraes información estructurada de facturas, listas de productos, cotizaciones y otros documentos. Responde siempre en JSON válido.',
          },
          {
            role: 'user',
            content: contentParts,
          },
        ],
        max_tokens: 4096,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('Error de AI gateway:', aiResponse.status, errText);

      const status = aiResponse.status;
      if (status === 429 || status === 402) {
        await supabase.from('sales_requests').update({
          extraction_status: 'failed',
          extracted_data: { error: status === 429 ? 'Límite de solicitudes excedido' : 'Créditos insuficientes' },
        }).eq('id', requestId);

        return new Response(JSON.stringify({
          error: status === 429 ? 'Rate limit exceeded' : 'Payment required',
        }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content || '';

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
