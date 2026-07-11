import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// FunciÃ³n auxiliar para generar prompts de validaciÃ³n
// Helper function to retry API calls with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.log(`Intento ${i + 1} fallÃ³, reintentando en ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

function getValidationPrompt(documentType: string): string {
  const prompts: Record<string, string> = {
    'acta_constitutiva': `Analiza esta imagen y determina si contiene informaciÃ³n de un ACTA CONSTITUTIVA mexicana.

IMPORTANTE: Puede ser una pÃ¡gina parcial o fragmento del acta. Solo necesitamos verificar que contenga AL MENOS UNO de estos datos:
- RazÃ³n social de la empresa
- Nombre del representante legal
- Objeto social (actividades de la empresa)
- InformaciÃ³n del registro pÃºblico

âœ… ES VÃLIDA si la imagen contiene texto relacionado con constituciÃ³n de sociedad y al menos uno de los datos anteriores.

âŒ NO es vÃ¡lida SOLO si es:
- Un ticket de compra o recibo comÃºn
- Una foto casual sin relaciÃ³n con documentos legales
- Una identificaciÃ³n personal (INE, pasaporte)
- Una factura o comprobante fiscal

SÃ© flexible: el documento puede estar incompleto, ser una pÃ¡gina interna, o no tener todos los elementos formales (sellos, firmas). Lo importante es que contenga datos del acta constitutiva.`,

    'constancia_fiscal': `Analiza esta imagen y determina si contiene informaciÃ³n de una CONSTANCIA DE SITUACIÃ“N FISCAL del SAT.

Solo necesitamos verificar que contenga ALGUNOS de estos datos:
- RFC del contribuyente
- RazÃ³n social o nombre
- RÃ©gimen fiscal
- Actividades econÃ³micas
- Domicilio fiscal
- CÃ³digo postal
- Fecha de emisiÃ³n

âœ… ES VÃLIDA si la imagen contiene informaciÃ³n fiscal del SAT y al menos 3 de los datos anteriores.

âŒ NO es vÃ¡lida SOLO si es:
- Un ticket de compra comÃºn
- Una foto casual sin documentos
- Una identificaciÃ³n personal (INE)
- Un recibo de servicios bÃ¡sicos

No importa si falta el logo, cÃ³digo de barras, o si la calidad no es perfecta. Lo importante es que contenga datos fiscales.`,

    'comprobante_domicilio': `Analiza esta imagen y determina si contiene informaciÃ³n de un COMPROBANTE DE DOMICILIO (recibo de luz, agua, telÃ©fono, predial, etc.).

Solo necesitamos verificar que contenga estos datos bÃ¡sicos:
- Nombre del titular o razÃ³n social
- DirecciÃ³n
- CÃ³digo postal
- Fecha de emisiÃ³n

âœ… ES VÃLIDO si la imagen contiene informaciÃ³n de un recibo de servicios (CFE, agua, telÃ©fono, predial, etc.) con los datos anteriores.

âŒ NO es vÃ¡lido SOLO si es:
- Un ticket de compra en tienda
- Una foto casual sin documentos
- Una identificaciÃ³n personal

IMPORTANTE: Ignora completamente advertencias como "ESTE DOCUMENTO NO ES UN COMPROBANTE FISCAL" - eso NO importa. Solo nos interesa que contenga los datos de domicilio necesarios. La fecha puede ser de cualquier momento, no hay lÃ­mite de 3 meses.`,

    'aviso_funcionamiento': `Analiza esta imagen y determina si contiene informaciÃ³n de un AVISO DE FUNCIONAMIENTO mexicano.

Solo necesitamos verificar que contenga ALGUNOS de estos datos:
- RazÃ³n social de la empresa
- Domicilio del establecimiento
- Actividad econÃ³mica
- Fecha de emisiÃ³n

âœ… ES VÃLIDO si la imagen contiene informaciÃ³n relacionada con aviso de funcionamiento sanitario y al menos 2 de los datos anteriores. Puede ser una pÃ¡gina completa o un fragmento, con o sin sellos oficiales.

âŒ NO es vÃ¡lido SOLO si es:
- Un ticket de compra comÃºn
- Una foto casual sin documentos
- Una factura o recibo de servicios
- Una identificaciÃ³n personal

No importa si es pÃ¡gina principal o interna, con o sin sellos. Lo importante es que contenga datos del aviso de funcionamiento.`,

    'ine': `Analiza esta imagen y determina si contiene informaciÃ³n de una CREDENCIAL INE mexicana.

Solo necesitamos verificar que contenga ALGUNOS de estos datos:
- FotografÃ­a del titular
- Nombre completo del titular
- CURP (18 caracteres)
- Clave de elector

âœ… ES VÃLIDA si la imagen muestra una credencial del INE (frente o reverso) con al menos 2 de los datos anteriores.

âŒ NO es vÃ¡lida SOLO si es:
- Una foto casual sin documentos
- Una identificaciÃ³n extranjera
- Una licencia de conducir
- Un pasaporte
- Otro tipo de documento

No importa si estÃ¡ vencida, deteriorada, o sin hologramas visibles. Lo importante es que sea una credencial INE con los datos necesarios.`,

    'datos_bancarios': `Analiza esta imagen y determina si contiene informaciÃ³n de un ESTADO DE CUENTA BANCARIO mexicano.

Solo necesitamos verificar que contenga ALGUNOS de estos datos:
- Nombre del banco (BBVA, Santander, Banamex, etc.)
- NÃºmero de cuenta
- NÃºmero de cuenta CLABE (18 dÃ­gitos)
- Nombre del titular o cliente
- R.F.C del titular
- InformaciÃ³n financiera (saldos, movimientos)

âœ… ES VÃLIDO si la imagen muestra un estado de cuenta bancario con al menos 3 de los datos anteriores.

âŒ NO es vÃ¡lido SOLO si es:
- Un ticket de compra comÃºn
- Una foto casual sin documentos
- Una identificaciÃ³n personal
- Un recibo de servicios
- Una factura comÃºn

No importa si es parcial, sin logo del banco, o si la calidad no es perfecta. Lo importante es que contenga datos bancarios del titular.`
  };

  return prompts[documentType] || 'Analiza si este documento es vÃ¡lido y del tipo correcto.';
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

    // FunciÃ³n auxiliar para convertir imagen a base64
    const imageToBase64 = async (imagePath: string) => {
      const { data: fileData, error: downloadError } = await supabaseClient
        .storage
        .from('documents')
        .download(imagePath);

      if (downloadError || !fileData) {
        throw new Error(`Error descargando imagen: ${downloadError?.message}`);
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Detectar tipo de imagen
      let mimeType: string;
      if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
        mimeType = 'image/jpeg';
      } else if (uint8Array[0] === 0x89 && uint8Array[1] === 0x50) {
        mimeType = 'image/png';
      } else {
        throw new Error('Tipo de archivo no soportado');
      }
      
      // Convertir a base64
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
        binary += String.fromCharCode(...chunk);
      }
      
      return { base64: btoa(binary), mimeType, size: fileData.size };
    };

    // Determinar cuÃ¡ntas pÃ¡ginas procesar segÃºn el tipo de documento
    const pageLimit: Record<string, number> = {
      'constancia_fiscal': 2,      // Primera pÃ¡gina: datos bÃ¡sicos, Segunda: regÃ­menes
      'comprobante_domicilio': 1,  // Siempre es una pÃ¡gina
      'ine': 2,                    // Frente y reverso
      'datos_bancarios': 3,        // Primeras pÃ¡ginas tienen la info clave
      'aviso_funcionamiento': 5,   // Info clave en primeras pÃ¡ginas
      'acta_constitutiva': 5       // Procesar en bloques de 5 pÃ¡ginas (implementaciÃ³n especial mÃ¡s adelante)
    };

    // Obtener todas las imÃ¡genes disponibles
    const allImages = document.image_urls && document.image_urls.length > 0 
      ? document.image_urls 
      : [document.file_url.split('/documents/')[1]];

    console.log(`Documento tiene ${allImages.length} pÃ¡gina(s) totales, tipo: "${document.document_type}"`);

    // Para ACTA CONSTITUTIVA: procesamiento especial por bloques
    let imageDataArray: Array<{ base64: string; mimeType: string; size: number }> = [];
    let totalSize = 0;

    if (document.document_type === 'acta_constitutiva' && allImages.length > 5) {
      // Procesamiento por bloques para actas largas
      const BLOCK_SIZE = 5;
      const MAX_BLOCKS = 4; // MÃ¡ximo 20 pÃ¡ginas (4 bloques)
      const totalBlocks = Math.min(Math.ceil(allImages.length / BLOCK_SIZE), MAX_BLOCKS);
      
      console.log(`âš™ï¸ Acta Constitutiva con ${allImages.length} pÃ¡ginas - procesando en ${totalBlocks} bloques de ${BLOCK_SIZE} pÃ¡ginas`);
      
      // Procesar primer bloque para la validaciÃ³n
      const firstBlockImages = allImages.slice(0, BLOCK_SIZE);
      for (const imagePath of firstBlockImages) {
        try {
          const imageData = await imageToBase64(imagePath);
          imageDataArray.push(imageData);
          totalSize += imageData.size;
        } catch (error) {
          console.error('Error procesando imagen del primer bloque:', error);
          throw error;
        }
      }
      
      console.log(`âœ… Primer bloque cargado (${firstBlockImages.length} pÃ¡ginas) - TamaÃ±o: ${totalSize} bytes`);
      
    } else {
      // Procesamiento normal para otros documentos o actas cortas
      const maxPages = pageLimit[document.document_type] || 3;
      const imagesToProcess = allImages.slice(0, maxPages);
      
      console.log(`Procesando las primeras ${imagesToProcess.length} pÃ¡ginas`);
      
      for (const imagePath of imagesToProcess) {
        try {
          const imageData = await imageToBase64(imagePath);
          imageDataArray.push(imageData);
          totalSize += imageData.size;
          console.log(`PÃ¡gina procesada - TamaÃ±o: ${imageData.size} bytes, Tipo: ${imageData.mimeType}`);
        } catch (error) {
          console.error('Error procesando imagen:', error);
          await supabaseClient
            .from('documents')
            .update({ extraction_status: 'failed' })
            .eq('id', documentId);
          return new Response(
            JSON.stringify({ error: 'Error procesando las imÃ¡genes del documento' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    console.log(`Total de pÃ¡ginas cargadas inicialmente: ${imageDataArray.length}, TamaÃ±o total: ${totalSize} bytes`);
    
    if (totalSize > 2000000) {
      console.log('âš ï¸ ADVERTENCIA: Documento muy grande detectado. Esto puede causar timeouts.');
    }

    console.log('Llamando a Claude para extraer informaciÃ³n y validar autenticidad');
    console.log('Tipo de documento:', document.document_type);

    const GEMINI_API_KEY = Deno.env.get('GEMINIKEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINIKEY no estÃ¡ configurado');
    }

    // PASO 1: Primero validar que el documento sea legÃ­timo
    console.log('Validando autenticidad del documento con IA...');
    const validationPrompt = getValidationPrompt(document.document_type);
    
    let validationResponse;
    try {
      validationResponse = await retryWithBackoff(async () => {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: 'Eres un experto en validaciÃ³n de documentos legales y fiscales mexicanos. Tu trabajo es determinar si una imagen contiene el tipo de documento esperado o si es una imagen falsa/irrelevante.' }]
              },
              tools: [
                {
                  functionDeclarations: [
                    {
                      name: 'validate_document',
                      description: 'Validar si el documento es autÃ©ntico y del tipo correcto',
                      parameters: {
                        type: 'object',
                        properties: {
                          is_valid_type: {
                            type: 'boolean',
                            description: 'true si el documento es del tipo esperado, false si es una foto random, ticket, o documento no relacionado'
                          },
                          confidence_score: {
                            type: 'number',
                            description: 'PuntuaciÃ³n de confianza de 0 a 100 sobre la autenticidad del documento'
                          },
                          validation_notes: {
                            type: 'string',
                            description: 'Notas sobre por quÃ© el documento es vÃ¡lido o no. Si es invÃ¡lido, explicar quÃ© se detectÃ³ en la imagen.'
                          },
                          detected_issues: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Lista de problemas especÃ­ficos detectados (baja calidad, texto ilegible, no es el documento correcto, etc.)'
                          }
                        },
                        required: ['is_valid_type', 'confidence_score', 'validation_notes', 'detected_issues']
                      }
                    }
                  ]
                }
              ],
              toolConfig: {
                functionCallingConfig: {
                  mode: 'ANY',
                  allowedFunctionNames: ['validate_document'],
                }
              },
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: validationPrompt },
                    ...imageDataArray.map(imgData => ({
                      inline_data: {
                        mime_type: imgData.mimeType,
                        data: imgData.base64,
                      }
                    }))
                  ]
                }
              ],
              generationConfig: { maxOutputTokens: 1024 },
            }),
          }
        );
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        return response;
      }, 2, 2000); // 2 reintentos con delay inicial de 2 segundos
    } catch (retryError) {
      console.error('Error despuÃ©s de mÃºltiples reintentos:', retryError);
      
      await supabaseClient
        .from('documents')
        .update({ 
          extraction_status: 'failed',
          validation_errors: ['El servicio de procesamiento estÃ¡ temporalmente saturado. Por favor intenta de nuevo en unos minutos.']
        })
        .eq('id', documentId);
      
      return new Response(
        JSON.stringify({ 
          error: 'El servicio de IA estÃ¡ temporalmente no disponible. Por favor intenta mÃ¡s tarde.' 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validationData = await validationResponse.json();
    const validationParts = validationData.candidates?.[0]?.content?.parts || [];
    const validationFnCall = validationParts.find((p: any) => p.functionCall);

    if (!validationFnCall) {
      throw new Error('No se recibiÃ³ validaciÃ³n del documento');
    }

    const validationResult = validationFnCall.functionCall.args;
    console.log('Resultado de validaciÃ³n:', validationResult);

    // Si el documento no es vÃ¡lido, marcarlo y no continuar con la extracciÃ³n
    // Somos permisivos con todos los documentos (umbral de 30)
    const confidenceThreshold = 30;
    
    if (!validationResult.is_valid_type || validationResult.confidence_score < confidenceThreshold) {
      console.log('Documento rechazado por IA - no es del tipo correcto o confianza baja');
      
      const invalidationErrors = [
        `âš ï¸ DOCUMENTO NO VÃLIDO: ${validationResult.validation_notes}`,
        ...validationResult.detected_issues.map((issue: string) => `â€¢ ${issue}`)
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
          error: 'Documento no vÃ¡lido',
          validation_errors: invalidationErrors,
          confidence_score: validationResult.confidence_score
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PASO 2: Si el documento pasÃ³ la validaciÃ³n, extraer informaciÃ³n
    // Configurar el prompt y herramientas segÃºn el tipo de documento
    let systemPrompt = '';
    let userPrompt = '';
    let toolConfig: any = null;
    let updateFields: any = {};

    if (document.document_type === 'acta_constitutiva') {
      systemPrompt = 'Eres un asistente especializado en extraer informaciÃ³n de actas constitutivas mexicanas. Extrae la informaciÃ³n solicitada de forma precisa y estructurada.';
      userPrompt = 'Extrae la siguiente informaciÃ³n del acta constitutiva: RazÃ³n Social, Representante Legal, Objeto Social, y Registro PÃºblico. Si algÃºn dato no estÃ¡ disponible, indica "No encontrado".';
      toolConfig = {
        tools: [{ functionDeclarations: [{
          name: 'extract_acta_info',
          description: 'Extraer informaciÃ³n estructurada del acta constitutiva',
          parameters: {
            type: 'object',
            properties: {
              razon_social: { type: 'string', description: 'RazÃ³n social o nombre legal de la empresa' },
              representante_legal: { type: 'string', description: 'Nombre completo del representante legal' },
              objeto_social: { type: 'string', description: 'DescripciÃ³n del objeto social de la empresa' },
              registro_publico: { type: 'string', description: 'InformaciÃ³n del registro pÃºblico (nÃºmero, fecha, notarÃ­a, etc.)' }
            },
            required: ['razon_social', 'representante_legal', 'objeto_social', 'registro_publico']
          }
        }]}],
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['extract_acta_info'] } }
      };
    } else if (document.document_type === 'constancia_fiscal') {
      systemPrompt = 'Eres un experto en documentos fiscales del SAT mexicano. Tu trabajo es extraer SOLO la informaciÃ³n exacta que se te solicita, sin confundir conceptos.';
      userPrompt = `Lee esta constancia de situaciÃ³n fiscal del SAT.

**PASO 1 - BUSCA EL RÃ‰GIMEN FISCAL (MUY IMPORTANTE - LEE CON ATENCIÃ“N):**

BUSCA especÃ­ficamente una TABLA o SECCIÃ“N llamada "RegÃ­menes" (en PLURAL). 
âš ï¸ NO confundas con "RÃ©gimen Capital" que es diferente.

DÃ³nde buscar:
- Busca una tabla con el encabezado "RegÃ­menes" (usualmente en la segunda pÃ¡gina)
- Puede estar en una tabla con columnas como: RÃ©gimen | Fecha Inicio | Fecha Fin
- O en una lista bajo el tÃ­tulo "RegÃ­menes"

El rÃ©gimen fiscal PUEDE aparecer en DOS formatos:

FORMATO 1 (PREFERIDO) - Con cÃ³digo numÃ©rico del SAT:
âœ… "601 - General de Ley Personas Morales"
âœ… "626 - RÃ©gimen Simplificado de Confianza"
âœ… "612 - Personas FÃ­sicas con Actividades Empresariales y Profesionales"

FORMATO 2 (TAMBIÃ‰N VÃLIDO) - Solo nombre (sin cÃ³digo):
âœ… "RÃ©gimen General de Ley Personas Morales"
âœ… "RÃ©gimen Simplificado de Confianza"
âœ… "Personas FÃ­sicas con Actividades Empresariales y Profesionales"

âš ï¸ IMPORTANTE - Lo que NO ES rÃ©gimen fiscal (IGNORA ESTOS CAMPOS):
âŒ Campo "RÃ©gimen Capital: SOCIEDAD ANONIMA DE CAPITAL VARIABLE" - NO es rÃ©gimen fiscal
âŒ "S.A. DE C.V." - es tipo de sociedad, NO rÃ©gimen fiscal
âŒ "PERSONA MORAL" o "PERSONA FÃSICA" - es tipo de persona, NO rÃ©gimen fiscal

REGLA FINAL:
1. Busca la tabla/secciÃ³n "RegÃ­menes" (plural)
2. Ignora completamente el campo "RÃ©gimen Capital"
3. Extrae el rÃ©gimen con o sin cÃ³digo
4. Solo escribe "No encontrado" si no existe la secciÃ³n "RegÃ­menes"

**PASO 2 - EXTRAE LOS DEMÃS CAMPOS:**
- RazÃ³n Social: Nombre legal de la persona o empresa
- RFC: 12-13 caracteres alfanumÃ©ricos
- Actividad EconÃ³mica: DescripciÃ³n de la actividad principal
- RÃ©gimen Tributario: Tipo de constituciÃ³n legal (S.A. DE C.V., PERSONA FÃSICA, etc.)
- DirecciÃ³n: Domicilio fiscal completo
- CÃ³digo Postal: 5 dÃ­gitos
- Fecha de EmisiÃ³n: Formato YYYY-MM-DD

Si NO encuentras algÃºn dato, escribe "No encontrado".`;
      toolConfig = {
        tools: [{ functionDeclarations: [{
          name: 'extract_constancia_info',
          description: 'Extraer informaciÃ³n estructurada de la constancia de situaciÃ³n fiscal',
          parameters: {
            type: 'object',
            properties: {
              razon_social: { type: 'string', description: 'RazÃ³n social o nombre legal de la empresa' },
              rfc: { type: 'string', description: 'RFC del contribuyente' },
              actividad_economica: { type: 'string', description: 'Actividad econÃ³mica principal' },
              regimen_tributario: { type: 'string', description: 'Tipo de constituciÃ³n legal (ej: SOCIEDAD ANONIMA DE CAPITAL VARIABLE, PERSONA FÃSICA, etc.)' },
              regimen_fiscal: { type: 'string', description: 'RÃ©gimen fiscal del SAT. PUEDE tener dos formatos: 1) CÃ³digo de 3 dÃ­gitos + guiÃ³n + descripciÃ³n (ej: "601 - General de Ley Personas Morales", "626 - RÃ©gimen Simplificado de Confianza"), 2) Solo nombre del rÃ©gimen sin cÃ³digo (ej: "RÃ©gimen Simplificado de Confianza", "General de Ley Personas Morales"). NUNCA extraer tipos de constituciÃ³n como "SOCIEDAD ANONIMA" o "S.A. DE C.V." - esos NO son regÃ­menes fiscales. Si no encuentras ninguna menciÃ³n del rÃ©gimen fiscal en el documento, devuelve "No encontrado".' },
              direccion: { type: 'string', description: 'DirecciÃ³n completa del domicilio fiscal' },
              codigo_postal: { type: 'string', description: 'CÃ³digo postal del domicilio fiscal (5 dÃ­gitos)' },
              fecha_emision: { type: 'string', description: 'Fecha de emisiÃ³n de la constancia en formato YYYY-MM-DD' }
            },
            required: ['razon_social', 'rfc', 'actividad_economica', 'regimen_tributario', 'regimen_fiscal', 'direccion', 'codigo_postal', 'fecha_emision']
          }
        }]}],
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['extract_constancia_info'] } }
      };
    } else if (document.document_type === 'comprobante_domicilio') {
      systemPrompt = 'Eres un asistente especializado en extraer informaciÃ³n de comprobantes de domicilio (recibos de luz, agua, telÃ©fono, predial, etc.). Extrae la informaciÃ³n solicitada de forma precisa y estructurada.';
      userPrompt = 'Extrae la siguiente informaciÃ³n del comprobante de domicilio: RazÃ³n Social o Nombre del titular, RFC (si estÃ¡ disponible), CÃ³digo Postal, y Fecha de EmisiÃ³n. Si algÃºn dato no estÃ¡ disponible, indica "No encontrado".';
      toolConfig = {
        tools: [{ functionDeclarations: [{
          name: 'extract_comprobante_domicilio_info',
          description: 'Extraer informaciÃ³n estructurada del comprobante de domicilio',
          parameters: {
            type: 'object',
            properties: {
              razon_social: { type: 'string', description: 'RazÃ³n social o nombre del titular del servicio' },
              rfc: { type: 'string', description: 'RFC del titular (si estÃ¡ disponible en el documento)' },
              codigo_postal: { type: 'string', description: 'CÃ³digo postal del domicilio (5 dÃ­gitos)' },
              fecha_emision: { type: 'string', description: 'Fecha de emisiÃ³n del comprobante en formato YYYY-MM-DD' }
            },
            required: ['razon_social', 'codigo_postal', 'fecha_emision']
          }
        }]}],
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['extract_comprobante_domicilio_info'] } }
      };
    } else if (document.document_type === 'aviso_funcionamiento') {
      systemPrompt = 'Eres un asistente experto en extraer informaciÃ³n de Avisos de Funcionamiento emitidos por COFEPRIS en MÃ©xico. Analiza TODA la imagen con atenciÃ³n al detalle.';
      userPrompt = `Lee CUIDADOSAMENTE toda esta imagen de un Aviso de Funcionamiento de COFEPRIS.

**PASO 1 - Localiza estos elementos bÃ¡sicos:**
- RazÃ³n Social de la empresa (busca en la parte superior del documento)
- DirecciÃ³n completa del establecimiento (calle, nÃºmero, colonia, CP, municipio, estado)

**PASO 2 - BUSCA ESPECÃFICAMENTE esta secciÃ³n:**
"5. Datos del responsable sanitario (excepto para productos y servicios)"

Esta secciÃ³n puede aparecer:
- En la parte media o inferior del documento
- Con o sin el nÃºmero "5."
- Puede decir solo "Datos del responsable sanitario"
- Puede aparecer en cualquier formato o tamaÃ±o de letra

**DENTRO de esta secciÃ³n del responsable sanitario, busca:**
- Nombre completo de una PERSONA (no de la empresa)
- CURP de esa persona (18 caracteres alfanumÃ©ricos)
- Puede tener tÃ­tulos profesionales como: MÃ©dico, QFB, Dr., Dra., QuÃ­mico, FarmacÃ©utico

**IMPORTANTE:**
1. El responsable sanitario es UNA PERSONA FÃSICA, NO es la empresa
2. Es DIFERENTE al representante legal
3. Su CURP es diferente al RFC de la empresa
4. Lee TODO el texto de la imagen, lÃ­nea por lÃ­nea
5. Si ves el texto "5. Datos del responsable sanitario" en CUALQUIER parte, examina el Ã¡rea debajo de ese texto
6. Solo indica "No encontrado" si despuÃ©s de leer TODA la imagen no encuentras esta secciÃ³n especÃ­fica

Extrae:
- razon_social: Nombre de la empresa
- direccion: DirecciÃ³n completa del establecimiento  
- responsable_sanitario_nombre: Nombre completo de la persona responsable sanitario
- responsable_sanitario_curp: CURP del responsable sanitario`;

      toolConfig = {
        tools: [{ functionDeclarations: [{
          name: 'extract_aviso_funcionamiento_info',
          description: 'Extraer informaciÃ³n estructurada del aviso de funcionamiento',
          parameters: {
            type: 'object',
            properties: {
              razon_social: { type: 'string', description: 'RazÃ³n social o nombre legal de la empresa' },
              direccion: { type: 'string', description: 'DirecciÃ³n completa del establecimiento' },
              responsable_sanitario_nombre: { type: 'string', description: 'Nombre completo del responsable sanitario' },
              responsable_sanitario_curp: { type: 'string', description: 'CURP del responsable sanitario (si estÃ¡ disponible)' }
            },
            required: ['razon_social', 'direccion', 'responsable_sanitario_nombre']
          }
        }]}],
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['extract_aviso_funcionamiento_info'] } }
      };
    } else if (document.document_type === 'ine') {
      systemPrompt = 'Eres un asistente especializado en extraer informaciÃ³n de credenciales INE mexicanas. Extrae la informaciÃ³n solicitada de forma precisa y estructurada.';
      userPrompt = 'Extrae la siguiente informaciÃ³n de la credencial INE: Nombre completo del titular y CURP. Si algÃºn dato no estÃ¡ disponible, indica "No encontrado".';
      toolConfig = {
        tools: [{ functionDeclarations: [{
          name: 'extract_ine_info',
          description: 'Extraer informaciÃ³n estructurada de la credencial INE',
          parameters: {
            type: 'object',
            properties: {
              nombre_completo: { type: 'string', description: 'Nombre completo del titular de la credencial' },
              curp: { type: 'string', description: 'CURP del titular (18 caracteres)' }
            },
            required: ['nombre_completo', 'curp']
          }
        }]}],
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['extract_ine_info'] } }
      };
    } else if (document.document_type === 'datos_bancarios') {
      systemPrompt = 'Eres un asistente especializado en extraer informaciÃ³n de estados de cuenta bancarios mexicanos. Extrae la informaciÃ³n solicitada de forma precisa y estructurada.';
      userPrompt = 'Extrae la siguiente informaciÃ³n del estado de cuenta bancario: Nombre del Banco (usualmente aparece en la parte superior izquierda o encabezado), NÃºmero de Cuenta, NÃºmero de Cuenta CLABE (18 dÃ­gitos), y Nombre del Cliente/Titular. Si algÃºn dato no estÃ¡ disponible, indica "No encontrado".';
      toolConfig = {
        tools: [{ functionDeclarations: [{
          name: 'extract_datos_bancarios_info',
          description: 'Extraer informaciÃ³n estructurada del estado de cuenta bancario',
          parameters: {
            type: 'object',
            properties: {
              nombre_banco: { type: 'string', description: 'Nombre del banco (ej: BBVA, Santander, Banamex). Usualmente aparece en la parte superior o encabezado del documento' },
              numero_cuenta: { type: 'string', description: 'NÃºmero de cuenta bancaria' },
              numero_cuenta_clabe: { type: 'string', description: 'NÃºmero de cuenta CLABE (18 dÃ­gitos)' },
              nombre_cliente: { type: 'string', description: 'Nombre completo del titular o cliente de la cuenta' }
            },
            required: ['nombre_banco', 'numero_cuenta', 'numero_cuenta_clabe', 'nombre_cliente']
          }
        }]}],
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['extract_datos_bancarios_info'] } }
      };
    } else {
      throw new Error(`Tipo de documento no soportado para extracciÃ³n: ${document.document_type}`);
    }

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          ...toolConfig,
          contents: [
            {
              role: 'user',
              parts: [
                { text: userPrompt },
                ...imageDataArray.map(imgData => ({
                  inline_data: {
                    mime_type: imgData.mimeType,
                    data: imgData.base64,
                  }
                }))
              ]
            }
          ],
          generationConfig: { maxOutputTokens: 2048 },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Error de Claude:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        await supabaseClient
          .from('documents')
          .update({ extraction_status: 'failed' })
          .eq('id', documentId);
        return new Response(
          JSON.stringify({ error: 'LÃ­mite de solicitudes excedido, intenta mÃ¡s tarde' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        await supabaseClient
          .from('documents')
          .update({ extraction_status: 'failed' })
          .eq('id', documentId);
        return new Response(
          JSON.stringify({ error: 'CrÃ©ditos de IA agotados' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Error de Claude: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    console.log('Respuesta de Gemini recibida:', JSON.stringify(aiData));

    const aiParts = aiData.candidates?.[0]?.content?.parts || [];
    const aiFnCall = aiParts.find((p: any) => p.functionCall);
    if (!aiFnCall) {
      console.error('No se recibiÃ³ functionCall en la respuesta');
      await supabaseClient
        .from('documents')
        .update({ extraction_status: 'failed' })
        .eq('id', documentId);
      return new Response(
        JSON.stringify({ error: 'Error al procesar la respuesta de IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let extractedInfo = aiFnCall.functionCall.args;
    console.log('InformaciÃ³n extraÃ­da del primer bloque:', extractedInfo);

    // PROCESAMIENTO ADICIONAL PARA ACTA CONSTITUTIVA CON BLOQUES MÃšLTIPLES
    if (document.document_type === 'acta_constitutiva' && allImages.length > 5) {
      const BLOCK_SIZE = 5;
      const MAX_BLOCKS = 4;
      let currentBlock = 1; // Ya procesamos el bloque 0
      
      // FunciÃ³n para verificar si falta informaciÃ³n crÃ­tica
      const isMissingCriticalInfo = (info: any) => {
        return (
          !info.razon_social || info.razon_social === 'No encontrado' ||
          !info.representante_legal || info.representante_legal === 'No encontrado' ||
          !info.objeto_social || info.objeto_social === 'No encontrado' ||
          !info.registro_publico || info.registro_publico === 'No encontrado'
        );
      };
      
      // FunciÃ³n para consolidar informaciÃ³n (priorizar datos completos)
      const consolidateInfo = (current: any, newInfo: any) => {
        return {
          razon_social: (newInfo.razon_social && newInfo.razon_social !== 'No encontrado') 
            ? newInfo.razon_social 
            : current.razon_social,
          representante_legal: (newInfo.representante_legal && newInfo.representante_legal !== 'No encontrado') 
            ? newInfo.representante_legal 
            : current.representante_legal,
          objeto_social: (newInfo.objeto_social && newInfo.objeto_social !== 'No encontrado') 
            ? newInfo.objeto_social 
            : current.objeto_social,
          registro_publico: (newInfo.registro_publico && newInfo.registro_publico !== 'No encontrado') 
            ? newInfo.registro_publico 
            : current.registro_publico
        };
      };
      
      // Procesar bloques adicionales si falta informaciÃ³n
      while (isMissingCriticalInfo(extractedInfo) && currentBlock < MAX_BLOCKS && (currentBlock * BLOCK_SIZE) < allImages.length) {
        const startPage = currentBlock * BLOCK_SIZE;
        const endPage = Math.min(startPage + BLOCK_SIZE, allImages.length);
        const blockImages = allImages.slice(startPage, endPage);
        
        console.log(`ðŸ“„ Procesando bloque ${currentBlock + 1}: pÃ¡ginas ${startPage + 1}-${endPage} (faltan datos en bloque anterior)`);
        
        // Cargar imÃ¡genes del siguiente bloque
        const blockImageData: Array<{ base64: string; mimeType: string; size: number }> = [];
        for (const imagePath of blockImages) {
          try {
            const imageData = await imageToBase64(imagePath);
            blockImageData.push(imageData);
          } catch (error) {
            console.error('Error cargando bloque adicional:', error);
            break;
          }
        }
        
        if (blockImageData.length === 0) {
          console.log('âš ï¸ No se pudieron cargar mÃ¡s pÃ¡ginas, deteniendo procesamiento por bloques');
          break;
        }
        
        // Procesar este bloque con IA
        try {
          const blockResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                ...toolConfig,
                contents: [
                  {
                    role: 'user',
                    parts: [
                      { text: `${userPrompt}\n\nNOTA: EstÃ¡s analizando las pÃ¡ginas ${startPage + 1}-${endPage} de un acta. Extrae SOLO la informaciÃ³n que encuentres en estas pÃ¡ginas.` },
                      ...blockImageData.map(imgData => ({
                        inline_data: {
                          mime_type: imgData.mimeType,
                          data: imgData.base64,
                        }
                      }))
                    ]
                  }
                ],
                generationConfig: { maxOutputTokens: 2048 },
              }),
            }
          );
          
          if (blockResponse.ok) {
            const blockData = await blockResponse.json();
            const blockParts = blockData.candidates?.[0]?.content?.parts || [];
            const blockFnCall = blockParts.find((p: any) => p.functionCall);

            if (blockFnCall) {
              const blockInfo = blockFnCall.functionCall.args;
              console.log(`âœ… InformaciÃ³n adicional extraÃ­da del bloque ${currentBlock + 1}:`, blockInfo);
              
              // Consolidar informaciÃ³n
              extractedInfo = consolidateInfo(extractedInfo, blockInfo);
              console.log('ðŸ“Š InformaciÃ³n consolidada:', extractedInfo);
            }
          } else {
            console.log(`âš ï¸ Error procesando bloque ${currentBlock + 1}, continuando con informaciÃ³n actual`);
          }
        } catch (blockError) {
          console.error(`Error en bloque ${currentBlock + 1}:`, blockError);
          // Continuar con la informaciÃ³n que tenemos
        }
        
        currentBlock++;
      }
      
      // Resumen final
      const missingFields = [];
      if (!extractedInfo.razon_social || extractedInfo.razon_social === 'No encontrado') missingFields.push('RazÃ³n Social');
      if (!extractedInfo.representante_legal || extractedInfo.representante_legal === 'No encontrado') missingFields.push('Representante Legal');
      if (!extractedInfo.objeto_social || extractedInfo.objeto_social === 'No encontrado') missingFields.push('Objeto Social');
      if (!extractedInfo.registro_publico || extractedInfo.registro_publico === 'No encontrado') missingFields.push('Registro PÃºblico');
      
      if (missingFields.length > 0) {
        console.log(`âš ï¸ Campos no encontrados despuÃ©s de procesar ${currentBlock} bloques: ${missingFields.join(', ')}`);
      } else {
        console.log(`âœ… InformaciÃ³n completa obtenida despuÃ©s de procesar ${currentBlock} bloque(s)`);
      }
    }

    console.log('âœ¨ InformaciÃ³n final extraÃ­da:', extractedInfo);

    // Validar informaciÃ³n extraÃ­da
    const validationErrors: string[] = [];
    let isValid = true;

    // Validaciones de fecha de emisiÃ³n (constancia fiscal y comprobante domicilio)
    if ((document.document_type === 'constancia_fiscal' || document.document_type === 'comprobante_domicilio') && extractedInfo.fecha_emision) {
      try {
        const fechaEmision = new Date(extractedInfo.fecha_emision);
        const hoy = new Date();
        const tresMesesAtras = new Date();
        tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);

        if (fechaEmision < tresMesesAtras) {
          const tipoDoc = document.document_type === 'constancia_fiscal' ? 'La constancia' : 'El comprobante';
          validationErrors.push(`${tipoDoc} tiene mÃ¡s de 3 meses de antigÃ¼edad. Se requiere un documento actualizado.`);
          isValid = false;
        }

        console.log('ValidaciÃ³n de fecha:', {
          tipoDocumento: document.document_type,
          fechaEmision: fechaEmision.toISOString(),
          tresMesesAtras: tresMesesAtras.toISOString(),
          esValida: fechaEmision >= tresMesesAtras
        });
      } catch (error) {
        console.error('Error validando fecha:', error);
        validationErrors.push('No se pudo validar la fecha de emisiÃ³n');
        isValid = false;
      }
    }

    // Preparar campos a actualizar segÃºn el tipo de documento
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

    // Actualizar el documento con la informaciÃ³n extraÃ­da
    const { error: updateError } = await supabaseClient
      .from('documents')
      .update(updateFields)
      .eq('id', documentId);

    if (updateError) {
      console.error('Error actualizando documento:', updateError);
      throw updateError;
    }

    console.log('Documento actualizado exitosamente con confianza:', validationResult.confidence_score);

    // Agregar nota de validaciÃ³n al inicio si hay advertencias
    if (validationResult.detected_issues.length > 0) {
      validationErrors.unshift(`Nivel de confianza: ${validationResult.confidence_score}% - ${validationResult.validation_notes}`);
    }

    // Realizar validaciÃ³n cruzada entre constancia_fiscal y comprobante_domicilio
    if (document.document_type === 'constancia_fiscal' || document.document_type === 'comprobante_domicilio') {
      console.log('Iniciando validaciÃ³n cruzada entre constancia fiscal y comprobante domicilio...');
      
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
          console.log('Validando RFC, RazÃ³n Social y CÃ³digo Postal:', {
            constancia: { rfc: constanciaFiscal.rfc, razon_social: constanciaFiscal.razon_social, codigo_postal: constanciaFiscal.codigo_postal },
            comprobante: { rfc: comprobanteDomicilio.rfc, razon_social: comprobanteDomicilio.razon_social, codigo_postal: comprobanteDomicilio.codigo_postal }
          });

          const errors: string[] = [];

          // Validar RFC
          if (constanciaFiscal.rfc && comprobanteDomicilio.rfc && constanciaFiscal.rfc !== comprobanteDomicilio.rfc) {
            errors.push(`El RFC no coincide entre documentos. Constancia: ${constanciaFiscal.rfc}, Comprobante: ${comprobanteDomicilio.rfc}`);
          }

          // Validar RazÃ³n Social (normalizar para comparaciÃ³n)
          if (constanciaFiscal.razon_social && comprobanteDomicilio.razon_social) {
            const razonSocialConstancia = constanciaFiscal.razon_social.trim().toLowerCase();
            const razonSocialComprobante = comprobanteDomicilio.razon_social.trim().toLowerCase();
            
            if (razonSocialConstancia !== razonSocialComprobante) {
              errors.push(`La RazÃ³n Social no coincide entre documentos. Constancia: "${constanciaFiscal.razon_social}", Comprobante: "${comprobanteDomicilio.razon_social}"`);
            }
          }

          // Validar CÃ³digo Postal
          if (constanciaFiscal.codigo_postal && comprobanteDomicilio.codigo_postal && constanciaFiscal.codigo_postal !== comprobanteDomicilio.codigo_postal) {
            errors.push(`El CÃ³digo Postal no coincide entre documentos. Constancia: ${constanciaFiscal.codigo_postal}, Comprobante: ${comprobanteDomicilio.codigo_postal}`);
          }

          if (errors.length > 0) {
            // Hay errores, actualizar ambos documentos
            console.log('Errores de validaciÃ³n encontrados:', errors);
            
            for (const doc of [constanciaFiscal, comprobanteDomicilio]) {
              // Obtener errores actuales y combinar
              const { data: currentDoc } = await supabaseClient
                .from('documents')
                .select('validation_errors')
                .eq('id', doc.id)
                .single();

              const currentErrors = currentDoc?.validation_errors || [];
              // Filtrar errores antiguos de RFC, RazÃ³n Social y CÃ³digo Postal, agregar nuevos
              const filteredErrors = currentErrors.filter(
                (err: string) => !err.includes('RFC no coincide') && !err.includes('RazÃ³n Social no coincide') && !err.includes('CÃ³digo Postal no coincide')
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
            // No hay errores, limpiar errores de RFC, RazÃ³n Social y CÃ³digo Postal
            console.log('RFC, RazÃ³n Social y CÃ³digo Postal coinciden correctamente');
            
            for (const doc of [constanciaFiscal, comprobanteDomicilio]) {
              const { data: currentDoc } = await supabaseClient
                .from('documents')
                .select('validation_errors')
                .eq('id', doc.id)
                .single();

              if (currentDoc && currentDoc.validation_errors) {
                const filteredErrors = currentDoc.validation_errors.filter(
                  (err: string) => !err.includes('RFC no coincide') && !err.includes('RazÃ³n Social no coincide') && !err.includes('CÃ³digo Postal no coincide')
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

    // Realizar validaciÃ³n cruzada entre aviso_funcionamiento y constancia_fiscal
    if (document.document_type === 'aviso_funcionamiento' || document.document_type === 'constancia_fiscal') {
      console.log('Iniciando validaciÃ³n cruzada entre aviso de funcionamiento y constancia fiscal...');
      
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
          console.log('Validando RazÃ³n Social y DirecciÃ³n:', {
            constancia: { razon_social: constanciaFiscal.razon_social, direccion: constanciaFiscal.direccion },
            aviso: { razon_social: avisoFuncionamiento.razon_social, direccion: avisoFuncionamiento.direccion }
          });

          const errors: string[] = [];

          // Validar RazÃ³n Social (normalizar para comparaciÃ³n)
          if (constanciaFiscal.razon_social && avisoFuncionamiento.razon_social) {
            const normalize = (str: string) => str.trim().toLowerCase()
              .replace(/\s+/g, ' ')
              .replace(/\./g, '')
              .replace(/,/g, '');
            
            const razonSocialConstancia = normalize(constanciaFiscal.razon_social);
            const razonSocialAviso = normalize(avisoFuncionamiento.razon_social);
            
            if (razonSocialConstancia === razonSocialAviso) {
              errors.push(`âœ… Coincidencia confirmada: RazÃ³n Social en Constancia Fiscal (${constanciaFiscal.razon_social}) coincide con Aviso de Funcionamiento (${avisoFuncionamiento.razon_social})`);
            } else if (razonSocialConstancia.includes(razonSocialAviso) || razonSocialAviso.includes(razonSocialConstancia)) {
              errors.push(`âœ… Coincidencia confirmada: RazÃ³n Social similar - Constancia Fiscal: ${constanciaFiscal.razon_social}, Aviso de Funcionamiento: ${avisoFuncionamiento.razon_social}`);
            } else {
              errors.push(`âŒ La RazÃ³n Social no coincide entre documentos. Constancia Fiscal: "${constanciaFiscal.razon_social}", Aviso de Funcionamiento: "${avisoFuncionamiento.razon_social}"`);
            }
          }

          // Validar DirecciÃ³n (normalizar para comparaciÃ³n)
          if (constanciaFiscal.direccion && avisoFuncionamiento.direccion) {
            const normalize = (str: string) => str.trim().toLowerCase()
              .replace(/\s+/g, ' ')
              .replace(/,/g, '')
              .replace(/\./g, '');
            
            const direccionConstancia = normalize(constanciaFiscal.direccion);
            const direccionAviso = normalize(avisoFuncionamiento.direccion);
            
            if (direccionConstancia === direccionAviso) {
              errors.push(`âœ… Coincidencia confirmada: DirecciÃ³n en Constancia Fiscal (${constanciaFiscal.direccion}) coincide con Aviso de Funcionamiento (${avisoFuncionamiento.direccion})`);
            } else if (direccionConstancia.includes(direccionAviso) || direccionAviso.includes(direccionConstancia)) {
              errors.push(`âœ… Coincidencia confirmada: DirecciÃ³n similar - Constancia Fiscal: ${constanciaFiscal.direccion}, Aviso de Funcionamiento: ${avisoFuncionamiento.direccion}`);
            } else {
              errors.push(`âŒ La DirecciÃ³n no coincide entre documentos. Constancia Fiscal: "${constanciaFiscal.direccion}", Aviso de Funcionamiento: "${avisoFuncionamiento.direccion}"`);
            }
          }

          if (errors.length > 0) {
            // Hay errores, actualizar ambos documentos
            console.log('Errores de validaciÃ³n encontrados:', errors);
            
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
                (err: string) => !err.includes('RazÃ³n Social') && 
                                 !err.includes('DirecciÃ³n') &&
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
            // No hay errores, limpiar errores de validaciÃ³n entre aviso y constancia
            console.log('RazÃ³n Social y DirecciÃ³n coinciden correctamente');
            
            for (const doc of [constanciaFiscal, avisoFuncionamiento]) {
              const { data: currentDoc } = await supabaseClient
                .from('documents')
                .select('validation_errors')
                .eq('id', doc.id)
                .single();

              if (currentDoc && currentDoc.validation_errors) {
                const filteredErrors = currentDoc.validation_errors.filter(
                  (err: string) => !err.includes('RazÃ³n Social') && 
                                   !err.includes('DirecciÃ³n') &&
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

    // Realizar validaciÃ³n cruzada entre datos_bancarios y constancia_fiscal
    if (document.document_type === 'datos_bancarios' || document.document_type === 'constancia_fiscal') {
      console.log('Iniciando validaciÃ³n cruzada entre datos bancarios y constancia fiscal...');
      
      // Obtener todos los documentos del proveedor
      const { data: supplierDocs, error: docsError } = await supabaseClient
        .from('documents')
        .select('id, document_type, nombre_cliente, razon_social, extraction_status, validation_errors')
        .eq('supplier_id', document.supplier_id)
        .in('document_type', ['datos_bancarios', 'constancia_fiscal'])
        .eq('extraction_status', 'completed');
      
      console.log('Documentos encontrados para validaciÃ³n Datos Bancarios-Constancia:', supplierDocs);

      if (!docsError && supplierDocs) {
        const datosBancarios = supplierDocs.find(d => d.document_type === 'datos_bancarios');
        const constanciaFiscal = supplierDocs.find(d => d.document_type === 'constancia_fiscal');

        if (datosBancarios && constanciaFiscal) {
          console.log('Validando Nombre de Cliente con RazÃ³n Social:', {
            datos_bancarios: { nombre_cliente: datosBancarios.nombre_cliente },
            constancia_fiscal: { razon_social: constanciaFiscal.razon_social }
          });

          const errors: string[] = [];

          // Validar que el nombre del cliente coincida con la razÃ³n social
          if (datosBancarios.nombre_cliente && constanciaFiscal.razon_social) {
            // Normalizar: convertir a mayÃºsculas y eliminar espacios extra
            const normalizarTexto = (texto: string) => {
              return texto.trim().toUpperCase().replace(/\s+/g, ' ');
            };
            
            const nombreClienteNorm = normalizarTexto(datosBancarios.nombre_cliente);
            const razonSocialNorm = normalizarTexto(constanciaFiscal.razon_social);
            
            if (nombreClienteNorm === razonSocialNorm) {
              errors.push(`âœ… Coincidencia confirmada: Nombre del cliente en Datos Bancarios (${datosBancarios.nombre_cliente}) coincide con RazÃ³n Social en Constancia Fiscal (${constanciaFiscal.razon_social})`);
            } else if (nombreClienteNorm.includes(razonSocialNorm) || razonSocialNorm.includes(nombreClienteNorm)) {
              errors.push(`âœ… Coincidencia confirmada: Nombre similar - Datos Bancarios: ${datosBancarios.nombre_cliente}, Constancia Fiscal: ${constanciaFiscal.razon_social}`);
            } else {
              errors.push(`âŒ El Nombre del Cliente en Datos Bancarios no coincide con la RazÃ³n Social en Constancia Fiscal. Datos Bancarios: "${datosBancarios.nombre_cliente}", Constancia Fiscal: "${constanciaFiscal.razon_social}"`);
            }
          }

          if (errors.length > 0) {
            // Hay errores, actualizar ambos documentos
            console.log('Errores de validaciÃ³n encontrados:', errors);
            
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
                  is_valid: !combinedErrors.some((err: string) => err.startsWith('âŒ'))
                })
                .eq('id', doc.id);
            }
          } else {
            // No hay errores, limpiar errores de validaciÃ³n entre datos bancarios y constancia
            console.log('Nombre del Cliente coincide correctamente con RazÃ³n Social');
            
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
                    is_valid: filteredErrors.length === 0 || !filteredErrors.some((err: string) => err.startsWith('âŒ'))
                  })
                  .eq('id', doc.id);
              }
            }
          }
        }
      }
    }

    // Realizar validaciÃ³n cruzada entre INE y aviso_funcionamiento (responsable sanitario)
    if (document.document_type === 'ine' || document.document_type === 'aviso_funcionamiento') {
      console.log('Iniciando validaciÃ³n cruzada entre INE y aviso de funcionamiento...');
      
      // Obtener todos los documentos del proveedor
      const { data: supplierDocs, error: docsError } = await supabaseClient
        .from('documents')
        .select('id, document_type, nombre_completo_ine, curp, representante_legal, extraction_status, validation_errors')
        .eq('supplier_id', document.supplier_id)
        .in('document_type', ['ine', 'aviso_funcionamiento'])
        .eq('extraction_status', 'completed');
      
      console.log('Documentos encontrados para validaciÃ³n INE-Aviso:', supplierDocs);

      if (!docsError && supplierDocs) {
        const ine = supplierDocs.find(d => d.document_type === 'ine');
        const avisoFuncionamiento = supplierDocs.find(d => d.document_type === 'aviso_funcionamiento');

        if (ine && avisoFuncionamiento) {
          console.log('Validando Nombre Completo y CURP del Responsable Sanitario:', {
            ine: { nombre_completo: ine.nombre_completo_ine, curp: ine.curp },
            aviso: { responsable_sanitario: avisoFuncionamiento.representante_legal, curp: avisoFuncionamiento.curp }
          });

          const errors: string[] = [];

          // PRIORIDAD 1: Validar CURP (identificador Ãºnico mÃ¡s confiable)
          let curpCoincide = false;
          if (ine.curp && avisoFuncionamiento.curp) {
            // Verificar si el dato fue encontrado (no es "No encontrado")
            if (avisoFuncionamiento.curp.toLowerCase().includes('no encontrado')) {
              errors.push(`âš ï¸ Los datos del responsable sanitario no se encontraron en la imagen del Aviso de Funcionamiento procesada. Si el documento tiene mÃºltiples pÃ¡ginas, asegÃºrate de subir la pÃ¡gina que contiene el "Apartado 5: Datos del responsable sanitario".`);
            } else if (ine.curp.trim().toUpperCase() === avisoFuncionamiento.curp.trim().toUpperCase()) {
              // CURP coincide - esto es suficiente para validar
              curpCoincide = true;
              console.log('âœ… CURP del responsable sanitario coincide perfectamente:', ine.curp);
              errors.push(`âœ… Coincidencia confirmada: CURP del responsable sanitario en INE (${ine.curp}) coincide con Aviso de Funcionamiento (${avisoFuncionamiento.curp})`);
            } else {
              errors.push(`âŒ El CURP del responsable sanitario no coincide. INE: ${ine.curp}, Aviso de Funcionamiento: ${avisoFuncionamiento.curp}`);
            }
          }

          // PRIORIDAD 2: Validar Nombre solo si el CURP NO coincide (como validaciÃ³n adicional)
          if (!curpCoincide && ine.nombre_completo_ine && avisoFuncionamiento.representante_legal) {
            // Verificar si el dato fue encontrado (no es "No encontrado")
            if (!avisoFuncionamiento.representante_legal.toLowerCase().includes('no encontrado')) {
              // Normalizar: convertir a minÃºsculas, eliminar espacios extra y ordenar palabras alfabÃ©ticamente
              const normalizarNombre = (nombre: string) => {
                return nombre.trim().toLowerCase()
                  .split(/\s+/)  // Dividir por espacios
                  .filter(palabra => palabra.length > 0)  // Eliminar strings vacÃ­os
                  .sort()  // Ordenar alfabÃ©ticamente
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
            console.log('Errores de validaciÃ³n encontrados:', errors);
            
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
                                 !err.includes('âš ï¸ Los datos del responsable sanitario') &&
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
            // No hay errores, limpiar errores de validaciÃ³n entre INE y aviso
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
                                   !err.includes('âš ï¸ Los datos del responsable sanitario') &&
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

    // Obtener el documento actualizado con todos sus errores de validaciÃ³n
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
