import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invoiceId, filePath, fileType } = await req.json();
    console.log('Validando complemento de pago:', { invoiceId, filePath, fileType });

    if (!invoiceId || !filePath) {
      throw new Error('invoiceId y filePath son requeridos');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

    console.log('Descargando complemento desde storage:', filePath);
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('documents')
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`Error descargando archivo: ${downloadError?.message || 'No data'}`);
    }

    const fileBuffer = await fileData.arrayBuffer();
    const base64File = base64Encode(fileBuffer);

    let mimeType = 'image/jpeg';
    if (fileType === 'pdf') {
      mimeType = 'application/pdf';
    } else if (filePath.toLowerCase().endsWith('.png')) {
      mimeType = 'image/png';
    }

    console.log('Archivo descargado, tamaño:', fileBuffer.byteLength);

    const GEMINI_API_KEY = Deno.env.get('GEMINIKEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINIKEY no está configurada');
    }

    console.log('Llamando a Gemini para extraer UUID del complemento...');

    const isPdf = mimeType === 'application/pdf';

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: 'Eres un experto en análisis de Complementos de Pago CFDI mexicanos. Extraes información estructurada con precisión.' }]
          },
          tools: [
            {
              functionDeclarations: [
                {
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
              ]
            }
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: 'ANY',
              allowedFunctionNames: ['extract_complement_uuid'],
            }
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inline_data: {
                    mime_type: isPdf ? 'application/pdf' : mimeType,
                    data: base64File,
                  }
                },
                {
                  text: `Este es un Complemento de Pago CFDI mexicano. Necesito que extraigas el UUID del documento fiscal digital relacionado.

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
   - La fecha de pago si está visible`
                }
              ]
            }
          ],
          generationConfig: { maxOutputTokens: 1024 },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Error de Gemini:', errorText);
      throw new Error(`Error llamando a Gemini: ${aiResponse.statusText}`);
    }

    const aiData = await aiResponse.json();
    console.log('Respuesta de Gemini recibida:', JSON.stringify(aiData));

    const parts = aiData.candidates?.[0]?.content?.parts || [];
    const functionCallPart = parts.find((p: any) => p.functionCall);
    if (!functionCallPart) {
      throw new Error('No se recibió respuesta válida de la IA');
    }

    const extractedInfo = functionCallPart.functionCall.args;

    console.log('Información extraída del complemento:', extractedInfo);

    const extractedUUID = extractedInfo.uuid_documento_relacionado?.toUpperCase()?.trim();
    const normalizedInvoiceUUID = invoiceUUID.toUpperCase().trim();

    console.log('UUID extraído del complemento:', extractedUUID);
    console.log('UUID de la factura (normalizado):', normalizedInvoiceUUID);

    if (!extractedUUID) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'No se pudo extraer el UUID del documento relacionado del complemento de pago. Asegúrese de que el archivo sea legible y contenga un complemento de pago CFDI válido.',
          invoiceUUID: normalizedInvoiceUUID,
          extractedUUID: null,
          extractedInfo
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: unknown) {
    console.error('Error en validate-payment-complement:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error validando el complemento de pago';
    return new Response(
      JSON.stringify({ valid: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
