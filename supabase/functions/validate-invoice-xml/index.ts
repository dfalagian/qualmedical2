import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { xmlPath } = await req.json();

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
    const formaPagoMatch = xmlText.match(/FormaPago="([^"]+)"/);
    const metodoPagoMatch = xmlText.match(/MetodoPago="([^"]+)"/);
    const folioMatch = xmlText.match(/Folio="([^"]+)"/);
    const serieMatch = xmlText.match(/Serie="([^"]+)"/);
    const totalMatch = xmlText.match(/Total="([0-9.]+)"/);
    const subtotalMatch = xmlText.match(/SubTotal="([0-9.]+)"/);
    const descuentoMatch = xmlText.match(/Descuento="([0-9.]+)"/);
    const fechaMatch = xmlText.match(/Fecha="([^"]+)"/);
    const lugarExpedicionMatch = xmlText.match(/LugarExpedicion="([^"]+)"/);

    // Extraer UUID (TimbreFiscalDigital)
    const uuidMatch = xmlText.match(/UUID="([^"]+)"/);
    
    // Extraer información del emisor
    const emisorNombreMatch = xmlText.match(/cfdi:Emisor[^>]*Nombre="([^"]+)"/);
    const emisorRfcMatch = xmlText.match(/cfdi:Emisor[^>]*Rfc="([^"]+)"/);
    const emisorRegimenMatch = xmlText.match(/RegimenFiscal="([^"]+)"/);
    
    // Extraer información del receptor
    const receptorNombreMatch = xmlText.match(/cfdi:Receptor[^>]*Nombre="([^"]+)"/);
    const receptorRfcMatch = xmlText.match(/cfdi:Receptor[^>]*Rfc="([^"]+)"/);
    const receptorUsoCfdiMatch = xmlText.match(/UsoCFDI="([^"]+)"/);

    // Extraer impuestos totales
    const totalImpuestosMatch = xmlText.match(/TotalImpuestosTrasladados="([0-9.]+)"/);

    // Extraer conceptos/artículos
    const conceptosRegex = /<cfdi:Concepto([^>]*)>/g;
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
    const folio = folioMatch ? folioMatch[1] : null;
    const serie = serieMatch ? serieMatch[1] : null;
    const total = totalMatch ? parseFloat(totalMatch[1]) : null;
    const subtotal = subtotalMatch ? parseFloat(subtotalMatch[1]) : null;
    const descuento = descuentoMatch ? parseFloat(descuentoMatch[1]) : 0;
    const totalImpuestos = totalImpuestosMatch ? parseFloat(totalImpuestosMatch[1]) : 0;
    const fecha = fechaMatch ? fechaMatch[1] : null;
    const lugarExpedicion = lugarExpedicionMatch ? lugarExpedicionMatch[1] : null;
    const uuid = uuidMatch ? uuidMatch[1] : null;
    
    // Construir número de factura (Serie + Folio o solo Folio si no hay Serie)
    const invoiceNumber = serie ? `${serie}-${folio}` : folio;

    console.log('Información extraída del XML:');
    console.log('- Número de factura:', invoiceNumber);
    console.log('- Total:', total);
    console.log('- UUID:', uuid);
    console.log('- Emisor:', emisorNombreMatch?.[1]);
    console.log('- Conceptos encontrados:', conceptos.length);

    // VALIDACIÓN CRÍTICA: Si FormaPago = 99, entonces MetodoPago DEBE ser PPD
    if (formaPago === '99' && metodoPago !== 'PPD') {
      console.log('ERROR: FormaPago=99 pero MetodoPago no es PPD');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validación de factura fallida',
          mensaje: 'Error en el XML: Cuando la Forma de Pago es 99, el Método de Pago debe ser PPD. Se detectó Método de Pago: ' + (metodoPago || 'no especificado') + '.'
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

    // Verificar si se requiere complemento de pago
    // FormaPago = 99 (Por definir) y MetodoPago = PPD (Pago en parcialidades o diferido)
    const requiereComplemento = formaPago === '99' && metodoPago === 'PPD';

    console.log('¿Requiere complemento de pago?:', requiereComplemento);

    return new Response(
      JSON.stringify({
        success: true,
        formaPago,
        metodoPago,
        invoiceNumber,
        amount: total,
        subtotal,
        descuento,
        totalImpuestos,
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
