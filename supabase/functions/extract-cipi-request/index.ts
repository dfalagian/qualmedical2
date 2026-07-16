import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PROMPT = `Analiza el documento/texto de una solicitud médica (CIPI, CIPI Pro o CEMI) y extrae la información.

IMPORTANTE: Excluye cualquier fila que NO sea un producto real. Las filas que contienen textos informativos como condiciones de pago, métodos de pago, datos bancarios (CLABE, cuenta, banco), notas legales, avisos sobre IVA, honorarios médicos, cláusulas, instrucciones de pago o cualquier texto que no sea un producto médico concreto, NO deben incluirse en el listado. Ejemplos de filas a EXCLUIR: "Los precios ya incluyen IVA en los rubros de servicios e insumos médicos...", "Los métodos de pago son: pago con terminal y transferencia electrónica: BANCOMER...", "La cotización incluye honorarios médicos, preparación, suministro y aplicación de infusión.". Solo incluye filas que representen medicamentos, insumos, soluciones u otros productos médicos concretos con descripción de producto real, cantidad y precio.

MAPEO DE COLUMNAS (CRÍTICO para las cantidades): La tabla tiene, en este orden, las columnas: DESCRIPCION, MARCA, LOTE, "DIAS DE CICLO", UNIDAD, PRECIO UNITARIO, IVA, PRECIO. Hay DOS columnas numéricas seguidas que se confunden con facilidad: "DIAS DE CICLO" (casi siempre un valor fijo, p. ej. 4) y "UNIDAD" (la cantidad real del producto). REGLAS ESTRICTAS:
- El campo "cantidad" se toma SIEMPRE de la columna UNIDAD; NUNCA de "DIAS DE CICLO".
- Ignora por completo el valor de "DIAS DE CICLO"; no lo uses para ningún campo salvo el campo "dias_ciclo".
- Ejemplo: si un renglón muestra los números "4   8", entonces DIAS DE CICLO=4 y la cantidad (UNIDAD) = 8.
- Lee cada renglón de forma ALINEADA horizontalmente. No cruces ni desplaces valores entre filas contiguas: cada cantidad pertenece exactamente a la descripción de su misma fila, respetando el orden en que aparecen.

Responde ÚNICAMENTE con JSON válido:
{
  "datos_encabezado": {
    "empresa": "", "razon_social": "", "rfc": "", "cfdi": "",
    "concepto": "", "folio": "", "fecha_cotizacion": "",
    "fecha_entrega": "", "factura_anterior": "",
    "fecha_ultima_factura": "", "monto_ultima_factura": 0
  },
  "productos": [
    {
      "categoria": "MEDICAMENTOS|ONCOLOGICOS|INMUNOTERAPIA|SOLUCIONES|INSUMOS",
      "descripcion": "", "marca": "", "lote": "", "caducidad": "YYYY-MM-DD",
      "dias_ciclo": 0, "cantidad": 0, "precio_unitario": 0, "iva": 0, "precio": 0
    }
  ],
  "subtotal": 0, "impuestos": 0, "total": 0
}
OBLIGATORIO para cada producto: lee y devuelve AMBAS columnas numéricas de su fila: "dias_ciclo" = valor de la columna "DIAS DE CICLO" (normalmente 4) y "cantidad" = valor de la columna "UNIDAD". Debes reportar los dos números tal como aparecen alineados en el mismo renglón; esto evita que confundas o cruces las cantidades. Nunca dejes "cantidad" igual a "dias_ciclo" por descuido si en el renglón hay dos números distintos.
Los valores como "S/D", "S/N", "N/A", "SIN DATO" o "-" significan que NO hay dato: en esos casos deja el campo vacío u OMÍTELO; nunca los copies como folio ni como ningún otro valor.
Si algún campo no está disponible, omítelo. No inventes datos.`;

