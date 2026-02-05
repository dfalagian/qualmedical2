import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, ChevronLeft, ChevronRight, Download, Loader2, FileText } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { getSignedUrls } from "@/lib/storage";
import { toast } from "sonner";
import { PdfInlineViewer } from "@/components/pdf/PdfInlineViewer";

interface ImageViewerProps {
  fileUrl?: string;
  imageUrls?: string[];
  fileName: string;
  triggerText?: string;
  triggerSize?: "sm" | "default" | "lg" | "icon";
  triggerVariant?: "default" | "outline" | "ghost" | "destructive";
  bucket?: string;
  showDownload?: boolean;
}

export const ImageViewer = ({ 
  fileUrl,
  imageUrls,
  fileName, 
  triggerText = "Ver",
  triggerSize = "sm",
  triggerVariant = "outline",
  bucket = "documents",
  showDownload = true
}: ImageViewerProps) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [signedUrls, setSignedUrls] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null);
  
  // Detectar si es un PDF sin imágenes convertidas
  const isPdfWithoutImages = useMemo(() => {
    const hasNoImages = !imageUrls || imageUrls.length === 0;
    const isPdf = fileUrl?.toLowerCase().includes('.pdf') || fileName?.toLowerCase().endsWith('.pdf');
    return hasNoImages && isPdf && fileUrl;
  }, [imageUrls, fileUrl, fileName]);

  const rawPaths = useMemo(() => {
    // Si es PDF sin imágenes, no intentamos cargar el PDF como imagen
    if (isPdfWithoutImages) {
      return [];
    }
    return imageUrls && imageUrls.length > 0 ? imageUrls : [];
  }, [fileUrl, imageUrls]);

  useEffect(() => {
    const loadSignedUrls = async () => {
      setIsLoading(true);
      
      // Si es PDF sin imágenes, cargar URL firmada del PDF
      if (isPdfWithoutImages && fileUrl) {
        try {
          const path = fileUrl.startsWith('http') 
            ? fileUrl.split(`/${bucket}/`)[1] 
            : fileUrl;
          
          if (path) {
            const urls = await getSignedUrls(bucket, [path], 3600);
            if (urls[0]) {
              setPdfSignedUrl(urls[0]);
            }
          }
        } catch (error) {
          console.error('Error loading PDF signed URL:', error);
        }
        setIsLoading(false);
        return;
      }

      console.log('ImageViewer - rawPaths:', rawPaths);
      console.log('ImageViewer - bucket:', bucket);
      
      const paths = rawPaths.map(url => {
        // Si ya es una URL completa, extraer el path
        if (url.startsWith('http')) {
          const urlObj = new URL(url);
          const pathname = urlObj.pathname;
          console.log('ImageViewer - pathname:', pathname);
          
          // Extraer la ruta después de /object/public/{bucket}/ o /object/sign/{bucket}/
          const objectPattern = /\/object\/(public|sign)\/([^/]+)\/(.+)$/;
          const match = pathname.match(objectPattern);
          
          if (match) {
            const extractedPath = match[3];
            console.log('ImageViewer - extracted path:', extractedPath);
            return extractedPath;
          }
          
          // Fallback: buscar solo el bucket
          const bucketPattern = new RegExp(`\\/${bucket}\\/(.+)$`);
          const bucketMatch = pathname.match(bucketPattern);
          if (bucketMatch) {
            console.log('ImageViewer - bucket match path:', bucketMatch[1]);
            return bucketMatch[1];
          }
          
          console.warn('ImageViewer - No se pudo extraer path de:', url);
          return url;
        }
        
        // Ya es un path relativo
        return url.includes(`/${bucket}/`) 
          ? url.split(`/${bucket}/`)[1] 
          : url;
      });

      console.log('ImageViewer - processed paths:', paths);
      const urls = await getSignedUrls(bucket, paths, 3600); // 1 hora de expiración
      console.log('ImageViewer - signed URLs:', urls);
      setSignedUrls(urls.filter((url): url is string => url !== null));
      setIsLoading(false);
    };

    if (rawPaths.length > 0) {
      loadSignedUrls();
    } else if (isPdfWithoutImages) {
      loadSignedUrls();
    } else {
      setIsLoading(false);
    }
  }, [rawPaths, bucket, isPdfWithoutImages, fileUrl]);

  const totalPages = signedUrls.length;
  const hasMultiplePages = totalPages > 1;

  const goToNextPage = () => {
    setCurrentPage((prev) => (prev + 1) % totalPages);
  };

  const goToPreviousPage = () => {
    setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
  };

  const downloadCurrentImage = async () => {
    if (signedUrls.length === 0) return;
    
    setIsDownloading(true);
    try {
      const response = await fetch(signedUrls[currentPage]);
      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Generar nombre de archivo
      const extension = signedUrls[currentPage].includes('.png') ? 'png' : 'jpg';
      const downloadName = hasMultiplePages 
        ? `${fileName.replace(/\.[^/.]+$/, '')}_pagina_${currentPage + 1}.${extension}`
        : `${fileName.replace(/\.[^/.]+$/, '')}.${extension}`;
      
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success(`Imagen descargada: ${downloadName}`);
    } catch (error) {
      console.error('Error downloading image:', error);
      toast.error('Error al descargar la imagen');
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadAllImages = async () => {
    if (signedUrls.length === 0) return;
    
    setIsDownloading(true);
    try {
      for (let i = 0; i < signedUrls.length; i++) {
        const response = await fetch(signedUrls[i]);
        const blob = await response.blob();
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const extension = signedUrls[i].includes('.png') ? 'png' : 'jpg';
        const downloadName = `${fileName.replace(/\.[^/.]+$/, '')}_pagina_${i + 1}.${extension}`;
        
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        // Pequeña pausa entre descargas para evitar problemas
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      toast.success(`${signedUrls.length} imágenes descargadas`);
    } catch (error) {
      console.error('Error downloading images:', error);
      toast.error('Error al descargar las imágenes');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className={triggerSize === "icon" ? "h-8 w-8" : ""}>
          <Eye className={triggerSize === "icon" ? "h-3.5 w-3.5" : "h-4 w-4 mr-1"} />
          {triggerSize !== "icon" && triggerText}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>
              {fileName}
              {hasMultiplePages && ` - Página ${currentPage + 1} de ${totalPages}`}
            </DialogTitle>
            {showDownload && signedUrls.length > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadCurrentImage}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-1" />
                  )}
                  Descargar
                </Button>
                {hasMultiplePages && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={downloadAllImages}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-1" />
                    )}
                    Descargar Todo ({totalPages})
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>
        <div className="relative overflow-auto max-h-[calc(90vh-100px)]">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : isPdfWithoutImages && pdfSignedUrl ? (
            <PdfInlineViewer url={pdfSignedUrl} />
          ) : signedUrls.length > 0 ? (
            <img 
              src={signedUrls[currentPage]} 
              alt={`${fileName} - Página ${currentPage + 1}`}
              className="w-full h-auto rounded-lg"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <FileText className="h-16 w-16 text-muted-foreground" />
              <p className="text-muted-foreground">No hay vista previa disponible</p>
              {pdfSignedUrl && (
                <Button asChild variant="outline">
                  <a href={pdfSignedUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-2" />
                    Descargar PDF
                  </a>
                </Button>
              )}
            </div>
          )}
          
          {hasMultiplePages && (
            <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-4 pointer-events-none">
              <Button
                variant="secondary"
                size="icon"
                onClick={goToPreviousPage}
                className="pointer-events-auto"
                disabled={totalPages <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={goToNextPage}
                className="pointer-events-auto"
                disabled={totalPages <= 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        
        {hasMultiplePages && (
          <div className="flex justify-center gap-2 mt-2">
            {signedUrls.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentPage(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentPage ? 'bg-primary' : 'bg-muted'
                }`}
                aria-label={`Ir a página ${index + 1}`}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};