import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Función auxiliar para generar prompts de validación
function getValidationPrompt(documentType: string): string {
  const prompts: Record<string, string> = {
    'acta_constitutiva': `Analiza esta imagen y determina si es realmente un ACTA CONSTITUTIVA mexicana oficial.

Un acta constitutiva válida debe contener:
- Encabezado de notaría pública
- Datos del notario público
- Razón social de la empresa
- Nombre(s) del representante legal
- Objeto social de la empresa
- Información del registro público
- Sellos y firmas oficiales

NO es válida si es:
- Un ticket de compra
- Una foto casual sin relación
- Un documento diferente (factura, recibo, identificación, etc.)
- Una captura de pantalla o imagen de baja calidad
- Un documento extranjero o no mexicano

Analiza cuidadosamente y responde con honestidad.`,

    'constancia_fiscal': `Analiza esta imagen y determina si es realmente una CONSTANCIA DE SITUACIÓN FISCAL mexicana del SAT.

Una constancia fiscal válida debe contener:
- Logo del SAT (Servicio de Administración Tributaria)
- RFC del contribuyente
- Razón social o nombre
- Régimen fiscal
- Actividades económicas
- Domicilio fiscal registrado
- Código postal
- Fecha de emisión
- Código de barras o QR del SAT

NO es válida si es:
- Un ticket de compra
- Una foto casual sin relación
- Un recibo de servicios
- Una identificación
- Una captura de pantalla de baja calidad
- Un documento que no es del SAT

Analiza cuidadosamente y responde con honestidad.`,

    'comprobante_domicilio': `Analiza esta imagen y determina si es realmente un COMPROBANTE DE DOMICILIO válido (recibo de luz, agua, teléfono, predial, etc.).

Un comprobante de domicilio válido debe contener:
- Logo de la empresa de servicios (CFE, Telmex, gobierno local, etc.)
- Nombre del titular del servicio
- Dirección completa y clara
- Código postal
- Fecha de emisión (no mayor a 3 meses)
- Monto a pagar o pagado
- Número de cuenta o servicio

NO es válido si es:
- Un ticket de compra
- Una foto casual sin relación
- Una identificación
- Una captura de pantalla de baja calidad
- Un documento muy antiguo (más de 3 meses)
- Un documento extranjero

Analiza cuidadosamente y responde con honestidad.`,

    'aviso_funcionamiento': `Analiza esta imagen y determina si es realmente un AVISO DE FUNCIONAMIENTO mexicano oficial.

Un aviso de funcionamiento válido debe contener:
- Encabezado de autoridad sanitaria o gobierno local
- Razón social de la empresa
- Dirección completa del establecimiento
- Datos del responsable sanitario (nombre y CURP)
- Número de registro o folio
- Sellos oficiales
- Fecha de expedición

NO es válido si es:
- Un ticket de compra
- Una foto casual sin relación
- Un documento diferente (factura, recibo, etc.)
- Una captura de pantalla de baja calidad
- Un documento extranjero

Analiza cuidadosamente y responde con honestidad.`,

    'ine': `Analiza esta imagen y determina si es realmente una CREDENCIAL INE (Instituto Nacional Electoral) mexicana oficial.

Una credencial INE válida debe contener:
- Logo del INE
- Fotografía del titular
- Nombre completo del titular
- CURP (18 caracteres)
- Dirección del titular
- Clave de elector
- Elementos de seguridad (hologramas, marcas de agua)
- Vigencia de la credencial

NO es válida si es:
- Una foto casual sin relación
- Una identificación extranjera
- Una licencia de conducir
- Un pasaporte
- Una captura de pantalla de baja calidad
- Una credencial vencida o muy deteriorada
- Un documento diferente

Analiza cuidadosamente y responde con honestidad.`
  };

  return prompts[documentType] || 'Analiza si este documento es válido y del tipo correcto.';
}

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

    console.log('Descargando imagen desde:', document.file_url);

    // Descargar la imagen desde storage
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

    // Detectar tipo de archivo y convertir a imagen base64
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    let base64Image: string;
    
    // Detectar si es un PDF por sus bytes mágicos
    const isPDF = uint8Array[0] === 0x25 && uint8Array[1] === 0x50 && 
                  uint8Array[2] === 0x44 && uint8Array[3] === 0x46; // %PDF
    
    if (isPDF) {
      console.log('Archivo detectado como PDF, convirtiendo a imagen...');
      
      try {
        // Crear archivos temporales
        const tempPdfPath = await Deno.makeTempFile({ suffix: '.pdf' });
        const tempImagePath = await Deno.makeTempFile({ suffix: '.jpg' });
        
        // Escribir el PDF al archivo temporal
        await Deno.writeFile(tempPdfPath, uint8Array);
        console.log('PDF escrito en archivo temporal');
        
        // Usar ImageMagick para convertir la primera página del PDF a imagen
        const command = new Deno.Command("convert", {
          args: [
            "-density", "300",           // Alta resolución
            "-quality", "95",            // Alta calidad JPEG
            `${tempPdfPath}[0]`,        // Solo primera página
            "-flatten",                  // Aplanar capas
            tempImagePath
          ],
        });
        
        const { code, stderr } = await command.output();
        
        if (code !== 0) {
          const errorText = new TextDecoder().decode(stderr);
          console.error('Error ejecutando ImageMagick:', errorText);
          throw new Error('Error convirtiendo PDF a imagen');
        }
        
        console.log('PDF convertido a imagen exitosamente');
        
        // Leer la imagen generada
        const imageData = await Deno.readFile(tempImagePath);
        
        // Convertir a base64
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < imageData.length; i += chunkSize) {
          const chunk = imageData.subarray(i, Math.min(i + chunkSize, imageData.length));
          binary += String.fromCharCode(...chunk);
        }
        base64Image = btoa(binary);
        
        // Limpiar archivos temporales
        try {
          await Deno.remove(tempPdfPath);
          await Deno.remove(tempImagePath);
        } catch (cleanupError) {
          console.warn('Error limpiando archivos temporales:', cleanupError);
        }
        
        console.log('Primera página del PDF extraída y convertida a imagen');
        
      } catch (pdfError) {
        console.error('Error procesando PDF:', pdfError);
        await supabaseClient
          .from('documents')
          .update({ 
            extraction_status: 'failed',
            validation_errors: ['Error al procesar el archivo PDF. Asegúrate de que sea un PDF válido y no esté dañado o corrupto.']
          })
          .eq('id', documentId);
        throw new Error('Error procesando PDF');
      }
    } else {
      // Es una imagen, procesarla directamente
      console.log('Archivo detectado como imagen, procesando...');
      
      // Convertir a base64 en chunks para evitar stack overflow
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
        binary += String.fromCharCode(...chunk);
      }
      base64Image = btoa(binary);
    }

    console.log('Llamando a Lovable AI para extraer información y validar autenticidad');
    console.log('Tipo de documento:', document.document_type);

    // Llamar a Lovable AI para extraer información
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurado');
    }

    // PASO 1: Primero validar que el documento sea legítimo
    console.log('Validando autenticidad del documento con IA...');
    const validationPrompt = getValidationPrompt(document.document_type);
    
    const validationResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: 'Eres un experto en validación de documentos legales y fiscales mexicanos. Tu trabajo es determinar si una imagen contiene el tipo de documento esperado o si es una imagen falsa/irrelevante.' 
          },
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: validationPrompt
              },
              {
                type: 'image_url',
                image_url: { 
                  url: `data:image/jpeg;base64,${base64Image}` 
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'validate_document',
              description: 'Validar si el documento es auténtico y del tipo correcto',
              parameters: {
                type: 'object',
                properties: {
                  is_valid_type: { 
                    type: 'boolean', 
                    description: 'true si el documento es del tipo esperado, false si es una foto random, ticket, o documento no relacionado' 
                  },
                  confidence_score: { 
                    type: 'number', 
                    description: 'Puntuación de confianza de 0 a 100 sobre la autenticidad del documento' 
                  },
                  validation_notes: { 
                    type: 'string', 
                    description: 'Notas sobre por qué el documento es válido o no. Si es inválido, explicar qué se detectó en la imagen.' 
                  },
                  detected_issues: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Lista de problemas específicos detectados (baja calidad, texto ilegible, no es el documento correcto, etc.)'
                  }
                },
                required: ['is_valid_type', 'confidence_score', 'validation_notes', 'detected_issues'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'validate_document' } }
      }),
    });

    if (!validationResponse.ok) {
      const errorText = await validationResponse.text();
      console.error('Error validando documento:', validationResponse.status, errorText);
      
      // Marcar documento como failed antes de lanzar error
      await supabaseClient
        .from('documents')
        .update({ 
          extraction_status: 'failed',
          validation_errors: ['Error procesando el archivo. Asegúrate de subir una imagen clara en formato JPG/PNG o un PDF válido con imágenes legibles.']
        })
        .eq('id', documentId);
      
      throw new Error('Error al validar el documento con IA');
    }

    const validationData = await validationResponse.json();
    const validationCall = validationData.choices[0]?.message?.tool_calls?.[0];
    
    if (!validationCall) {
      throw new Error('No se recibió validación del documento');
    }

    const validationResult = JSON.parse(validationCall.function.arguments);
    console.log('Resultado de validación:', validationResult);

    // Si el documento no es válido, marcarlo y no continuar con la extracción
    if (!validationResult.is_valid_type || validationResult.confidence_score < 50) {
      console.log('Documento rechazado por IA - no es del tipo correcto o confianza baja');
      
      const invalidationErrors = [
        `⚠️ DOCUMENTO SOSPECHOSO: ${validationResult.validation_notes}`,
        ...validationResult.detected_issues.map((issue: string) => `• ${issue}`)
      ];

      await supabaseClient
        .from('documents')
        .update({ 
          extraction_status: 'failed',
          validation_errors: invalidationErrors,
          is_valid: false
        })
        .eq('id', documentId);

      return new Response(
        JSON.stringify({ 
          error: 'Documento no válido',
          validation_errors: invalidationErrors,
          confidence_score: validationResult.confidence_score
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PASO 2: Si el documento pasó la validación, extraer información
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
      userPrompt = 'Extrae la siguiente información del aviso de funcionamiento: Razón Social de la empresa, la Dirección completa del establecimiento, y los Datos del Responsable Sanitario (nombre completo y CURP si está disponible). Si algún dato no está disponible, indica "No encontrado".';
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
                  direccion: { type: 'string', description: 'Dirección completa del establecimiento' },
                  responsable_sanitario_nombre: { type: 'string', description: 'Nombre completo del responsable sanitario' },
                  responsable_sanitario_curp: { type: 'string', description: 'CURP del responsable sanitario (si está disponible)' }
                },
                required: ['razon_social', 'direccion', 'responsable_sanitario_nombre'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_aviso_funcionamiento_info' } }
      };
    } else if (document.document_type === 'ine') {
      systemPrompt = 'Eres un asistente especializado en extraer información de credenciales INE mexicanas. Extrae la información solicitada de forma precisa y estructurada.';
      userPrompt = 'Extrae la siguiente información de la credencial INE: Nombre completo del titular y CURP. Si algún dato no está disponible, indica "No encontrado".';
      toolConfig = {
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_ine_info',
              description: 'Extraer información estructurada de la credencial INE',
              parameters: {
                type: 'object',
                properties: {
                  nombre_completo: { type: 'string', description: 'Nombre completo del titular de la credencial' },
                  curp: { type: 'string', description: 'CURP del titular (18 caracteres)' }
                },
                required: ['nombre_completo', 'curp'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_ine_info' } }
      };
    } else {
      throw new Error(`Tipo de documento no soportado para extracción: ${document.document_type}`);
    }

    // Llamar a Lovable AI para extraer información de la imagen
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
              { 
                type: 'text', 
                text: userPrompt 
              },
              {
                type: 'image_url',
                image_url: { 
                  url: `data:image/jpeg;base64,${base64Image}` 
                }
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
        representante_legal: extractedInfo.responsable_sanitario_nombre,
        rfc: extractedInfo.responsable_sanitario_curp || null,
        extraction_status: 'completed',
        extracted_at: new Date().toISOString(),
        validation_errors: validationErrors,
        is_valid: isValid
      };
    } else if (document.document_type === 'ine') {
      updateFields = {
        nombre_completo_ine: extractedInfo.nombre_completo,
        curp: extractedInfo.curp,
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

    console.log('Documento actualizado exitosamente con confianza:', validationResult.confidence_score);

    // Agregar nota de validación al inicio si hay advertencias
    if (validationResult.detected_issues.length > 0) {
      validationErrors.unshift(`Nivel de confianza: ${validationResult.confidence_score}% - ${validationResult.validation_notes}`);
    }

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

    // Realizar validación cruzada entre INE y aviso_funcionamiento (responsable sanitario)
    if (document.document_type === 'ine' || document.document_type === 'aviso_funcionamiento') {
      console.log('Iniciando validación cruzada entre INE y aviso de funcionamiento...');
      
      // Obtener todos los documentos del proveedor
      const { data: supplierDocs, error: docsError } = await supabaseClient
        .from('documents')
        .select('id, document_type, nombre_completo_ine, curp, representante_legal, rfc, extraction_status')
        .eq('supplier_id', document.supplier_id)
        .in('document_type', ['ine', 'aviso_funcionamiento'])
        .eq('extraction_status', 'completed');

      if (!docsError && supplierDocs) {
        const ine = supplierDocs.find(d => d.document_type === 'ine');
        const avisoFuncionamiento = supplierDocs.find(d => d.document_type === 'aviso_funcionamiento');

        if (ine && avisoFuncionamiento) {
          console.log('Validando Nombre Completo y CURP del Responsable Sanitario:', {
            ine: { nombre_completo: ine.nombre_completo_ine, curp: ine.curp },
            aviso: { responsable_sanitario: avisoFuncionamiento.representante_legal, curp: avisoFuncionamiento.rfc }
          });

          const errors: string[] = [];

          // Validar Nombre Completo (normalizar para comparación)
          if (ine.nombre_completo_ine && avisoFuncionamiento.representante_legal) {
            const nombreINE = ine.nombre_completo_ine.trim().toLowerCase();
            const nombreAviso = avisoFuncionamiento.representante_legal.trim().toLowerCase();
            
            if (nombreINE !== nombreAviso) {
              errors.push(`El Nombre Completo del responsable sanitario no coincide. INE: "${ine.nombre_completo_ine}", Aviso de Funcionamiento: "${avisoFuncionamiento.representante_legal}"`);
            }
          }

          // Validar CURP
          if (ine.curp && avisoFuncionamiento.rfc && ine.curp !== avisoFuncionamiento.rfc) {
            errors.push(`El CURP del responsable sanitario no coincide. INE: ${ine.curp}, Aviso de Funcionamiento: ${avisoFuncionamiento.rfc}`);
          }

          if (errors.length > 0) {
            // Hay errores, actualizar ambos documentos
            console.log('Errores de validación encontrados:', errors);
            
            for (const doc of [ine, avisoFuncionamiento]) {
              // Obtener errores actuales y combinar
              const { data: currentDoc } = await supabaseClient
                .from('documents')
                .select('validation_errors')
                .eq('id', doc.id)
                .single();

              const currentErrors = currentDoc?.validation_errors || [];
              // Filtrar errores antiguos entre INE y aviso, agregar nuevos
              const filteredErrors = currentErrors.filter(
                (err: string) => !err.includes('Nombre Completo del responsable sanitario no coincide') && !err.includes('CURP del responsable sanitario no coincide')
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
            // No hay errores, limpiar errores de validación entre INE y aviso
            console.log('Nombre Completo y CURP del responsable sanitario coinciden correctamente');
            
            for (const doc of [ine, avisoFuncionamiento]) {
              const { data: currentDoc } = await supabaseClient
                .from('documents')
                .select('validation_errors')
                .eq('id', doc.id)
                .single();

              if (currentDoc && currentDoc.validation_errors) {
                const filteredErrors = currentDoc.validation_errors.filter(
                  (err: string) => !err.includes('Nombre Completo del responsable sanitario no coincide') && !err.includes('CURP del responsable sanitario no coincide')
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

    // Obtener el documento actualizado con todos sus errores de validación
    const { data: updatedDoc } = await supabaseClient
      .from('documents')
      .select('validation_errors, is_valid')
      .eq('id', documentId)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        extractedInfo,
        validation_errors: updatedDoc?.validation_errors || [],
        is_valid: updatedDoc?.is_valid ?? true
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en extract-document-info:', error);
    
    // Asegurarnos de marcar el documento como failed en cualquier error no manejado
    try {
      const { documentId: errorDocId } = await req.clone().json();
      if (errorDocId) {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        
        await supabaseClient
          .from('documents')
          .update({ 
            extraction_status: 'failed',
            validation_errors: ['Error procesando el documento. Por favor intenta nuevamente con una imagen clara (JPG/PNG) o un PDF válido.']
          })
          .eq('id', errorDocId);
      }
    } catch (cleanupError) {
      console.error('Error al actualizar estado del documento:', cleanupError);
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
