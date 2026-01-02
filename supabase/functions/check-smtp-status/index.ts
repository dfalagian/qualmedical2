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

    // Verificar que todas las variables estén configuradas
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
            from: smtpFromEmail || "No configurado"
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Intentar crear conexión SMTP y enviar un email de prueba simple
    console.log(`Attempting SMTP connection to ${smtpHost}:${smtpPort}...`);
    
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: parseInt(smtpPort),
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPassword,
        },
      },
    });

    // Enviar un email de prueba para verificar la conexión
    await client.send({
      from: smtpFromEmail,
      to: "falagian@gmail.com",
      subject: "Test de conexión SMTP - QualMedical",
      content: "Este es un mensaje de prueba para verificar la configuración SMTP. Si recibes este correo, la configuración funciona correctamente.",
    });

    await client.close();

    console.log("SMTP connection successful!");

    return new Response(
      JSON.stringify({
        success: true,
        status: "connected",
        message: "Conexión SMTP exitosa",
        config: {
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          from: smtpFromEmail
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("SMTP connection error:", error);
    
    let errorMessage = error.message || "Error desconocido";
    let errorType = "connection_error";

    if (errorMessage.includes("authentication") || errorMessage.includes("535") || errorMessage.includes("auth")) {
      errorType = "auth_error";
      errorMessage = "Error de autenticación SMTP. Verifica el usuario y contraseña.";
    } else if (errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT")) {
      errorType = "timeout";
      errorMessage = "Tiempo de espera agotado. El servidor SMTP no responde.";
    } else if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("getaddrinfo")) {
      errorType = "host_not_found";
      errorMessage = "No se encontró el servidor SMTP. Verifica el host.";
    } else if (errorMessage.includes("ECONNREFUSED")) {
      errorType = "connection_refused";
      errorMessage = "Conexión rechazada. Verifica el puerto y configuración TLS.";
    }

    return new Response(
      JSON.stringify({
        success: false,
        status: "error",
        errorType: errorType,
        message: errorMessage,
        details: error.message
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
