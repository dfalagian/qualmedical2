import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  supplier_id: string;
  type: 'account_approved' | 'account_rejected' | 'document_approved' | 'document_rejected' | 
        'invoice_validated' | 'invoice_rejected' | 'payment_completed' | 'payment_pending' | 
        'purchase_order_created' | 'new_message';
  data?: any;
}

const getEmailTemplate = (type: string, data: any, supplierName: string) => {
  const templates = {
    account_approved: {
      subject: "¡Tu cuenta ha sido aprobada!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #22c55e;">Cuenta Aprobada ✓</h2>
          <p>Hola ${supplierName},</p>
          <p>Tu cuenta de proveedor ha sido aprobada exitosamente.</p>
          <p>Ya puedes acceder a todas las funcionalidades del sistema.</p>
          <p style="margin-top: 30px;">Saludos,<br>Equipo QualMedical</p>
        </div>
      `
    },
    account_rejected: {
      subject: "Actualización sobre tu cuenta",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ef4444;">Cuenta Rechazada</h2>
          <p>Hola ${supplierName},</p>
          <p>Lamentamos informarte que tu cuenta no ha sido aprobada.</p>
          <p><strong>Motivo:</strong> ${data?.rejection_reason || 'No especificado'}</p>
          <p>Por favor, contacta al administrador para más información.</p>
          <p style="margin-top: 30px;">Saludos,<br>Equipo QualMedical</p>
        </div>
      `
    },
    document_approved: {
      subject: `Documento aprobado: ${data?.document_type || 'Documento'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #22c55e;">Documento Aprobado ✓</h2>
          <p>Hola ${supplierName},</p>
          <p>Tu documento <strong>${data?.document_type || 'documento'}</strong> ha sido aprobado.</p>
          ${data?.notes ? `<p><strong>Notas:</strong> ${data.notes}</p>` : ''}
          <p style="margin-top: 30px;">Saludos,<br>Equipo QualMedical</p>
        </div>
      `
    },
    document_rejected: {
      subject: `Documento rechazado: ${data?.document_type || 'Documento'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ef4444;">Documento Rechazado</h2>
          <p>Hola ${supplierName},</p>
          <p>Tu documento <strong>${data?.document_type || 'documento'}</strong> ha sido rechazado.</p>
          ${data?.rejection_reason ? `<p><strong>Motivo:</strong> ${data.rejection_reason}</p>` : ''}
          <p>Por favor, revisa y vuelve a subir el documento corregido.</p>
          <p style="margin-top: 30px;">Saludos,<br>Equipo QualMedical</p>
        </div>
      `
    },
    invoice_validated: {
      subject: `Factura validada: ${data?.invoice_number || 'Factura'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #22c55e;">Factura Validada ✓</h2>
          <p>Hola ${supplierName},</p>
          <p>Tu factura <strong>${data?.invoice_number || 'factura'}</strong> ha sido validada exitosamente.</p>
          <p><strong>Monto:</strong> $${data?.amount || '0.00'}</p>
          <p><strong>Estado:</strong> ${data?.status || 'Validada'}</p>
          <p style="margin-top: 30px;">Saludos,<br>Equipo QualMedical</p>
        </div>
      `
    },
    invoice_rejected: {
      subject: `Factura rechazada: ${data?.invoice_number || 'Factura'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ef4444;">Factura Rechazada</h2>
          <p>Hola ${supplierName},</p>
          <p>Tu factura <strong>${data?.invoice_number || 'factura'}</strong> ha sido rechazada.</p>
          ${data?.rejection_reason ? `<p><strong>Motivo:</strong> ${data.rejection_reason}</p>` : ''}
          <p>Por favor, revisa y vuelve a subir la factura corregida.</p>
          <p style="margin-top: 30px;">Saludos,<br>Equipo QualMedical</p>
        </div>
      `
    },
    payment_completed: {
      subject: `Pago completado: ${data?.invoice_number || 'Factura'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #22c55e;">Pago Completado ✓</h2>
          <p>Hola ${supplierName},</p>
          <p>El pago de tu factura <strong>${data?.invoice_number || 'factura'}</strong> ha sido completado.</p>
          <p><strong>Monto pagado:</strong> $${data?.amount || '0.00'}</p>
          <p><strong>Fecha de pago:</strong> ${data?.payment_date || new Date().toLocaleDateString()}</p>
          ${data?.payment_method ? `<p><strong>Método:</strong> ${data.payment_method}</p>` : ''}
          <p style="margin-top: 30px;">Saludos,<br>Equipo QualMedical</p>
        </div>
      `
    },
    payment_pending: {
      subject: `Pago en proceso: ${data?.invoice_number || 'Factura'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">Pago en Proceso</h2>
          <p>Hola ${supplierName},</p>
          <p>Tu pago para la factura <strong>${data?.invoice_number || 'factura'}</strong> está siendo procesado.</p>
          <p><strong>Monto:</strong> $${data?.amount || '0.00'}</p>
          <p>Te notificaremos cuando el pago sea completado.</p>
          <p style="margin-top: 30px;">Saludos,<br>Equipo QualMedical</p>
        </div>
      `
    },
    purchase_order_created: {
      subject: `Nueva orden de compra: ${data?.po_number || 'OC'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Nueva Orden de Compra</h2>
          <p>Hola ${supplierName},</p>
          <p>Se ha creado una nueva orden de compra: <strong>${data?.po_number || 'orden'}</strong></p>
          <p><strong>Monto total:</strong> $${data?.total_amount || '0.00'}</p>
          ${data?.delivery_date ? `<p><strong>Fecha de entrega:</strong> ${data.delivery_date}</p>` : ''}
          <p>Por favor, revisa los detalles en el sistema.</p>
          <p style="margin-top: 30px;">Saludos,<br>Equipo QualMedical</p>
        </div>
      `
    },
    new_message: {
      subject: `Nuevo mensaje: ${data?.subject || 'Mensaje'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Nuevo Mensaje</h2>
          <p>Hola ${supplierName},</p>
          <p>Tienes un nuevo mensaje:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Asunto:</strong> ${data?.subject || 'Sin asunto'}</p>
            <p>${data?.message || ''}</p>
          </div>
          <p>Por favor, inicia sesión en el sistema para responder.</p>
          <p style="margin-top: 30px;">Saludos,<br>Equipo QualMedical</p>
        </div>
      `
    }
  };

  return templates[type as keyof typeof templates] || {
    subject: "Notificación del sistema",
    html: `<p>Hola ${supplierName}, tienes una nueva notificación.</p>`
  };
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { supplier_id, type, data }: NotificationRequest = await req.json();

    console.log("Sending notification:", { supplier_id, type });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get supplier email
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", supplier_id)
      .single();

    if (profileError || !profile) {
      console.error("Error fetching supplier profile:", profileError);
      throw new Error("Supplier not found");
    }

    const template = getEmailTemplate(type, data, profile.full_name || profile.email);

    // Send email via send-email function
    const emailResponse = await supabase.functions.invoke("send-email", {
      body: {
        to: profile.email,
        subject: template.subject,
        html: template.html,
      },
    });

    if (emailResponse.error) {
      throw emailResponse.error;
    }

    console.log("Notification sent successfully to:", profile.email);

    return new Response(
      JSON.stringify({ success: true, message: "Notification sent" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending notification:", error);
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
