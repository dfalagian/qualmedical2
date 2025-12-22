import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Loader2, FileCheck, RefreshCw } from "lucide-react";
import { getSignedUrl } from "@/lib/storage";
import { convertPDFToImages } from "@/lib/pdfToImages";
import { useAuth } from "@/hooks/useAuth";

interface InvoicePaymentProofUploadProps {
  invoiceId: string;
  supplierId: string;
  hasProof: boolean;
  proofUrl?: string | null;
}

export function InvoicePaymentProofUpload({ 
  invoiceId, 
  supplierId, 
  hasProof, 
  proofUrl 
}: InvoicePaymentProofUploadProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  useEffect(() => {
    const loadSignedUrl = async () => {
      if (open && proofUrl && hasProof) {
        setLoadingImage(true);
        try {
          const urlPath = new URL(proofUrl).pathname;
          const filePath = urlPath.split('/').slice(-3).join('/');
          const url = await getSignedUrl('documents', filePath, 3600);
          setSignedUrl(url);
        } catch (error) {
          console.error('Error loading signed URL:', error);
        } finally {
          setLoadingImage(false);
        }
      }
    };
    loadSignedUrl();
  }, [open, proofUrl, hasProof]);

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
      if (data?.isPartialPayment) {
        toast.warning(data.message, { duration: 10000 });
      } else if (data?.discrepancias?.detectadas) {
        toast.error("⚠️ Discrepancias detectadas en datos bancarios", { duration: 8000 });
      } else {
        toast.success(isChanging ? "Comprobante actualizado" : "Comprobante procesado correctamente");
      }
      
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
      setFile(null);
      setOpen(false);
      setIsChanging(false);
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

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) {
        setIsChanging(false);
        setFile(null);
      }
    }}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant={hasProof ? "outline" : "default"} size="icon" className="h-8 w-8">
                <FileCheck className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{hasProof ? "Ver comprobante de pago" : "Subir comprobante de pago"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{hasProof ? "Comprobante de Pago" : "Subir Comprobante de Pago"}</DialogTitle>
        </DialogHeader>

        {hasProof && proofUrl && !isChanging ? (
          <div className="space-y-4">
            {loadingImage ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : signedUrl ? (
              <>
                <img src={signedUrl} alt="Comprobante de pago" className="w-full rounded-lg border" />
                {isAdmin && (
                  <Button onClick={() => setIsChanging(true)} variant="outline" className="w-full">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Cambiar Comprobante
                  </Button>
                )}
              </>
            ) : (
              <p className="text-center text-muted-foreground p-4">No se pudo cargar la imagen</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="proof-file">Archivo del comprobante (JPG, PNG o PDF)</Label>
              <Input id="proof-file" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleFileChange} className="mt-2" />
              {file && <p className="text-sm text-muted-foreground mt-1">Archivo seleccionado: {file.name}</p>}
            </div>
            
            <div className="flex gap-2">
              {isChanging && (
                <Button onClick={() => { setIsChanging(false); setFile(null); }} variant="outline" className="flex-1">
                  Cancelar
                </Button>
              )}
              <Button onClick={handleUpload} disabled={!file || uploadMutation.isPending} className={isChanging ? "flex-1" : "w-full"}>
                {uploadMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Procesando...</>
                ) : (
                  isChanging ? "Actualizar Comprobante" : "Subir y Procesar"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
