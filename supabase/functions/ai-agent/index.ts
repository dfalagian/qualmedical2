import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.39.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const tools: Anthropic.Tool[] = [
  {
    name: "consultar_stock",
    description: "Consulta el stock actual de productos en los almacenes. Puede filtrar por nombre de almacén o nombre de producto.",
    input_schema: {
      type: "object",
      properties: {
        almacen: {
          type: "string",
          description: "Nombre del almacén a consultar. Ej: 'Principal', 'CITIO'. Si no se especifica, devuelve todos.",
        },
        producto: {
          type: "string",
          description: "Nombre o parte del nombre del producto a buscar.",
        },
        solo_con_stock: {
          type: "boolean",
          description: "Si es true, solo devuelve productos con stock > 0.",
        },
      },
    },
  },
  {
    name: "consultar_cotizaciones",
    description: "Consulta las cotizaciones con su estado, cliente, total y fecha.",
    input_schema: {
      type: "object",
      properties: {
        estado: {
          type: "string",
          description: "Estado de la cotización: 'borrador', 'aprobada', 'rechazada', 'cancelada'. Si no se especifica, devuelve todas.",
        },
        limite: {
          type: "number",
          description: "Máximo de cotizaciones a devolver. Default 10.",
        },
        folio: {
          type: "string",
          description: "Folio específico de cotización a buscar. Ej: 'COT-QUAL-2026-001'.",
        },
      },
    },
  },
  {
    name: "consultar_movimientos",
    description: "Consulta los movimientos de inventario (entradas, salidas, ajustes). Útil para auditar qué pasó con el stock.",
    input_schema: {
      type: "object",
      properties: {
        producto: {
          type: "string",
          description: "Nombre o parte del nombre del producto.",
        },
        tipo: {
          type: "string",
          description: "Tipo de movimiento: 'entrada', 'salida', 'ajuste', 'transferencia'.",
        },
        limite: {
          type: "number",
          description: "Máximo de movimientos a devolver. Default 20.",
        },
        referencia_id: {
          type: "string",
          description: "UUID de la cotización u otra referencia para ver sus movimientos específicos.",
        },
      },
    },
  },
  {
    name: "consultar_productos",
    description: "Busca productos en el catálogo con información de precio y stock total.",
    input_schema: {
      type: "object",
      properties: {
        busqueda: {
          type: "string",
          description: "Texto para buscar en nombre, marca o SKU del producto.",
        },
        limite: {
          type: "number",
          description: "Máximo de productos a devolver. Default 20.",
        },
      },
    },
  },
];

