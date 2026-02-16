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
  channel?: "whatsapp" | "sms" | "both";
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

function formatPhoneNumber(phone: string, channel: "whatsapp" | "sms"): string {
  let digits = phone.replace(/\D/g, "");

  if (digits.startsWith("52") && digits.length === 12) {
    return channel === "whatsapp" ? `whatsapp:+${digits}` : `+${digits}`;
  }

  if (digits.length === 10) {
    return channel === "whatsapp" ? `whatsapp:+52${digits}` : `+52${digits}`;
  }

  if (phone.startsWith("+")) {
    return channel === "whatsapp" ? `whatsapp:${phone}` : phone;
  }

  return channel === "whatsapp" ? `whatsapp:+${digits}` : `+${digits}`;
}

async function sendViaTwilio(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
): Promise<{ ok: boolean; result: any }> {
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const response = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });

  const result = await response.json();
  return { ok: response.ok, result };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, message, template_type, data, channel = "whatsapp" }: MessageRequest = await req.json();

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

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const whatsappFrom = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";
    const smsFrom = Deno.env.get("TWILIO_SMS_FROM") || "";

    const results: Record<string, any> = {};

    // Send WhatsApp
    if (channel === "whatsapp" || channel === "both") {
      const toFormatted = formatPhoneNumber(to, "whatsapp");
      console.log(`Sending WhatsApp to: ${toFormatted}, template: ${template_type || "custom"}`);
      const wa = await sendViaTwilio(accountSid, authToken, whatsappFrom, toFormatted, body);
      results.whatsapp = wa;
      if (!wa.ok) console.error("WhatsApp error:", wa.result);
      else console.log("WhatsApp sent, SID:", wa.result.sid);
    }

    // Send SMS
    if ((channel === "sms" || channel === "both") && smsFrom) {
      const toFormatted = formatPhoneNumber(to, "sms");
      // Strip markdown-style formatting for SMS
      const smsBody = body.replace(/\*/g, "");
      console.log(`Sending SMS to: ${toFormatted}`);
      const sms = await sendViaTwilio(accountSid, authToken, smsFrom, toFormatted, smsBody);
      results.sms = sms;
      if (!sms.ok) console.error("SMS error:", sms.result);
      else console.log("SMS sent, SID:", sms.result.sid);
    } else if ((channel === "sms" || channel === "both") && !smsFrom) {
      console.warn("SMS requested but TWILIO_SMS_FROM not configured, skipping SMS");
      results.sms = { ok: false, result: { message: "TWILIO_SMS_FROM not configured" } };
    }

    const anySuccess = Object.values(results).some((r: any) => r.ok);

    return new Response(
      JSON.stringify({ success: anySuccess, results }),
      { status: anySuccess ? 200 : 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending message:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
