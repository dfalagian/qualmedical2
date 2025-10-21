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
    console.log('Tipo de documento:', document.document_type);

    // Llamar a Lovable AI para extraer información
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurado');
    }

    // Configurar el prompt y herramientas según el tipo de documento
    let systemPrompt = '';
    let userPrompt = '';
    let toolConfig: any = null;
    let updateFields: any = {};

    if (document.document_type === 'acta_constitutiva') {
      systemPrompt = 'Eres un asistente especializado en extraer información de actas constitutivas mexicanas. Extrae la información solicitada de forma precisa y estructurada.';
      userPrompt = 'Extrae la siguiente información del acta constitutiva: Razón Social, Representante Legal, Objeto Social, y Registro Público. Si algún dato no está disponible, indica "No encontrado".';
      toolConfig = {
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_acta_info',
              description: 'Extraer información estructurada del acta constitutiva',
              parameters: {
                type: 'object',
                properties: {
                  razon_social: { type: 'string', description: 'Razón social o nombre legal de la empresa' },
                  representante_legal: { type: 'string', description: 'Nombre completo del representante legal' },
                  objeto_social: { type: 'string', description: 'Descripción del objeto social de la empresa' },
                  registro_publico: { type: 'string', description: 'Información del registro público (número, fecha, notaría, etc.)' }
                },
                required: ['razon_social', 'representante_legal', 'objeto_social', 'registro_publico'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_acta_info' } }
      };
    } else if (document.document_type === 'constancia_fiscal') {
      systemPrompt = 'Eres un asistente especializado en extraer información de constancias de situación fiscal mexicanas. Extrae la información solicitada de forma precisa y estructurada.';
      userPrompt = 'Extrae la siguiente información de la constancia de situación fiscal: Razón Social, RFC, Actividad Económica, Régimen Tributario, Dirección del domicilio fiscal, Código Postal, y Fecha de Emisión. Si algún dato no está disponible, indica "No encontrado".';
      toolConfig = {
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_constancia_info',
              description: 'Extraer información estructurada de la constancia de situación fiscal',
              parameters: {
                type: 'object',
                properties: {
                  razon_social: { type: 'string', description: 'Razón social o nombre legal de la empresa' },
                  rfc: { type: 'string', description: 'RFC del contribuyente' },
                  actividad_economica: { type: 'string', description: 'Actividad económica principal' },
                  regimen_tributario: { type: 'string', description: 'Régimen tributario del contribuyente' },
                  direccion: { type: 'string', description: 'Dirección completa del domicilio fiscal' },
                  codigo_postal: { type: 'string', description: 'Código postal del domicilio fiscal (5 dígitos)' },
                  fecha_emision: { type: 'string', description: 'Fecha de emisión de la constancia en formato YYYY-MM-DD' }
                },
                required: ['razon_social', 'rfc', 'actividad_economica', 'regimen_tributario', 'direccion', 'codigo_postal', 'fecha_emision'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_constancia_info' } }
      };
    } else if (document.document_type === 'comprobante_domicilio') {
      systemPrompt = 'Eres un asistente especializado en extraer información de comprobantes de domicilio (recibos de luz, agua, teléfono, predial, etc.). Extrae la información solicitada de forma precisa y estructurada.';
      userPrompt = 'Extrae la siguiente información del comprobante de domicilio: Razón Social o Nombre del titular, RFC (si está disponible), Código Postal, y Fecha de Emisión. Si algún dato no está disponible, indica "No encontrado".';
      toolConfig = {
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_comprobante_domicilio_info',
              description: 'Extraer información estructurada del comprobante de domicilio',
              parameters: {
                type: 'object',
                properties: {
                  razon_social: { type: 'string', description: 'Razón social o nombre del titular del servicio' },
                  rfc: { type: 'string', description: 'RFC del titular (si está disponible en el documento)' },
                  codigo_postal: { type: 'string', description: 'Código postal del domicilio (5 dígitos)' },
                  fecha_emision: { type: 'string', description: 'Fecha de emisión del comprobante en formato YYYY-MM-DD' }
                },
                required: ['razon_social', 'codigo_postal', 'fecha_emision'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_comprobante_domicilio_info' } }
      };
    } else if (document.document_type === 'aviso_funcionamiento') {
      systemPrompt = 'Eres un asistente especializado en extraer información de avisos de funcionamiento mexicanos. Extrae la información solicitada de forma precisa y estructurada.';
      userPrompt = 'Extrae la siguiente información del aviso de funcionamiento: Razón Social de la empresa y la Dirección completa del establecimiento. Si algún dato no está disponible, indica "No encontrado".';
      toolConfig = {
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_aviso_funcionamiento_info',
              description: 'Extraer información estructurada del aviso de funcionamiento',
              parameters: {
                type: 'object',
                properties: {
                  razon_social: { type: 'string', description: 'Razón social o nombre legal de la empresa' },
                  direccion: { type: 'string', description: 'Dirección completa del establecimiento' }
                },
                required: ['razon_social', 'direccion'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_aviso_funcionamiento_info' } }
      };
    } else {
      throw new Error(`Tipo de documento no soportado para extracción: ${document.document_type}`);
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
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: { url: `data:application/pdf;base64,${base64Pdf}` }
              }
            ]
          }
        ],
        ...toolConfig
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

    // Validar información extraída
    const validationErrors: string[] = [];
    let isValid = true;

    // Validaciones de fecha de emisión (constancia fiscal y comprobante domicilio)
    if ((document.document_type === 'constancia_fiscal' || document.document_type === 'comprobante_domicilio') && extractedInfo.fecha_emision) {
      try {
        const fechaEmision = new Date(extractedInfo.fecha_emision);
        const hoy = new Date();
        const tresMesesAtras = new Date();
        tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);

        if (fechaEmision < tresMesesAtras) {
          const tipoDoc = document.document_type === 'constancia_fiscal' ? 'La constancia' : 'El comprobante';
          validationErrors.push(`${tipoDoc} tiene más de 3 meses de antigüedad. Se requiere un documento actualizado.`);
          isValid = false;
        }

        console.log('Validación de fecha:', {
          tipoDocumento: document.document_type,
          fechaEmision: fechaEmision.toISOString(),
          tresMesesAtras: tresMesesAtras.toISOString(),
          esValida: fechaEmision >= tresMesesAtras
        });
      } catch (error) {
        console.error('Error validando fecha:', error);
        validationErrors.push('No se pudo validar la fecha de emisión');
        isValid = false;
      }
    }

    // Preparar campos a actualizar según el tipo de documento
    if (document.document_type === 'acta_constitutiva') {
      updateFields = {
        razon_social: extractedInfo.razon_social,
        representante_legal: extractedInfo.representante_legal,
        objeto_social: extractedInfo.objeto_social,
        registro_publico: extractedInfo.registro_publico,
        extraction_status: 'completed',
        extracted_at: new Date().toISOString(),
        validation_errors: validationErrors,
        is_valid: isValid
      };
    } else if (document.document_type === 'constancia_fiscal') {
      updateFields = {
        razon_social: extractedInfo.razon_social,
        rfc: extractedInfo.rfc,
        actividad_economica: extractedInfo.actividad_economica,
        regimen_tributario: extractedInfo.regimen_tributario,
        direccion: extractedInfo.direccion,
        codigo_postal: extractedInfo.codigo_postal,
        fecha_emision: extractedInfo.fecha_emision,
        extraction_status: 'completed',
        extracted_at: new Date().toISOString(),
        validation_errors: validationErrors,
        is_valid: isValid
      };
    } else if (document.document_type === 'comprobante_domicilio') {
      updateFields = {
        razon_social: extractedInfo.razon_social,
        rfc: extractedInfo.rfc || null,
        codigo_postal: extractedInfo.codigo_postal,
        fecha_emision: extractedInfo.fecha_emision,
        extraction_status: 'completed',
        extracted_at: new Date().toISOString(),
        validation_errors: validationErrors,
        is_valid: isValid
      };
    } else if (document.document_type === 'aviso_funcionamiento') {
      updateFields = {
        razon_social: extractedInfo.razon_social,
        direccion: extractedInfo.direccion,
        extraction_status: 'completed',
        extracted_at: new Date().toISOString(),
        validation_errors: validationErrors,
        is_valid: isValid
      };
    }

    // Actualizar el documento con la información extraída
    const { error: updateError } = await supabaseClient
      .from('documents')
      .update(updateFields)
      .eq('id', documentId);

    if (updateError) {
      console.error('Error actualizando documento:', updateError);
      throw updateError;
    }

    console.log('Documento actualizado exitosamente');

    // Realizar validación cruzada entre constancia_fiscal y comprobante_domicilio
    if (document.document_type === 'constancia_fiscal' || document.document_type === 'comprobante_domicilio') {
      console.log('Iniciando validación cruzada entre constancia fiscal y comprobante domicilio...');
      
      // Obtener todos los documentos del proveedor
      const { data: supplierDocs, error: docsError } = await supabaseClient
        .from('documents')
        .select('id, document_type, rfc, razon_social, codigo_postal, extraction_status')
        .eq('supplier_id', document.supplier_id)
        .in('document_type', ['constancia_fiscal', 'comprobante_domicilio'])
        .eq('extraction_status', 'completed');

      if (!docsError && supplierDocs) {
        const constanciaFiscal = supplierDocs.find(d => d.document_type === 'constancia_fiscal');
        const comprobanteDomicilio = supplierDocs.find(d => d.document_type === 'comprobante_domicilio');

        if (constanciaFiscal && comprobanteDomicilio) {
          console.log('Validando RFC, Razón Social y Código Postal:', {
            constancia: { rfc: constanciaFiscal.rfc, razon_social: constanciaFiscal.razon_social, codigo_postal: constanciaFiscal.codigo_postal },
            comprobante: { rfc: comprobanteDomicilio.rfc, razon_social: comprobanteDomicilio.razon_social, codigo_postal: comprobanteDomicilio.codigo_postal }
          });

          const errors: string[] = [];

          // Validar RFC
          if (constanciaFiscal.rfc && comprobanteDomicilio.rfc && constanciaFiscal.rfc !== comprobanteDomicilio.rfc) {
            errors.push(`El RFC no coincide entre documentos. Constancia: ${constanciaFiscal.rfc}, Comprobante: ${comprobanteDomicilio.rfc}`);
          }

          // Validar Razón Social (normalizar para comparación)
          if (constanciaFiscal.razon_social && comprobanteDomicilio.razon_social) {
            const razonSocialConstancia = constanciaFiscal.razon_social.trim().toLowerCase();
            const razonSocialComprobante = comprobanteDomicilio.razon_social.trim().toLowerCase();
            
            if (razonSocialConstancia !== razonSocialComprobante) {
              errors.push(`La Razón Social no coincide entre documentos. Constancia: "${constanciaFiscal.razon_social}", Comprobante: "${comprobanteDomicilio.razon_social}"`);
            }
          }

          // Validar Código Postal
          if (constanciaFiscal.codigo_postal && comprobanteDomicilio.codigo_postal && constanciaFiscal.codigo_postal !== comprobanteDomicilio.codigo_postal) {
            errors.push(`El Código Postal no coincide entre documentos. Constancia: ${constanciaFiscal.codigo_postal}, Comprobante: ${comprobanteDomicilio.codigo_postal}`);
          }

          if (errors.length > 0) {
            // Hay errores, actualizar ambos documentos
            console.log('Errores de validación encontrados:', errors);
            
            for (const doc of [constanciaFiscal, comprobanteDomicilio]) {
              // Obtener errores actuales y combinar
              const { data: currentDoc } = await supabaseClient
                .from('documents')
                .select('validation_errors')
                .eq('id', doc.id)
                .single();

              const currentErrors = currentDoc?.validation_errors || [];
              // Filtrar errores antiguos de RFC, Razón Social y Código Postal, agregar nuevos
              const filteredErrors = currentErrors.filter(
                (err: string) => !err.includes('RFC no coincide') && !err.includes('Razón Social no coincide') && !err.includes('Código Postal no coincide')
              );
              const combinedErrors = [...filteredErrors, ...errors];

              await supabaseClient
                .from('documents')
                .update({
                  validation_errors: combinedErrors,
                  is_valid: false
                })
                .eq('id', doc.id);
            }
          } else {
            // No hay errores, limpiar errores de RFC, Razón Social y Código Postal
            console.log('RFC, Razón Social y Código Postal coinciden correctamente');
            
            for (const doc of [constanciaFiscal, comprobanteDomicilio]) {
              const { data: currentDoc } = await supabaseClient
                .from('documents')
                .select('validation_errors')
                .eq('id', doc.id)
                .single();

              if (currentDoc && currentDoc.validation_errors) {
                const filteredErrors = currentDoc.validation_errors.filter(
                  (err: string) => !err.includes('RFC no coincide') && !err.includes('Razón Social no coincide') && !err.includes('Código Postal no coincide')
                );
                
                await supabaseClient
                  .from('documents')
                  .update({
                    validation_errors: filteredErrors,
                    is_valid: filteredErrors.length === 0
                  })
                  .eq('id', doc.id);
              }
            }
          }
        }
      }
    }

    // Realizar validación cruzada entre aviso_funcionamiento y constancia_fiscal
    if (document.document_type === 'aviso_funcionamiento' || document.document_type === 'constancia_fiscal') {
      console.log('Iniciando validación cruzada entre aviso de funcionamiento y constancia fiscal...');
      
      // Obtener todos los documentos del proveedor
      const { data: supplierDocs, error: docsError } = await supabaseClient
        .from('documents')
        .select('id, document_type, razon_social, direccion, extraction_status')
        .eq('supplier_id', document.supplier_id)
        .in('document_type', ['constancia_fiscal', 'aviso_funcionamiento'])
        .eq('extraction_status', 'completed');

      if (!docsError && supplierDocs) {
        const constanciaFiscal = supplierDocs.find(d => d.document_type === 'constancia_fiscal');
        const avisoFuncionamiento = supplierDocs.find(d => d.document_type === 'aviso_funcionamiento');

        if (constanciaFiscal && avisoFuncionamiento) {
          console.log('Validando Razón Social y Dirección:', {
            constancia: { razon_social: constanciaFiscal.razon_social, direccion: constanciaFiscal.direccion },
            aviso: { razon_social: avisoFuncionamiento.razon_social, direccion: avisoFuncionamiento.direccion }
          });

          const errors: string[] = [];

          // Validar Razón Social (normalizar para comparación)
          if (constanciaFiscal.razon_social && avisoFuncionamiento.razon_social) {
            const razonSocialConstancia = constanciaFiscal.razon_social.trim().toLowerCase();
            const razonSocialAviso = avisoFuncionamiento.razon_social.trim().toLowerCase();
            
            if (razonSocialConstancia !== razonSocialAviso) {
              errors.push(`La Razón Social no coincide entre documentos. Constancia Fiscal: "${constanciaFiscal.razon_social}", Aviso de Funcionamiento: "${avisoFuncionamiento.razon_social}"`);
            }
          }

          // Validar Dirección (normalizar para comparación)
          if (constanciaFiscal.direccion && avisoFuncionamiento.direccion) {
            const direccionConstancia = constanciaFiscal.direccion.trim().toLowerCase();
            const direccionAviso = avisoFuncionamiento.direccion.trim().toLowerCase();
            
            if (direccionConstancia !== direccionAviso) {
              errors.push(`La Dirección no coincide entre documentos. Constancia Fiscal: "${constanciaFiscal.direccion}", Aviso de Funcionamiento: "${avisoFuncionamiento.direccion}"`);
            }
          }

          if (errors.length > 0) {
            // Hay errores, actualizar ambos documentos
            console.log('Errores de validación encontrados:', errors);
            
            for (const doc of [constanciaFiscal, avisoFuncionamiento]) {
              // Obtener errores actuales y combinar
              const { data: currentDoc } = await supabaseClient
                .from('documents')
                .select('validation_errors')
                .eq('id', doc.id)
                .single();

              const currentErrors = currentDoc?.validation_errors || [];
              // Filtrar errores antiguos entre aviso y constancia, agregar nuevos
              const filteredErrors = currentErrors.filter(
                (err: string) => !err.includes('Razón Social no coincide entre documentos. Constancia Fiscal') && !err.includes('Dirección no coincide entre documentos. Constancia Fiscal')
              );
              const combinedErrors = [...filteredErrors, ...errors];

              await supabaseClient
                .from('documents')
                .update({
                  validation_errors: combinedErrors,
                  is_valid: false
                })
                .eq('id', doc.id);
            }
          } else {
            // No hay errores, limpiar errores de validación entre aviso y constancia
            console.log('Razón Social y Dirección coinciden correctamente');
            
            for (const doc of [constanciaFiscal, avisoFuncionamiento]) {
              const { data: currentDoc } = await supabaseClient
                .from('documents')
                .select('validation_errors')
                .eq('id', doc.id)
                .single();

              if (currentDoc && currentDoc.validation_errors) {
                const filteredErrors = currentDoc.validation_errors.filter(
                  (err: string) => !err.includes('Razón Social no coincide entre documentos. Constancia Fiscal') && !err.includes('Dirección no coincide entre documentos. Constancia Fiscal')
                );
                
                await supabaseClient
                  .from('documents')
                  .update({
                    validation_errors: filteredErrors,
                    is_valid: filteredErrors.length === 0
                  })
                  .eq('id', doc.id);
              }
            }
          }
        }
      }
    }

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
