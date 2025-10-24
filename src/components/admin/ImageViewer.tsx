import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";

interface ImageViewerProps {
  fileUrl?: string;
  imageUrls?: string[];
  fileName: string;
  triggerText?: string;
  triggerSize?: "sm" | "default" | "lg" | "icon";
  triggerVariant?: "default" | "outline" | "ghost" | "destructive";
}

export const ImageViewer = ({ 
  fileUrl,
  imageUrls,
  fileName, 
  triggerText = "Ver",
  triggerSize = "sm",
  triggerVariant = "outline"
}: ImageViewerProps) => {
  const [currentPage, setCurrentPage] = useState(0);
  
  const images = useMemo(() => {
    const urls = imageUrls && imageUrls.length > 0 ? imageUrls : fileUrl ? [fileUrl] : [];
    return urls.map(url => {
      if (url.startsWith('http')) {
        return url;
      }
      const { data } = supabase.storage.from('documents').getPublicUrl(url);
      return data.publicUrl;
    });
  }, [fileUrl, imageUrls]);

  const totalPages = images.length;
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
          <img 
            src={images[currentPage]} 
            alt={`${fileName} - Página ${currentPage + 1}`}
            className="w-full h-auto rounded-lg"
          />
          
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
            {images.map((_, index) => (
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
