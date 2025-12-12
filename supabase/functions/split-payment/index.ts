import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pagoId, installmentCount, dates, remainingAmount } = await req.json();
    console.log('Dividiendo pago:', { pagoId, installmentCount, dates, remainingAmount });

    if (!pagoId || !installmentCount || !dates || !remainingAmount) {
      throw new Error('pagoId, installmentCount, dates y remainingAmount son requeridos');
    }

    if (dates.length !== installmentCount) {
      throw new Error('El número de fechas debe coincidir con el número de cuotas');
    }

    // Inicializar Supabase Admin Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Obtener información del pago
    const { data: pagoData, error: pagoError } = await supabaseAdmin
      .from('pagos')
      .select('invoice_id, supplier_id, original_amount')
      .eq('id', pagoId)
      .single();

    if (pagoError || !pagoData) {
      console.error('Error obteniendo pago:', pagoError);
      throw new Error('No se pudo obtener información del pago');
    }

    // Calcular monto por cuota
    const installmentAmount = remainingAmount / installmentCount;
    console.log('Monto por cuota:', installmentAmount);

    // Crear las cuotas
    const installments = dates.map((date: string, index: number) => ({
      pago_id: pagoId,
      invoice_id: pagoData.invoice_id,
      installment_number: index + 1,
      expected_amount: Number(installmentAmount.toFixed(2)),
      status: 'pendiente',
      payment_date: date,
    }));

    console.log('Creando cuotas:', installments);

    const { error: insertError } = await supabaseAdmin
      .from('payment_installments')
      .insert(installments);

    if (insertError) {
      console.error('Error creando cuotas:', insertError);
      throw insertError;
    }

    // Actualizar el pago principal como dividido
    const { error: updatePagoError } = await supabaseAdmin
      .from('pagos')
      .update({
        is_split_payment: true,
        total_installments: installmentCount,
        status: 'procesando',
      })
      .eq('id', pagoId);

    if (updatePagoError) {
      console.error('Error actualizando pago:', updatePagoError);
      throw updatePagoError;
    }

    console.log('Pago dividido exitosamente');

    return new Response(
      JSON.stringify({ 
        success: true,
        installmentCount: installmentCount,
        installmentAmount: installmentAmount,
        message: `Pago dividido en ${installmentCount} cuotas de $${installmentAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error dividiendo pago:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});