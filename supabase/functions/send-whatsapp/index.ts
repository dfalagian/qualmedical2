const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WhatsAppRequest {
  to: string;
  message?: string;
  template_type?: string;
  data?: Record<string, string>;
}

const TEMPLATES: Record<string, (data: Record<string, string>) => string> = {
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
};

function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, "");

  // If it already starts with country code for Mexico
  if (digits.startsWith("52") && digits.length === 12) {
    return `whatsapp:+${digits}`;
  }

  // If it's a 10-digit Mexican number, add country code
  if (digits.length === 10) {
    return `whatsapp:+52${digits}`;
  }

  // If it already has a + prefix or full international format
  if (phone.startsWith("+")) {
    return `whatsapp:${phone}`;
  }

  // Default: assume Mexican number
  return `whatsapp:+${digits}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, message, template_type, data }: WhatsAppRequest = await req.json();

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
    // Default to Twilio Sandbox number for free accounts
    const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";

    const toFormatted = formatPhoneNumber(to);

    console.log(`Sending WhatsApp to: ${toFormatted}, template: ${template_type || "custom"}`);

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: fromNumber,
        To: toFormatted,
        Body: body,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Twilio error:", result);
      return new Response(
        JSON.stringify({ error: result.message || "Failed to send WhatsApp message", details: result }),
        { status: response.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("WhatsApp sent successfully, SID:", result.sid);

    return new Response(
      JSON.stringify({ success: true, sid: result.sid }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending WhatsApp:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
