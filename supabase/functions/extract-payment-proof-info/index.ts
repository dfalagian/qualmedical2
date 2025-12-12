import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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
    const { pagoId, filePath, installmentId, expectedAmount } = await req.json();
    console.log('Procesando comprobante de pago:', { pagoId, filePath, installmentId, expectedAmount });

    if (!filePath) {
      throw new Error('filePath es requerido');
    }

    // Si es una cuota, procesar diferente
    const isInstallmentPayment = !!installmentId;

    // Inicializar Supabase Admin Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Descargar la imagen desde Storage privado usando admin client
    console.log('Descargando imagen desde storage:', filePath);
    const { data: imageData, error: downloadError } = await supabaseAdmin.storage
      .from('documents')
      .download(filePath);
    
    if (downloadError || !imageData) {
      throw new Error(`Error descargando imagen: ${downloadError?.message || 'No data'}`);
    }
    
    const imageBuffer = await imageData.arrayBuffer();
    
    // Usar la API nativa de Deno para base64 (maneja archivos grandes sin stack overflow)
    const base64Image = base64Encode(imageBuffer);
    const imageDataUrl = `data:image/jpeg;base64,${base64Image}`;

    console.log('Imagen descargada, tamaño:', imageBuffer.byteLength);
    
    // Obtener la URL pública para guardarla en la base de datos
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('documents')
      .getPublicUrl(filePath);

    // Llamar a Lovable AI para extraer la fecha de pago
    console.log('Llamando a Lovable AI para extraer fecha de pago...');
    
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analiza este comprobante de pago bancario y extrae la siguiente información:

**Instrucciones importantes:**
1. Busca la fecha de pago/transferencia en el documento
2. La fecha puede aparecer como "Fecha de pago", "Fecha de operación", "Fecha de transferencia" o similar
3. Devuelve la fecha en formato YYYY-MM-DD
4. Extrae el número de cuenta destino (puede ser cuenta completa o CLABE)
5. Identifica el tipo de cuenta (puede ser "Ahorro", "Corriente", "CLABE", etc.)
6. IMPORTANTE: Extrae el MONTO/IMPORTE de la transferencia (busca campos como "Monto", "Importe", "Cantidad", etc.)
7. Si no encuentras algún dato, devuelve null

