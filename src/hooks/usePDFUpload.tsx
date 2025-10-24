import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { convertPDFToImages } from '@/lib/pdfToImages';
import { toast } from 'sonner';

export interface UploadProgress {
  status: 'idle' | 'converting' | 'uploading' | 'complete' | 'error';
  currentPage?: number;
  totalPages?: number;
  message?: string;
}

export function usePDFUpload() {
  const [progress, setProgress] = useState<UploadProgress>({ status: 'idle' });

  const uploadPDFAsImages = async (
    file: File,
    documentId: string,
    basePath: string
  ): Promise<string[]> => {
    try {
      // Check if file is PDF
      if (!file.type.includes('pdf')) {
        throw new Error('El archivo debe ser un PDF');
      }

      setProgress({ status: 'converting', message: 'Convirtiendo PDF a imágenes...' });
      
      // Convert PDF to images
      const { images, totalPages } = await convertPDFToImages(file);
      
      setProgress({
        status: 'uploading',
        totalPages,
        currentPage: 0,
        message: `Subiendo ${totalPages} páginas...`,
      });

      const imageUrls: string[] = [];

      // Upload each image
      for (let i = 0; i < images.length; i++) {
        const imagePath = `${basePath}_page_${i + 1}.png`;
        
        setProgress({
          status: 'uploading',
          currentPage: i + 1,
          totalPages,
          message: `Subiendo página ${i + 1} de ${totalPages}...`,
        });

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(imagePath, images[i], {
            contentType: 'image/png',
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Error subiendo página ${i + 1}: ${uploadError.message}`);
        }

        imageUrls.push(imagePath);
      }

      // Update document with image URLs
      const { error: updateError } = await supabase
        .from('documents')
        .update({ image_urls: imageUrls })
        .eq('id', documentId);

      if (updateError) {
        throw new Error(`Error actualizando documento: ${updateError.message}`);
      }

      setProgress({
        status: 'complete',
        message: `${totalPages} páginas subidas exitosamente`,
      });

      return imageUrls;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setProgress({
        status: 'error',
        message: errorMessage,
      });
      toast.error(errorMessage);
      throw error;
    }
  };

  return {
    progress,
    uploadPDFAsImages,
    resetProgress: () => setProgress({ status: 'idle' }),
  };
}