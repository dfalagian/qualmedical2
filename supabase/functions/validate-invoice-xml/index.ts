import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== INICIO validate-invoice-xml ===');
  console.log('Método:', req.method);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));

  if (req.method === 'OPTIONS') {
    console.log('Respuesta OPTIONS CORS');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Intentando parsear body del request...');
    let body;
    try {
      body = await req.json();
      console.log('Body parseado exitosamente:', body);
    } catch (parseError) {
      console.error('Error al parsear JSON del request:', parseError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'El cuerpo de la solicitud no es JSON válido',
          details: parseError instanceof Error ? parseError.message : 'Error desconocido'
        }),
        { 
          status: 400,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      );
    }

    const { xmlPath } = body;
    console.log('xmlPath recibido:', xmlPath);

    if (!xmlPath) {
      throw new Error('xmlPath es requerido');
    }

    console.log('Descargando XML desde storage:', xmlPath);

    // Crear cliente de Supabase con service role para acceder a archivos privados
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Descargar el archivo XML desde el storage privado
    const { data: xmlData, error: downloadError } = await supabase.storage
      .from('invoices')
      .download(xmlPath);

    if (downloadError) {
      console.error('Error al descargar XML:', downloadError);
      throw new Error('Error al descargar el archivo XML del storage');
    }

    const xmlText = await xmlData.text();
    console.log('XML descargado exitosamente, tamaño:', xmlText.length);

    // Extraer FormaPago y MetodoPago usando regex
    // FormaPago es un atributo del elemento Comprobante
    // MetodoPago también es un atributo del elemento Comprobante
    
    // Extraer información del comprobante
    // Buscar Total primero en el elemento Comprobante (puede tener namespace)
    const formaPagoMatch = xmlText.match(/FormaPago="([^"]+)"/);
    const metodoPagoMatch = xmlText.match(/MetodoPago="([^"]+)"/);
    const folioMatch = xmlText.match(/Folio="([^"]+)"/);
    const serieMatch = xmlText.match(/Serie="([^"]+)"/);
    const tipoComprobanteMatch = xmlText.match(/TipoDeComprobante="([^"]+)"/);

    
    // Mejorar extracción de Total - buscar en diferentes formatos posibles
    // El atributo Total está en el elemento cfdi:Comprobante
    let totalMatch = xmlText.match(/(?:[a-zA-Z0-9]+:)?Comprobante[^>]*Total="([0-9.]+)"/);
    if (!totalMatch) {
      totalMatch = xmlText.match(/\bTotal="([0-9.]+)"/);
    }
    
    // Similar para SubTotal
    let subtotalMatch = xmlText.match(/(?:[a-zA-Z0-9]+:)?Comprobante[^>]*SubTotal="([0-9.]+)"/);
    if (!subtotalMatch) {
      subtotalMatch = xmlText.match(/\bSubTotal="([0-9.]+)"/);
    }
    
    const descuentoMatch = xmlText.match(/Descuento="([0-9.]+)"/);
    const fechaMatch = xmlText.match(/Fecha="([^"]+)"/);
    const lugarExpedicionMatch = xmlText.match(/LugarExpedicion="([^"]+)"/);
    
    console.log('Total extraído:', totalMatch ? totalMatch[1] : 'NO ENCONTRADO');
    console.log('SubTotal extraído:', subtotalMatch ? subtotalMatch[1] : 'NO ENCONTRADO');

    // Extraer UUID (TimbreFiscalDigital)
    const uuidMatch = xmlText.match(/UUID="([^"]+)"/);
    
    // Extraer información del emisor
    const emisorNombreMatch = xmlText.match(/(?:[a-zA-Z0-9]+:)?Emisor[^>]*Nombre="([^"]+)"/);
    const emisorRfcMatch = xmlText.match(/(?:[a-zA-Z0-9]+:)?Emisor[^>]*Rfc="([^"]+)"/);
    const emisorRegimenMatch = xmlText.match(/RegimenFiscal="([^"]+)"/);
    
    const receptorNombreMatch = xmlText.match(/(?:[a-zA-Z0-9]+:)?Receptor[^>]*Nombre="([^"]+)"/);
    const receptorRfcMatch = xmlText.match(/(?:[a-zA-Z0-9]+:)?Receptor[^>]*Rfc="([^"]+)"/);
    const receptorUsoCfdiMatch = xmlText.match(/UsoCFDI="([^"]+)"/);

    // VALIDACIÓN CRÍTICA: Verificar que el RFC del receptor sea de QualMedical
    const receptorRfc = receptorRfcMatch ? receptorRfcMatch[1] : null;
    const RFC_QUALMEDICAL = 'QME240321HF3';
    
    if (receptorRfc !== RFC_QUALMEDICAL) {
      console.log('ERROR: RFC del receptor no corresponde a QualMedical');
      console.log('RFC encontrado:', receptorRfc, '| RFC esperado:', RFC_QUALMEDICAL);
      
      // Devolver status 200 con success: false para que el cliente pueda leer el mensaje
      return new Response(
        JSON.stringify({
          success: false,
          error: 'RFC del receptor inválido',
          mensaje: `El RFC del receptor en la factura (${receptorRfc || 'no especificado'}) no corresponde a QualMedical (${RFC_QUALMEDICAL}). Por favor verifica que la factura esté emitida correctamente.`
        }),
        { 
          status: 200, // Usar 200 para validaciones de negocio
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      );
    }

    // Extraer impuestos totales
    const totalImpuestosMatch = xmlText.match(/TotalImpuestosTrasladados="([0-9.]+)"/);
    const totalRetenidosMatch = xmlText.match(/TotalImpuestosRetenidos="([0-9.]+)"/);

    // Extraer impuestos detallados del bloque <cfdi:Impuestos> del comprobante (totales consolidados)
    // NO de los conceptos individuales
    const impuestosDetalle: any = {
      traslados: [],
      retenciones: []
    };

    // Buscar el bloque principal de Impuestos del Comprobante (al final del XML)
    // Este bloque contiene los totales consolidados, no los impuestos por concepto
    const impuestosBloqueMatch = xmlText.match(/<(?:[a-zA-Z0-9]+:)?Impuestos[^>]*TotalImpuesto[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?Impuestos>/);
    
    if (impuestosBloqueMatch) {
      const impuestosBloque = impuestosBloqueMatch[0];
      console.log('Bloque de Impuestos consolidados encontrado');
      
      // Extraer traslados consolidados del bloque <cfdi:Traslados>
      const trasladosBloqueMatch = impuestosBloque.match(/<(?:[a-zA-Z0-9]+:)?Traslados>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?Traslados>/);
      if (trasladosBloqueMatch) {
        const trasladosBloque = trasladosBloqueMatch[1];
        const trasladosRegex = /<(?:[a-zA-Z0-9]+:)?Traslado\s([^>]*)\/>/g;
        let trasladoMatch;
        while ((trasladoMatch = trasladosRegex.exec(trasladosBloque)) !== null) {
          const trasladoText = trasladoMatch[1];
          const impuestoMatch = trasladoText.match(/Impuesto="([^"]+)"/);
          const tipoFactorMatch = trasladoText.match(/TipoFactor="([^"]+)"/);
          const tasaCuotaMatch = trasladoText.match(/Tasa[Oo]Cuota="([0-9.]+)"/);
          const baseMatch = trasladoText.match(/Base="([0-9.]+)"/);
          const importeMatch = trasladoText.match(/Importe="([0-9.]+)"/);

          impuestosDetalle.traslados.push({
            impuesto: impuestoMatch ? impuestoMatch[1] : null,
            tipo_factor: tipoFactorMatch ? tipoFactorMatch[1] : null,
            tasa_o_cuota: tasaCuotaMatch ? tasaCuotaMatch[1] : null,
            base: baseMatch ? parseFloat(baseMatch[1]) : 0,
            importe: importeMatch ? parseFloat(importeMatch[1]) : 0
          });
        }
      }
      
      // Extraer retenciones consolidadas del bloque <cfdi:Retenciones>
      const retencionesBloqueMatch = impuestosBloque.match(/<(?:[a-zA-Z0-9]+:)?Retenciones>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?Retenciones>/);
      if (retencionesBloqueMatch) {
        const retencionesBloque = retencionesBloqueMatch[1];
        const retencionesRegex = /<(?:[a-zA-Z0-9]+:)?Retencion\s([^>]*)\/>/g;
        let retencionMatch;
        while ((retencionMatch = retencionesRegex.exec(retencionesBloque)) !== null) {
          const retencionText = retencionMatch[1];
          const impuestoMatch = retencionText.match(/Impuesto="([^"]+)"/);
          const importeMatch = retencionText.match(/Importe="([0-9.]+)"/);

          impuestosDetalle.retenciones.push({
            impuesto: impuestoMatch ? impuestoMatch[1] : null,
            importe: importeMatch ? parseFloat(importeMatch[1]) : 0
          });
        }
      }
    } else {
      console.log('⚠️ No se encontró bloque de Impuestos consolidados, sumando impuestos de conceptos');
      
      // Fallback: buscar todos los impuestos y SUMAR por tipo de impuesto
      // Mapas para acumular totales por tipo de impuesto
      const trasladosMap: Record<string, { impuesto: string; tipo_factor: string | null; tasa_o_cuota: string | null; base: number; importe: number }> = {};
      const retencionesMap: Record<string, { impuesto: string; importe: number }> = {};
      
      const trasladosRegex = /<(?:[a-zA-Z0-9]+:)?Traslado\s([^>]*)\/>/g;
      let trasladoMatch;
      while ((trasladoMatch = trasladosRegex.exec(xmlText)) !== null) {
        const trasladoText = trasladoMatch[1];
        const impuestoMatch = trasladoText.match(/Impuesto="([^"]+)"/);
        const tipoFactorMatch = trasladoText.match(/TipoFactor="([^"]+)"/);
        const tasaCuotaMatch = trasladoText.match(/Tasa[Oo]Cuota="([0-9.]+)"/);
        const baseMatch = trasladoText.match(/Base="([0-9.]+)"/);
        const importeMatch = trasladoText.match(/Importe="([0-9.]+)"/);
        
        const impuesto = impuestoMatch ? impuestoMatch[1] : 'desconocido';
        const tasaOCuota = tasaCuotaMatch ? tasaCuotaMatch[1] : null;
        const key = `${impuesto}-${tasaOCuota || 'sin-tasa'}`;
        
        if (!trasladosMap[key]) {
          trasladosMap[key] = {
            impuesto,
            tipo_factor: tipoFactorMatch ? tipoFactorMatch[1] : null,
            tasa_o_cuota: tasaOCuota,
            base: 0,
            importe: 0
          };
        }
        
        trasladosMap[key].base += baseMatch ? parseFloat(baseMatch[1]) : 0;
        trasladosMap[key].importe += importeMatch ? parseFloat(importeMatch[1]) : 0;
      }
      
      const retencionesRegex = /<(?:[a-zA-Z0-9]+:)?Retencion\s([^>]*)\/>/g;
      let retencionMatch;
      while ((retencionMatch = retencionesRegex.exec(xmlText)) !== null) {
        const retencionText = retencionMatch[1];
        const impuestoMatch = retencionText.match(/Impuesto="([^"]+)"/);
        const importeMatch = retencionText.match(/Importe="([0-9.]+)"/);
        
        const impuesto = impuestoMatch ? impuestoMatch[1] : 'desconocido';
        
        if (!retencionesMap[impuesto]) {
          retencionesMap[impuesto] = {
            impuesto,
            importe: 0
          };
        }
        
        retencionesMap[impuesto].importe += importeMatch ? parseFloat(importeMatch[1]) : 0;
      }
      
      // Convertir los mapas a arrays
      impuestosDetalle.traslados = Object.values(trasladosMap);
      impuestosDetalle.retenciones = Object.values(retencionesMap);
      
      console.log('Traslados acumulados:', impuestosDetalle.traslados);
      console.log('Retenciones acumuladas:', impuestosDetalle.retenciones);
    }

    // Extraer conceptos/artículos - soportar con o sin namespace (cfdi:Concepto, Concepto, o cualquier prefijo)
    const conceptosRegex = /<(?:[a-zA-Z0-9]+:)?Concepto\s([^>]*)(?:>|\/\s*>)/g;
    const conceptos = [];
    let conceptoMatch;
    
    while ((conceptoMatch = conceptosRegex.exec(xmlText)) !== null) {
      const conceptoText = conceptoMatch[1];
      const claveProdServMatch = conceptoText.match(/ClaveProdServ="([^"]+)"/);
      const claveUnidadMatch = conceptoText.match(/ClaveUnidad="([^"]+)"/);
      const unidadMatch = conceptoText.match(/Unidad="([^"]+)"/);
      const descripcionMatch = conceptoText.match(/Descripcion="([^"]+)"/);
      const cantidadMatch = conceptoText.match(/Cantidad="([0-9.]+)"/);
      const valorUnitarioMatch = conceptoText.match(/ValorUnitario="([0-9.]+)"/);
      const importeMatch = conceptoText.match(/Importe="([0-9.]+)"/);
      const descuentoConceptoMatch = conceptoText.match(/Descuento="([0-9.]+)"/);

      conceptos.push({
        claveProdServ: claveProdServMatch ? claveProdServMatch[1] : '',
        claveUnidad: claveUnidadMatch ? claveUnidadMatch[1] : '',
        unidad: unidadMatch ? unidadMatch[1] : '',
        descripcion: descripcionMatch ? descripcionMatch[1] : '',
        cantidad: cantidadMatch ? parseFloat(cantidadMatch[1]) : 0,
        valorUnitario: valorUnitarioMatch ? parseFloat(valorUnitarioMatch[1]) : 0,
        importe: importeMatch ? parseFloat(importeMatch[1]) : 0,
        descuento: descuentoConceptoMatch ? parseFloat(descuentoConceptoMatch[1]) : 0
      });
    }

    const formaPago = formaPagoMatch ? formaPagoMatch[1] : null;
    const metodoPago = metodoPagoMatch ? metodoPagoMatch[1] : null;
    const tipoComprobante = tipoComprobanteMatch ? tipoComprobanteMatch[1] : null;
    const folio = folioMatch ? folioMatch[1] : null;
    const serie = serieMatch ? serieMatch[1] : null;
    const total = totalMatch ? parseFloat(totalMatch[1]) : null;
    const subtotal = subtotalMatch ? parseFloat(subtotalMatch[1]) : null;
    const descuento = descuentoMatch ? parseFloat(descuentoMatch[1]) : 0;
    const totalImpuestos = totalImpuestosMatch ? parseFloat(totalImpuestosMatch[1]) : 0;

    const fecha = fechaMatch ? fechaMatch[1] : null;
    const lugarExpedicion = lugarExpedicionMatch ? lugarExpedicionMatch[1] : null;
    const uuid = uuidMatch ? uuidMatch[1] : null;

    // Construir número de factura (Serie + Folio, o solo Folio, o UUID si no hay Folio)
    let invoiceNumber = serie ? `${serie}-${folio}` : folio;
    
    // Si no hay Folio, usar el UUID como número de factura
    if (!invoiceNumber && uuid) {
      invoiceNumber = uuid;
      console.log('⚠️ Factura sin Folio/Serie, usando UUID como número de factura:', uuid);
    }

    console.log('Información extraída del XML:');
    console.log('- Tipo de comprobante:', tipoComprobante);
    console.log('- Número de factura:', invoiceNumber);
    console.log('- Total:', total);
    console.log('- UUID:', uuid);
    console.log('- Emisor:', emisorNombreMatch?.[1]);
    console.log('- Conceptos encontrados:', conceptos.length);
    console.log('- Impuestos detallados - Traslados:', impuestosDetalle.traslados.length);
    console.log('- Impuestos detallados - Retenciones:', impuestosDetalle.retenciones.length);

    // VALIDACIÓN CRÍTICA: Si FormaPago = 99, entonces MetodoPago DEBE ser PPD
    if (formaPago === '99' && metodoPago !== 'PPD') {
      console.log('ERROR: FormaPago=99 pero MetodoPago no es PPD');
      
      // Devolver status 200 con success: false para que el cliente pueda leer el mensaje
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validación de factura fallida',
          mensaje: 'Error en el XML: Cuando la Forma de Pago es 99, el Método de Pago debe ser PPD. Se detectó Método de Pago: ' + (metodoPago || 'no especificado') + '.'
        }),
        { 
          status: 200, // Usar 200 para validaciones de negocio
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      );
    }

    // Verificar si se requiere complemento de pago
    // FormaPago = 99 (Por definir) y MetodoPago = PPD (Pago en parcialidades o diferido)
    const requiereComplemento = formaPago === '99' && metodoPago === 'PPD';

    console.log('¿Requiere complemento de pago?:', requiereComplemento);

    return new Response(
      JSON.stringify({
        success: true,
        tipoComprobante,
        formaPago,
        metodoPago,
        invoiceNumber,
        amount: total,
        subtotal,
        descuento,
        totalImpuestos,
        impuestosDetalle,
        fecha,
        lugarExpedicion,
        uuid,
        emisorNombre: emisorNombreMatch?.[1] || null,
        emisorRfc: emisorRfcMatch?.[1] || null,
        emisorRegimenFiscal: emisorRegimenMatch?.[1] || null,
        receptorNombre: receptorNombreMatch?.[1] || null,
        receptorRfc: receptorRfcMatch?.[1] || null,
        receptorUsoCfdi: receptorUsoCfdiMatch?.[1] || null,
        conceptos,
        requiereComplemento,
        mensaje: requiereComplemento 
          ? 'Esta factura requiere un complemento de pago. Por favor, súbelo cuando esté disponible.'
          : 'Factura válida'
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error en validate-invoice-xml:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
