import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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
    const { invoiceId, filePath, fileType } = await req.json();
    console.log('Validando complemento de pago:', { invoiceId, filePath, fileType });

    if (!invoiceId || !filePath) {
      throw new Error('invoiceId y filePath son requeridos');
    }

    // Inicializar Supabase Admin Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Obtener el UUID de la factura desde la base de datos
    console.log('Obteniendo UUID de la factura...');
    const { data: invoiceData, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('uuid, invoice_number')
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoiceData) {
      console.error('Error obteniendo factura:', invoiceError);
      throw new Error('No se pudo obtener la información de la factura');
    }

    const invoiceUUID = invoiceData.uuid;
    console.log('UUID de la factura:', invoiceUUID);

    if (!invoiceUUID) {
      throw new Error('La factura no tiene un UUID registrado. Por favor, verifique que el XML de la factura fue procesado correctamente.');
    }

    // Descargar el archivo del complemento desde Storage
    console.log('Descargando complemento desde storage:', filePath);
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('documents')
      .download(filePath);
    
    if (downloadError || !fileData) {
      throw new Error(`Error descargando archivo: ${downloadError?.message || 'No data'}`);
    }
    
    const fileBuffer = await fileData.arrayBuffer();
    const base64File = base64Encode(fileBuffer);
    
    // Determinar el tipo MIME
    let mimeType = 'image/jpeg';
    if (fileType === 'pdf') {
      mimeType = 'application/pdf';
    } else if (filePath.toLowerCase().endsWith('.png')) {
      mimeType = 'image/png';
    }
    
    const fileDataUrl = `data:${mimeType};base64,${base64File}`;

    console.log('Archivo descargado, tamaño:', fileBuffer.byteLength);
    
    // Llamar a Lovable AI para extraer el UUID del complemento de pago
    console.log('Llamando a Lovable AI para extraer UUID del complemento...');
    
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Este es un Complemento de Pago CFDI mexicano (puede ser imagen o PDF). Necesito que extraigas el UUID del documento fiscal digital relacionado.

**Instrucciones CRÍTICAS:**

1. **Busca el UUID del documento relacionado** - En un complemento de pago CFDI, hay una sección llamada "Documentos Relacionados" o "DoctoRelacionado" que contiene el UUID de la factura que se está pagando.

2. **El UUID tiene formato estándar** - Es una cadena de 36 caracteres con formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (8-4-4-4-12 caracteres hexadecimales separados por guiones).

3. **Ubicaciones comunes del UUID:**
   - En la sección "Documentos Relacionados" o "DoctoRelacionado"
   - Campo "IdDocumento" o "UUID Documento"
   - Puede aparecer como "Folio Fiscal del Documento" o similar
   
4. **NO confundir con:**
   - El UUID del propio complemento (Folio Fiscal del Complemento)
   - El UUID debe ser el del DOCUMENTO RELACIONADO/PAGADO

5. **Extrae también:**
   - El monto pagado en este complemento (campo "ImpPagado" o similar)
   - La fecha de pago si está visible

Por favor, extrae el UUID del documento relacionado (la factura que se está pagando).`
              },
              {
                type: 'image_url',
                image_url: {
                  url: fileDataUrl
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_complement_uuid',
              description: 'Extrae el UUID del documento relacionado desde el complemento de pago CFDI',
              parameters: {
                type: 'object',
                properties: {
                  uuid_documento_relacionado: {
                    type: 'string',
                    description: 'UUID del documento relacionado (factura) en formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx, o null si no se encuentra'
                  },
                  monto_pagado: {
                    type: 'number',
                    description: 'Monto pagado en el complemento, o null si no está visible'
                  },
                  fecha_pago: {
                    type: 'string',
                    description: 'Fecha de pago en formato YYYY-MM-DD, o null si no está visible'
                  },
                  uuid_complemento: {
                    type: 'string',
                    description: 'UUID del propio complemento de pago (si se puede distinguir del documento relacionado), o null'
                  }
                },
                required: ['uuid_documento_relacionado']
              }
            }
          }
        ],
        tool_choice: 'required'
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Error de IA:', errorText);
      throw new Error(`Error llamando a Lovable AI: ${aiResponse.statusText}`);
    }

    const aiData = await aiResponse.json();
    console.log('Respuesta de IA recibida:', JSON.stringify(aiData));

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No se recibió respuesta válida de la IA');
    }

    let extractedInfo;
    try {
      const content = toolCall.function.arguments;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedInfo = JSON.parse(jsonMatch[0]);
      } else {
        extractedInfo = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Error parseando respuesta de AI:', parseError);
      extractedInfo = {
        uuid_documento_relacionado: null,
        monto_pagado: null,
        fecha_pago: null
      };
    }

    console.log('Información extraída del complemento:', extractedInfo);

    const extractedUUID = extractedInfo.uuid_documento_relacionado?.toUpperCase()?.trim();
    const normalizedInvoiceUUID = invoiceUUID.toUpperCase().trim();

    console.log('UUID extraído del complemento:', extractedUUID);
    console.log('UUID de la factura (normalizado):', normalizedInvoiceUUID);

    // Validar que el UUID coincida
    if (!extractedUUID) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'No se pudo extraer el UUID del documento relacionado del complemento de pago. Asegúrese de que el archivo sea legible y contenga un complemento de pago CFDI válido.',
          invoiceUUID: normalizedInvoiceUUID,
          extractedUUID: null,
          extractedInfo
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Comparar UUIDs
    const uuidsMatch = extractedUUID === normalizedInvoiceUUID;

    if (!uuidsMatch) {
      console.warn('⚠️ UUID NO COINCIDE');
      console.warn('UUID Factura:', normalizedInvoiceUUID);
      console.warn('UUID Complemento:', extractedUUID);
      
      return new Response(
        JSON.stringify({
          valid: false,
          error: `El UUID del complemento de pago (${extractedUUID}) NO coincide con el UUID de la factura (${normalizedInvoiceUUID}). Este complemento no corresponde a esta factura.`,
          invoiceUUID: normalizedInvoiceUUID,
          extractedUUID: extractedUUID,
          invoiceNumber: invoiceData.invoice_number,
          extractedInfo
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    console.log('✅ UUID VÁLIDO - El complemento corresponde a la factura');

    return new Response(
      JSON.stringify({
        valid: true,
        message: 'El complemento de pago corresponde correctamente a esta factura.',
        invoiceUUID: normalizedInvoiceUUID,
        extractedUUID: extractedUUID,
        invoiceNumber: invoiceData.invoice_number,
        extractedInfo
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    console.error('Error en validate-payment-complement:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error validando el complemento de pago';
    return new Response(
      JSON.stringify({ 
        valid: false,
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
