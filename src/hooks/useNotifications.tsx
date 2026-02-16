import { supabase } from "@/integrations/supabase/client";

type NotificationType = 
  | 'account_approved' 
  | 'account_rejected' 
  | 'document_approved' 
  | 'document_rejected'
  | 'invoice_validated' 
  | 'invoice_rejected' 
  | 'payment_completed' 
  | 'payment_pending'
  | 'purchase_order_created' 
  | 'new_message'
  | 'evidence_approved'
  | 'evidence_rejected'
  | 'invoice_status_processing'
  | 'invoice_status_paid'
  | 'invoice_status_rejected';

type AdminNotificationType =
  | 'new_registration'
  | 'pending_document'
  | 'pending_invoice'
  | 'extraction_completed'
  | 'extraction_failed'
  | 'new_message'
  | 'payment_proof_uploaded';

// Map notification types to WhatsApp template types
const WHATSAPP_TEMPLATE_MAP: Partial<Record<NotificationType, string>> = {
  account_approved: 'account_approved',
  account_rejected: 'account_rejected',
  document_approved: 'document_approved',
  document_rejected: 'document_rejected',
  invoice_validated: 'invoice_validated',
  invoice_rejected: 'invoice_rejected',
  payment_completed: 'payment_completed',
  payment_pending: 'payment_pending',
  evidence_approved: 'evidence_approved',
  evidence_rejected: 'evidence_rejected',
};

export const useNotifications = () => {
  const sendWhatsApp = async (
    phone: string,
    templateType: string,
    data?: Record<string, string>
  ) => {
    try {
      const { error } = await supabase.functions.invoke("send-whatsapp", {
        body: { to: phone, template_type: templateType, data },
      });
      if (error) {
        console.error("Error sending WhatsApp:", error);
      }
    } catch (error) {
      console.error("Failed to send WhatsApp:", error);
    }
  };

  const notifySupplier = async (
    supplierId: string,
    type: NotificationType,
    data?: any
  ) => {
    try {
      // Send email notification
      const { error } = await supabase.functions.invoke("notify-supplier", {
        body: { supplier_id: supplierId, type, data },
      });

      if (error) {
        console.error("Error sending supplier notification:", error);
        throw error;
      }

      // Send WhatsApp if template exists for this type
      const templateType = WHATSAPP_TEMPLATE_MAP[type];
      if (templateType) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("phone")
            .eq("id", supplierId)
            .single();

          if (profile?.phone) {
            await sendWhatsApp(profile.phone, templateType, data);
          }
        } catch (whatsappError) {
          // Don't fail the main notification if WhatsApp fails
          console.error("WhatsApp notification failed (non-blocking):", whatsappError);
        }
      }
    } catch (error) {
      console.error("Failed to notify supplier:", error);
    }
  };

  const notifyAdmin = async (type: AdminNotificationType, data?: any) => {
    try {
      const { error } = await supabase.functions.invoke("notify-admin", {
        body: { type, data },
      });

      if (error) {
        console.error("Error sending admin notification:", error);
        throw error;
      }
    } catch (error) {
      console.error("Failed to notify admin:", error);
    }
  };

  const notifySupplierWhatsApp = async (
    phone: string,
    templateType: string,
    data?: Record<string, string>
  ) => {
    await sendWhatsApp(phone, templateType, data);
  };

  const notifyRecipientsByEvent = async (
    eventType: string,
    templateType: string,
    data?: Record<string, string>
  ) => {
    try {
      const { data: recipients, error } = await supabase
        .from("notification_recipients")
        .select("phone, channel, name")
        .eq("event_type", eventType)
        .eq("is_active", true);

      if (error) {
        console.error("Error fetching notification recipients:", error);
        return;
      }

      if (!recipients || recipients.length === 0) {
        console.log(`No active recipients for event: ${eventType}`);
        return;
      }

      for (const recipient of recipients) {
        try {
          await supabase.functions.invoke("send-whatsapp", {
            body: {
              to: recipient.phone,
              template_type: templateType,
              data,
              channel: recipient.channel || "both",
            },
          });
          console.log(`Notification sent to ${recipient.name} (${recipient.phone})`);
        } catch (err) {
          console.error(`Failed to notify ${recipient.name}:`, err);
        }
      }
    } catch (error) {
      console.error("Failed to notify recipients:", error);
    }
  };

  return {
    notifySupplier,
    notifyAdmin,
    notifySupplierWhatsApp,
    notifyRecipientsByEvent,
  };
};
