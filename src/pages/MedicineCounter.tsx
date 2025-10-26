import { useState, useRef } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Camera, Loader2, X, Save, History } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const MedicineCounter = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<{ count: number | null; analysis: string } | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Fetch suppliers (proveedores)
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name")
        .order("full_name");
      
      if (error) throw error;
      
      // Filter out admins
      const { data: nonAdmins } = await supabase
        .from("user_roles")
        .select("user_id")
        .neq("role", "admin");
      
      const nonAdminIds = nonAdmins?.map(r => r.user_id) || [];
      return data?.filter(p => nonAdminIds.includes(p.id)) || [];
    },
  });

  // Fetch medicine count history
  const { data: countHistory } = useQuery({
    queryKey: ["medicine_counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicine_counts")
        .select(`
          *,
          supplier:profiles!medicine_counts_supplier_id_fkey(full_name, company_name)
        `)
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!result || !preview || !selectedSupplier) {
        throw new Error("Faltan datos requeridos");
      }

      // Upload image to storage
      const fileName = `${selectedSupplier}_${Date.now()}.jpg`;
      const base64Data = preview.split(',')[1];
      const blob = await fetch(preview).then(r => r.blob());
      
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(`medicine-counts/${fileName}`, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("documents")
        .getPublicUrl(`medicine-counts/${fileName}`);

      // Save record
      const { error: insertError } = await supabase
        .from("medicine_counts")
        .insert({
          supplier_id: selectedSupplier,
          count: result.count || 0,
          analysis: result.analysis,
          image_url: publicUrl,
          notes: notes || null,
          created_by: (await supabase.auth.getUser()).data.user?.id
        });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast({
        title: "Registro guardado",
        description: "El conteo se guardó correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["medicine_counts"] });
      
      // Reset form
      setPreview(null);
      setResult(null);
      setSelectedSupplier("");
      setNotes("");
      setSelectedFile(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar el registro",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Error",
          description: "Por favor selecciona una imagen válida",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      setResult(null);

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!preview) return;

    setIsAnalyzing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('count-medicine-boxes', {
        body: { imageBase64: preview }
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      setResult({
        count: data.count,
        analysis: data.analysis
      });

      toast({
        title: "Análisis completado",
        description: data.count 
          ? `Se detectaron ${data.count} cajas de medicamentos`
          : "Análisis realizado con éxito",
      });
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "No se pudo analizar la imagen. Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const openCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      
      setStream(mediaStream);
      setShowCamera(true);
      
      // Wait for video element to be available
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
      
      const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
      setSelectedFile(file);
      setResult(null);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      closeCamera();
      
      toast({
        title: "Foto capturada",
        description: "Ahora puedes analizar la imagen",
      });
    }, 'image/jpeg', 0.95);
  };

  return (
    <DashboardLayout>
      <div className="w-full py-4 px-2 sm:py-8 sm:px-4 max-w-4xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Contador de Cajas de Medicamentos</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Toma una foto o sube una imagen para contar automáticamente las cajas
          </p>
        </div>

        <div className="grid gap-4 sm:gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Camera className="h-5 w-5" />
                Cargar Imagen
              </CardTitle>
              <CardDescription className="text-sm">
                Selecciona una opción para comenzar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="supplier-select">Proveedor</Label>
                  <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                    <SelectTrigger id="supplier-select">
                      <SelectValue placeholder="Selecciona un proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers?.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.company_name || supplier.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  onClick={openCamera}
                  disabled={isAnalyzing || (isAdmin && !selectedSupplier)}
                  variant="outline"
                  className="w-full h-20 sm:h-24 flex flex-col items-center justify-center gap-2"
                >
                  <Camera className="h-6 w-6 sm:h-8 sm:w-8" />
                  <span className="text-sm sm:text-base">Tomar Foto</span>
                </Button>
                
                <Label
                  htmlFor="image-upload"
                  className="cursor-pointer"
                >
                  <div className="w-full h-20 sm:h-24 flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md hover:bg-accent transition-colors">
                    <Upload className="h-6 w-6 sm:h-8 sm:w-8" />
                    <span className="text-sm sm:text-base">Subir Imagen</span>
                  </div>
                  <Input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    disabled={isAnalyzing || (isAdmin && !selectedSupplier)}
                    className="hidden"
                  />
                </Label>
              </div>

              {preview && (
                <div className="space-y-4">
                  <div className="relative rounded-lg overflow-hidden border bg-muted">
                    <img
                      src={preview}
                      alt="Vista previa"
                      className="w-full h-auto max-h-[300px] sm:max-h-96 object-contain"
                    />
                  </div>

                  <Button
                    onClick={analyzeImage}
                    disabled={isAnalyzing}
                    className="w-full"
                    size="lg"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analizando imagen...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Analizar Imagen
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl">Resultados del Análisis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.count !== null && (
                  <div className="p-4 sm:p-6 rounded-lg bg-primary/10 border-2 border-primary">
                    <div className="text-center">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-2">Total de Cajas Detectadas</p>
                      <p className="text-4xl sm:text-5xl font-bold text-primary">{result.count}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm sm:text-base">Análisis Detallado</Label>
                  <div className="p-3 sm:p-4 rounded-lg bg-muted whitespace-pre-wrap text-xs sm:text-sm">
                    {result.analysis}
                  </div>
                </div>

                {isAdmin && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notas Adicionales (Opcional)</Label>
                      <Textarea
                        id="notes"
                        placeholder="Agrega cualquier observación adicional..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <Button
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending || !selectedSupplier}
                      className="w-full"
                      size="lg"
                    >
                      {saveMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Guardar Registro
                        </>
                      )}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {isAdmin && countHistory && countHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  <History className="h-5 w-5" />
                  Historial de Conteos
                </CardTitle>
                <CardDescription>Últimos 10 registros</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {countHistory.map((record: any) => (
                    <div
                      key={record.id}
                      className="flex items-start justify-between p-3 sm:p-4 border rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm sm:text-base">
                            {record.supplier?.company_name || record.supplier?.full_name}
                          </span>
                          <span className="text-xs sm:text-sm text-muted-foreground">
                            {new Date(record.created_at).toLocaleDateString('es-MX', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Cajas contadas: <span className="font-semibold text-primary">{record.count}</span>
                        </p>
                        {record.notes && (
                          <p className="text-xs text-muted-foreground italic">{record.notes}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(record.image_url, '_blank')}
                      >
                        Ver imagen
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Dialog open={showCamera} onOpenChange={(open) => !open && closeCamera()}>
          <DialogContent className="max-w-[95vw] sm:max-w-3xl p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between text-base sm:text-lg">
                <span>Capturar Foto</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeCamera}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <Button
                onClick={capturePhoto}
                className="w-full"
                size="lg"
              >
                <Camera className="mr-2 h-4 w-4" />
                Capturar Foto
              </Button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default MedicineCounter;