async function executeTool(name: string, input: Record<string, unknown>, supabase: ReturnType<typeof createClient>) {
  try {
    if (name === "consultar_stock") {
      let warehouseIds: string[] | null = null;
      let productIds: string[] | null = null;

      if (input.almacen) {
        const { data } = await supabase
          .from("warehouses")
          .select("id, name")
          .ilike("name", `%${input.almacen}%`);
        warehouseIds = (data || []).map((w: { id: string }) => w.id);
        if (warehouseIds.length === 0) return { error: `No se encontró almacén con nombre "${input.almacen}"` };
      }

      if (input.producto) {
        const { data } = await supabase
          .from("products")
          .select("id")
          .or(`name.ilike.%${input.producto}%,brand.ilike.%${input.producto}%`)
          .eq("is_active", true);
        productIds = (data || []).map((p: { id: string }) => p.id);
        if (productIds.length === 0) return { error: `No se encontró producto con nombre "${input.producto}"` };
      }

      let query = supabase
        .from("warehouse_stock")
        .select("current_stock, products(name, brand, sku), warehouses(name)")
        .order("current_stock", { ascending: false })
        .limit(100);

      if (warehouseIds) query = query.in("warehouse_id", warehouseIds);
      if (productIds) query = query.in("product_id", productIds);
      if (input.solo_con_stock) query = query.gt("current_stock", 0);

      const { data, error } = await query;
      if (error) return { error: error.message };

      const formatted = (data || []).map((row: Record<string, unknown>) => ({
        producto: (row.products as Record<string, unknown>)?.name,
        marca: (row.products as Record<string, unknown>)?.brand,
        sku: (row.products as Record<string, unknown>)?.sku,
        almacen: (row.warehouses as Record<string, unknown>)?.name,
        stock: row.current_stock,
      }));

      return { total_registros: formatted.length, stock: formatted };
    }

    if (name === "consultar_cotizaciones") {
      let query = supabase
        .from("quotes")
        .select("id, folio, status, subtotal, total, fecha_cotizacion, concepto, notes, clients(nombre_cliente)")
        .order("created_at", { ascending: false })
        .limit(Number(input.limite) || 10);

      if (input.estado) query = query.eq("status", input.estado);
      if (input.folio) query = query.ilike("folio", `%${input.folio}%`);

      const { data, error } = await query;
      if (error) return { error: error.message };

      const formatted = (data || []).map((q: Record<string, unknown>) => ({
        id: q.id,
        folio: q.folio,
        cliente: (q.clients as Record<string, unknown>)?.nombre_cliente,
        estado: q.status,
        total: q.total,
        fecha: q.fecha_cotizacion,
        concepto: q.concepto,
      }));

      return { total: formatted.length, cotizaciones: formatted };
    }

    if (name === "consultar_movimientos") {
      let productIds: string[] | null = null;

      if (input.producto) {
        const { data } = await supabase
          .from("products")
          .select("id")
          .or(`name.ilike.%${input.producto}%,brand.ilike.%${input.producto}%`);
        productIds = (data || []).map((p: { id: string }) => p.id);
        if (productIds.length === 0) return { error: `No se encontró producto con nombre "${input.producto}"` };
      }

      let query = supabase
        .from("inventory_movements")
        .select("movement_type, quantity, previous_stock, new_stock, reference_type, reference_id, notes, created_at, products(name, brand)")
        .order("created_at", { ascending: false })
        .limit(Number(input.limite) || 20);

      if (input.tipo) query = query.eq("movement_type", input.tipo);
      if (productIds) query = query.in("product_id", productIds);
      if (input.referencia_id) query = query.eq("reference_id", input.referencia_id);

      const { data, error } = await query;
      if (error) return { error: error.message };

      const formatted = (data || []).map((m: Record<string, unknown>) => ({
        producto: (m.products as Record<string, unknown>)?.name,
        marca: (m.products as Record<string, unknown>)?.brand,
        tipo: m.movement_type,
        cantidad: m.quantity,
        stock_anterior: m.previous_stock,
        stock_nuevo: m.new_stock,
        referencia_tipo: m.reference_type,
        referencia_id: m.reference_id,
        notas: m.notes,
        fecha: m.created_at,
      }));

      return { total: formatted.length, movimientos: formatted };
    }

    if (name === "consultar_productos") {
      let query = supabase
        .from("products")
        .select("id, name, brand, sku, price_type_1, price_with_tax, current_stock, is_active")
        .eq("is_active", true)
        .order("name")
        .limit(Number(input.limite) || 20);

      if (input.busqueda) {
        query = query.or(`name.ilike.%${input.busqueda}%,brand.ilike.%${input.busqueda}%,sku.ilike.%${input.busqueda}%`);
      }

      const { data, error } = await query;
      if (error) return { error: error.message };

      return { total: (data || []).length, productos: data };
    }

    return { error: `Herramienta desconocida: ${name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido ejecutando herramienta" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY no configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { message, history = [] } = await req.json();

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: "user", content: message },
    ];

    const systemPrompt = `Eres un agente de control e inteligencia para el sistema QualMedical2, una plataforma de gestión de inventario y ventas de productos médicos.

Tu rol es ayudar al equipo (especialmente a Ismael) a auditar, monitorear y entender el estado del sistema en tiempo real.

Tienes acceso a estas herramientas de consulta:
- consultar_stock: ver stock por almacén y producto
- consultar_cotizaciones: ver cotizaciones con estado y montos
- consultar_movimientos: auditar movimientos de inventario
- consultar_productos: buscar productos en el catálogo

Comportamiento:
- Responde siempre en español
- Cuando el usuario haga una pregunta, usa las herramientas necesarias para obtener datos reales
- Presenta los datos de forma clara, usando listas o tablas cuando sea útil
- Si detectas algo inusual (stock en 0 inesperadamente, movimientos sin referencia, etc.), menciónalo proactivamente
- Eres de solo lectura — no modificas datos, solo consultas y analizas
- Si el usuario pregunta algo que no puedes responder con las herramientas disponibles, díselo claramente`;

    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    // Tool use loop
    while (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>, supabase);
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          };
        })
      );

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages,
      });
    }

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return new Response(
      JSON.stringify({ response: textContent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
