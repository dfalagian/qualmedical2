import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, CheckCircle, Clock, Receipt, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getSignedUrl } from "@/lib/storage";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface PaymentProofsHistoryProps {
  pagoId: string;
  invoiceAmount: number;
  paidAmount?: number;
  status: string;
  defaultOpen?: boolean;
}

interface PaymentProof {
  id: string;
  proof_number: number;
  amount: number;
  comprobante_url: string;
  fecha_pago: string | null;
  created_at: string;
}

export function PaymentProofsHistory({ 
  pagoId, 
  invoiceAmount, 
  paidAmount = 0,
  status,
  defaultOpen = false
}: PaymentProofsHistoryProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [proofToDelete, setProofToDelete] = useState<PaymentProof | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  const { data: proofs, isLoading } = useQuery({
    queryKey: ["payment-proofs", pagoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_proofs")
        .select("*")
        .eq("pago_id", pagoId)
        .order("proof_number", { ascending: true });

      if (error) throw error;
      return data as PaymentProof[];
    },
    enabled: !!pagoId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (proof: PaymentProof) => {
      // Eliminar el comprobante
      const { error: deleteError } = await supabase
        .from("payment_proofs")
        .delete()
        .eq("id", proof.id);

      if (deleteError) throw deleteError;

      // Actualizar el paid_amount en pagos
      const { data: currentPago, error: pagoError } = await supabase
        .from("pagos")
        .select("paid_amount, original_amount")
        .eq("id", pagoId)
        .single();

      if (pagoError) throw pagoError;

      const newPaidAmount = Math.max(0, (currentPago.paid_amount || 0) - Number(proof.amount));
      const newStatus = newPaidAmount <= 0 ? "pendiente" : 
                        newPaidAmount >= (currentPago.original_amount || 0) ? "pagado" : "parcial";

      const { error: updateError } = await supabase
        .from("pagos")
        .update({ 
          paid_amount: newPaidAmount,
          status: newStatus
        })
        .eq("id", pagoId);

      if (updateError) throw updateError;

      // Actualizar status de la factura si es necesario
      const { data: invoice } = await supabase
        .from("invoices")
        .select("id")
        .eq("id", proof.id)
        .maybeSingle();

      // Obtener invoice_id desde payment_proofs o pagos
      const { data: proofData } = await supabase
        .from("payment_proofs")
        .select("invoice_id")
        .eq("pago_id", pagoId)
        .limit(1)
        .maybeSingle();

      if (proofData?.invoice_id || !proofData) {
        // Actualizar estado de factura basado en nuevo paid_amount
        const invoiceStatus = newPaidAmount <= 0 ? "pendiente" : 
                             newPaidAmount >= (currentPago.original_amount || 0) ? "pagado" : "procesando";
        
        await supabase
          .from("invoices")
          .update({ status: invoiceStatus })
          .eq("id", proofData?.invoice_id);
      }

      return { newPaidAmount };
    },
    onSuccess: () => {
      toast.success("Comprobante eliminado correctamente");
      queryClient.invalidateQueries({ queryKey: ["payment-proofs"] });
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setDeleteDialogOpen(false);
      setProofToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar el comprobante");
    },
  });

  const remainingAmount = invoiceAmount - paidAmount;
  const isFullyPaid = remainingAmount <= 0 || status === 'pagado';

  const handleViewProof = async (url: string) => {
    setLoadingImage(true);
    setDialogOpen(true);
    try {
      const urlPath = new URL(url).pathname;
      const filePath = urlPath.split('/').slice(-3).join('/');
      const signedUrl = await getSignedUrl('documents', filePath, 3600);
      setSelectedProofUrl(signedUrl);
    } catch (error) {
      console.error('Error loading signed URL:', error);
    } finally {
      setLoadingImage(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, proof: PaymentProof) => {
    e.stopPropagation();
    setProofToDelete(proof);
    setDeleteDialogOpen(true);
  };

  if (isLoading || !proofs || proofs.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between p-2 h-auto">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            <span className="text-sm font-medium">
              Historial de pagos ({proofs.length})
            </span>
            {isFullyPaid ? (
              <Badge variant="default" className="bg-green-600 ml-2">
                <CheckCircle className="h-3 w-3 mr-1" />
                Pagado
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-orange-100 text-orange-700 ml-2">
                <Clock className="h-3 w-3 mr-1" />
                Resta: ${remainingAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </Badge>
            )}
          </div>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-2 space-y-2">
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="flex justify-between text-sm font-medium border-b pb-2">
            <span>Total factura:</span>
            <span>${invoiceAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
          </div>
          
          {proofs.map((proof) => (
            <div 
              key={proof.id} 
              className="flex justify-between items-center text-sm py-1 hover:bg-muted/80 px-2 rounded cursor-pointer group"
              onClick={() => handleViewProof(proof.comprobante_url)}
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Pago #{proof.proof_number}
                </Badge>
                {proof.fecha_pago && (
                  <span className="text-muted-foreground text-xs">
                    {new Date(proof.fecha_pago).toLocaleDateString('es-MX')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-green-600">
                  -${Number(proof.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => handleDeleteClick(e, proof)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          
          <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
            <span>Total pagado:</span>
            <span className="text-green-600">
              ${paidAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
          </div>
          
          {!isFullyPaid && (
            <div className="flex justify-between text-sm font-bold text-orange-600">
              <span>Pendiente:</span>
              <span>${remainingAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>
      </CollapsibleContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Comprobante de Pago</DialogTitle>
          </DialogHeader>
          {loadingImage ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : selectedProofUrl ? (
            <img 
              src={selectedProofUrl} 
              alt="Comprobante de pago" 
              className="w-full rounded-lg border"
            />
          ) : (
            <p className="text-center text-muted-foreground p-4">
              No se pudo cargar la imagen
            </p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar comprobante de pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el comprobante de pago #{proofToDelete?.proof_number} por{" "}
              <span className="font-semibold">
                ${Number(proofToDelete?.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>.
              <br /><br />
              El monto pagado de la factura se actualizará automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => proofToDelete && deleteMutation.mutate(proofToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                "Eliminar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
