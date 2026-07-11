import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No se proporcionÃ³ imagen" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINIKEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINIKEY no configurado");
    }

    // Parse data URL to extract media type and raw base64
    const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    const mediaType = dataUrlMatch ? dataUrlMatch[1] : "image/jpeg";
    const rawBase64 = dataUrlMatch ? dataUrlMatch[2] : imageBase64;

    console.log("Iniciando anÃ¡lisis de imagen con IA mejorada...");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: `Eres un experto en anÃ¡lisis de inventarios mÃ©dicos con visiÃ³n artificial avanzada.
Tu tarea es contar con mÃ¡xima precisiÃ³n el nÃºmero de cajas de medicamentos en imÃ¡genes.

INSTRUCCIONES CRÃTICAS:
1. Cuenta SOLO cajas completas y claramente visibles
2. NO cuentes cajas parcialmente visibles o cortadas por el borde
3. Si hay cajas apiladas, cuenta cada caja individual visible
4. Si la calidad de imagen es baja, indÃ­calo en tu anÃ¡lisis
5. Proporciona un nivel de confianza en tu conteo (Alto/Medio/Bajo)
6. Identifica si hay etiquetas o cÃ³digos visibles en las cajas
7. Describe la organizaciÃ³n espacial de las cajas
8. Detecta si hay anomalÃ­as (cajas daÃ±adas, mal etiquetadas, etc.)

IMPORTANTE: SÃ© conservador en el conteo. Es mejor reportar menos cajas con alta confianza que mÃ¡s cajas con incertidumbre.` }]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  inline_data: {
                    mime_type: mediaType,
                    data: rawBase64,
                  }
                },
                {
                  text: `Analiza esta imagen de inventario mÃ©dico y proporciona:

FORMATO DE RESPUESTA (usa EXACTAMENTE este formato):
---
Total de cajas: [nÃºmero entero]
Confianza: [Alto/Medio/Bajo]
Calidad de imagen: [Excelente/Buena/Regular/Mala]
---

DETALLES DEL ANÃLISIS:
1. DistribuciÃ³n espacial: [describe cÃ³mo estÃ¡n organizadas las cajas]
2. CaracterÃ­sticas visibles: [describe etiquetas, cÃ³digos, condiciÃ³n de las cajas]
3. Observaciones importantes: [cualquier detalle relevante o anomalÃ­a]
4. Recomendaciones: [sugerencias para mejorar el conteo si aplica]

Si la calidad de imagen es insuficiente para un conteo preciso, indÃ­calo claramente.`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        console.error("Rate limit alcanzado");
        return new Response(
          JSON.stringify({ error: "LÃ­mite de solicitudes excedido. Intenta de nuevo mÃ¡s tarde." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        console.error("CrÃ©ditos insuficientes");
        return new Response(
          JSON.stringify({ error: "CrÃ©ditos insuficientes. Por favor, aÃ±ade fondos a tu cuenta." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("Error del gateway de IA:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Error al procesar la imagen" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!analysis) {
      throw new Error("No se recibiÃ³ respuesta del modelo");
    }

    console.log("AnÃ¡lisis recibido:", analysis);

    // Extraer datos estructurados del anÃ¡lisis
    const countMatch = analysis.match(/Total de cajas:\s*(\d+)/i);
    const confidenceMatch = analysis.match(/Confianza:\s*(Alto|Medio|Bajo)/i);
    const qualityMatch = analysis.match(/Calidad de imagen:\s*(Excelente|Buena|Regular|Mala)/i);

    const count = countMatch ? parseInt(countMatch[1]) : null;
    const confidence = confidenceMatch ? confidenceMatch[1] : "Desconocido";
    const imageQuality = qualityMatch ? qualityMatch[1] : "Desconocido";

    // Validaciones automÃ¡ticas
    const warnings = [];
    if (count === null) {
      warnings.push("âš ï¸ No se pudo extraer un conteo numÃ©rico del anÃ¡lisis");
    }
    if (confidence === "Bajo") {
      warnings.push("âš ï¸ El anÃ¡lisis tiene confianza baja - considera tomar otra foto");
    }
    if (imageQuality === "Mala" || imageQuality === "Regular") {
      warnings.push("âš ï¸ Calidad de imagen subÃ³ptima - se recomienda mejor iluminaciÃ³n");
    }
    if (count && count === 0) {
      warnings.push("âš ï¸ No se detectaron cajas en la imagen");
    }

    console.log("Conteo extraÃ­do:", count);
    console.log("Confianza:", confidence);
    console.log("Calidad de imagen:", imageQuality);
    console.log("Advertencias:", warnings);

    return new Response(
      JSON.stringify({
        count,
        analysis,
        confidence,
        imageQuality,
        warnings: warnings.length > 0 ? warnings : undefined,
        success: true,
        metadata: {
          model: "gemini-2.5-flash",
          timestamp: new Date().toISOString(),
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error en count-medicine-boxes:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Error desconocido",
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
