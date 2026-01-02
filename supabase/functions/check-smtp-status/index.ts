import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import nodemailer from "https://esm.sh/nodemailer@6.9.10";

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

    // Normalizar SMTP_FROM_EMAIL
    const rawFrom = smtpFromEmail.trim();
    const match = rawFrom.match(/<([^>]+)>/);
    const fromEmail = (match?.[1] ?? rawFrom).trim();

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail);
    if (!isValidEmail) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "misconfigured",
          message: "SMTP_FROM_EMAIL no es un correo válido.",
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

    const port = parseInt(smtpPort);
    console.log(`Attempting SMTP connection to ${smtpHost}:${port} using nodemailer...`);
    
    // Configurar nodemailer
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: port,
      secure: port === 465, // true para 465, false para otros puertos (usará STARTTLS)
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
      tls: {
        rejectUnauthorized: false, // Permitir certificados auto-firmados
      },
    });

    // Verificar conexión
    console.log("Verifying SMTP connection...");
    await transporter.verify();
    console.log("SMTP connection verified successfully!");

    // Enviar email de prueba
    console.log("Sending test email...");
    const info = await transporter.sendMail({
      from: fromEmail,
      to: "falagian@gmail.com",
      subject: "Test de conexión SMTP - QualMedical",
      text: "Este es un mensaje de prueba para verificar la configuración SMTP. Si recibes este correo, la configuración funciona correctamente.",
    });

    console.log("Email sent successfully:", info.messageId);

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

    if (errorMessage.includes("authentication") || errorMessage.includes("535") || errorMessage.includes("auth") || errorMessage.includes("Invalid login")) {
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