Por favor, extrae toda la información solicitada del comprobante de pago.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_payment_info',
              description: 'Extrae la información del comprobante de pago bancario',
              parameters: {
                type: 'object',
                properties: {
                  fecha_pago: {
                    type: 'string',
                    description: 'Fecha de pago en formato YYYY-MM-DD, o null si no está visible'
                  },
                  numero_cuenta: {
                    type: 'string',
                    description: 'Número de cuenta destino (puede ser cuenta completa o CLABE), o null si no está visible'
                  },
                  tipo_cuenta: {
                    type: 'string',
                    description: 'Tipo de cuenta (Ahorro, Corriente, CLABE, etc.), o null si no está visible'
                  },
                  monto: {
                    type: 'number',
                    description: 'Monto/Importe de la transferencia como número decimal, o null si no está visible'
                  }
                },
                required: ['fecha_pago', 'numero_cuenta', 'tipo_cuenta', 'monto']
              }
            }
          }
        ],
        tool_choice: 'required'
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Error de IA:', errorText);
      throw new Error(`Error llamando a Lovable AI: ${aiResponse.statusText}`);
    }

    const aiData = await aiResponse.json();
    console.log('Respuesta de IA recibida:', JSON.stringify(aiData));

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No se recibió respuesta válida de la IA');
    }

    let extractedInfo;
    try {
      const content = toolCall.function.arguments;
      // Intentar parsear directamente
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedInfo = JSON.parse(jsonMatch[0]);
      } else {
        extractedInfo = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Error parseando respuesta de AI:', parseError);
      extractedInfo = {
        fecha_pago: null,
        numero_cuenta: null,
        tipo_cuenta: null,
        monto: null
      };
    }

    console.log('Información parseada:', extractedInfo);

    const paymentDate = extractedInfo.fecha_pago;
    const accountNumber = extractedInfo.numero_cuenta;
    const accountType = extractedInfo.tipo_cuenta;
    const extractedAmount = extractedInfo.monto;

    console.log('Monto extraído del comprobante:', extractedAmount);

    // Si es un pago de cuota, procesarlo de manera diferente
    if (isInstallmentPayment) {
      console.log('Procesando pago de cuota:', installmentId);
      
      // Obtener la URL pública para guardarla
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Verificar si el monto coincide con el esperado
      const amountMismatch = extractedAmount !== null && expectedAmount !== null && 
        Math.abs(extractedAmount - expectedAmount) > 0.01;

      // Actualizar la cuota
      const installmentUpdate: any = {
        comprobante_url: publicUrl,
        status: 'pagado',
        actual_amount: extractedAmount,
      };

      if (paymentDate && paymentDate !== 'No encontrado') {
        installmentUpdate.payment_date = paymentDate;
      }

      const { error: installmentError } = await supabaseAdmin
        .from('payment_installments')
        .update(installmentUpdate)
        .eq('id', installmentId);

      if (installmentError) {
        console.error('Error actualizando cuota:', installmentError);
        throw installmentError;
      }

      // Verificar si todas las cuotas están pagadas para actualizar el pago principal
      const { data: installmentData } = await supabaseAdmin
        .from('payment_installments')
        .select('pago_id')
        .eq('id', installmentId)
        .single();

      if (installmentData) {
        const { data: allInstallments } = await supabaseAdmin
          .from('payment_installments')
          .select('status')
          .eq('pago_id', installmentData.pago_id);

        const allPaid = allInstallments?.every(i => i.status === 'pagado');

        if (allPaid) {
          // Actualizar el pago principal como completado
          await supabaseAdmin
            .from('pagos')
            .update({ status: 'pagado' })
            .eq('id', installmentData.pago_id);

          // También actualizar la factura
          const { data: pagoInfo } = await supabaseAdmin
            .from('pagos')
            .select('invoice_id')
            .eq('id', installmentData.pago_id)
            .single();

          if (pagoInfo) {
            await supabaseAdmin
              .from('invoices')
              .update({ status: 'pagado' })
              .eq('id', pagoInfo.invoice_id);
          }
        }
      }

      console.log('Cuota actualizada exitosamente');

      return new Response(
        JSON.stringify({ 
          success: true,
          fecha_pago: paymentDate,
          extractedAmount: extractedAmount,
          expectedAmount: expectedAmount,
          amountMismatch: amountMismatch,
          message: amountMismatch 
            ? 'Comprobante procesado - El monto no coincide con el esperado' 
            : 'Comprobante de cuota procesado exitosamente'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Procesamiento normal para pagos principales (código original continúa)

    // Obtener información del pago, proveedor y factura
    console.log('Obteniendo información del pago...');
    const { data: pagoData, error: pagoError } = await supabaseAdmin
      .from('pagos')
      .select('supplier_id, datos_bancarios_id, invoice_id, amount')
      .eq('id', pagoId)
      .single();

    if (pagoError || !pagoData) {
      console.error('Error obteniendo información del pago:', pagoError);
      throw new Error('No se pudo obtener información del pago');
    }

    // Obtener monto de la factura
    const { data: invoiceData } = await supabaseAdmin
      .from('invoices')
      .select('amount')
      .eq('id', pagoData.invoice_id)
      .single();

    const invoiceAmount = invoiceData?.amount || pagoData.amount;

    // Obtener datos bancarios registrados del proveedor
    console.log('Obteniendo datos bancarios del proveedor...');
    console.log('datos_bancarios_id:', pagoData.datos_bancarios_id);
    console.log('supplier_id:', pagoData.supplier_id);
    
    const { data: datosBancarios, error: bancError } = await supabaseAdmin
      .from('documents')
      .select('nombre_cliente, numero_cuenta, numero_cuenta_clabe')
      .eq('id', pagoData.datos_bancarios_id)
      .eq('document_type', 'datos_bancarios')
      .single();

    if (bancError) {
      console.error('Error obteniendo datos bancarios:', bancError);
    }
    
    console.log('Datos bancarios obtenidos:', datosBancarios);

    // Comparar datos y detectar discrepancias
    let discrepancias = null;
    if (datosBancarios) {
      const discrepanciaDetectada: any = {};
      
      // Comparar número de cuenta
      const numeroCuentaRegistradoRaw = datosBancarios.numero_cuenta || datosBancarios.numero_cuenta_clabe || '';
      // Ignorar valores como "No encontrado" que pueden haber sido guardados por error
      const numeroCuentaRegistrado = (numeroCuentaRegistradoRaw && numeroCuentaRegistradoRaw !== 'No encontrado') 
        ? numeroCuentaRegistradoRaw 
        : (datosBancarios.numero_cuenta_clabe || '');
      const numeroCuentaComprobante = accountNumber || '';
      
      console.log('Número de cuenta registrado:', numeroCuentaRegistrado);
      console.log('Número de cuenta del comprobante:', numeroCuentaComprobante);
      
      // Si hay un número en el comprobante, verificar contra el registrado
      if (numeroCuentaComprobante) {
        if (!numeroCuentaRegistrado) {
          // No hay número de cuenta registrado
          discrepanciaDetectada.numero_cuenta = {
            registrado: 'No encontrado',
            comprobante: numeroCuentaComprobante,
            mensaje: 'No se encontró número de cuenta registrado en los datos bancarios'
          };
        } else {
          // Comparar últimos 4 dígitos
          const ultimos4Registrado = numeroCuentaRegistrado.slice(-4);
          const ultimos4Comprobante = numeroCuentaComprobante.slice(-4);
          
          if (ultimos4Registrado !== ultimos4Comprobante) {
            discrepanciaDetectada.numero_cuenta = {
              registrado: numeroCuentaRegistrado,
              comprobante: numeroCuentaComprobante,
              mensaje: 'Los últimos 4 dígitos de la cuenta no coinciden'
            };
          }
        }
      }

      if (Object.keys(discrepanciaDetectada).length > 0) {
        discrepancias = {
          detectadas: true,
          detalles: discrepanciaDetectada,
          titular_registrado: datosBancarios.nombre_cliente
        };
        console.warn('⚠️ DISCREPANCIAS DETECTADAS:', discrepancias);
      } else {
        console.log('✅ Validación exitosa: Datos del comprobante coinciden con los registrados');
      }
    }

    // Verificar si el monto del comprobante es menor al monto de la factura
    const needsSplitPayment = extractedAmount !== null && extractedAmount < invoiceAmount;
    console.log('Verificación de monto - Factura:', invoiceAmount, 'Comprobante:', extractedAmount, 'Necesita división:', needsSplitPayment);

    // Si el monto es menor, NO actualizar como pagado aún, devolver información para división
    if (needsSplitPayment) {
      // Guardar el comprobante pero mantener como procesando
      const partialUpdateData: any = {
        comprobante_pago_url: publicUrl,
        status: 'procesando',
        original_amount: invoiceAmount,
      };

      if (paymentDate && paymentDate !== 'No encontrado') {
        partialUpdateData.fecha_pago = paymentDate;
      }

      const { error: partialUpdateError } = await supabaseAdmin
        .from('pagos')
        .update(partialUpdateData)
        .eq('id', pagoId);

      if (partialUpdateError) {
        console.error('Error actualizando pago parcial:', partialUpdateError);
        throw partialUpdateError;
      }

      // Actualizar factura a procesando
      await supabaseAdmin
        .from('invoices')
        .update({ status: 'procesando' })
        .eq('id', pagoData.invoice_id);

      return new Response(
        JSON.stringify({ 
          success: true,
          needsSplitPayment: true,
          extractedAmount: extractedAmount,
          invoiceAmount: invoiceAmount,
          remainingAmount: invoiceAmount - extractedAmount,
          fecha_pago: paymentDate,
          numero_cuenta: accountNumber,
          tipo_cuenta: accountType,
          pagoId: pagoId,
          discrepancias: discrepancias,
          message: 'El monto del comprobante es menor al monto de la factura'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Actualizar el registro de pago (pago completo)
    const updateData: any = {
      comprobante_pago_url: publicUrl,
      status: 'pagado',
    };

    if (paymentDate && paymentDate !== 'No encontrado') {
      updateData.fecha_pago = paymentDate;
    }

    const { error: updateError } = await supabaseAdmin
      .from('pagos')
      .update(updateData)
      .eq('id', pagoId);

    if (updateError) {
      console.error('Error actualizando pago:', updateError);
      throw updateError;
    }

    // Actualizar estado de factura a "pagado"
    const { error: invoiceUpdateError } = await supabaseAdmin
      .from('invoices')
      .update({ status: 'pagado' })
      .eq('id', pagoData.invoice_id);

    if (invoiceUpdateError) {
      console.error('Error actualizando estado de factura:', invoiceUpdateError);
    }

    console.log('Pago actualizado exitosamente');

    return new Response(
      JSON.stringify({ 
        success: true,
        fecha_pago: paymentDate,
        numero_cuenta: accountNumber,
        tipo_cuenta: accountType,
        discrepancias: discrepancias,
        message: discrepancias 
          ? 'Comprobante procesado con advertencias - Se detectaron discrepancias en los datos' 
          : 'Comprobante procesado exitosamente'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error procesando comprobante:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    const errorDetails = error instanceof Error ? error.toString() : String(error);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorDetails
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