Deno.serve(async (req) => {
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

    const { data: request, error: fetchError } = await supabase
      .from('cipi_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !request) {
      return new Response(JSON.stringify({ error: 'Solicitud no encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('cipi_requests').update({ extraction_status: 'processing' }).eq('id', requestId);

    const GEMINI_API_KEY = Deno.env.get('GEMINIKEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINIKEY no está configurado');

    const contentParts: any[] = [];
    let hasContent = false;

    if (request.file_url) {
      try {
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
          const isImage = mimeType.startsWith('image/');
          const isPdf = mimeType.includes('pdf');

          if (isPdf || isImage) {
            contentParts.push({ inline_data: { mime_type: mimeType, data: base64 } });
            hasContent = true;
          }
        }
      } catch (fileErr) {
        console.error('Error procesando archivo:', fileErr);
      }
    }

    if (request.raw_text) {
      contentParts.push({ text: `Texto del usuario:\n${request.raw_text}` });
      hasContent = true;
    }

    if (!hasContent) {
      await supabase.from('cipi_requests').update({
        extraction_status: 'failed',
        extracted_data: { error: 'Sin contenido para analizar' },
      }).eq('id', requestId);
      return new Response(JSON.stringify({ error: 'Sin contenido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    contentParts.unshift({ text: PROMPT });

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: 'Experto en documentos médicos mexicanos. Extrae info estructurada leyendo las tablas con máxima precisión de alineación por fila. Responde siempre en JSON válido.' }],
          },
          contents: [
            { role: 'user', parts: contentParts },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      await supabase.from('cipi_requests').update({
        extraction_status: 'failed',
        extracted_data: { error: status === 429 ? 'Rate limit' : `Error AI: ${status}` },
      }).eq('id', requestId);
      return new Response(JSON.stringify({ error: `AI error: ${status}` }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let extractedData: any = {};
    try {
      const cleanJson = responseContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      extractedData = JSON.parse(cleanJson.trim());
    } catch {
      extractedData = { texto_extraido: responseContent };
    }

    // Guardar partidas. Se borran las previas para evitar duplicados al reprocesar.
    if (extractedData.productos && Array.isArray(extractedData.productos)) {
      const items = extractedData.productos
        .filter((p: any) => {
          const desc = (p.descripcion || '').toLowerCase();
          const isInformational = (
            (!p.precio_unitario || p.precio_unitario === 0) &&
            (!p.precio || p.precio === 0) &&
            (!p.marca || p.marca === '') &&
            desc.length > 100
          );
          const hasPaymentKeywords = /m[eé]todos?\s+de\s+pago|transferencia\s+electr[oó]nica|datos?\s+bancari|clabe|n[uú]mero\s+de\s+cuenta|condiciones\s+de\s+pago/i.test(desc);
          return !isInformational && !hasPaymentKeywords;
        })
        .map((p: any) => ({
          cipi_request_id: requestId,
          categoria: p.categoria || null,
          descripcion: p.descripcion || 'Sin descripción',
          marca: p.marca || null,
          lote: p.lote || null,
          caducidad: p.caducidad || null,
          cantidad: p.cantidad || 1,
          precio_unitario: p.precio_unitario || 0,
          iva: p.iva || 0,
          precio: p.precio || 0,
        }));

      await supabase.from('cipi_request_items').delete().eq('cipi_request_id', requestId);
      if (items.length > 0) {
        await supabase.from('cipi_request_items').insert(items);
      }
    }

    const header = extractedData.datos_encabezado || {};
    await supabase.from('cipi_requests').update({
      extraction_status: 'completed',
      extracted_data: extractedData,
      empresa: header.empresa || request.empresa,
      razon_social: header.razon_social || request.razon_social,
      rfc: header.rfc || request.rfc,
      cfdi: header.cfdi || request.cfdi,
      concepto: header.concepto || request.concepto,
      folio: header.folio || request.folio,
      subtotal: extractedData.subtotal || request.subtotal,
      impuestos: extractedData.impuestos || request.impuestos,
      total: extractedData.total || request.total,
    }).eq('id', requestId);

    return new Response(JSON.stringify({ success: true, extracted: extractedData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Error interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
