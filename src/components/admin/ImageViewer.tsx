import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { getSignedUrls } from "@/lib/storage";

interface ImageViewerProps {
  fileUrl?: string;
  imageUrls?: string[];
  fileName: string;
  triggerText?: string;
  triggerSize?: "sm" | "default" | "lg" | "icon";
  triggerVariant?: "default" | "outline" | "ghost" | "destructive";
  bucket?: string;
}

export const ImageViewer = ({ 
  fileUrl,
  imageUrls,
  fileName, 
  triggerText = "Ver",
  triggerSize = "sm",
  triggerVariant = "outline",
  bucket = "documents"
}: ImageViewerProps) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [signedUrls, setSignedUrls] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const rawPaths = useMemo(() => {
    return imageUrls && imageUrls.length > 0 ? imageUrls : fileUrl ? [fileUrl] : [];
  }, [fileUrl, imageUrls]);

  useEffect(() => {
    const loadSignedUrls = async () => {
      setIsLoading(true);
      
      const paths = rawPaths.map(url => {
        // Si ya es una URL completa, extraer el path
        if (url.startsWith('http')) {
          const bucketPattern = new RegExp(`\\/${bucket}\\/(.+)$`);
          const match = url.match(bucketPattern);
          return match ? match[1] : url;
        }
        
        // Ya es un path relativo
        return url.includes(`/${bucket}/`) 
          ? url.split(`/${bucket}/`)[1] 
          : url;
      });

      const urls = await getSignedUrls(bucket, paths, 3600); // 1 hora de expiración
      setSignedUrls(urls.filter((url): url is string => url !== null));
      setIsLoading(false);
    };

    if (rawPaths.length > 0) {
      loadSignedUrls();
    }
  }, [rawPaths, bucket]);

  const totalPages = signedUrls.length;
  const hasMultiplePages = totalPages > 1;

  const goToNextPage = () => {
    setCurrentPage((prev) => (prev + 1) % totalPages);
  };

  const goToPreviousPage = () => {
    setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          <Eye className="h-4 w-4 mr-1" />
          {triggerText}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {fileName}
            {hasMultiplePages && ` - Página ${currentPage + 1} de ${totalPages}`}
          </DialogTitle>
        </DialogHeader>
        <div className="relative overflow-auto max-h-[calc(90vh-100px)]">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Cargando imagen...</p>
            </div>
          ) : signedUrls.length > 0 ? (
            <img 
              src={signedUrls[currentPage]} 
              alt={`${fileName} - Página ${currentPage + 1}`}
              className="w-full h-auto rounded-lg"
            />
          ) : (
            <div className="flex items-center justify-center h-64">
              <p className="text-destructive">Error al cargar imagen</p>
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
                  index === currentPage ? 'bg-primary' : 'bg-gray-300'
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
