import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId } = await req.json();

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'documentId es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Reprocesando documento:', documentId);

    // Obtener el documento de la base de datos
    const { data: document, error: docError } = await supabaseClient
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      console.error('Error obteniendo documento:', docError);
      return new Response(
        JSON.stringify({ error: 'Documento no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar que sea un PDF
    const isPDF = document.file_name?.toLowerCase().endsWith('.pdf') || 
                  document.file_url?.toLowerCase().includes('.pdf');

    if (!isPDF) {
      return new Response(
        JSON.stringify({ error: 'El documento no es un PDF', message: 'Solo se pueden reprocesar documentos PDF' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Marcar como procesando
    await supabaseClient
      .from('documents')
      .update({ extraction_status: 'processing' })
      .eq('id', documentId);

    // Extraer el path del archivo del URL
    let filePath: string;
    if (document.file_url.includes('/documents/')) {
      filePath = document.file_url.split('/documents/')[1];
    } else {
      return new Response(
        JSON.stringify({ error: 'No se pudo determinar la ruta del archivo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Descargando PDF desde:', filePath);

    // Descargar el PDF
    const { data: pdfData, error: downloadError } = await supabaseClient
      .storage
      .from('documents')
      .download(filePath);

    if (downloadError || !pdfData) {
      console.error('Error descargando PDF:', downloadError);
      await supabaseClient
        .from('documents')
        .update({ 
          extraction_status: 'failed',
          validation_errors: ['Error al descargar el archivo PDF']
        })
        .eq('id', documentId);
      
      return new Response(
        JSON.stringify({ error: 'Error descargando el PDF' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convertir PDF a base64 para enviar a la API de Vision
    const pdfArrayBuffer = await pdfData.arrayBuffer();
    const pdfUint8Array = new Uint8Array(pdfArrayBuffer);
    
    let pdfBase64 = '';
    const chunkSize = 8192;
    for (let i = 0; i < pdfUint8Array.length; i += chunkSize) {
      const chunk = pdfUint8Array.subarray(i, Math.min(i + chunkSize, pdfUint8Array.length));
      pdfBase64 += String.fromCharCode(...chunk);
    }
    pdfBase64 = btoa(pdfBase64);

    console.log('PDF descargado y convertido a base64, tamaño:', pdfArrayBuffer.byteLength, 'bytes');

    // Usar Gemini para procesar el PDF directamente (soporta PDFs nativamente)
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurado');
    }

    // Determinar número máximo de páginas según tipo de documento
    const maxPages = document.document_type === 'acta_constitutiva' ? 50 : 20;

    console.log(`Procesando PDF con Gemini Vision (máx ${maxPages} páginas)...`);

    // Llamar a Gemini para extraer información del PDF
    const extractionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `Eres un experto en análisis de documentos legales y fiscales mexicanos. Tu trabajo es:
1. Verificar que el documento sea del tipo correcto: ${document.document_type}
2. Extraer la información relevante del documento
3. Determinar el número total de páginas del documento

Responde SIEMPRE en formato JSON válido.` 
          },
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: `Analiza este documento PDF que debería ser de tipo "${document.document_type}".

Extrae la siguiente información según el tipo de documento:

Para acta_constitutiva:
- razon_social: nombre de la empresa
- representante_legal: nombre del representante
- objeto_social: actividades de la empresa
- registro_publico: datos del registro
- total_pages: número total de páginas

Para constancia_fiscal:
- rfc: RFC del contribuyente
- razon_social: nombre o razón social
- regimen_fiscal: régimen tributario
- actividad_economica: actividades
- codigo_postal: CP del domicilio
- direccion: dirección fiscal
- total_pages: número total de páginas

Para otros documentos, extrae la información relevante disponible.

Responde ÚNICAMENTE con un objeto JSON con los campos encontrados y un campo "is_valid" (boolean) indicando si es un documento válido del tipo esperado.`
              },
              {
                type: 'image_url',
                image_url: { 
                  url: `data:application/pdf;base64,${pdfBase64}` 
                }
              }
            ]
          }
        ],
        max_tokens: 4096,
      }),
    });

    if (!extractionResponse.ok) {
      const errorText = await extractionResponse.text();
      console.error('Error de Gemini:', errorText);
      
      await supabaseClient
        .from('documents')
        .update({ 
          extraction_status: 'failed',
          validation_errors: ['Error al procesar el documento con IA']
        })
        .eq('id', documentId);
      
      return new Response(
        JSON.stringify({ error: 'Error procesando el documento' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const extractionData = await extractionResponse.json();
    const responseContent = extractionData.choices[0]?.message?.content;
    
    console.log('Respuesta de Gemini:', responseContent);

    // Parsear la respuesta JSON
    let extractedInfo: any = {};
    try {
      // Limpiar la respuesta (puede venir con markdown)
      let cleanJson = responseContent;
      if (responseContent.includes('```json')) {
        cleanJson = responseContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (responseContent.includes('```')) {
        cleanJson = responseContent.replace(/```\n?/g, '');
      }
      extractedInfo = JSON.parse(cleanJson.trim());
    } catch (parseError) {
      console.error('Error parseando respuesta:', parseError);
      extractedInfo = { raw_response: responseContent };
    }

    // Actualizar el documento con la información extraída
    const updateData: any = {
      extraction_status: 'completed',
      extracted_at: new Date().toISOString(),
      is_valid: extractedInfo.is_valid !== false,
    };

    // Mapear campos según el tipo de documento
    if (extractedInfo.razon_social) updateData.razon_social = extractedInfo.razon_social;
    if (extractedInfo.representante_legal) updateData.representante_legal = extractedInfo.representante_legal;
    if (extractedInfo.objeto_social) updateData.objeto_social = extractedInfo.objeto_social;
    if (extractedInfo.registro_publico) updateData.registro_publico = extractedInfo.registro_publico;
    if (extractedInfo.rfc) updateData.rfc = extractedInfo.rfc;
    if (extractedInfo.regimen_fiscal) updateData.regimen_fiscal = extractedInfo.regimen_fiscal;
    if (extractedInfo.actividad_economica) updateData.actividad_economica = extractedInfo.actividad_economica;
    if (extractedInfo.codigo_postal) updateData.codigo_postal = extractedInfo.codigo_postal;
    if (extractedInfo.direccion) updateData.direccion = extractedInfo.direccion;

    // Guardar notas de validación si existen
    if (extractedInfo.validation_notes || extractedInfo.notes) {
      updateData.validation_errors = [extractedInfo.validation_notes || extractedInfo.notes];
    }

    console.log('Actualizando documento con:', updateData);

    const { error: updateError } = await supabaseClient
      .from('documents')
      .update(updateData)
      .eq('id', documentId);

    if (updateError) {
      console.error('Error actualizando documento:', updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Documento reprocesado exitosamente',
        extracted: extractedInfo
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en reprocess-pdf-document:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
