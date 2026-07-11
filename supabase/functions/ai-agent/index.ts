import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const tools = [
  // â”€â”€ CONSULTAS (solo lectura) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    name: "consultar_stock",
    description: "Consulta el stock actual de productos en los almacenes.",
    input_schema: {
      type: "object",
      properties: {
        almacen: { type: "string", description: "Nombre del almacÃ©n. Ej: 'Principal', 'CITIO'." },
        producto: { type: "string", description: "Nombre o parte del nombre del producto." },
        solo_con_stock: { type: "boolean", description: "Si true, solo devuelve productos con stock > 0." },
      },
    },
  },
  {
    name: "consultar_cotizaciones",
    description: "Consulta las cotizaciones con su estado, cliente, total y fecha.",
    input_schema: {
      type: "object",
      properties: {
        estado: { type: "string", description: "Estado: 'borrador', 'aprobada', 'rechazada', 'cancelada'." },
        limite: { type: "number", description: "MÃ¡ximo de resultados. Default 10." },
        folio: { type: "string", description: "Folio especÃ­fico a buscar." },
      },
    },
  },
  {
    name: "consultar_movimientos",
    description: "Consulta los movimientos de inventario (entradas, salidas, ajustes).",
    input_schema: {
      type: "object",
      properties: {
        producto: { type: "string", description: "Nombre o parte del nombre del producto." },
        tipo: { type: "string", description: "Tipo: 'entrada', 'salida', 'ajuste', 'transferencia'." },
        limite: { type: "number", description: "MÃ¡ximo de resultados. Default 20." },
        referencia_id: { type: "string", description: "UUID de la cotizaciÃ³n para ver sus movimientos." },
      },
    },
  },
  {
    name: "consultar_productos",
    description: "Busca productos en el catÃ¡logo con precios y stock.",
    input_schema: {
      type: "object",
      properties: {
        busqueda: { type: "string", description: "Texto para buscar en nombre, marca o SKU." },
        limite: { type: "number", description: "MÃ¡ximo de resultados. Default 20." },
      },
    },
  },
  {
    name: "consultar_clientes",
    description: "Busca clientes disponibles para cotizaciones.",
    input_schema: {
      type: "object",
      properties: {
        busqueda: { type: "string", description: "Nombre o RFC del cliente." },
        limite: { type: "number", description: "MÃ¡ximo de resultados. Default 10." },
      },
    },
  },

  // â”€â”€ ACCIONES (requieren confirmaciÃ³n explÃ­cita del usuario) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    name: "aprobar_cotizacion",
    description: "Aprueba una cotizaciÃ³n en estado borrador. SOLO ejecutar cuando el usuario haya confirmado explÃ­citamente con 'sÃ­', 'confirmo', 'procede' u otra confirmaciÃ³n clara. Nunca ejecutar sin confirmaciÃ³n.",
    input_schema: {
      type: "object",
      properties: {
        folio: { type: "string", description: "Folio de la cotizaciÃ³n a aprobar. Ej: 'COT-QUAL-2026-001'." },
        warehouse_id: { type: "string", description: "UUID del almacÃ©n desde donde se descuenta el stock." },
      },
      required: ["folio", "warehouse_id"],
    },
  },
  {
    name: "rechazar_cotizacion",
    description: "Rechaza una cotizaciÃ³n. SOLO ejecutar cuando el usuario haya confirmado explÃ­citamente.",
    input_schema: {
      type: "object",
      properties: {
        folio: { type: "string", description: "Folio de la cotizaciÃ³n a rechazar." },
        motivo: { type: "string", description: "Motivo del rechazo." },
      },
      required: ["folio"],
    },
  },
];

