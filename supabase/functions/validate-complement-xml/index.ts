import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Función para extraer el UUID del documento relacionado de un XML de complemento de pago
function extractUUIDFromComplementXML(xmlContent: string): {
  uuid_documento_relacionado: string | null;
  uuid_complemento: string | null;
  monto_pagado: number | null;
  fecha_pago: string | null;
  num_parcialidad: string | null;
} {
  console.log('Parseando XML del complemento...');
  
  // Limpiar BOM y espacios
  const cleanXml = xmlContent.replace(/^\uFEFF/, '').trim();
  
  // 1. Extraer UUID del documento relacionado (IdDocumento en DoctoRelacionado)
  // Patrones comunes para DoctoRelacionado IdDocumento
  const doctoRelacionadoPatterns = [
    /IdDocumento\s*=\s*["']([A-Fa-f0-9-]{36})["']/i,
    /pago20:DoctoRelacionado[^>]*IdDocumento\s*=\s*["']([A-Fa-f0-9-]{36})["']/i,
    /pago10:DoctoRelacionado[^>]*IdDocumento\s*=\s*["']([A-Fa-f0-9-]{36})["']/i,
    /<(?:pago20:|pago10:)?DoctoRelacionado[^>]*IdDocumento\s*=\s*["']([A-Fa-f0-9-]{36})["']/i,
  ];
  
  let uuid_documento_relacionado: string | null = null;
  for (const pattern of doctoRelacionadoPatterns) {
    const match = cleanXml.match(pattern);
    if (match && match[1]) {
      uuid_documento_relacionado = match[1].toUpperCase();
      console.log('UUID documento relacionado encontrado:', uuid_documento_relacionado);
      break;
    }
  }

  // 2. Extraer UUID del complemento (TimbreFiscalDigital UUID)
  const timbrePatterns = [
    /tfd:TimbreFiscalDigital[^>]*UUID\s*=\s*["']([A-Fa-f0-9-]{36})["']/i,
    /<TimbreFiscalDigital[^>]*UUID\s*=\s*["']([A-Fa-f0-9-]{36})["']/i,
    /cfdi:Complemento[^>]*>[\s\S]*?UUID\s*=\s*["']([A-Fa-f0-9-]{36})["']/i,
  ];
  
  let uuid_complemento: string | null = null;
  for (const pattern of timbrePatterns) {
    const match = cleanXml.match(pattern);
    if (match && match[1]) {
      uuid_complemento = match[1].toUpperCase();
      console.log('UUID del complemento encontrado:', uuid_complemento);
      break;
    }
  }

  // 3. Extraer monto pagado (ImpPagado en DoctoRelacionado)
  const montoPatterns = [
    /ImpPagado\s*=\s*["']([0-9.]+)["']/i,
    /pago20:DoctoRelacionado[^>]*ImpPagado\s*=\s*["']([0-9.]+)["']/i,
    /pago10:DoctoRelacionado[^>]*ImpPagado\s*=\s*["']([0-9.]+)["']/i,
  ];
  
  let monto_pagado: number | null = null;
  for (const pattern of montoPatterns) {
    const match = cleanXml.match(pattern);
    if (match && match[1]) {
      monto_pagado = parseFloat(match[1]);
      console.log('Monto pagado encontrado:', monto_pagado);
      break;
    }
  }

  // 4. Extraer fecha de pago (FechaPago en Pago)
  const fechaPatterns = [
    /FechaPago\s*=\s*["'](\d{4}-\d{2}-\d{2})/i,
    /pago20:Pago[^>]*FechaPago\s*=\s*["'](\d{4}-\d{2}-\d{2})/i,
    /pago10:Pago[^>]*FechaPago\s*=\s*["'](\d{4}-\d{2}-\d{2})/i,
  ];
  
  let fecha_pago: string | null = null;
  for (const pattern of fechaPatterns) {
    const match = cleanXml.match(pattern);
    if (match && match[1]) {
      fecha_pago = match[1];
      console.log('Fecha de pago encontrada:', fecha_pago);
      break;
    }
  }

  // 5. Extraer número de parcialidad
  const parcialidadPatterns = [
    /NumParcialidad\s*=\s*["'](\d+)["']/i,
  ];
  
  let num_parcialidad: string | null = null;
  for (const pattern of parcialidadPatterns) {
    const match = cleanXml.match(pattern);
    if (match && match[1]) {
      num_parcialidad = match[1];
      console.log('Número de parcialidad encontrado:', num_parcialidad);
      break;
    }
  }

  return {
    uuid_documento_relacionado,
    uuid_complemento,
    monto_pagado,
    fecha_pago,
    num_parcialidad
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invoiceId, filePath } = await req.json();
    console.log('Validando XML del complemento de pago:', { invoiceId, filePath });

    if (!invoiceId || !filePath) {
      throw new Error('invoiceId y filePath son requeridos');
    }

    // Verificar que sea un archivo XML
    if (!filePath.toLowerCase().endsWith('.xml')) {
      throw new Error('El archivo debe ser un XML');
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

    // Descargar el archivo XML desde Storage
    console.log('Descargando XML desde storage:', filePath);
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('documents')
      .download(filePath);
    
    if (downloadError || !fileData) {
      throw new Error(`Error descargando archivo: ${downloadError?.message || 'No data'}`);
    }
    
    // Leer el contenido del XML
    const xmlContent = await fileData.text();
    console.log('XML descargado, tamaño:', xmlContent.length, 'caracteres');

    // Extraer información del XML
    const extractedInfo = extractUUIDFromComplementXML(xmlContent);
    console.log('Información extraída:', extractedInfo);

    const extractedUUID = extractedInfo.uuid_documento_relacionado;
    const normalizedInvoiceUUID = invoiceUUID.toUpperCase().trim();

    console.log('UUID extraído del complemento:', extractedUUID);
    console.log('UUID de la factura (normalizado):', normalizedInvoiceUUID);

    // Validar que se haya encontrado el UUID
    if (!extractedUUID) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'No se pudo extraer el UUID del documento relacionado del XML. Verifique que el archivo sea un complemento de pago CFDI válido con la sección DoctoRelacionado.',
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
          error: `El UUID del documento relacionado (${extractedUUID}) NO coincide con el UUID de la factura (${normalizedInvoiceUUID}). Este complemento no corresponde a esta factura.`,
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
        uuidComplemento: extractedInfo.uuid_complemento,
        invoiceNumber: invoiceData.invoice_number,
        extractedInfo
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    console.error('Error en validate-complement-xml:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error validando el XML del complemento de pago';
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
