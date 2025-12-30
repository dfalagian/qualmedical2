import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, X, Check, Package, Calendar, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

export type PhotoPhase = 'brand' | 'lot_expiry' | 'receipt';

export interface PhasePhotos {
  brand: string[]; // hasta 4 fotos de marca
  lot_expiry: string[]; // hasta 4 fotos de lote/caducidad
  receipt: string | null; // 1 foto de acuse de recibo
}

interface MultiPhasePhotoCaptureProps {
  photos: PhasePhotos;
  onPhotosChange: (photos: PhasePhotos) => void;
  disabled?: boolean;
}

const PHASE_CONFIG = {
  brand: {
    title: "Fase 1: Fotos de Marca",
    description: "Toma hasta 4 fotos donde se vea claramente la marca de las cajas",
    icon: Package,
    maxPhotos: 4,
    color: "bg-blue-500",
  },
  lot_expiry: {
    title: "Fase 2: Lote y Caducidad",
    description: "Toma hasta 4 fotos donde se vea el número de lote y fecha de caducidad",
    icon: Calendar,
    maxPhotos: 4,
    color: "bg-green-500",
  },
  receipt: {
    title: "Fase 3: Acuse de Recibo",
    description: "Toma 1 foto del acuse de recibo firmado y sellado (hoja A4)",
    icon: FileText,
    maxPhotos: 1,
    color: "bg-purple-500",
  },
};

