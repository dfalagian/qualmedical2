import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, FileCheck } from "lucide-react";
import { getSignedUrl } from "@/lib/storage";
import { convertPDFToImages } from "@/lib/pdfToImages";

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
  const queryClient = useQueryClient();

  // Cargar la URL firmada cuando se abre el diálogo y ya existe un comprobante
  useEffect(() => {
    const loadSignedUrl = async () => {
      if (open && proofUrl && hasProof) {
        setLoadingImage(true);
        try {
          // Extraer el path del archivo desde la URL completa
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
      // Primero, buscar si existe un registro de pago para esta factura
      const { data: pagoData, error: pagoError } = await supabase
        .from("pagos")
        .select("id")
        .eq("invoice_id", invoiceId)
        .maybeSingle();

      if (pagoError) throw pagoError;

      if (!pagoData) {
        throw new Error("No se encontró un registro de pago para esta factura");
      }

      const pagoId = pagoData.id;

      // Convertir PDF a imágenes si es necesario
      let imageFile: File;
      if (file.type === 'application/pdf') {
        const result = await convertPDFToImages(file);
        if (result.images.length === 0) {
          throw new Error('No se pudo convertir el PDF');
        }
        // Convertir Blob a File
        imageFile = new File([result.images[0]], 'comprobante.png', { type: 'image/png' });
      } else {
        imageFile = file;
      }

      // Subir imagen a Supabase Storage
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${supplierId}/comprobantes/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      // Invocar edge function para extraer información
      const { data, error: functionError } = await supabase.functions.invoke(
        'extract-payment-proof-info',
        {
          body: { 
            pagoId,
            filePath: fileName
          }
        }
      );

      if (functionError) throw functionError;

      return data;
    },
    onSuccess: () => {
      toast.success("Comprobante subido y procesado correctamente");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant={hasProof ? "outline" : "default"} 
          size="icon"
          className="h-8 w-8"
          title={hasProof ? "Ver Comprobante" : "Subir Comprobante"}
        >
          <FileCheck className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {hasProof ? "Comprobante de Pago" : "Subir Comprobante de Pago"}
          </DialogTitle>
        </DialogHeader>

        {hasProof && proofUrl ? (
          <div className="space-y-4">
            {loadingImage ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : signedUrl ? (
              <img 
                src={signedUrl} 
                alt="Comprobante de pago" 
                className="w-full rounded-lg border"
              />
            ) : (
              <p className="text-center text-muted-foreground p-4">
                No se pudo cargar la imagen
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="proof-file">Archivo del comprobante (JPG, PNG o PDF)</Label>
              <Input
                id="proof-file"
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={handleFileChange}
                className="mt-2"
              />
              {file && (
                <p className="text-sm text-muted-foreground mt-1">
                  Archivo seleccionado: {file.name}
                </p>
              )}
            </div>
            
            <Button
              onClick={handleUpload}
              disabled={!file || uploadMutation.isPending}
              className="w-full"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                "Subir y Procesar"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
