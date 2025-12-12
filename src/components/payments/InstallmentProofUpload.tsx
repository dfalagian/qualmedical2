import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, FileText, Eye, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { convertPDFToImages } from "@/lib/pdfToImages";
import { getSignedUrl } from "@/lib/storage";

interface InstallmentProofUploadProps {
  installmentId: string;
  supplierId: string;
  expectedAmount: number;
  hasProof: boolean;
  proofUrl?: string | null;
}

export function InstallmentProofUpload({ 
  installmentId, 
  supplierId, 
  expectedAmount,
  hasProof, 
  proofUrl 
}: InstallmentProofUploadProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && hasProof && proofUrl) {
      setLoadingImage(true);
      const urlParts = proofUrl.split('/documents/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        getSignedUrl('documents', filePath, 3600).then((url) => {
          setSignedUrl(url);
          setLoadingImage(false);
        }).catch((error) => {
          console.error('Error obteniendo URL firmada:', error);
          toast.error('Error cargando imagen');
          setLoadingImage(false);
        });
      }
    }
  }, [open, hasProof, proofUrl]);

  const uploadMutation = useMutation({
    mutationFn: async (selectedFile: File) => {
      // Convertir PDF a imagen si es necesario
      let imageFiles: Blob[] = [];
      
      if (selectedFile.type === 'application/pdf') {
        const { images } = await convertPDFToImages(selectedFile, 1);
        imageFiles = images;
      } else {
        imageFiles = [selectedFile];
      }

      if (imageFiles.length === 0) {
        throw new Error("No se pudo procesar el archivo");
      }

      // Subir imagen a Storage
      const timestamp = Date.now();
      const fileName = `${supplierId}/cuotas/${timestamp}_comprobante_cuota.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, imageFiles[0], {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      // Llamar edge function para extraer monto
      const { data: extractionData, error: extractionError } = await supabase.functions.invoke(
        'extract-payment-proof-info',
        {
          body: { 
            installmentId,
            filePath: fileName,
            expectedAmount
          }
        }
      );

      if (extractionError) {
        console.error('Error extrayendo información:', extractionError);
        throw extractionError;
      }

      return extractionData;
    },
    onSuccess: (data) => {
      if (data?.amountMismatch) {
        toast.warning(
          `⚠️ El monto del comprobante ($${data.extractedAmount?.toLocaleString('es-MX')}) no coincide con el esperado ($${expectedAmount.toLocaleString('es-MX')}). El comprobante se guardó de todas formas.`,
          { duration: 8000 }
        );
      } else {
        toast.success("Comprobante de cuota subido exitosamente");
      }
      
      queryClient.invalidateQueries({ queryKey: ["payment-installments"] });
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
      setOpen(false);
      setFile(null);
    },
    onError: (error: any) => {
      console.error('Error al subir comprobante:', error);
      toast.error(error.message || "Error al subir comprobante");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.match(/^(image\/(jpeg|jpg|png|webp)|application\/pdf)$/)) {
        toast.error("Solo se permiten archivos de imagen (JPG, PNG, WEBP) o PDF");
        return;
      }
      
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.error("El archivo no puede superar 10MB");
        return;
      }
      
      setFile(selectedFile);
    }
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
          size="sm"
          className="h-6 text-xs"
        >
          {hasProof ? (
            <>
              <Eye className="h-3 w-3 mr-1" />
              Ver
            </>
          ) : (
            <>
              <Upload className="h-3 w-3 mr-1" />
              Subir
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        {hasProof ? (
          <>
            <DialogHeader>
              <DialogTitle>Comprobante de Cuota</DialogTitle>
              <DialogDescription>
                Comprobante subido exitosamente
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4">
              {loadingImage ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : signedUrl ? (
                <img 
                  src={signedUrl} 
                  alt="Comprobante de cuota" 
                  className="w-full h-auto rounded-lg border"
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Error cargando imagen
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Subir Comprobante de Cuota</DialogTitle>
              <DialogDescription>
                Monto esperado: ${expectedAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-amber-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <p className="text-sm">
                El sistema verificará que el monto del comprobante coincida con ${expectedAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
            </div>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="file">Archivo</Label>
                <Input
                  id="file"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  disabled={uploadMutation.isPending}
                />
                {file && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span>{file.name}</span>
                  </div>
                )}
              </div>

              <Button 
                onClick={handleUpload} 
                disabled={!file || uploadMutation.isPending}
                className="w-full"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Subir y Verificar
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}