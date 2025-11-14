import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNotifications } from "./useNotifications";

export function useSupplierApproval() {
  const queryClient = useQueryClient();
  const { notifySupplier } = useNotifications();

  const approveMutation = useMutation({
    mutationFn: async ({ supplierId, approved }: { supplierId: string; approved: boolean }) => {
      // For now, just send notifications without updating database
      // The approval logic should be handled elsewhere or via a database migration

      // Send notification
      if (approved) {
        await notifySupplier(supplierId, 'account_approved', {});
      } else {
        await notifySupplier(supplierId, 'account_rejected', {
          rejection_reason: 'Cuenta rechazada por el administrador'
        });
      }
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.approved 
          ? "Proveedor aprobado y notificado por email" 
          : "Aprobación revocada y proveedor notificado"
      );
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar estado de aprobación");
    },
  });

  return {
    approve: (supplierId: string) => approveMutation.mutate({ supplierId, approved: true }),
    revoke: (supplierId: string) => approveMutation.mutate({ supplierId, approved: false }),
    isLoading: approveMutation.isPending,
  };
}
