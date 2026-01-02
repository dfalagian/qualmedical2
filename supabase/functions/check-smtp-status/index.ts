import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Deno.env.get("SMTP_PORT");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const smtpFromEmail = Deno.env.get("SMTP_FROM_EMAIL");

    console.log("Checking SMTP configuration...");
    console.log("SMTP_HOST configured:", !!smtpHost);
    console.log("SMTP_PORT configured:", !!smtpPort);
    console.log("SMTP_USER configured:", !!smtpUser);
    console.log("SMTP_PASSWORD configured:", !!smtpPassword);
    console.log("SMTP_FROM_EMAIL configured:", !!smtpFromEmail);

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword || !smtpFromEmail) {
      const missing = [];
      if (!smtpHost) missing.push("SMTP_HOST");
      if (!smtpPort) missing.push("SMTP_PORT");
      if (!smtpUser) missing.push("SMTP_USER");
      if (!smtpPassword) missing.push("SMTP_PASSWORD");
      if (!smtpFromEmail) missing.push("SMTP_FROM_EMAIL");

      return new Response(
        JSON.stringify({
          success: false,
          status: "misconfigured",
          message: `Faltan variables de configuración SMTP: ${missing.join(", ")}`,
          config: {
            host: smtpHost || "No configurado",
            port: smtpPort || "No configurado",
            user: smtpUser ? "Configurado" : "No configurado",
            password: smtpPassword ? "Configurado" : "No configurado",
            from: smtpFromEmail || "No configurado",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const port = parseInt(smtpPort);
    console.log(`Attempting SMTP connection to ${smtpHost}:${port}...`);

    // IMPORTANTE:
    // - En este runtime, STARTTLS (587) suele fallar de forma no-determinista con librerías SMTP.
    // - Para pruebas de conectividad, sólo soportamos de forma confiable TLS implícito (465).
    if (port !== 465) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "warning",
          message:
            "La verificación SMTP con STARTTLS (587) no es confiable en este entorno cloud. Para probar SMTP aquí, usa puerto 465 (TLS implícito) o migra a un proveedor HTTP (recomendado) como Resend.",
          config: {
            host: smtpHost,
            port: smtpPort,
            user: smtpUser ? "Configurado" : "No configurado",
            from: smtpFromEmail,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Normalizar SMTP_FROM_EMAIL: algunos proveedores lo guardan como "Nombre <email@dominio>"
    const rawFrom = smtpFromEmail.trim();
    const match = rawFrom.match(/<([^>]+)>/);
    const fromEmail = (match?.[1] ?? rawFrom).trim();

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail);
    if (!isValidEmail) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "misconfigured",
          message:
            "SMTP_FROM_EMAIL no es un correo válido. Usa formato email@dominio.com (o Nombre <email@dominio.com>).",
          config: {
            host: smtpHost,
            port: smtpPort,
            user: smtpUser ? "Configurado" : "No configurado",
            from: "Formato inválido",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    let client: SMTPClient | null = null;
    try {
      client = new SMTPClient({
        connection: {
          hostname: smtpHost,
          port,
          tls: true, // 465 = TLS implícito
          auth: {
            username: smtpUser,
            password: smtpPassword,
          },
        },
      });

      await client.send({
        from: fromEmail,
        to: "falagian@gmail.com",
        subject: "Test de conexión SMTP - QualMedical",
        content:
          "Este es un mensaje de prueba para verificar la configuración SMTP (TLS 465).",
      });

      console.log("SMTP connection successful!");

      return new Response(
        JSON.stringify({
          success: true,
          status: "connected",
          message: "Conexión SMTP exitosa (TLS 465)",
          config: {
            host: smtpHost,
            port: smtpPort,
            user: smtpUser,
            from: smtpFromEmail,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    } finally {
      try {
        await client?.close();
      } catch (e) {
        console.warn("SMTP close warning:", e);
      }
    }
  } catch (error: any) {
    console.error("SMTP connection error:", error);

    const details = error?.message ?? String(error);

    let errorMessage = details;
    let errorType = "connection_error";

    if (details.includes("authentication") || details.includes("535") || details.includes("auth")) {
      errorType = "auth_error";
      errorMessage = "Error de autenticación SMTP. Verifica el usuario y contraseña.";
    } else if (details.includes("timeout") || details.includes("ETIMEDOUT")) {
      errorType = "timeout";
      errorMessage = "Tiempo de espera agotado. El servidor SMTP no responde.";
    } else if (details.includes("ENOTFOUND") || details.includes("getaddrinfo")) {
      errorType = "host_not_found";
      errorMessage = "No se encontró el servidor SMTP. Verifica el host.";
    } else if (details.includes("ECONNREFUSED")) {
      errorType = "connection_refused";
      errorMessage = "Conexión rechazada. Verifica el puerto y configuración TLS.";
    }

    return new Response(
      JSON.stringify({
        success: false,
        status: "error",
        errorType,
        message: errorMessage,
        details,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
