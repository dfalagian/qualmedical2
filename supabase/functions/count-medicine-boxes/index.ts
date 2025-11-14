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
        JSON.stringify({ error: "No se proporcionó imagen" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY no configurado");
    }

    console.log("Iniciando análisis de imagen con IA mejorada...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro", // Modelo más potente para mejor precisión
        messages: [
          {
            role: "system",
            content: `Eres un experto en análisis de inventarios médicos con visión artificial avanzada. 
Tu tarea es contar con máxima precisión el número de cajas de medicamentos en imágenes.

INSTRUCCIONES CRÍTICAS:
1. Cuenta SOLO cajas completas y claramente visibles
2. NO cuentes cajas parcialmente visibles o cortadas por el borde
3. Si hay cajas apiladas, cuenta cada caja individual visible
4. Si la calidad de imagen es baja, indícalo en tu análisis
5. Proporciona un nivel de confianza en tu conteo (Alto/Medio/Bajo)
6. Identifica si hay etiquetas o códigos visibles en las cajas
7. Describe la organización espacial de las cajas
8. Detecta si hay anomalías (cajas dañadas, mal etiquetadas, etc.)

IMPORTANTE: Sé conservador en el conteo. Es mejor reportar menos cajas con alta confianza que más cajas con incertidumbre.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analiza esta imagen de inventario médico y proporciona:

FORMATO DE RESPUESTA (usa EXACTAMENTE este formato):
---
Total de cajas: [número entero]
Confianza: [Alto/Medio/Bajo]
Calidad de imagen: [Excelente/Buena/Regular/Mala]
---

DETALLES DEL ANÁLISIS:
1. Distribución espacial: [describe cómo están organizadas las cajas]
2. Características visibles: [describe etiquetas, códigos, condición de las cajas]
3. Observaciones importantes: [cualquier detalle relevante o anomalía]
4. Recomendaciones: [sugerencias para mejorar el conteo si aplica]

Si la calidad de imagen es insuficiente para un conteo preciso, indícalo claramente.`
              },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64
                }
              }
            ]
          }
        ],
        temperature: 0.2, // Baja temperatura para más consistencia
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error("Rate limit alcanzado");
        return new Response(
          JSON.stringify({ error: "Límite de solicitudes excedido. Intenta de nuevo más tarde." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        console.error("Créditos insuficientes");
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Por favor, añade fondos a tu cuenta." }),
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
    const analysis = data.choices?.[0]?.message?.content;

    if (!analysis) {
      throw new Error("No se recibió respuesta del modelo");
    }

    console.log("Análisis recibido:", analysis);

    // Extraer datos estructurados del análisis
    const countMatch = analysis.match(/Total de cajas:\s*(\d+)/i);
    const confidenceMatch = analysis.match(/Confianza:\s*(Alto|Medio|Bajo)/i);
    const qualityMatch = analysis.match(/Calidad de imagen:\s*(Excelente|Buena|Regular|Mala)/i);

    const count = countMatch ? parseInt(countMatch[1]) : null;
    const confidence = confidenceMatch ? confidenceMatch[1] : "Desconocido";
    const imageQuality = qualityMatch ? qualityMatch[1] : "Desconocido";

    // Validaciones automáticas
    const warnings = [];
    if (count === null) {
      warnings.push("⚠️ No se pudo extraer un conteo numérico del análisis");
    }
    if (confidence === "Bajo") {
      warnings.push("⚠️ El análisis tiene confianza baja - considera tomar otra foto");
    }
    if (imageQuality === "Mala" || imageQuality === "Regular") {
      warnings.push("⚠️ Calidad de imagen subóptima - se recomienda mejor iluminación");
    }
    if (count && count === 0) {
      warnings.push("⚠️ No se detectaron cajas en la imagen");
    }

    console.log("Conteo extraído:", count);
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
          model: "google/gemini-2.5-pro",
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
