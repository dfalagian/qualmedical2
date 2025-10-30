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
    const { pagoId, filePath } = await req.json();
    console.log('Procesando comprobante de pago:', { pagoId, filePath });

    if (!pagoId || !filePath) {
      throw new Error('pagoId y filePath son requeridos');
    }

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
                text: `Analiza este comprobante de pago bancario y extrae la fecha de pago.

**Instrucciones importantes:**
1. Busca la fecha de pago/transferencia en el documento
2. La fecha puede aparecer como "Fecha de pago", "Fecha de operación", "Fecha de transferencia" o similar
3. Devuelve la fecha en formato YYYY-MM-DD
4. Si no encuentras la fecha, devuelve "No encontrado"

Por favor, extrae la información solicitada del comprobante de pago.`
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
              name: 'extract_payment_date',
              description: 'Extrae la fecha de pago del comprobante bancario',
              parameters: {
                type: 'object',
                properties: {
                  fecha_pago: {
                    type: 'string',
                    description: 'Fecha de pago en formato YYYY-MM-DD, o "No encontrado" si no está visible'
                  }
                },
                required: ['fecha_pago']
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

    const extractedInfo = JSON.parse(toolCall.function.arguments);
    console.log('Información extraída:', extractedInfo);

    // Actualizar el registro de pago
    const updateData: any = {
      comprobante_pago_url: publicUrl,
      status: 'pagado',
    };

    if (extractedInfo.fecha_pago && extractedInfo.fecha_pago !== 'No encontrado') {
      updateData.fecha_pago = extractedInfo.fecha_pago;
    }

    const { error: updateError } = await supabaseAdmin
      .from('pagos')
      .update(updateData)
      .eq('id', pagoId);

    if (updateError) {
      console.error('Error actualizando pago:', updateError);
      throw updateError;
    }

    console.log('Pago actualizado exitosamente');

    return new Response(
      JSON.stringify({ 
        success: true,
        fecha_pago: extractedInfo.fecha_pago,
        message: 'Comprobante procesado exitosamente'
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
