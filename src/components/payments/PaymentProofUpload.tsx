import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, FileText, CheckCircle, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { convertPDFToImages } from "@/lib/pdfToImages";
import { getSignedUrl } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";

interface PaymentProofUploadProps {
  pagoId: string;
  supplierId: string;
  hasProof: boolean;
  proofUrl?: string | null;
}

export function PaymentProofUpload({ pagoId, supplierId, hasProof, proofUrl }: PaymentProofUploadProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  // Obtener URL firmada cuando se abre el diálogo y ya hay comprobante
  useEffect(() => {
    if (open && hasProof && proofUrl) {
      setLoadingImage(true);
      // Extraer el path del archivo de la URL
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
      // 1. Convertir PDF a imágenes o usar la imagen directamente
      let imageFiles: Blob[] = [];
      
      if (selectedFile.type === 'application/pdf') {
        const { images } = await convertPDFToImages(selectedFile, 1); // Solo primera página
        imageFiles = images;
      } else {
        imageFiles = [selectedFile];
      }

      if (imageFiles.length === 0) {
        throw new Error("No se pudo procesar el archivo");
      }

      // 2. Subir imagen a Storage
      const timestamp = Date.now();
      const fileName = `${supplierId}/${timestamp}_comprobante_pago.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, imageFiles[0], {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 3. Llamar edge function para extraer fecha de pago
      // Enviamos el path del archivo en lugar de la URL pública
      const { data: extractionData, error: extractionError } = await supabase.functions.invoke(
        'extract-payment-proof-info',
        {
          body: { 
            pagoId,
            filePath: fileName 
          }
        }
      );

      if (extractionError) {
        console.error('Error extrayendo información:', extractionError);
        throw extractionError;
      }

      return extractionData;
    },
    onSuccess: () => {
      toast.success("Comprobante de pago subido exitosamente");
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
      setOpen(false);
      setFile(null);
    },
    onError: (error: any) => {
      console.error('Error al subir comprobante:', error);
      toast.error(error.message || "Error al subir comprobante de pago");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validar tipo de archivo
      if (!selectedFile.type.match(/^(image\/(jpeg|jpg|png|webp)|application\/pdf)$/)) {
        toast.error("Solo se permiten archivos de imagen (JPG, PNG, WEBP) o PDF");
        return;
      }
      
      // Validar tamaño (máximo 10MB)
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
          className={hasProof ? "text-green-600 border-green-600" : ""}
        >
          {hasProof ? (
            <>
              <Eye className="h-4 w-4 mr-2" />
              Ver Comprobante
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Subir Comprobante
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        {hasProof ? (
          // Vista de comprobante existente
          <>
            <DialogHeader>
              <DialogTitle>Comprobante de Pago</DialogTitle>
              <DialogDescription>
                Comprobante subido exitosamente
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4">
              {loadingImage ? (
                <div className="flex items-center justify-center h-96">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : signedUrl ? (
                <div className="relative w-full">
                  <img 
                    src={signedUrl} 
                    alt="Comprobante de pago" 
                    className="w-full h-auto rounded-lg border"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-96 text-muted-foreground">
                  Error cargando imagen
                </div>
              )}
            </div>
          </>
        ) : isAdmin ? (
          // Vista de subida de nuevo comprobante (solo para admins)
          <>
            <DialogHeader>
              <DialogTitle>Subir Comprobante de Pago</DialogTitle>
              <DialogDescription>
                Selecciona el comprobante de pago en formato imagen (JPG, PNG, WEBP) o PDF.
                La fecha de pago se extraerá automáticamente.
              </DialogDescription>
            </DialogHeader>
            
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
                    Subir y Procesar
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          // Vista para proveedores cuando no hay comprobante
          <>
            <DialogHeader>
              <DialogTitle>Comprobante de Pago</DialogTitle>
              <DialogDescription>
                Aún no se ha subido un comprobante de pago para esta transacción
              </DialogDescription>
            </DialogHeader>
            <div className="py-8 text-center text-muted-foreground">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>El comprobante de pago será subido por el administrador</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
