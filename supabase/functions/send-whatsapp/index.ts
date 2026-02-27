const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MessageRequest {
  to: string;
  message?: string;
  template_type?: string;
  data?: Record<string, string>;
}

const TEMPLATES: Record<string, (d: Record<string, string>) => string> = {
  document_approved: (d) =>
    `✅ *QualMedical* - Tu documento ${d.type || ""} ha sido aprobado. Accede al portal: qualmedical.lovable.app`,
  document_rejected: (d) =>
    `❌ *QualMedical* - Tu documento ${d.type || ""} fue rechazado.${d.reason ? ` Razón: ${d.reason}.` : ""} Revisa el portal: qualmedical.lovable.app`,
  invoice_validated: (d) =>
    `✅ *QualMedical* - Tu factura ${d.number || ""} ha sido validada correctamente.`,
  invoice_rejected: (d) =>
    `❌ *QualMedical* - Tu factura ${d.number || ""} fue rechazada.${d.reason ? ` Razón: ${d.reason}.` : ""} Revisa el portal.`,
  payment_completed: (d) =>
    `💰 *QualMedical* - Se ha registrado tu pago de $${d.amount || "0"} MXN para la factura ${d.number || ""}.`,
  payment_pending: (d) =>
    `⏳ *QualMedical* - Tu pago de $${d.amount || "0"} MXN está pendiente de confirmación.`,
  evidence_approved: () =>
    `✅ *QualMedical* - Tu evidencia de entrega ha sido aprobada.`,
  evidence_rejected: (d) =>
    `❌ *QualMedical* - Tu evidencia de entrega fue rechazada.${d.reason ? ` Razón: ${d.reason}.` : ""} Sube una nueva evidencia.`,
  account_approved: () =>
    `🎉 *QualMedical* - Tu cuenta de proveedor ha sido aprobada. Ya puedes acceder al portal: qualmedical.lovable.app`,
  account_rejected: (d) =>
    `❌ *QualMedical* - Tu solicitud de registro fue rechazada.${d.reason ? ` Razón: ${d.reason}.` : ""} Contacta al administrador.`,
  pos_sale: (d) =>
    `🛒 *QualMedical - Nueva Venta POS*\n\n📋 Folio: ${d.folio || "N/A"}\n👤 Vendedor: ${d.vendedor || "N/A"}\n🏢 Cliente: ${d.cliente || "Mostrador"}\n📦 Productos: ${d.productos || "N/A"}\n💰 Total: $${d.total || "0"} MXN\n\n📝 Detalle:\n${d.detalle || "Sin detalle"}`,
};

function formatPhoneNumber(phone: string): string {
  let digits = phone.replace(/\D/g, "");

  // Mexican numbers: remove extra '1' after '52' (521XXXXXXXXXX -> 52XXXXXXXXXX)
  if (digits.startsWith("521") && digits.length === 13) {
    digits = "52" + digits.substring(3);
  }

  // Already has country code for Mexico
  if (digits.startsWith("52") && digits.length === 12) {
    return digits;
  }

  // 10-digit Mexican number
  if (digits.length === 10) {
    return `52${digits}`;
  }

  // Already has + prefix
  if (phone.startsWith("+")) {
    return digits;
  }

  return digits;
}

async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  body: string
): Promise<{ ok: boolean; result: any }> {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  const result = await response.json();
  return { ok: response.ok, result };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, message, template_type, data }: MessageRequest = await req.json();

    if (!to) {
      return new Response(
        JSON.stringify({ error: "Phone number (to) is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Build message body
    let body: string;
    if (template_type && TEMPLATES[template_type]) {
      body = TEMPLATES[template_type](data || {});
    } else if (message) {
      body = message;
    } else {
      return new Response(
        JSON.stringify({ error: "Either message or template_type is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;

    const formattedPhone = formatPhoneNumber(to);
    console.log(`Sending WhatsApp to: ${formattedPhone}, template: ${template_type || "custom"}`);

    const result = await sendWhatsAppMessage(phoneNumberId, accessToken, formattedPhone, body);

    if (!result.ok) {
      console.error("WhatsApp API error:", JSON.stringify(result.result));
    } else {
      console.log("WhatsApp sent, message ID:", result.result?.messages?.[0]?.id);
    }

    return new Response(
      JSON.stringify({ success: result.ok, result: result.result }),
      { status: result.ok ? 200 : 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending WhatsApp message:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
