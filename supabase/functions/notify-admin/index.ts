import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: 'new_registration' | 'pending_document' | 'pending_invoice' | 'extraction_completed' | 
        'extraction_failed' | 'new_message' | 'payment_proof_uploaded';
  data?: any;
}

const getEmailTemplate = (type: string, data: any) => {
  const templates = {
    new_registration: {
      subject: "Nuevo proveedor registrado",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Nuevo Proveedor Registrado</h2>
          <p>Se ha registrado un nuevo proveedor en el sistema:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Nombre:</strong> ${data?.supplier_name || 'Sin nombre'}</p>
            <p><strong>Email:</strong> ${data?.email || 'Sin email'}</p>
            <p><strong>Fecha de registro:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          <p>Por favor, revisa y aprueba la cuenta del proveedor.</p>
          <p style="margin-top: 30px;">Sistema QualMedical</p>
        </div>
      `
    },
    pending_document: {
      subject: `Nuevo documento pendiente: ${data?.document_type || 'Documento'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">Documento Pendiente de Revisión</h2>
          <p>Se ha subido un nuevo documento que requiere revisión:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Tipo:</strong> ${data?.document_type || 'Documento'}</p>
            <p><strong>Proveedor:</strong> ${data?.supplier_name || 'Sin nombre'}</p>
            <p><strong>Fecha de subida:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          <p>Por favor, revisa y aprueba o rechaza el documento.</p>
          <p style="margin-top: 30px;">Sistema QualMedical</p>
        </div>
      `
    },
    pending_invoice: {
      subject: `Nueva factura pendiente: ${data?.invoice_number || 'Factura'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">Factura Pendiente de Validación</h2>
          <p>Se ha subido una nueva factura que requiere validación:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Número:</strong> ${data?.invoice_number || 'Sin número'}</p>
            <p><strong>Proveedor:</strong> ${data?.supplier_name || 'Sin nombre'}</p>
            <p><strong>Monto:</strong> $${data?.amount || '0.00'}</p>
            <p><strong>Fecha de subida:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          <p>Por favor, valida la factura en el sistema.</p>
          <p style="margin-top: 30px;">Sistema QualMedical</p>
        </div>
      `
    },
    extraction_completed: {
      subject: `Extracción completada: ${data?.document_type || 'Documento'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #22c55e;">Extracción de Datos Completada ✓</h2>
          <p>La extracción de datos se ha completado exitosamente:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Documento:</strong> ${data?.document_type || 'Documento'}</p>
            <p><strong>Proveedor:</strong> ${data?.supplier_name || 'Sin nombre'}</p>
            ${data?.extracted_data ? `<p><strong>Datos extraídos:</strong> ${JSON.stringify(data.extracted_data, null, 2)}</p>` : ''}
          </div>
          <p>Los datos están listos para su revisión.</p>
          <p style="margin-top: 30px;">Sistema QualMedical</p>
        </div>
      `
    },
    extraction_failed: {
      subject: `Error en extracción: ${data?.document_type || 'Documento'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ef4444;">Error en Extracción de Datos</h2>
          <p>Ha ocurrido un error durante la extracción de datos:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Documento:</strong> ${data?.document_type || 'Documento'}</p>
            <p><strong>Proveedor:</strong> ${data?.supplier_name || 'Sin nombre'}</p>
            ${data?.error ? `<p><strong>Error:</strong> ${data.error}</p>` : ''}
          </div>
          <p>Por favor, revisa el documento manualmente.</p>
          <p style="margin-top: 30px;">Sistema QualMedical</p>
        </div>
      `
    },
    new_message: {
      subject: `Nuevo mensaje de proveedor: ${data?.subject || 'Mensaje'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Nuevo Mensaje de Proveedor</h2>
          <p>Has recibido un nuevo mensaje:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>De:</strong> ${data?.supplier_name || 'Proveedor'}</p>
            <p><strong>Asunto:</strong> ${data?.subject || 'Sin asunto'}</p>
            <p>${data?.message || ''}</p>
          </div>
          <p>Por favor, inicia sesión en el sistema para responder.</p>
          <p style="margin-top: 30px;">Sistema QualMedical</p>
        </div>
      `
    },
    payment_proof_uploaded: {
      subject: `Nuevo comprobante de pago: ${data?.invoice_number || 'Factura'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Comprobante de Pago Subido</h2>
          <p>Se ha subido un nuevo comprobante de pago:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Factura:</strong> ${data?.invoice_number || 'Sin número'}</p>
            <p><strong>Proveedor:</strong> ${data?.supplier_name || 'Sin nombre'}</p>
            <p><strong>Monto:</strong> $${data?.amount || '0.00'}</p>
            <p><strong>Fecha de subida:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          <p>Por favor, revisa el comprobante en el sistema.</p>
          <p style="margin-top: 30px;">Sistema QualMedical</p>
        </div>
      `
    }
  };

  return templates[type as keyof typeof templates] || {
    subject: "Notificación del sistema",
    html: `<p>Tienes una nueva notificación administrativa.</p>`
  };
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, data }: NotificationRequest = await req.json();

    console.log("Sending admin notification:", { type });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all admin emails
    const { data: admins, error: adminsError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminsError || !admins || admins.length === 0) {
      console.error("Error fetching admins:", adminsError);
      throw new Error("No admins found");
    }

    const { data: adminProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("email")
      .in("id", admins.map(a => a.user_id));

    if (profilesError || !adminProfiles) {
      console.error("Error fetching admin profiles:", profilesError);
      throw new Error("Admin profiles not found");
    }

    const template = getEmailTemplate(type, data);

    // Send email to all admins
    const emailPromises = adminProfiles.map(admin =>
      supabase.functions.invoke("send-email", {
        body: {
          to: admin.email,
          subject: template.subject,
          html: template.html,
        },
      })
    );

    const results = await Promise.allSettled(emailPromises);
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;

    console.log(`Notifications sent: ${successCount} success, ${failureCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Notifications sent",
        stats: { successCount, failureCount }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending admin notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
