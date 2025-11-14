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
  | 'evidence_rejected';

type AdminNotificationType =
  | 'new_registration'
  | 'pending_document'
  | 'pending_invoice'
  | 'extraction_completed'
  | 'extraction_failed'
  | 'new_message'
  | 'payment_proof_uploaded';

export const useNotifications = () => {
  const notifySupplier = async (
    supplierId: string,
    type: NotificationType,
    data?: any
  ) => {
    try {
      const { error } = await supabase.functions.invoke("notify-supplier", {
        body: {
          supplier_id: supplierId,
          type,
          data,
        },
      });

      if (error) {
        console.error("Error sending supplier notification:", error);
        throw error;
      }
    } catch (error) {
      console.error("Failed to notify supplier:", error);
    }
  };

  const notifyAdmin = async (type: AdminNotificationType, data?: any) => {
    try {
      const { error } = await supabase.functions.invoke("notify-admin", {
        body: {
          type,
          data,
        },
      });

      if (error) {
        console.error("Error sending admin notification:", error);
        throw error;
      }
    } catch (error) {
      console.error("Failed to notify admin:", error);
    }
  };

  return {
    notifySupplier,
    notifyAdmin,
  };
};
