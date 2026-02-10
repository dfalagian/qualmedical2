import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get invoice
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, xml_url, invoice_number")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract relative path from xml_url
    const xmlUrl = invoice.xml_url as string;
    let relativePath = xmlUrl;
    if (xmlUrl.includes("/invoices/")) {
      const parts = xmlUrl.split("/storage/v1/object/public/invoices/");
      if (parts[1]) relativePath = parts[1];
    }

    // Download the XML
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("invoices")
      .download(relativePath);

    if (dlErr || !fileData) {
      return new Response(JSON.stringify({ error: "Could not download XML", details: dlErr?.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const xmlText = await fileData.text();

    // Parse conceptos using regex (handles various namespace prefixes)
    const conceptoRegex = /<[^:]*:?Concepto\s([^>]+?)\/?\s*>/gi;
    const conceptos: any[] = [];
    let match;

    while ((match = conceptoRegex.exec(xmlText)) !== null) {
      const attrs = match[1];
      const getAttr = (name: string) => {
        const r = new RegExp(`${name}="([^"]*)"`, "i");
        const m = attrs.match(r);
        return m ? m[1] : null;
      };

      conceptos.push({
        clave_prod_serv: getAttr("ClaveProdServ"),
        clave_unidad: getAttr("ClaveUnidad"),
        unidad: getAttr("Unidad"),
        descripcion: getAttr("Descripcion") || getAttr("descripcion"),
        cantidad: parseFloat(getAttr("Cantidad") || "0"),
        valor_unitario: parseFloat(getAttr("ValorUnitario") || "0"),
        importe: parseFloat(getAttr("Importe") || "0"),
        descuento: parseFloat(getAttr("Descuento") || "0"),
      });
    }

    if (conceptos.length === 0) {
      return new Response(JSON.stringify({ error: "No conceptos found in XML", invoice_number: invoice.invoice_number }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check existing items
    const { data: existing } = await supabase
      .from("invoice_items")
      .select("id")
      .eq("invoice_id", invoice_id);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ 
        message: "Items already exist", 
        count: existing.length,
        invoice_number: invoice.invoice_number 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert items
    const items = conceptos.map((c) => ({
      invoice_id,
      clave_prod_serv: c.clave_prod_serv,
      clave_unidad: c.clave_unidad,
      unidad: c.unidad,
      descripcion: c.descripcion,
      cantidad: c.cantidad,
      valor_unitario: c.valor_unitario,
      importe: c.importe,
      descuento: c.descuento,
    }));

    const { error: insertErr } = await supabase.from("invoice_items").insert(items);

    if (insertErr) {
      return new Response(JSON.stringify({ error: "Failed to insert items", details: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      invoice_number: invoice.invoice_number,
      items_inserted: items.length,
      items 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
