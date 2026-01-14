import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RecoveryRequest {
  email: string;
  redirectTo?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirectTo }: RecoveryRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email es requerido" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Processing password recovery for:", email);

    // Validate SMTP configuration
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Deno.env.get("SMTP_PORT");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const smtpFromEmail = Deno.env.get("SMTP_FROM_EMAIL");

    console.log("SMTP Config - Host:", smtpHost, "Port:", smtpPort, "User:", smtpUser, "From:", smtpFromEmail);

    if (!smtpHost || !smtpUser || !smtpPassword || !smtpFromEmail) {
      console.error("Missing SMTP configuration");
      return new Response(
        JSON.stringify({ error: "Configuración de correo incompleta. Contacta al administrador." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate from email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(smtpFromEmail)) {
      console.error("Invalid SMTP_FROM_EMAIL format:", smtpFromEmail);
      return new Response(
        JSON.stringify({ error: "Formato de correo remitente inválido. Contacta al administrador." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create admin client to generate recovery link
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if user exists in profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (profileError || !profile) {
      // Don't reveal if email exists or not for security
      console.log("Email not found, returning success anyway for security");
      return new Response(
        JSON.stringify({ success: true, message: "Si el correo existe, recibirás un enlace de recuperación" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate recovery link using admin API
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: redirectTo || `${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovableproject.com')}/auth?reset=true`,
      }
    });

    if (linkError) {
      console.error("Error generating recovery link:", linkError);
      throw new Error("Error al generar enlace de recuperación");
    }

    console.log("Recovery link generated successfully");

    // Send email using SMTP
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: parseInt(smtpPort || "465"),
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPassword,
        },
      },
    });

    const recoveryLink = linkData.properties?.action_link;
    const userName = profile.full_name || "Usuario";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperación de Contraseña</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                🔐 Recuperación de Contraseña
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                Hola <strong>${userName}</strong>,
              </p>
              <p style="margin: 0 0 20px; color: #555555; font-size: 16px; line-height: 1.6;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>QualMedical</strong>.
              </p>
              
              <!-- Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 30px 0;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${recoveryLink}" 
                       style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);">
                      Restablecer Contraseña
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0; color: #666666; font-size: 14px; line-height: 1.6;">
                Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña permanecerá sin cambios.
              </p>
              
              <p style="margin: 20px 0; color: #888888; font-size: 13px; line-height: 1.6;">
                Este enlace expirará en 24 horas por seguridad.
              </p>
              
              <!-- Link fallback -->
              <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
                <p style="margin: 0 0 10px; color: #666666; font-size: 13px;">
                  Si el botón no funciona, copia y pega este enlace en tu navegador:
                </p>
                <p style="margin: 0; word-break: break-all; color: #1e3a5f; font-size: 12px;">
                  ${recoveryLink}
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #888888; font-size: 13px;">
                © 2026 QualMedical - Portal de Proveedores
              </p>
              <p style="margin: 10px 0 0; color: #aaaaaa; font-size: 12px;">
                Este es un correo automático, por favor no respondas a este mensaje.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    if (!recoveryLink) {
      throw new Error("No se pudo generar el enlace de recuperación");
    }

    try {
      await client.send({
        from: smtpFromEmail,
        to: email,
        subject: "🔐 Recupera tu contraseña - QualMedical",
        content: `Hola ${userName}, haz clic en este enlace para restablecer tu contraseña: ${recoveryLink}`,
        html: emailHtml,
      });
    } catch (smtpError: any) {
      const msg = String(smtpError?.message || smtpError);
      console.error("SMTP send failed:", msg);

      // 535 auth failed
      if (msg.includes("535") || msg.toLowerCase().includes("authentication failed")) {
        return new Response(
          JSON.stringify({
            error:
              "Credenciales SMTP inválidas. Verifica SMTP_USER/SMTP_PASSWORD (muchas veces es una contraseña de aplicación).",
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      return new Response(
        JSON.stringify({ error: "No se pudo enviar el correo por SMTP. Revisa la configuración." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } finally {
      try {
        await client.close();
      } catch {
        // ignore
      }
    }

    console.log("Recovery email sent successfully to:", email);

    return new Response(
      JSON.stringify({ success: true, message: "Correo de recuperación enviado" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in send-recovery-email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error al enviar correo de recuperación" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