async function executeTool(name: string, input: Record<string, unknown>, supabase: ReturnType<typeof createClient>) {
  try {
    // â”€â”€ CONSULTAS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (name === "consultar_stock") {
      let warehouseIds: string[] | null = null;
      let productIds: string[] | null = null;

      if (input.almacen) {
        const { data } = await supabase.from("warehouses").select("id, name").ilike("name", `%${input.almacen}%`);
        warehouseIds = (data || []).map((w: { id: string }) => w.id);
        if (warehouseIds.length === 0) return { error: `No se encontrÃ³ almacÃ©n "${input.almacen}"` };
      }
      if (input.producto) {
        const { data } = await supabase.from("products").select("id").or(`name.ilike.%${input.producto}%,brand.ilike.%${input.producto}%`).eq("is_active", true);
        productIds = (data || []).map((p: { id: string }) => p.id);
        if (productIds.length === 0) return { error: `No se encontrÃ³ producto "${input.producto}"` };
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
        almacen: (row.warehouses as Record<string, unknown>)?.name,
        stock: row.current_stock,
      }));
      return { total: formatted.length, stock: formatted };
    }

    if (name === "consultar_cotizaciones") {
      let query = supabase
        .from("quotes")
        .select("id, folio, status, total, fecha_cotizacion, concepto, clients(nombre_cliente)")
        .order("created_at", { ascending: false })
        .limit(Number(input.limite) || 10);

      if (input.estado) query = query.eq("status", input.estado);
      if (input.folio) query = query.ilike("folio", `%${input.folio}%`);

      const { data, error } = await query;
      if (error) return { error: error.message };

      return {
        total: (data || []).length,
        cotizaciones: (data || []).map((q: Record<string, unknown>) => ({
          id: q.id,
          folio: q.folio,
          cliente: (q.clients as Record<string, unknown>)?.nombre_cliente,
          estado: q.status,
          total: q.total,
          fecha: q.fecha_cotizacion,
          concepto: q.concepto,
        })),
      };
    }

    if (name === "consultar_movimientos") {
      let productIds: string[] | null = null;
      if (input.producto) {
        const { data } = await supabase.from("products").select("id").or(`name.ilike.%${input.producto}%,brand.ilike.%${input.producto}%`);
        productIds = (data || []).map((p: { id: string }) => p.id);
        if (productIds.length === 0) return { error: `No se encontrÃ³ producto "${input.producto}"` };
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

      return {
        total: (data || []).length,
        movimientos: (data || []).map((m: Record<string, unknown>) => ({
          producto: (m.products as Record<string, unknown>)?.name,
          tipo: m.movement_type,
          cantidad: m.quantity,
          stock_anterior: m.previous_stock,
          stock_nuevo: m.new_stock,
          referencia_tipo: m.reference_type,
          notas: m.notes,
          fecha: m.created_at,
        })),
      };
    }

    if (name === "consultar_productos") {
      let query = supabase
        .from("products")
        .select("id, name, brand, sku, price_type_1, current_stock")
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

    if (name === "consultar_clientes") {
      let query = supabase
        .from("clients")
        .select("id, nombre_cliente, rfc, email, telefono")
        .eq("is_active", true)
        .order("nombre_cliente")
        .limit(Number(input.limite) || 10);

      if (input.busqueda) {
        query = query.or(`nombre_cliente.ilike.%${input.busqueda}%,rfc.ilike.%${input.busqueda}%`);
      }
      const { data, error } = await query;
      if (error) return { error: error.message };
      return { total: (data || []).length, clientes: data };
    }

    // â”€â”€ ACCIONES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (name === "aprobar_cotizacion") {
      const { folio, warehouse_id } = input as { folio: string; warehouse_id: string };

      // 1. Obtener la cotizaciÃ³n
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("id, folio, status, total, quote_items(product_id, nombre_producto, cantidad)")
        .ilike("folio", `%${folio}%`)
        .single();

      if (quoteError || !quote) return { error: `CotizaciÃ³n "${folio}" no encontrada` };
      if ((quote as Record<string, unknown>).status !== "borrador") {
        return { error: `La cotizaciÃ³n ${folio} ya estÃ¡ en estado "${(quote as Record<string, unknown>).status}" â€” solo se pueden aprobar cotizaciones en borrador` };
      }

      // 2. Verificar stock para cada item
      const items = (quote as Record<string, unknown>).quote_items as Array<Record<string, unknown>>;
      const stockIssues: string[] = [];

      for (const item of items) {
        if (!item.product_id) continue;
        const { data: ws } = await supabase
          .from("warehouse_stock")
          .select("current_stock")
          .eq("product_id", item.product_id)
          .eq("warehouse_id", warehouse_id)
          .single();

        const available = (ws as Record<string, unknown>)?.current_stock as number || 0;
        const needed = item.cantidad as number;
        if (available < needed) {
          stockIssues.push(`${item.nombre_producto}: necesita ${needed}, disponible ${available}`);
        }
      }

      if (stockIssues.length > 0) {
        return { error: `Stock insuficiente para aprobar:\n${stockIssues.join("\n")}` };
      }

      // 3. Descontar stock y registrar movimientos
      const undoLog: Array<{ product_id: string; cantidad: number }> = [];
      for (const item of items) {
        if (!item.product_id) continue;
        const { data: ws } = await supabase
          .from("warehouse_stock")
          .select("current_stock")
          .eq("product_id", item.product_id)
          .eq("warehouse_id", warehouse_id)
          .single();

        const currentStock = (ws as Record<string, unknown>)?.current_stock as number || 0;
        const newStock = currentStock - (item.cantidad as number);

        const { error: updateError } = await supabase
          .from("warehouse_stock")
          .update({ current_stock: newStock })
          .eq("product_id", item.product_id)
          .eq("warehouse_id", warehouse_id);

        if (updateError) {
          // Rollback
          for (const undo of undoLog) {
            const { data: ws2 } = await supabase.from("warehouse_stock").select("current_stock").eq("product_id", undo.product_id).eq("warehouse_id", warehouse_id).single();
            const cur = (ws2 as Record<string, unknown>)?.current_stock as number || 0;
            await supabase.from("warehouse_stock").update({ current_stock: cur + undo.cantidad }).eq("product_id", undo.product_id).eq("warehouse_id", warehouse_id);
          }
          return { error: `Error al descontar stock de "${item.nombre_producto}". Se revirtieron los cambios.` };
        }

        undoLog.push({ product_id: item.product_id as string, cantidad: item.cantidad as number });

        await supabase.from("inventory_movements").insert({
          product_id: item.product_id,
          movement_type: "salida",
          quantity: item.cantidad,
          previous_stock: currentStock,
          new_stock: newStock,
          reference_type: "quote",
          reference_id: (quote as Record<string, unknown>).id,
          notes: `AprobaciÃ³n cotizaciÃ³n ${folio} (agente IA)`,
        });
      }

      // 4. Actualizar estado de la cotizaciÃ³n
      const { error: statusError } = await supabase
        .from("quotes")
        .update({ status: "aprobada" })
        .eq("id", (quote as Record<string, unknown>).id);

      if (statusError) return { error: "Stock descontado pero error al cambiar estado: " + statusError.message };

      return {
        success: true,
        mensaje: `âœ… CotizaciÃ³n ${folio} aprobada correctamente. Se descontaron ${items.length} producto(s) del stock.`,
      };
    }

    if (name === "rechazar_cotizacion") {
      const { folio, motivo } = input as { folio: string; motivo?: string };

      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("id, status")
        .ilike("folio", `%${folio}%`)
        .single();

      if (quoteError || !quote) return { error: `CotizaciÃ³n "${folio}" no encontrada` };
      if ((quote as Record<string, unknown>).status === "aprobada") {
        return { error: `La cotizaciÃ³n ${folio} ya estÃ¡ aprobada y no puede rechazarse` };
      }

      const { error } = await supabase
        .from("quotes")
        .update({ status: "rechazada", notes: motivo || null })
        .eq("id", (quote as Record<string, unknown>).id);

      if (error) return { error: error.message };
      return { success: true, mensaje: `âœ… CotizaciÃ³n ${folio} rechazada.` };
    }

    return { error: `Herramienta desconocida: ${name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error ejecutando herramienta" };
  }
}

const SYSTEM_PROMPT = `Eres un agente de control e inteligencia para QualMedical2, una plataforma de gestiÃ³n de inventario y ventas de productos mÃ©dicos.

Tu rol es ayudar al equipo (especialmente a Ismael) a auditar, monitorear y operar el sistema.

MODO SUPERVISADO â€” REGLA CRÃTICA:
- Las herramientas "aprobar_cotizacion" y "rechazar_cotizacion" son acciones irreversibles.
- NUNCA las ejecutes sin confirmaciÃ³n explÃ­cita del usuario.
- Cuando el usuario pida aprobar o rechazar, primero consulta los datos, muestra un resumen claro de lo que vas a hacer y pregunta: "Â¿Confirmas que debo proceder?"
- Solo ejecuta la acciÃ³n cuando el usuario responda afirmativamente ("sÃ­", "confirmo", "procede", "adelante" o similar).
- Si hay duda, NO ejecutes.

Comportamiento general:
- Responde siempre en espaÃ±ol
- Usa las herramientas para obtener datos reales antes de responder
- Presenta los datos de forma clara con listas cuando sea Ãºtil
- Si detectas algo inusual (stock insuficiente, cotizaciÃ³n ya procesada, etc.), avisa antes de actuar`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY no configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { message, history = [] } = await req.json();
    console.log("Message:", message);

    const messages = [...history, { role: "user", content: message }];

    while (true) {
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools,
          messages,
        }),
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        console.error("Anthropic error:", errText);
        throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`);
      }

      const response = await anthropicRes.json();
      console.log("Stop reason:", response.stop_reason);

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter((b: { type: string }) => b.type === "tool_use");
        const toolResults = await Promise.all(
          toolUseBlocks.map(async (toolUse: { id: string; name: string; input: Record<string, unknown> }) => {
            console.log("Tool:", toolUse.name, JSON.stringify(toolUse.input).substring(0, 100));
            const result = await executeTool(toolUse.name, toolUse.input, supabase);
            return { type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) };
          })
        );
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });
      } else {
        const text = response.content
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { text: string }) => b.text)
          .join("\n");

        return new Response(JSON.stringify({ response: text }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("Fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
