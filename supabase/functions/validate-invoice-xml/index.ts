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
    
    const formaPagoMatch = xmlText.match(/FormaPago="([^"]+)"/);
    const metodoPagoMatch = xmlText.match(/MetodoPago="([^"]+)"/);

    const formaPago = formaPagoMatch ? formaPagoMatch[1] : null;
    const metodoPago = metodoPagoMatch ? metodoPagoMatch[1] : null;

    console.log('FormaPago extraído:', formaPago);
    console.log('MetodoPago extraído:', metodoPago);

    // VALIDACIÓN CRÍTICA: Si FormaPago = 99, entonces MetodoPago DEBE ser PPD
    if (formaPago === '99' && metodoPago !== 'PPD') {
      console.log('ERROR: FormaPago=99 pero MetodoPago no es PPD');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validación de factura fallida',
          mensaje: `Error en el XML: Cuando la Forma de Pago es 99, el Método de Pago debe ser PPD. Se detectó Método de Pago: ${metodoPago || 'no especificado'}.`
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
        requiereComplemento,
        mensaje: requiereComplemento 
          ? 'Se le requerirá Complemento de Pago. Luego de recibir su comprobante de pago, deberá adjuntar el Complemento de Pago en la sección Facturas.'
          : null
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
