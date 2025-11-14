import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const getDocumentTypeName = (type: string): string => {
  const types: Record<string, string> = {
    ine: "Credencial INE",
    constancia_fiscal: "Constancia de Situación Fiscal",
    comprobante_domicilio: "Comprobante de Domicilio",
    aviso_funcionamiento: "Aviso de Funcionamiento",
    datos_bancarios: "Datos Bancarios"
  };
  return types[type] || type;
};

const getEmailTemplate = (type: string, data: any): { subject: string; html: string } => {
  const templates: Record<string, (data: any) => { subject: string; html: string }> = {
    document_approved: (data) => ({
      subject: `✅ Documento Aprobado - ${getDocumentTypeName(data.document_type)}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
              .success-icon { font-size: 48px; margin-bottom: 10px; }
              .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
              .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="success-icon">✓</div>
                <h1 style="margin: 0;">Documento Aprobado</h1>
              </div>
              <div class="content">
                <p>Estimado proveedor,</p>
                <p>Nos complace informarle que su documento ha sido <strong>aprobado exitosamente</strong>:</p>
                <div style="background: white; padding: 15px; border-left: 4px solid #10b981; margin: 20px 0;">
                  <strong>${getDocumentTypeName(data.document_type)}</strong>
                </div>
                <p>Su documento ha pasado todas las validaciones requeridas y ahora forma parte de su expediente activo.</p>
              </div>
              <div class="footer">
                <p>Este es un mensaje automático del Sistema QualMedical</p>
              </div>
            </div>
          </body>
        </html>
      `
    }),
    
    document_rejected: (data) => ({
      subject: `❌ Documento Rechazado - ${getDocumentTypeName(data.document_type)}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
              .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">Documento Rechazado</h1>
              </div>
              <div class="content">
                <p>Estimado proveedor,</p>
                <p>Su documento <strong>${getDocumentTypeName(data.document_type)}</strong> ha sido rechazado.</p>
                <p>Por favor, revise y vuelva a subir el documento corregido.</p>
              </div>
              <div class="footer">
                <p>Este es un mensaje automático del Sistema QualMedical</p>
              </div>
            </div>
          </body>
        </html>
      `
    }),

    account_approved: () => ({
      subject: "🎉 Cuenta Aprobada",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">¡Cuenta Aprobada!</h2>
          <p>Tu cuenta ha sido aprobada exitosamente.</p>
        </div>
      `
    }),

    account_rejected: () => ({
      subject: "Cuenta No Aprobada",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Cuenta No Aprobada</h2>
          <p>Tu solicitud no ha sido aprobada.</p>
        </div>
      `
    })
  };

  return templates[type] ? templates[type](data) : {
    subject: "Notificación del Sistema",
    html: "<p>Ha recibido una notificación del sistema.</p>"
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { supplier_id, type, data } = await req.json();

    console.log('===== NOTIFY-SUPPLIER =====');
    console.log('Supplier ID:', supplier_id);
    console.log('Tipo:', type);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: supplier, error: supplierError } = await supabaseClient
      .from("profiles")
      .select("email, full_name")
      .eq("id", supplier_id)
      .single();

    if (supplierError || !supplier?.email) {
      throw new Error("Error obteniendo proveedor");
    }

    console.log('Email del proveedor:', supplier.email);

    const { subject, html } = getEmailTemplate(type, data);

    // Configurar cliente SMTP
    const client = new SMTPClient({
      connection: {
        hostname: Deno.env.get("SMTP_HOST") || "",
        port: Number(Deno.env.get("SMTP_PORT")) || 587,
        tls: true,
        auth: {
          username: Deno.env.get("SMTP_USER") || "",
          password: Deno.env.get("SMTP_PASSWORD") || "",
        },
      },
    });

    // Enviar email
    await client.send({
      from: Deno.env.get("SMTP_FROM_EMAIL") || "noreply@qualmedical.com",
      to: supplier.email,
      subject,
      html,
    });

    await client.close();

    console.log('Email enviado exitosamente');

    return new Response(
      JSON.stringify({ success: true, message: "Notificación enviada" }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error en notify-supplier:", error);
    return new Response(
      JSON.stringify({ error: error.message, success: false }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
