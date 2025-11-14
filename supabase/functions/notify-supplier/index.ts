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
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: white;
              }
              .header { 
                background-color: #22c55e; 
                color: white; 
                padding: 20px 30px; 
                text-align: center; 
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: normal;
              }
              .success-notice {
                background-color: #d1fae5;
                border: 1px solid #a7f3d0;
                padding: 20px;
                margin: 20px 30px;
                text-align: center;
                border-radius: 4px;
              }
              .success-notice h2 {
                color: #059669;
                margin: 0 0 10px 0;
                font-size: 20px;
              }
              .content { 
                padding: 0 30px 30px 30px;
              }
              .info-box {
                background: #f9fafb;
                border-left: 3px solid #22c55e;
                padding: 15px;
                margin: 15px 0;
              }
              .info-box p {
                margin: 5px 0;
              }
              .warning-box {
                background: #fef3c7;
                border-left: 3px solid #f59e0b;
                padding: 15px;
                margin: 20px 0;
              }
              .warning-box strong {
                color: #d97706;
              }
              .footer { 
                text-align: center; 
                padding: 20px 30px;
                background-color: #f9fafb;
                color: #6b7280; 
                font-size: 14px;
                border-top: 1px solid #e5e7eb;
              }
              .footer p {
                margin: 5px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✓ Documento Aprobado</h1>
              </div>
              
              <div class="success-notice">
                <h2>¡Excelente noticia!</h2>
                <p>Tu documento ha sido validado exitosamente</p>
              </div>

              <div class="content">
                <p><strong>Estimado ${data.supplier_name || 'proveedor'},</strong></p>
                
                <p>Te informamos que el siguiente documento ha sido <strong>aprobado</strong>:</p>
                
                <div class="info-box">
                  <p><strong>📄 Documento:</strong> ${getDocumentTypeName(data.document_type)}</p>
                </div>

                ${data.extracted_data?.rfc ? `
                <div class="info-box">
                  <p><strong>RFC:</strong> ${data.extracted_data.rfc}</p>
                </div>
                ` : ''}

                <div class="warning-box">
                  <p><strong>⚠️ Nota importante:</strong> Si aún tienes otros documentos pendientes de validación, te requerimos que tu cuenta será activada completamente una vez que todos los documentos sean aprobados.</p>
                </div>
              </div>

              <div class="footer">
                <p>Acceder al portal: <a href="https://qualmedical.iakan.es" style="color: #22c55e; text-decoration: none;">https://qualmedical.iakan.es</a></p>
                <p style="margin-top: 10px;">Este es un mensaje automático del Sistema QualMedical</p>
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
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: white;
              }
              .header { 
                background-color: #ef4444; 
                color: white; 
                padding: 20px 30px; 
                text-align: center; 
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: normal;
              }
              .alert-box {
                background-color: #fef3c7;
                border: 2px solid #f59e0b;
                padding: 20px;
                margin: 20px 30px;
                border-radius: 4px;
              }
              .alert-box h2 {
                color: #d97706;
                margin: 0 0 10px 0;
                font-size: 18px;
              }
              .content { 
                padding: 0 30px 30px 30px;
              }
              .document-list {
                background: #fef2f2;
                border-left: 3px solid #ef4444;
                padding: 15px;
                margin: 20px 0;
              }
              .document-list h3 {
                color: #dc2626;
                margin: 0 0 10px 0;
                font-size: 16px;
              }
              .document-item {
                padding: 10px 0;
                border-bottom: 1px solid #fecaca;
              }
              .document-item:last-child {
                border-bottom: none;
              }
              .document-item strong {
                color: #991b1b;
              }
              .footer { 
                text-align: center; 
                padding: 20px 30px;
                background-color: #f9fafb;
                color: #6b7280; 
                font-size: 14px;
                border-top: 1px solid #e5e7eb;
              }
              .footer p {
                margin: 5px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>⚠️ Documentación Pendiente</h1>
              </div>
              
              <div class="alert-box">
                <h2>Estimado(a) ${data.supplier_name || 'proveedor'},</h2>
                <p>Tu documentación ha sido revisada y requiere correcciones.</p>
              </div>

              <div class="content">
                <p>Hemos revisado la documentación de tu registro en el Sistema CITIO y encontramos que los siguientes documentos no han sido aprobados:</p>
                
                <div class="document-list">
                  <h3>📋 Documentos que requieren atención:</h3>
                  <div class="document-item">
                    <strong>• ${getDocumentTypeName(data.document_type)}</strong>
                    <p style="margin: 5px 0 0 20px; color: #991b1b;">Documento rechazado. Por favor, revise y vuelva a subir.</p>
                  </div>
                </div>

                ${data.notes ? `
                <div style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0;"><strong>📝 Nota del revisor:</strong></p>
                  <p style="margin: 10px 0 0 0;">${data.notes}</p>
                </div>
                ` : ''}
              </div>

              <div class="footer">
                <p>Acceder al portal: <a href="https://qualmedical.iakan.es" style="color: #ef4444; text-decoration: none;">https://qualmedical.iakan.es</a></p>
                <p style="margin-top: 10px;">Este es un mensaje automático del Sistema QualMedical</p>
              </div>
            </div>
          </body>
        </html>
      `
    }),

    supplier_approved: () => ({
      subject: "🎉 ¡Felicidades! Tu cuenta ha sido aprobada",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px; border-radius: 10px 10px 0 0; text-align: center; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
              .celebration-icon { font-size: 64px; margin-bottom: 15px; }
              .feature-list { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .feature-item { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
              .feature-item:last-child { border-bottom: none; }
              .check-icon { color: #10b981; margin-right: 10px; }
              .cta-button { display: inline-block; padding: 15px 40px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin-top: 25px; font-weight: bold; }
              .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="celebration-icon">🎉</div>
                <h1 style="margin: 0; font-size: 28px;">¡Tu cuenta ha sido aprobada!</h1>
              </div>
              <div class="content">
                <p><strong>¡Excelente noticia!</strong></p>
                <p>Tu documentación ha sido validada y tu cuenta está activa.</p>
                <div class="feature-list">
                  <h3>Ahora puedes:</h3>
                  <div class="feature-item"><span class="check-icon">✓</span> Subir tus facturas</div>
                  <div class="feature-item"><span class="check-icon">✓</span> Ver el estado de tus pagos</div>
                  <div class="feature-item"><span class="check-icon">✓</span> Acceder a todas las funcionalidades</div>
                </div>
                <center><a href="https://qualmedical.iakan.es" class="cta-button">Acceder al Portal</a></center>
              </div>
              <div class="footer">
                <p>QualMedical - Sistema de Gestión de Proveedores</p>
              </div>
            </div>
          </body>
        </html>
      `
    }),

    evidence_approved: (data) => ({
      subject: `✅ Evidencia de Entrega Aprobada - Factura ${data.invoice_number}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: white;
              }
              .header { 
                background-color: #22c55e; 
                color: white; 
                padding: 20px 30px; 
                text-align: center; 
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: normal;
              }
              .success-notice {
                background-color: #d1fae5;
                border: 1px solid #a7f3d0;
                padding: 20px;
                margin: 20px 30px;
                text-align: center;
                border-radius: 4px;
              }
              .success-notice h2 {
                color: #059669;
                margin: 0 0 10px 0;
                font-size: 20px;
              }
              .content { 
                padding: 0 30px 30px 30px;
              }
              .info-box {
                background: #f9fafb;
                border-left: 3px solid #22c55e;
                padding: 15px;
                margin: 15px 0;
              }
              .info-box p {
                margin: 5px 0;
              }
              .next-steps {
                background: #dbeafe;
                border-left: 3px solid #3b82f6;
                padding: 15px;
                margin: 20px 0;
              }
              .next-steps strong {
                color: #1e40af;
              }
              .footer { 
                text-align: center; 
                padding: 20px 30px;
                background-color: #f9fafb;
                color: #6b7280; 
                font-size: 14px;
                border-top: 1px solid #e5e7eb;
              }
              .footer p {
                margin: 5px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✓ Evidencia de Entrega Aprobada</h1>
              </div>
              
              <div class="success-notice">
                <h2>¡La evidencia ha sido validada!</h2>
                <p>Tu evidencia de entrega fue revisada y aprobada por el equipo administrativo</p>
              </div>

              <div class="content">
                <p><strong>Estimado proveedor,</strong></p>
                
                <p>Nos complace informarte que la evidencia de entrega que proporcionaste ha sido aprobada exitosamente.</p>

                <div class="info-box">
                  <p><strong>📄 Factura:</strong> ${data.invoice_number}</p>
                  <p><strong>💰 Monto:</strong> $${parseFloat(data.invoice_amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</p>
                  <p><strong>✅ Estado:</strong> Evidencia Aprobada</p>
                </div>

                <div class="next-steps">
                  <p><strong>🎯 Siguiente paso:</strong></p>
                  <p>Ahora que tu evidencia ha sido aprobada, el administrador procederá a subir el comprobante de pago correspondiente.</p>
                </div>

                <p>Puedes dar seguimiento al estado de tu pago en el portal:</p>
                <p style="text-align: center; margin-top: 20px;">
                  <a href="https://qualmedical.iakan.es" style="display: inline-block; padding: 12px 30px; background: #22c55e; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Acceder al Portal
                  </a>
                </p>
              </div>

              <div class="footer">
                <p>Este es un mensaje automático del Sistema QualMedical</p>
                <p>© 2025 QualMedical. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
        </html>
      `
    }),

    evidence_rejected: (data) => ({
      subject: `❌ Evidencia de Entrega Rechazada - Factura ${data.invoice_number}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: white;
              }
              .header { 
                background-color: #ef4444; 
                color: white; 
                padding: 20px 30px; 
                text-align: center; 
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: normal;
              }
              .alert-box {
                background-color: #fee2e2;
                border: 1px solid #fecaca;
                padding: 20px;
                margin: 20px 30px;
                text-align: center;
                border-radius: 4px;
              }
              .alert-box h2 {
                color: #dc2626;
                margin: 0 0 10px 0;
                font-size: 20px;
              }
              .content { 
                padding: 0 30px 30px 30px;
              }
              .info-box {
                background: #f9fafb;
                border-left: 3px solid #ef4444;
                padding: 15px;
                margin: 15px 0;
              }
              .info-box p {
                margin: 5px 0;
              }
              .reason-box {
                background: #fef3c7;
                border-left: 3px solid #f59e0b;
                padding: 15px;
                margin: 20px 0;
              }
              .reason-box strong {
                color: #d97706;
              }
              .action-box {
                background: #dbeafe;
                border-left: 3px solid #3b82f6;
                padding: 15px;
                margin: 20px 0;
              }
              .action-box strong {
                color: #1e40af;
              }
              .footer { 
                text-align: center; 
                padding: 20px 30px;
                background-color: #f9fafb;
                color: #6b7280; 
                font-size: 14px;
                border-top: 1px solid #e5e7eb;
              }
              .footer p {
                margin: 5px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>⚠️ Evidencia de Entrega Rechazada</h1>
              </div>
              
              <div class="alert-box">
                <h2>La evidencia requiere correcciones</h2>
                <p>Tu evidencia de entrega ha sido revisada y necesita ser corregida</p>
              </div>

              <div class="content">
                <p><strong>Estimado proveedor,</strong></p>
                
                <p>Hemos revisado la evidencia de entrega que proporcionaste y lamentablemente no cumple con los requisitos necesarios.</p>

                <div class="info-box">
                  <p><strong>📄 Factura:</strong> ${data.invoice_number}</p>
                  <p><strong>💰 Monto:</strong> $${parseFloat(data.invoice_amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</p>
                  <p><strong>❌ Estado:</strong> Evidencia Rechazada</p>
                </div>

                ${data.rejection_reason ? `
                <div class="reason-box">
                  <p><strong>📝 Razón del rechazo:</strong></p>
                  <p style="margin: 10px 0 0 0;">${data.rejection_reason}</p>
                </div>
                ` : ''}

                <div class="action-box">
                  <p><strong>🔧 Acción requerida:</strong></p>
                  <p>Por favor, revisa la razón del rechazo y vuelve a subir la evidencia de entrega con las correcciones necesarias.</p>
                  <p style="margin-top: 10px;"><strong>Nota:</strong> Asegúrate de que las imágenes sean claras, legibles y muestren la entrega completa del pedido.</p>
                </div>

                <p style="text-align: center; margin-top: 20px;">
                  <a href="https://qualmedical.iakan.es" style="display: inline-block; padding: 12px 30px; background: #ef4444; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    Subir Nueva Evidencia
                  </a>
                </p>
              </div>

              <div class="footer">
                <p>Este es un mensaje automático del Sistema QualMedical</p>
                <p>© 2025 QualMedical. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
        </html>
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
