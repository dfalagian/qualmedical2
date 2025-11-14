import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useSupplierApproval() {
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async ({ supplierId, approved }: { supplierId: string; approved: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ approved })
        .eq("id", supplierId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.approved 
          ? "Proveedor aprobado exitosamente" 
          : "Aprobación de proveedor revocada"
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
