import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";

interface ImageViewerProps {
  fileUrl: string;
  fileName: string;
  triggerText?: string;
  triggerSize?: "sm" | "default" | "lg" | "icon";
  triggerVariant?: "default" | "outline" | "ghost" | "destructive";
}

export const ImageViewer = ({ 
  fileUrl, 
  fileName, 
  triggerText = "Ver",
  triggerSize = "sm",
  triggerVariant = "outline"
}: ImageViewerProps) => {
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
          <DialogTitle>{fileName}</DialogTitle>
        </DialogHeader>
        <div className="overflow-auto max-h-[calc(90vh-100px)]">
          <img 
            src={fileUrl} 
            alt={fileName}
            className="w-full h-auto rounded-lg"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