export const MultiPhasePhotoCapture = ({
  photos,
  onPhotosChange,
  disabled = false,
}: MultiPhasePhotoCaptureProps) => {
  const [currentPhase, setCurrentPhase] = useState<PhotoPhase>('brand');
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  const getPhotoCount = (phase: PhotoPhase) => {
    if (phase === 'receipt') {
      return photos.receipt ? 1 : 0;
    }
    return photos[phase].length;
  };

  const isPhaseComplete = (phase: PhotoPhase) => {
    const count = getPhotoCount(phase);
    return count >= 1; // Al menos 1 foto para considerar completa
  };

  const getTotalProgress = () => {
    const brandComplete = photos.brand.length > 0 ? 1 : 0;
    const lotComplete = photos.lot_expiry.length > 0 ? 1 : 0;
    const receiptComplete = photos.receipt ? 1 : 0;
    return ((brandComplete + lotComplete + receiptComplete) / 3) * 100;
  };

  const openCamera = async (phase: PhotoPhase) => {
    const config = PHASE_CONFIG[phase];
    const currentCount = getPhotoCount(phase);
    
    if (currentCount >= config.maxPhotos) {
      toast({
        title: "Límite alcanzado",
        description: `Ya tienes el máximo de ${config.maxPhotos} foto(s) para esta fase`,
        variant: "destructive",
      });
      return;
    }

    setCurrentPhase(phase);
    
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      
      setStream(mediaStream);
      setShowCamera(true);
      
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (error) {
      console.error("Error accessing camera:", error);
      toast({
        title: "Error",
        description: "No se pudo acceder a la cámara. Verifica los permisos.",
        variant: "destructive",
      });
    }
  };

  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      if (!blob) return;
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        addPhotoToPhase(currentPhase, base64);
        
        const config = PHASE_CONFIG[currentPhase];
        const newCount = getPhotoCount(currentPhase) + 1;
        
        toast({
          title: "Foto capturada",
          description: `${newCount}/${config.maxPhotos} foto(s) en ${config.title}`,
        });

        // Si es la última foto permitida, cerrar cámara
        if (newCount >= config.maxPhotos) {
          closeCamera();
        }
      };
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.9);
  };

  const addPhotoToPhase = (phase: PhotoPhase, photoBase64: string) => {
    const newPhotos = { ...photos };
    
    if (phase === 'receipt') {
      newPhotos.receipt = photoBase64;
    } else {
      newPhotos[phase] = [...newPhotos[phase], photoBase64];
    }
    
    onPhotosChange(newPhotos);
  };

  const removePhoto = (phase: PhotoPhase, index: number) => {
    const newPhotos = { ...photos };
    
    if (phase === 'receipt') {
      newPhotos.receipt = null;
    } else {
      newPhotos[phase] = newPhotos[phase].filter((_, i) => i !== index);
    }
    
    onPhotosChange(newPhotos);
    
    toast({
      title: "Foto eliminada",
      description: "La foto ha sido removida",
    });
  };

  const handleFileUpload = (phase: PhotoPhase, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Por favor selecciona una imagen válida",
        variant: "destructive",
      });
      return;
    }

    const config = PHASE_CONFIG[phase];
    const currentCount = getPhotoCount(phase);
    
    if (currentCount >= config.maxPhotos) {
      toast({
        title: "Límite alcanzado",
        description: `Ya tienes el máximo de ${config.maxPhotos} foto(s) para esta fase`,
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      addPhotoToPhase(phase, reader.result as string);
      toast({
        title: "Imagen cargada",
        description: `Foto agregada a ${config.title}`,
      });
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  };

  const renderPhaseCard = (phase: PhotoPhase) => {
    const config = PHASE_CONFIG[phase];
    const Icon = config.icon;
    const photoCount = getPhotoCount(phase);
    const isComplete = isPhaseComplete(phase);
    const photoArray = phase === 'receipt' 
      ? (photos.receipt ? [photos.receipt] : [])
      : photos[phase];

    return (
      <Card key={phase} className={`border-2 ${isComplete ? 'border-green-500/50' : 'border-muted'}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${config.color}`}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">{config.title}</CardTitle>
                <CardDescription className="text-xs">
                  {config.description}
                </CardDescription>
              </div>
            </div>
            <Badge variant={isComplete ? "default" : "secondary"}>
              {photoCount}/{config.maxPhotos}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Grid de fotos */}
          {photoArray.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {photoArray.map((photo, index) => (
                <div key={index} className="relative aspect-square rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={photo}
                    alt={`Foto ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(phase, index)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={disabled}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Botones de captura */}
          {photoCount < config.maxPhotos && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openCamera(phase)}
                disabled={disabled}
                className="h-10"
              >
                <Camera className="h-4 w-4 mr-2" />
                Cámara
              </Button>
              <label className={`${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <div className="h-10 flex items-center justify-center gap-2 border rounded-md text-sm font-medium hover:bg-accent transition-colors">
                  <Upload className="h-4 w-4" />
                  Subir
                </div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleFileUpload(phase, e)}
                  disabled={disabled}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {isComplete && photoCount >= config.maxPhotos && (
            <div className="flex items-center justify-center gap-2 text-green-600 text-sm">
              <Check className="h-4 w-4" />
              Fase completa
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Progreso de captura</span>
          <span className="text-muted-foreground">{Math.round(getTotalProgress())}%</span>
        </div>
        <Progress value={getTotalProgress()} className="h-2" />
      </div>

      {/* Phase cards */}
      <div className="space-y-4">
        {(Object.keys(PHASE_CONFIG) as PhotoPhase[]).map(renderPhaseCard)}
      </div>

      {/* Camera Dialog */}
      <Dialog open={showCamera} onOpenChange={(open) => !open && closeCamera()}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>{PHASE_CONFIG[currentPhase].title}</DialogTitle>
          </DialogHeader>
          <div className="relative bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-auto max-h-[60vh] object-contain"
            />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <div className="p-4 flex gap-2">
            <Button
              variant="outline"
              onClick={closeCamera}
              className="flex-1"
            >
              Cerrar
            </Button>
            <Button
              onClick={capturePhoto}
              className="flex-1"
            >
              <Camera className="h-4 w-4 mr-2" />
              Capturar ({getPhotoCount(currentPhase) + 1}/{PHASE_CONFIG[currentPhase].maxPhotos})
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
