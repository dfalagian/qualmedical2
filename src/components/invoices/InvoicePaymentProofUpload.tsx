import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Loader2, FileCheck, Plus, CheckCircle2 } from "lucide-react";
import { convertPDFToImages } from "@/lib/pdfToImages";
import { useAuth } from "@/hooks/useAuth";

interface InvoicePaymentProofUploadProps {
  invoiceId: string;
  supplierId: string;
  hasProof: boolean;
  proofUrl?: string | null;
  invoiceAmount?: number;
  paidAmount?: number;
}

export function InvoicePaymentProofUpload({ 
  invoiceId, 
  supplierId, 
  hasProof, 
  proofUrl,
  invoiceAmount = 0,
  paidAmount = 0
}: InvoicePaymentProofUploadProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  const isFullyPaid = paidAmount >= invoiceAmount && invoiceAmount > 0;
  const remainingAmount = Math.max(0, invoiceAmount - paidAmount);

  // Fetch payment info to get accurate paid amount
  const { data: paymentInfo } = useQuery({
    queryKey: ["payment-info", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos")
        .select("id, paid_amount, amount, status")
        .eq("invoice_id", invoiceId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  const effectivePaidAmount = paymentInfo?.paid_amount ?? paidAmount;
  const effectiveIsFullyPaid = effectivePaidAmount >= invoiceAmount && invoiceAmount > 0;
  const effectiveRemainingAmount = Math.max(0, invoiceAmount - effectivePaidAmount);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      let { data: pagoData, error: pagoError } = await supabase
        .from("pagos")
        .select("id")
        .eq("invoice_id", invoiceId)
        .maybeSingle();

      if (pagoError) throw pagoError;

      if (!pagoData) {
        const { data: bankDocsData, error: bankDocsError } = await supabase
          .from("documents")
          .select("id, nombre_banco")
          .eq("supplier_id", supplierId)
          .eq("document_type", "datos_bancarios")
          .eq("status", "aprobado")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (bankDocsError) throw bankDocsError;
        if (!bankDocsData) throw new Error("No se encontraron datos bancarios aprobados");

        const { data: invoiceData, error: invoiceError } = await supabase
          .from("invoices")
          .select("amount")
          .eq("id", invoiceId)
          .single();

        if (invoiceError) throw invoiceError;

        const { data: newPago, error: createPagoError } = await supabase
          .from("pagos")
          .insert({
            supplier_id: supplierId,
            datos_bancarios_id: bankDocsData.id,
            invoice_id: invoiceId,
            amount: invoiceData.amount,
            status: "pendiente",
            nombre_banco: bankDocsData.nombre_banco,
          })
          .select("id")
          .single();

        if (createPagoError) throw createPagoError;
        pagoData = newPago;
      }

      let imageFile: File;
      if (file.type === 'application/pdf') {
        const result = await convertPDFToImages(file);
        if (result.images.length === 0) throw new Error('No se pudo convertir el PDF');
        imageFile = new File([result.images[0]], 'comprobante.png', { type: 'image/png' });
      } else {
        imageFile = file;
      }

      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${supplierId}/comprobantes/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      const { data, error: functionError } = await supabase.functions.invoke(
        'extract-payment-proof-info',
        { body: { pagoId: pagoData.id, filePath: fileName } }
      );

      if (functionError) throw functionError;
      return { ...data, pagoId: pagoData.id };
    },
    onSuccess: (data) => {
      if (data?.isFullyPaid) {
        toast.success(data.message, { duration: 8000 });
      } else if (data?.isPartialPayment) {
        toast.warning(data.message, { duration: 10000 });
      } else if (data?.discrepancias?.detectadas) {
        toast.error("⚠️ Discrepancias detectadas en datos bancarios", { duration: 8000 });
      } else {
        toast.success("Comprobante procesado correctamente");
      }
      
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
      queryClient.invalidateQueries({ queryKey: ["payment-proofs"] });
      queryClient.invalidateQueries({ queryKey: ["payment-info"] });
      setFile(null);
      setOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al subir el comprobante");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(selectedFile.type)) {
      toast.error('Solo se permiten archivos JPG, PNG o PDF');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('El archivo no debe superar los 10MB');
      return;
    }
    setFile(selectedFile);
  };

  const handleUpload = () => {
    if (!file) {
      toast.error("Por favor selecciona un archivo");
      return;
    }
    uploadMutation.mutate(file);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  // Determine button appearance
  const getButtonVariant = () => {
    if (effectiveIsFullyPaid) return "outline";
    if (hasProof) return "secondary";
    return "default";
  };

  const getButtonIcon = () => {
    if (effectiveIsFullyPaid) return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
    if (hasProof) return <Plus className="h-3.5 w-3.5" />;
    return <FileCheck className="h-3.5 w-3.5" />;
  };

  const getTooltipText = () => {
    if (effectiveIsFullyPaid) return "Factura pagada completamente";
    if (hasProof) return "Agregar otro comprobante de pago";
    return "Subir comprobante de pago";
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) {
        setFile(null);
      }
    }}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant={getButtonVariant()} size="icon" className="h-8 w-8">
                {getButtonIcon()}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getTooltipText()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {effectiveIsFullyPaid ? "Factura Pagada" : hasProof ? "Agregar Comprobante de Pago" : "Subir Comprobante de Pago"}
          </DialogTitle>
        </DialogHeader>

        {/* Payment summary */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Total de factura:</span>
            <span className="font-medium">{formatCurrency(invoiceAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Total pagado:</span>
            <span className="font-medium text-green-600">{formatCurrency(effectivePaidAmount)}</span>
          </div>
          <div className="flex justify-between text-sm border-t pt-2">
            <span className="font-medium">Pendiente por pagar:</span>
            <span className={`font-bold ${effectiveIsFullyPaid ? 'text-green-600' : 'text-orange-600'}`}>
              {effectiveIsFullyPaid ? "Pagado" : formatCurrency(effectiveRemainingAmount)}
            </span>
          </div>
        </div>

        {effectiveIsFullyPaid ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <p className="text-lg font-semibold text-green-600">¡Factura completamente pagada!</p>
            <p className="text-sm text-muted-foreground mt-2">
              Se han registrado todos los pagos para esta factura.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="proof-file">Archivo del comprobante (JPG, PNG o PDF)</Label>
              <Input id="proof-file" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleFileChange} className="mt-2" />
              {file && <p className="text-sm text-muted-foreground mt-1">Archivo seleccionado: {file.name}</p>}
            </div>
            
            <Button onClick={handleUpload} disabled={!file || uploadMutation.isPending} className="w-full">
              {uploadMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Procesando...</>
              ) : (
                hasProof ? "Agregar Comprobante" : "Subir y Procesar"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}