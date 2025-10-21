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

    console.log('Obteniendo documento:', documentId);

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

    // Marcar como procesando
    await supabaseClient
      .from('documents')
      .update({ extraction_status: 'processing' })
      .eq('id', documentId);

    console.log('Descargando PDF desde:', document.file_url);

    // Descargar el PDF desde storage
    const { data: fileData, error: downloadError } = await supabaseClient
      .storage
      .from('documents')
      .download(document.file_url.split('/documents/')[1]);

    if (downloadError || !fileData) {
      console.error('Error descargando archivo:', downloadError);
      await supabaseClient
        .from('documents')
        .update({ extraction_status: 'failed' })
        .eq('id', documentId);
      return new Response(
        JSON.stringify({ error: 'Error descargando el archivo' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Archivo descargado, tamaño:', fileData.size);

    // Convertir el PDF a base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    console.log('Llamando a Lovable AI para extraer información');

    // Llamar a Lovable AI para extraer información
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurado');
    }

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
            content: 'Eres un asistente especializado en extraer información de actas constitutivas mexicanas. Extrae la información solicitada de forma precisa y estructurada.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extrae la siguiente información del acta constitutiva: Razón Social, Representante Legal, Objeto Social, y Registro Público. Si algún dato no está disponible, indica "No encontrado".'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${base64Pdf}`
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_acta_info',
              description: 'Extraer información estructurada del acta constitutiva',
              parameters: {
                type: 'object',
                properties: {
                  razon_social: {
                    type: 'string',
                    description: 'Razón social o nombre legal de la empresa'
                  },
                  representante_legal: {
                    type: 'string',
                    description: 'Nombre completo del representante legal'
                  },
                  objeto_social: {
                    type: 'string',
                    description: 'Descripción del objeto social de la empresa'
                  },
                  registro_publico: {
                    type: 'string',
                    description: 'Información del registro público (número, fecha, notaría, etc.)'
                  }
                },
                required: ['razon_social', 'representante_legal', 'objeto_social', 'registro_publico'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_acta_info' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Error de Lovable AI:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        await supabaseClient
          .from('documents')
          .update({ extraction_status: 'failed' })
          .eq('id', documentId);
        return new Response(
          JSON.stringify({ error: 'Límite de solicitudes excedido, intenta más tarde' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        await supabaseClient
          .from('documents')
          .update({ extraction_status: 'failed' })
          .eq('id', documentId);
        return new Response(
          JSON.stringify({ error: 'Créditos de IA agotados' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Error de Lovable AI: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    console.log('Respuesta de IA recibida:', JSON.stringify(aiData));

    // Extraer la información del tool call
    const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error('No se recibió tool call en la respuesta');
      await supabaseClient
        .from('documents')
        .update({ extraction_status: 'failed' })
        .eq('id', documentId);
      return new Response(
        JSON.stringify({ error: 'Error al procesar la respuesta de IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const extractedInfo = JSON.parse(toolCall.function.arguments);
    console.log('Información extraída:', extractedInfo);

    // Actualizar el documento con la información extraída
    const { error: updateError } = await supabaseClient
      .from('documents')
      .update({
        razon_social: extractedInfo.razon_social,
        representante_legal: extractedInfo.representante_legal,
        objeto_social: extractedInfo.objeto_social,
        registro_publico: extractedInfo.registro_publico,
        extraction_status: 'completed',
        extracted_at: new Date().toISOString()
      })
      .eq('id', documentId);

    if (updateError) {
      console.error('Error actualizando documento:', updateError);
      throw updateError;
    }

    console.log('Documento actualizado exitosamente');

    return new Response(
      JSON.stringify({
        success: true,
        extractedInfo
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en extract-document-info:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
