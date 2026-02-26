import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BotRequest {
  phone: string;
  question: string;
  contact_name?: string;
}

async function getContextData(supabase: any, question: string) {
  const q = question.toLowerCase();
  const context: string[] = [];

  // Always fetch products summary for inventory questions
  if (q.includes("stock") || q.includes("inventario") || q.includes("medicamento") || 
      q.includes("producto") || q.includes("cantidad") || q.includes("cuant") ||
      q.includes("disponible") || q.includes("existencia")) {
    const { data: products } = await supabase
      .from("products")
      .select("name, sku, current_stock, category, brand, price_with_tax, unit")
      .eq("is_active", true)
      .order("name")
      .limit(200);
    
    if (products?.length) {
      context.push(`INVENTARIO DE PRODUCTOS (${products.length} productos activos):\n` +
        products.map((p: any) => 
          `- ${p.name} | SKU: ${p.sku} | Stock: ${p.current_stock ?? 0} ${p.unit || 'pza'} | Categoría: ${p.category || 'N/A'} | Marca: ${p.brand || 'N/A'} | Precio: $${p.price_with_tax || 0}`
        ).join("\n"));
    }
  }

  // Quotes/cotizaciones
  if (q.includes("cotizac") || q.includes("venta") || q.includes("vendido") || 
      q.includes("folio") || q.includes("cliente") || q.includes("presupuesto")) {
    const { data: quotes } = await supabase
      .from("quotes")
      .select("folio, status, total, fecha_cotizacion, concepto, clients(nombre_cliente)")
      .order("created_at", { ascending: false })
      .limit(50);
    
    if (quotes?.length) {
      const totalVentas = quotes.filter((q: any) => q.status === "aprobada").reduce((s: number, q: any) => s + (q.total || 0), 0);
      const stats = {
        total: quotes.length,
        aprobadas: quotes.filter((q: any) => q.status === "aprobada").length,
        borrador: quotes.filter((q: any) => q.status === "borrador").length,
        canceladas: quotes.filter((q: any) => q.status === "cancelada").length,
      };
      context.push(`COTIZACIONES (últimas 50):\nResumen: ${stats.total} total, ${stats.aprobadas} aprobadas ($${totalVentas.toFixed(2)} MXN), ${stats.borrador} borradores, ${stats.canceladas} canceladas\n` +
        quotes.slice(0, 20).map((q: any) => 
          `- ${q.folio} | ${q.status} | $${q.total} | ${q.fecha_cotizacion} | Cliente: ${q.clients?.nombre_cliente || 'N/A'} | ${q.concepto || ''}`
        ).join("\n"));
    }
  }

  // Quote items for specific product sales
  if (q.includes("venta") || q.includes("vendido") || q.includes("cuanto se ha vendido")) {
    const { data: quoteItems } = await supabase
      .from("quote_items")
      .select("nombre_producto, cantidad, precio_unitario, importe, quote_id, quotes(status, folio, fecha_cotizacion)")
      .limit(200);
    
    if (quoteItems?.length) {
      // Aggregate by product
      const productSales: Record<string, { qty: number; total: number; count: number }> = {};
      quoteItems.filter((i: any) => i.quotes?.status === "aprobada").forEach((i: any) => {
        const name = i.nombre_producto;
        if (!productSales[name]) productSales[name] = { qty: 0, total: 0, count: 0 };
        productSales[name].qty += i.cantidad;
        productSales[name].total += i.importe || 0;
        productSales[name].count++;
      });
      context.push(`VENTAS POR PRODUCTO (de cotizaciones aprobadas):\n` +
        Object.entries(productSales).map(([name, s]) => 
          `- ${name}: ${s.qty} unidades vendidas, $${s.total.toFixed(2)} MXN en ${s.count} cotizaciones`
        ).join("\n"));
    }
  }

  // Purchase orders
  if (q.includes("orden") || q.includes("compra") || q.includes("pedido") || q.includes("proveedor")) {
    const { data: orders } = await supabase
      .from("purchase_orders")
      .select("order_number, status, amount, currency, delivery_date, description, profiles(full_name, company_name)")
      .order("created_at", { ascending: false })
      .limit(50);
    
    if (orders?.length) {
      const totalCompras = orders.reduce((s: number, o: any) => s + (o.amount || 0), 0);
      const stats = {
        total: orders.length,
        pendientes: orders.filter((o: any) => o.status === "pendiente").length,
        recibidas: orders.filter((o: any) => o.status === "recibida").length,
      };
      context.push(`ÓRDENES DE COMPRA (últimas 50):\nResumen: ${stats.total} total ($${totalCompras.toFixed(2)} MXN), ${stats.pendientes} pendientes, ${stats.recibidas} recibidas\n` +
        orders.slice(0, 15).map((o: any) => 
          `- ${o.order_number} | ${o.status} | $${o.amount} ${o.currency} | Entrega: ${o.delivery_date || 'N/A'} | Proveedor: ${o.profiles?.company_name || o.profiles?.full_name || 'N/A'}`
        ).join("\n"));
    }
  }

  // Sales requests / solicitudes de venta  
  if (q.includes("solicitud") || q.includes("cipi") || q.includes("cemi") || q.includes("pedido")) {
    const { data: requests } = await supabase
      .from("cipi_requests")
      .select("folio, type, status, empresa, total, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    
    if (requests?.length) {
      context.push(`SOLICITUDES DE VENTA (últimas 30):\n` +
        requests.map((r: any) => 
          `- ${r.folio || 'S/F'} | Tipo: ${r.type} | ${r.status} | Empresa: ${r.empresa || 'N/A'} | $${r.total || 0}`
        ).join("\n"));
    }
  }

  // Sales invoices (compras-ventas)
  if (q.includes("factura") || q.includes("venta") || q.includes("ingreso")) {
    const { data: salesInvoices } = await supabase
      .from("sales_invoices")
      .select("folio, total, fecha_emision, receptor_nombre, currency")
      .order("created_at", { ascending: false })
      .limit(30);
    
    if (salesInvoices?.length) {
      const totalFacturado = salesInvoices.reduce((s: number, i: any) => s + (i.total || 0), 0);
      context.push(`FACTURAS DE VENTA (últimas 30):\nTotal facturado: $${totalFacturado.toFixed(2)} MXN\n` +
        salesInvoices.map((i: any) => 
          `- ${i.folio} | $${i.total} ${i.currency} | ${i.fecha_emision || 'N/A'} | ${i.receptor_nombre || 'N/A'}`
        ).join("\n"));
    }
  }

  // If no specific context matched, provide a general overview
  if (context.length === 0) {
    const [productsRes, quotesRes, ordersRes, requestsRes] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("quotes").select("id", { count: "exact", head: true }),
      supabase.from("purchase_orders").select("id", { count: "exact", head: true }),
      supabase.from("cipi_requests").select("id", { count: "exact", head: true }),
    ]);
    
    context.push(`RESUMEN GENERAL DEL SISTEMA:\n- Productos activos: ${productsRes.count || 0}\n- Cotizaciones: ${quotesRes.count || 0}\n- Órdenes de compra: ${ordersRes.count || 0}\n- Solicitudes de venta: ${requestsRes.count || 0}`);
  }

  return context.join("\n\n---\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, question, contact_name }: BotRequest = await req.json();

    if (!phone || !question) {
      return new Response(
        JSON.stringify({ error: "phone and question are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if phone is authorized
    const { data: botUser } = await supabase
      .from("whatsapp_bot_users")
      .select("*")
      .eq("phone", phone)
      .eq("is_active", true)
      .maybeSingle();

    if (!botUser) {
      return new Response(
        JSON.stringify({ authorized: false, reply: "No estás autorizado para usar el bot de consultas." }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch relevant context data from the database
    const contextData = await getContextData(supabase, question);

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Eres el asistente IA de QualMedical, una empresa de distribución de medicamentos y dispositivos médicos. 
Respondes preguntas de gerentes sobre el estado del negocio: inventario, ventas, cotizaciones, órdenes de compra y solicitudes de venta.

REGLAS:
- Responde SIEMPRE en español
- Sé conciso y directo, adaptado para lectura en WhatsApp
- Usa emojis moderadamente para mejor legibilidad
- Formatea números con separadores de miles y 2 decimales
- Si no encuentras la información específica, indícalo claramente
- No inventes datos, solo usa la información proporcionada
- Si la pregunta no está relacionada con el negocio, indica amablemente que solo puedes responder consultas del sistema

DATOS ACTUALES DEL SISTEMA:
${contextData}`
          },
          {
            role: "user",
            content: question
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "Error consultando IA", reply: "⚠️ Error al procesar tu consulta. Intenta de nuevo." }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const aiData = await aiResponse.json();
    const reply = aiData.choices?.[0]?.message?.content || "No pude generar una respuesta.";

    return new Response(
      JSON.stringify({ authorized: true, reply }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Bot query error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
