import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Función auxiliar para generar prompts de validación
function getValidationPrompt(documentType: string): string {
  const prompts: Record<string, string> = {
    'acta_constitutiva': `Analiza esta imagen y determina si contiene información de un ACTA CONSTITUTIVA mexicana.

IMPORTANTE: Puede ser una página parcial o fragmento del acta. Solo necesitamos verificar que contenga AL MENOS UNO de estos datos:
- Razón social de la empresa
- Nombre del representante legal
- Objeto social (actividades de la empresa)
- Información del registro público

✅ ES VÁLIDA si la imagen contiene texto relacionado con constitución de sociedad y al menos uno de los datos anteriores.

❌ NO es válida SOLO si es:
- Un ticket de compra o recibo común
- Una foto casual sin relación con documentos legales
- Una identificación personal (INE, pasaporte)
- Una factura o comprobante fiscal

Sé flexible: el documento puede estar incompleto, ser una página interna, o no tener todos los elementos formales (sellos, firmas). Lo importante es que contenga datos del acta constitutiva.`,

    'constancia_fiscal': `Analiza esta imagen y determina si contiene información de una CONSTANCIA DE SITUACIÓN FISCAL del SAT.

Solo necesitamos verificar que contenga ALGUNOS de estos datos:
- RFC del contribuyente
- Razón social o nombre
- Régimen fiscal
- Actividades económicas
- Domicilio fiscal
- Código postal
- Fecha de emisión

✅ ES VÁLIDA si la imagen contiene información fiscal del SAT y al menos 3 de los datos anteriores.

❌ NO es válida SOLO si es:
- Un ticket de compra común
- Una foto casual sin documentos
- Una identificación personal (INE)
- Un recibo de servicios básicos

No importa si falta el logo, código de barras, o si la calidad no es perfecta. Lo importante es que contenga datos fiscales.`,

    'comprobante_domicilio': `Analiza esta imagen y determina si contiene información de un COMPROBANTE DE DOMICILIO (recibo de luz, agua, teléfono, predial, etc.).

Solo necesitamos verificar que contenga estos datos básicos:
- Nombre del titular o razón social
- Dirección
- Código postal
- Fecha de emisión

✅ ES VÁLIDO si la imagen contiene información de un recibo de servicios (CFE, agua, teléfono, predial, etc.) con los datos anteriores.

❌ NO es válido SOLO si es:
- Un ticket de compra en tienda
- Una foto casual sin documentos
- Una identificación personal

IMPORTANTE: Ignora completamente advertencias como "ESTE DOCUMENTO NO ES UN COMPROBANTE FISCAL" - eso NO importa. Solo nos interesa que contenga los datos de domicilio necesarios. La fecha puede ser de cualquier momento, no hay límite de 3 meses.`,

    'aviso_funcionamiento': `Analiza esta imagen y determina si contiene información de un AVISO DE FUNCIONAMIENTO mexicano.

Solo necesitamos verificar que contenga ALGUNOS de estos datos:
- Razón social de la empresa
- Domicilio del establecimiento
- Actividad económica
- Fecha de emisión

✅ ES VÁLIDO si la imagen contiene información relacionada con aviso de funcionamiento sanitario y al menos 2 de los datos anteriores. Puede ser una página completa o un fragmento, con o sin sellos oficiales.

❌ NO es válido SOLO si es:
- Un ticket de compra común
- Una foto casual sin documentos
- Una factura o recibo de servicios
- Una identificación personal

No importa si es página principal o interna, con o sin sellos. Lo importante es que contenga datos del aviso de funcionamiento.`,

    'ine': `Analiza esta imagen y determina si contiene información de una CREDENCIAL INE mexicana.

Solo necesitamos verificar que contenga ALGUNOS de estos datos:
- Fotografía del titular
- Nombre completo del titular
- CURP (18 caracteres)
- Clave de elector

✅ ES VÁLIDA si la imagen muestra una credencial del INE (frente o reverso) con al menos 2 de los datos anteriores.

❌ NO es válida SOLO si es:
- Una foto casual sin documentos
- Una identificación extranjera
- Una licencia de conducir
- Un pasaporte
- Otro tipo de documento

No importa si está vencida, deteriorada, o sin hologramas visibles. Lo importante es que sea una credencial INE con los datos necesarios.`,

    'datos_bancarios': `Analiza esta imagen y determina si contiene información de un ESTADO DE CUENTA BANCARIO mexicano.

Solo necesitamos verificar que contenga ALGUNOS de estos datos:
- Nombre del banco (BBVA, Santander, Banamex, etc.)
- Número de cuenta
- Número de cuenta CLABE (18 dígitos)
- Nombre del titular o cliente
- R.F.C del titular
- Información financiera (saldos, movimientos)

✅ ES VÁLIDO si la imagen muestra un estado de cuenta bancario con al menos 3 de los datos anteriores.

❌ NO es válido SOLO si es:
- Un ticket de compra común
- Una foto casual sin documentos
- Una identificación personal
- Un recibo de servicios
- Una factura común

No importa si es parcial, sin logo del banco, o si la calidad no es perfecta. Lo importante es que contenga datos bancarios del titular.`
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

    // Si el documento tiene image_urls (PDF convertido), usar la primera imagen
    // Si no, usar el file_url directamente (imagen subida directamente)
    const imageToProcess = document.image_urls && document.image_urls.length > 0 
      ? document.image_urls[0] 
      : document.file_url.split('/documents/')[1];

    console.log('Descargando imagen desde:', imageToProcess);

    // Descargar la imagen desde storage
    const { data: fileData, error: downloadError } = await supabaseClient
      .storage
      .from('documents')
      .download(imageToProcess);

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

    // Convertir archivo a base64
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Detectar tipo de imagen por magic bytes
    let mimeType: string;
    if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
      mimeType = 'image/jpeg';
      console.log('Archivo detectado como JPEG');
    } else if (uint8Array[0] === 0x89 && uint8Array[1] === 0x50) {
      mimeType = 'image/png';
      console.log('Archivo detectado como PNG');
    } else {
      console.error('Tipo de archivo no soportado');
      await supabaseClient
        .from('documents')
        .update({ 
          extraction_status: 'failed',
          validation_errors: ['Tipo de archivo no soportado. Solo se aceptan imágenes JPG o PNG.']
        })
        .eq('id', documentId);
      throw new Error('Tipo de archivo no soportado');
    }
    
    // Convertir a base64 en chunks para evitar stack overflow
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode(...chunk);
    }
    const base64Data = btoa(binary);

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
                  url: `data:${mimeType};base64,${base64Data}` 
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
          validation_errors: ['Error procesando el archivo. Asegúrate de subir una imagen clara en formato JPG o PNG.']
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
    // Somos permisivos con todos los documentos (umbral de 30)
    const confidenceThreshold = 30;
    
    if (!validationResult.is_valid_type || validationResult.confidence_score < confidenceThreshold) {
      console.log('Documento rechazado por IA - no es del tipo correcto o confianza baja');
      
      const invalidationErrors = [
        `⚠️ DOCUMENTO NO VÁLIDO: ${validationResult.validation_notes}`,
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
      systemPrompt = 'Eres un asistente especializado en extraer información de constancias de situación fiscal mexicanas. Lee CUIDADOSAMENTE todo el documento para identificar cada campo solicitado.';
      userPrompt = `Analiza esta constancia de situación fiscal del SAT y extrae la siguiente información con mucha precisión:

**RÉGIMEN FISCAL - MUY IMPORTANTE:**
Busca en TODA la constancia cualquiera de estos campos o secciones:
- "Régimen de Constitución" o "Tipo de Persona" (puede decir: "PERSONA MORAL", "PERSONA FÍSICA", "SOCIEDAD ANÓNIMA", "SOCIEDAD CIVIL", etc.)
- Si encuentras una sección llamada "Regímenes" con fechas, extrae SOLO el régimen más reciente o vigente
- Puede aparecer como: "Régimen General de Ley Personas Morales", "Régimen Simplificado de Confianza", "Persona Física con Actividad Empresarial", etc.
- Busca en la parte superior, media e inferior del documento

**OTROS CAMPOS:**
- Razón Social (nombre completo de la persona o empresa)
- RFC (13 caracteres para personas físicas, 12 para morales)
- Actividad Económica (descripción de la actividad principal)
- Régimen Tributario (puede aparecer como lista de regímenes con claves y fechas)
- Dirección del domicilio fiscal (completa con calle, número, colonia, municipio, estado)
- Código Postal (5 dígitos)
- Fecha de Emisión (día en que se generó la constancia)

Si después de leer TODO el documento no encuentras algún dato, entonces indica "No encontrado".`;
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
                  regimen_fiscal: { type: 'string', description: 'Régimen fiscal o tipo de persona/constitución. Puede ser: PERSONA MORAL, PERSONA FÍSICA, SOCIEDAD ANÓNIMA, SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE, SOCIEDAD CIVIL, PERSONA FÍSICA CON ACTIVIDAD EMPRESARIAL, etc. Busca en secciones como "Régimen de Constitución", "Tipo de Persona", o en la lista de regímenes fiscales (usar solo el más reciente si hay múltiples)' },
                  direccion: { type: 'string', description: 'Dirección completa del domicilio fiscal' },
                  codigo_postal: { type: 'string', description: 'Código postal del domicilio fiscal (5 dígitos)' },
                  fecha_emision: { type: 'string', description: 'Fecha de emisión de la constancia en formato YYYY-MM-DD' }
                },
                required: ['razon_social', 'rfc', 'actividad_economica', 'regimen_tributario', 'regimen_fiscal', 'direccion', 'codigo_postal', 'fecha_emision'],
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
      systemPrompt = 'Eres un asistente experto en extraer información de Avisos de Funcionamiento emitidos por COFEPRIS en México. Analiza TODA la imagen con atención al detalle.';
      userPrompt = `Lee CUIDADOSAMENTE toda esta imagen de un Aviso de Funcionamiento de COFEPRIS.

**PASO 1 - Localiza estos elementos básicos:**
- Razón Social de la empresa (busca en la parte superior del documento)
- Dirección completa del establecimiento (calle, número, colonia, CP, municipio, estado)

**PASO 2 - BUSCA ESPECÍFICAMENTE esta sección:**
"5. Datos del responsable sanitario (excepto para productos y servicios)"

Esta sección puede aparecer:
- En la parte media o inferior del documento
- Con o sin el número "5."
- Puede decir solo "Datos del responsable sanitario"
- Puede aparecer en cualquier formato o tamaño de letra

**DENTRO de esta sección del responsable sanitario, busca:**
- Nombre completo de una PERSONA (no de la empresa)
- CURP de esa persona (18 caracteres alfanuméricos)
- Puede tener títulos profesionales como: Médico, QFB, Dr., Dra., Químico, Farmacéutico

**IMPORTANTE:**
1. El responsable sanitario es UNA PERSONA FÍSICA, NO es la empresa
2. Es DIFERENTE al representante legal
3. Su CURP es diferente al RFC de la empresa
4. Lee TODO el texto de la imagen, línea por línea
5. Si ves el texto "5. Datos del responsable sanitario" en CUALQUIER parte, examina el área debajo de ese texto
6. Solo indica "No encontrado" si después de leer TODA la imagen no encuentras esta sección específica

Extrae:
- razon_social: Nombre de la empresa
- direccion: Dirección completa del establecimiento  
- responsable_sanitario_nombre: Nombre completo de la persona responsable sanitario
- responsable_sanitario_curp: CURP del responsable sanitario`;

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
    } else if (document.document_type === 'datos_bancarios') {
      systemPrompt = 'Eres un asistente especializado en extraer información de estados de cuenta bancarios mexicanos. Extrae la información solicitada de forma precisa y estructurada.';
      userPrompt = 'Extrae la siguiente información del estado de cuenta bancario: Nombre del Banco (usualmente aparece en la parte superior izquierda o encabezado), Número de Cuenta, Número de Cuenta CLABE (18 dígitos), y Nombre del Cliente/Titular. Si algún dato no está disponible, indica "No encontrado".';
      toolConfig = {
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_datos_bancarios_info',
              description: 'Extraer información estructurada del estado de cuenta bancario',
              parameters: {
                type: 'object',
                properties: {
                  nombre_banco: { type: 'string', description: 'Nombre del banco (ej: BBVA, Santander, Banamex). Usualmente aparece en la parte superior o encabezado del documento' },
                  numero_cuenta: { type: 'string', description: 'Número de cuenta bancaria' },
                  numero_cuenta_clabe: { type: 'string', description: 'Número de cuenta CLABE (18 dígitos)' },
                  nombre_cliente: { type: 'string', description: 'Nombre completo del titular o cliente de la cuenta' }
                },
                required: ['nombre_banco', 'numero_cuenta', 'numero_cuenta_clabe', 'nombre_cliente'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_datos_bancarios_info' } }
      };
    } else {
      throw new Error(`Tipo de documento no soportado para extracción: ${document.document_type}`);
    }

    // Llamar a Lovable AI para extraer información de la imagen
    // Usar modelo más potente para avisos de funcionamiento por su complejidad
    const modelToUse = document.document_type === 'aviso_funcionamiento' 
      ? 'google/gemini-2.5-pro' 
      : 'google/gemini-2.5-flash';
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelToUse,
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
                url: `data:${mimeType};base64,${base64Data}` 
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
        regimen_fiscal: extractedInfo.regimen_fiscal,
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
        curp: extractedInfo.responsable_sanitario_curp || null,
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
    } else if (document.document_type === 'datos_bancarios') {
      updateFields = {
        numero_cuenta: extractedInfo.numero_cuenta,
        numero_cuenta_clabe: extractedInfo.numero_cuenta_clabe,
        nombre_cliente: extractedInfo.nombre_cliente,
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
            const normalize = (str: string) => str.trim().toLowerCase()
              .replace(/\s+/g, ' ')
              .replace(/\./g, '')
              .replace(/,/g, '');
            
            const razonSocialConstancia = normalize(constanciaFiscal.razon_social);
            const razonSocialAviso = normalize(avisoFuncionamiento.razon_social);
            
            if (razonSocialConstancia === razonSocialAviso) {
              errors.push(`✅ Coincidencia confirmada: Razón Social en Constancia Fiscal (${constanciaFiscal.razon_social}) coincide con Aviso de Funcionamiento (${avisoFuncionamiento.razon_social})`);
            } else if (razonSocialConstancia.includes(razonSocialAviso) || razonSocialAviso.includes(razonSocialConstancia)) {
              errors.push(`✅ Coincidencia confirmada: Razón Social similar - Constancia Fiscal: ${constanciaFiscal.razon_social}, Aviso de Funcionamiento: ${avisoFuncionamiento.razon_social}`);
            } else {
              errors.push(`❌ La Razón Social no coincide entre documentos. Constancia Fiscal: "${constanciaFiscal.razon_social}", Aviso de Funcionamiento: "${avisoFuncionamiento.razon_social}"`);
            }
          }

          // Validar Dirección (normalizar para comparación)
          if (constanciaFiscal.direccion && avisoFuncionamiento.direccion) {
            const normalize = (str: string) => str.trim().toLowerCase()
              .replace(/\s+/g, ' ')
              .replace(/,/g, '')
              .replace(/\./g, '');
            
            const direccionConstancia = normalize(constanciaFiscal.direccion);
            const direccionAviso = normalize(avisoFuncionamiento.direccion);
            
            if (direccionConstancia === direccionAviso) {
              errors.push(`✅ Coincidencia confirmada: Dirección en Constancia Fiscal (${constanciaFiscal.direccion}) coincide con Aviso de Funcionamiento (${avisoFuncionamiento.direccion})`);
            } else if (direccionConstancia.includes(direccionAviso) || direccionAviso.includes(direccionConstancia)) {
              errors.push(`✅ Coincidencia confirmada: Dirección similar - Constancia Fiscal: ${constanciaFiscal.direccion}, Aviso de Funcionamiento: ${avisoFuncionamiento.direccion}`);
            } else {
              errors.push(`❌ La Dirección no coincide entre documentos. Constancia Fiscal: "${constanciaFiscal.direccion}", Aviso de Funcionamiento: "${avisoFuncionamiento.direccion}"`);
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
                (err: string) => !err.includes('Razón Social') && 
                                 !err.includes('Dirección') &&
                                 !err.includes('Coincidencia confirmada')
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
                  (err: string) => !err.includes('Razón Social') && 
                                   !err.includes('Dirección') &&
                                   !err.includes('Coincidencia confirmada')
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

    // Realizar validación cruzada entre datos_bancarios y constancia_fiscal
    if (document.document_type === 'datos_bancarios' || document.document_type === 'constancia_fiscal') {
      console.log('Iniciando validación cruzada entre datos bancarios y constancia fiscal...');
      
      // Obtener todos los documentos del proveedor
      const { data: supplierDocs, error: docsError } = await supabaseClient
        .from('documents')
        .select('id, document_type, nombre_cliente, razon_social, extraction_status, validation_errors')
        .eq('supplier_id', document.supplier_id)
        .in('document_type', ['datos_bancarios', 'constancia_fiscal'])
        .eq('extraction_status', 'completed');
      
      console.log('Documentos encontrados para validación Datos Bancarios-Constancia:', supplierDocs);

      if (!docsError && supplierDocs) {
        const datosBancarios = supplierDocs.find(d => d.document_type === 'datos_bancarios');
        const constanciaFiscal = supplierDocs.find(d => d.document_type === 'constancia_fiscal');

        if (datosBancarios && constanciaFiscal) {
          console.log('Validando Nombre de Cliente con Razón Social:', {
            datos_bancarios: { nombre_cliente: datosBancarios.nombre_cliente },
            constancia_fiscal: { razon_social: constanciaFiscal.razon_social }
          });

          const errors: string[] = [];

          // Validar que el nombre del cliente coincida con la razón social
          if (datosBancarios.nombre_cliente && constanciaFiscal.razon_social) {
            // Normalizar: convertir a mayúsculas y eliminar espacios extra
            const normalizarTexto = (texto: string) => {
              return texto.trim().toUpperCase().replace(/\s+/g, ' ');
            };
            
            const nombreClienteNorm = normalizarTexto(datosBancarios.nombre_cliente);
            const razonSocialNorm = normalizarTexto(constanciaFiscal.razon_social);
            
            if (nombreClienteNorm === razonSocialNorm) {
              errors.push(`✅ Coincidencia confirmada: Nombre del cliente en Datos Bancarios (${datosBancarios.nombre_cliente}) coincide con Razón Social en Constancia Fiscal (${constanciaFiscal.razon_social})`);
            } else if (nombreClienteNorm.includes(razonSocialNorm) || razonSocialNorm.includes(nombreClienteNorm)) {
              errors.push(`✅ Coincidencia confirmada: Nombre similar - Datos Bancarios: ${datosBancarios.nombre_cliente}, Constancia Fiscal: ${constanciaFiscal.razon_social}`);
            } else {
              errors.push(`❌ El Nombre del Cliente en Datos Bancarios no coincide con la Razón Social en Constancia Fiscal. Datos Bancarios: "${datosBancarios.nombre_cliente}", Constancia Fiscal: "${constanciaFiscal.razon_social}"`);
            }
          }

          if (errors.length > 0) {
            // Hay errores, actualizar ambos documentos
            console.log('Errores de validación encontrados:', errors);
            
            for (const doc of [datosBancarios, constanciaFiscal]) {
              // Obtener errores actuales y combinar
              const { data: currentDoc } = await supabaseClient
                .from('documents')
                .select('validation_errors')
                .eq('id', doc.id)
                .single();

              const currentErrors = currentDoc?.validation_errors || [];
              // Filtrar errores antiguos entre datos bancarios y constancia, agregar nuevos
              const filteredErrors = currentErrors.filter(
                (err: string) => !err.includes('Nombre del Cliente en Datos Bancarios') && 
                                 !err.includes('Coincidencia confirmada: Nombre del cliente') &&
                                 !err.includes('Coincidencia confirmada: Nombre similar')
              );
              const combinedErrors = [...filteredErrors, ...errors];

              await supabaseClient
                .from('documents')
                .update({
                  validation_errors: combinedErrors,
                  is_valid: !combinedErrors.some((err: string) => err.startsWith('❌'))
                })
                .eq('id', doc.id);
            }
          } else {
            // No hay errores, limpiar errores de validación entre datos bancarios y constancia
            console.log('Nombre del Cliente coincide correctamente con Razón Social');
            
            for (const doc of [datosBancarios, constanciaFiscal]) {
              const { data: currentDoc } = await supabaseClient
                .from('documents')
                .select('validation_errors')
                .eq('id', doc.id)
                .single();

              if (currentDoc && currentDoc.validation_errors) {
                const filteredErrors = currentDoc.validation_errors.filter(
                  (err: string) => !err.includes('Nombre del Cliente en Datos Bancarios') && 
                                   !err.includes('Coincidencia confirmada: Nombre del cliente') &&
                                   !err.includes('Coincidencia confirmada: Nombre similar')
                );
                
                await supabaseClient
                  .from('documents')
                  .update({
                    validation_errors: filteredErrors,
                    is_valid: filteredErrors.length === 0 || !filteredErrors.some((err: string) => err.startsWith('❌'))
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
        .select('id, document_type, nombre_completo_ine, curp, representante_legal, extraction_status, validation_errors')
        .eq('supplier_id', document.supplier_id)
        .in('document_type', ['ine', 'aviso_funcionamiento'])
        .eq('extraction_status', 'completed');
      
      console.log('Documentos encontrados para validación INE-Aviso:', supplierDocs);

      if (!docsError && supplierDocs) {
        const ine = supplierDocs.find(d => d.document_type === 'ine');
        const avisoFuncionamiento = supplierDocs.find(d => d.document_type === 'aviso_funcionamiento');

        if (ine && avisoFuncionamiento) {
          console.log('Validando Nombre Completo y CURP del Responsable Sanitario:', {
            ine: { nombre_completo: ine.nombre_completo_ine, curp: ine.curp },
            aviso: { responsable_sanitario: avisoFuncionamiento.representante_legal, curp: avisoFuncionamiento.curp }
          });

          const errors: string[] = [];

          // PRIORIDAD 1: Validar CURP (identificador único más confiable)
          let curpCoincide = false;
          if (ine.curp && avisoFuncionamiento.curp) {
            // Verificar si el dato fue encontrado (no es "No encontrado")
            if (avisoFuncionamiento.curp.toLowerCase().includes('no encontrado')) {
              errors.push(`⚠️ Los datos del responsable sanitario no se encontraron en la imagen del Aviso de Funcionamiento procesada. Si el documento tiene múltiples páginas, asegúrate de subir la página que contiene el "Apartado 5: Datos del responsable sanitario".`);
            } else if (ine.curp.trim().toUpperCase() === avisoFuncionamiento.curp.trim().toUpperCase()) {
              // CURP coincide - esto es suficiente para validar
              curpCoincide = true;
              console.log('✅ CURP del responsable sanitario coincide perfectamente:', ine.curp);
              errors.push(`✅ Coincidencia confirmada: CURP del responsable sanitario en INE (${ine.curp}) coincide con Aviso de Funcionamiento (${avisoFuncionamiento.curp})`);
            } else {
              errors.push(`❌ El CURP del responsable sanitario no coincide. INE: ${ine.curp}, Aviso de Funcionamiento: ${avisoFuncionamiento.curp}`);
            }
          }

          // PRIORIDAD 2: Validar Nombre solo si el CURP NO coincide (como validación adicional)
          if (!curpCoincide && ine.nombre_completo_ine && avisoFuncionamiento.representante_legal) {
            // Verificar si el dato fue encontrado (no es "No encontrado")
            if (!avisoFuncionamiento.representante_legal.toLowerCase().includes('no encontrado')) {
              // Normalizar: convertir a minúsculas, eliminar espacios extra y ordenar palabras alfabéticamente
              const normalizarNombre = (nombre: string) => {
                return nombre.trim().toLowerCase()
                  .split(/\s+/)  // Dividir por espacios
                  .filter(palabra => palabra.length > 0)  // Eliminar strings vacíos
                  .sort()  // Ordenar alfabéticamente
                  .join(' ');  // Unir con espacio
              };
              
              const nombreINENormalizado = normalizarNombre(ine.nombre_completo_ine);
              const nombreAvisoNormalizado = normalizarNombre(avisoFuncionamiento.representante_legal);
              
              if (nombreINENormalizado !== nombreAvisoNormalizado) {
                errors.push(`El Nombre Completo del responsable sanitario no coincide. INE: "${ine.nombre_completo_ine}", Aviso de Funcionamiento: "${avisoFuncionamiento.representante_legal}"`);
              }
            }
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
                (err: string) => !err.includes('Nombre Completo del responsable sanitario') && 
                                 !err.includes('CURP del responsable sanitario') &&
                                 !err.includes('⚠️ Los datos del responsable sanitario') &&
                                 !err.includes('Coincidencia confirmada')
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
                  (err: string) => !err.includes('Nombre Completo del responsable sanitario') && 
                                   !err.includes('CURP del responsable sanitario') &&
                                   !err.includes('⚠️ Los datos del responsable sanitario') &&
                                   !err.includes('Coincidencia confirmada')
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
            validation_errors: ['Error procesando el documento. Por favor intenta nuevamente con una imagen clara en formato JPG o PNG.']
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
