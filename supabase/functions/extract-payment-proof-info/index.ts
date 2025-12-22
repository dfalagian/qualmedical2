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
                text: `Analiza este comprobante de pago bancario mexicano y extrae la siguiente información:

**Instrucciones MUY importantes:**
1. Busca la fecha de pago/transferencia en el documento
2. La fecha puede aparecer como "Fecha de pago", "Fecha de operación", "Fecha de transferencia" o similar
3. Devuelve la fecha en formato YYYY-MM-DD
4. Extrae el número de cuenta destino (puede ser cuenta completa o CLABE)
5. Identifica el tipo de cuenta (puede ser "Ahorro", "Corriente", "CLABE", etc.)
6. **CRÍTICO PARA EL MONTO**: 
   - Busca el monto principal de la transferencia en campos como "Monto", "Importe", "Cantidad", "Referere", "Total"
   - El monto suele estar precedido por el símbolo "$" o "MXN"
   - IGNORA montos que aparezcan dentro de razones sociales o nombres de empresas (ej: "SA de CV ($1)" NO es el monto)
   - IGNORA montos muy pequeños como $1 que suelen ser parte del texto de la empresa
   - El monto real de una transferencia bancaria típica es mayor a $100
   - Busca números grandes con formato de moneda (ej: $4,511 o $4511)
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

    // Función para sanitizar valores - convertir strings "null", "undefined", etc. a null real
    const sanitizeValue = (value: any): any => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        if (lower === 'null' || lower === 'undefined' || lower === 'no encontrado' || lower === 'n/a' || lower === '') {
          return null;
        }
      }
      return value;
    };

    const paymentDate = sanitizeValue(extractedInfo.fecha_pago);
    const accountNumber = sanitizeValue(extractedInfo.numero_cuenta);
    const accountType = sanitizeValue(extractedInfo.tipo_cuenta);
    const extractedAmount = sanitizeValue(extractedInfo.monto);

    console.log('Valores sanitizados - fecha:', paymentDate, 'cuenta:', accountNumber, 'monto:', extractedAmount);

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
      
      // Obtener el número de cuenta registrado (preferir numero_cuenta sobre CLABE)
      const numeroCuentaRegistrado = (datosBancarios.numero_cuenta && datosBancarios.numero_cuenta !== 'No encontrado') 
        ? datosBancarios.numero_cuenta 
        : '';
      const clabeRegistrada = (datosBancarios.numero_cuenta_clabe && datosBancarios.numero_cuenta_clabe !== 'No encontrado')
        ? datosBancarios.numero_cuenta_clabe
        : '';
      const numeroCuentaComprobante = accountNumber || '';
      
      console.log('Número de cuenta registrado:', numeroCuentaRegistrado);
      console.log('CLABE registrada:', clabeRegistrada);
      console.log('Número de cuenta del comprobante:', numeroCuentaComprobante);
      
      // Función para extraer solo dígitos
      const soloDigitos = (str: string) => str.replace(/\D/g, '');
      
      // Función para verificar si una cuenta está contenida en una CLABE
      // La CLABE tiene 18 dígitos: 3 (banco) + 3 (plaza) + 11 (cuenta) + 1 (verificador)
      // El número de cuenta usualmente son los 11 dígitos del medio (posiciones 6-16)
      const cuentaEnClabe = (cuenta: string, clabe: string): boolean => {
        if (!cuenta || !clabe) return false;
        const cuentaLimpia = soloDigitos(cuenta);
        const clabeLimpia = soloDigitos(clabe);
        // Verificar si la cuenta está contenida en la CLABE
        return clabeLimpia.includes(cuentaLimpia);
      };
      
      // Función para comparar cuentas con tolerancia a formatos
      const cuentasCoinciden = (cuenta1: string, cuenta2: string, clabe1: string, clabe2: string): boolean => {
        const c1 = soloDigitos(cuenta1);
        const c2 = soloDigitos(cuenta2);
        const cl1 = soloDigitos(clabe1);
        const cl2 = soloDigitos(clabe2);
        
        // Caso 1: Las cuentas coinciden directamente
        if (c1 && c2 && c1 === c2) return true;
        
        // Caso 2: Las CLABEs coinciden
        if (cl1 && cl2 && cl1 === cl2) return true;
        
        // Caso 3: La cuenta del comprobante está en la CLABE registrada
        if (c2 && cl1 && cuentaEnClabe(c2, cl1)) return true;
        
        // Caso 4: La CLABE del comprobante coincide con la registrada
        if (cl2 && cl1 && cl2 === cl1) return true;
        
        // Caso 5: El comprobante muestra CLABE y la cuenta registrada está en ella
        if (c1 && cl2 && cuentaEnClabe(c1, cl2)) return true;
        
        // Caso 6: Comparar últimos dígitos con tolerancia
        // Si uno es cuenta (10-11 dígitos) y otro es CLABE (18 dígitos), comparar últimos dígitos
        if (c1.length >= 10 && c2.length === 18) {
          // c2 es CLABE, extraer cuenta de CLABE (posiciones 6-16, excluyendo verificador)
          const cuentaDeClabe = c2.substring(6, 17);
          if (c1 === cuentaDeClabe || c1.slice(-10) === cuentaDeClabe.slice(-10)) return true;
        }
        if (c2.length >= 10 && c1.length === 18) {
          // c1 es CLABE, extraer cuenta de CLABE
          const cuentaDeClabe = c1.substring(6, 17);
          if (c2 === cuentaDeClabe || c2.slice(-10) === cuentaDeClabe.slice(-10)) return true;
        }
        
        // Caso 7: Últimos 10 dígitos coinciden (sin el dígito verificador de CLABE)
        const u10_1 = c1.slice(-10) || cl1.slice(6, 16);
        const u10_2 = c2.slice(-10) || cl2.slice(6, 16);
        if (u10_1 && u10_2 && u10_1 === u10_2) return true;
        
        return false;
      };
      
      // Si hay un número en el comprobante, verificar contra el registrado
      if (numeroCuentaComprobante) {
        if (!numeroCuentaRegistrado && !clabeRegistrada) {
          // No hay número de cuenta registrado
          discrepanciaDetectada.numero_cuenta = {
            registrado: 'No encontrado',
            comprobante: numeroCuentaComprobante,
            mensaje: 'No se encontró número de cuenta registrado en los datos bancarios'
          };
        } else {
          // Comparar con tolerancia a formatos (cuenta vs CLABE)
          const coincide = cuentasCoinciden(numeroCuentaRegistrado, numeroCuentaComprobante, clabeRegistrada, '');
          
          if (!coincide) {
            discrepanciaDetectada.numero_cuenta = {
              registrado: numeroCuentaRegistrado || clabeRegistrada,
              comprobante: numeroCuentaComprobante,
              mensaje: 'El número de cuenta del comprobante no coincide con el registrado'
            };
          } else {
            console.log('✅ Cuenta verificada: coincide con los datos registrados');
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

    // Obtener el total ya pagado de comprobantes anteriores
    const { data: existingProofs } = await supabaseAdmin
      .from('payment_proofs')
      .select('amount, proof_number')
      .eq('pago_id', pagoId)
      .order('proof_number', { ascending: false });

    const totalPaidBefore = existingProofs?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
    const nextProofNumber = (existingProofs?.[0]?.proof_number || 0) + 1;
    const currentPaymentAmount = extractedAmount || 0;
    const totalPaidNow = totalPaidBefore + currentPaymentAmount;
    const remainingAmount = invoiceAmount - totalPaidNow;
    const isFullyPaid = remainingAmount <= 0;

    console.log('Análisis de pagos:', {
      invoiceAmount,
      totalPaidBefore,
      currentPaymentAmount,
      totalPaidNow,
      remainingAmount,
      isFullyPaid,
      nextProofNumber
    });

    // Guardar el comprobante en payment_proofs
    const { error: proofError } = await supabaseAdmin
      .from('payment_proofs')
      .insert({
        pago_id: pagoId,
        invoice_id: pagoData.invoice_id,
        proof_number: nextProofNumber,
        amount: currentPaymentAmount,
        comprobante_url: publicUrl,
        fecha_pago: paymentDate && paymentDate !== 'No encontrado' ? paymentDate : null,
      });

    if (proofError) {
      console.error('Error guardando comprobante:', proofError);
      throw proofError;
    }

    // Actualizar pago con el total acumulado
    const pagoUpdateData: any = {
      comprobante_pago_url: publicUrl, // Último comprobante
      paid_amount: totalPaidNow,
      status: isFullyPaid ? 'pagado' : 'procesando',
      original_amount: invoiceAmount,
    };

    if (paymentDate && paymentDate !== 'No encontrado') {
      pagoUpdateData.fecha_pago = paymentDate;
    }

    const { error: updatePagoError } = await supabaseAdmin
      .from('pagos')
      .update(pagoUpdateData)
      .eq('id', pagoId);

    if (updatePagoError) {
      console.error('Error actualizando pago:', updatePagoError);
      throw updatePagoError;
    }

    // Actualizar estado de factura
    await supabaseAdmin
      .from('invoices')
      .update({ status: isFullyPaid ? 'pagado' : 'procesando' })
      .eq('id', pagoData.invoice_id);

    // Preparar historial de pagos para la respuesta
    const paymentHistory = existingProofs?.map(p => ({
      number: p.proof_number,
      amount: p.amount
    })) || [];
    paymentHistory.push({ number: nextProofNumber, amount: currentPaymentAmount });

    if (isFullyPaid) {
      return new Response(
        JSON.stringify({ 
          success: true,
          isFullyPaid: true,
          invoiceAmount,
          totalPaid: totalPaidNow,
          paymentHistory,
          discrepancias,
          message: `✅ Factura pagada completamente. Total: $${invoiceAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Pago parcial
    return new Response(
      JSON.stringify({ 
        success: true,
        isPartialPayment: true,
        invoiceAmount,
        currentPayment: currentPaymentAmount,
        totalPaid: totalPaidNow,
        remainingAmount,
        paymentHistory,
        proofNumber: nextProofNumber,
        discrepancias,
        message: `Pago #${nextProofNumber} registrado: $${currentPaymentAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}. Total pagado: $${totalPaidNow.toLocaleString('es-MX', { minimumFractionDigits: 2 })}. Resta: $${remainingAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
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
