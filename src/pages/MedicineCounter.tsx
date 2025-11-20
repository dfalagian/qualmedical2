import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Camera, Loader2, X, Save, History, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageViewer } from "@/components/admin/ImageViewer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

const MedicineCounter = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [deliveryDocFile, setDeliveryDocFile] = useState<File | null>(null);
  const [deliveryDocPreview, setDeliveryDocPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<{ 
    count: number | null; 
    analysis: string;
    confidence?: string;
    imageQuality?: string;
    warnings?: string[];
  } | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showDeliveryCamera, setShowDeliveryCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState<string>("");
  const [expectedQuantity, setExpectedQuantity] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const deliveryVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const deliveryCanvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const { isAdmin, isContador } = useAuth();
  const queryClient = useQueryClient();
  
  const canManageRecords = isAdmin || isContador;

  // Optimizar para móvil si el usuario es contador
  useEffect(() => {
    if (isContador) {
      // Forzar viewport móvil optimizado
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      }
      
      // Agregar clase para estilos móviles
      document.body.classList.add('contador-mobile-mode');
    }
    
    return () => {
      if (isContador) {
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
          viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
        }
        document.body.classList.remove('contador-mobile-mode');
      }
    };
  }, [isContador]);

  // Fetch suppliers (proveedores)
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    enabled: canManageRecords,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name")
        .order("full_name");
      
      if (error) throw error;
      
      // Filter out admins and contadores
      const { data: suppliers } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "proveedor");
      
      const supplierIds = suppliers?.map(r => r.user_id) || [];
      return data?.filter(p => supplierIds.includes(p.id)) || [];
    },
  });

  // Fetch medicine count history
  const { data: allCountHistory } = useQuery({
    queryKey: ["medicine_counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicine_counts")
        .select(`
          *,
          supplier:profiles(full_name, company_name)
        `)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Filter history on client side
  const countHistory = allCountHistory?.filter((record: any) => {
    if (!supplierFilter) return true;
    const searchLower = supplierFilter.toLowerCase();
    const companyName = record.supplier?.company_name?.toLowerCase() || "";
    const fullName = record.supplier?.full_name?.toLowerCase() || "";
    return companyName.includes(searchLower) || fullName.includes(searchLower);
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!result || !preview || !selectedSupplier) {
        throw new Error("Faltan datos requeridos");
      }

      // Verify session is active and refresh if needed
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error("Tu sesión ha expirado. Por favor, vuelve a iniciar sesión.");
      }

      // Verify user is authenticated and is admin
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error("No se pudo verificar tu identidad. Intenta cerrar sesión y volver a entrar.");
      }

      // Double check role status from database
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleError) {
        console.error("Role check error:", roleError);
        throw new Error("Error al verificar permisos: " + roleError.message);
      }

      if (!roleData || (roleData.role !== 'admin' && roleData.role !== 'contador')) {
        throw new Error("No tienes permisos para guardar registros");
      }

      // Upload medicine count image to storage
      const fileName = `${selectedSupplier}_${Date.now()}.jpg`;
      const blob = await fetch(preview).then(r => r.blob());
      
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(`medicine-counts/${fileName}`, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("documents")
        .getPublicUrl(`medicine-counts/${fileName}`);

      // Upload delivery document if provided
      let deliveryDocUrl = null;
      if (deliveryDocPreview) {
        const deliveryFileName = `${selectedSupplier}_delivery_${Date.now()}.jpg`;
        const deliveryBlob = await fetch(deliveryDocPreview).then(r => r.blob());
        
        const { error: deliveryUploadError } = await supabase.storage
          .from("documents")
          .upload(`medicine-counts/${deliveryFileName}`, deliveryBlob);

        if (deliveryUploadError) throw deliveryUploadError;

        const { data: { publicUrl: deliveryPublicUrl } } = supabase.storage
          .from("documents")
          .getPublicUrl(`medicine-counts/${deliveryFileName}`);
        
        deliveryDocUrl = deliveryPublicUrl;
      }

      // Calculate if it's a partial delivery
      const countValue = result.count || 0;
      const expectedValue = expectedQuantity ? parseInt(expectedQuantity) : null;
      const isPartialDelivery = expectedValue ? countValue < expectedValue : false;

      // Save record
      const { error: insertError } = await supabase
        .from("medicine_counts")
        .insert({
          supplier_id: selectedSupplier,
          count: countValue,
          analysis: result.analysis,
          image_url: publicUrl,
          delivery_document_url: deliveryDocUrl,
          purchase_order_number: purchaseOrderNumber || null,
          expected_quantity: expectedValue,
          is_partial_delivery: isPartialDelivery,
          notes: notes || null,
          created_by: user.id
        });

      if (insertError) {
        console.error("Insert error:", insertError);
        throw new Error(`Error al guardar: ${insertError.message}`);
      }
    },
    onSuccess: () => {
      toast({
        title: "Registro guardado",
        description: "El conteo se guardó correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["medicine_counts"] });
      
      // Reset form
      setPreview(null);
      setDeliveryDocPreview(null);
      setResult(null);
      setSelectedSupplier("");
      setPurchaseOrderNumber("");
      setExpectedQuantity("");
      setNotes("");
      setSelectedFile(null);
      setDeliveryDocFile(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar el registro",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase
        .from("medicine_counts")
        .delete()
        .eq("id", recordId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Registro eliminado",
        description: "El conteo se eliminó correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["medicine_counts"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el registro",
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

  const handleDeliveryDocSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

      setDeliveryDocFile(file);

      const reader = new FileReader();
      reader.onloadend = () => {
        setDeliveryDocPreview(reader.result as string);
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
        analysis: data.analysis,
        confidence: data.confidence,
        imageQuality: data.imageQuality,
        warnings: data.warnings
      });

      // Show warnings if any
      if (data.warnings && data.warnings.length > 0) {
        data.warnings.forEach((warning: string) => {
          toast({
            title: "Advertencia",
            description: warning,
            variant: "default",
          });
        });
      }

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

  const openDeliveryCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      
      setStream(mediaStream);
      setShowDeliveryCamera(true);
      
      // Wait for video element to be available
      setTimeout(() => {
        if (deliveryVideoRef.current) {
          deliveryVideoRef.current.srcObject = mediaStream;
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

  const closeDeliveryCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowDeliveryCamera(false);
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

  const captureDeliveryDoc = () => {
    if (!deliveryVideoRef.current || !deliveryCanvasRef.current) return;

    const video = deliveryVideoRef.current;
    const canvas = deliveryCanvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      if (!blob) return;
      
      const file = new File([blob], 'delivery-document.jpg', { type: 'image/jpeg' });
      setDeliveryDocFile(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setDeliveryDocPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      closeDeliveryCamera();
      
      toast({
        title: "Documento capturado",
        description: "Documento de entrega guardado",
      });
    }, 'image/jpeg', 0.95);
  };

  return (
    <DashboardLayout>
      <div className={`w-full py-4 px-3 max-w-4xl mx-auto ${isContador ? 'sm:py-4 sm:px-3' : 'sm:py-8 sm:px-4'}`}>
        <div className={`mb-4 ${isContador ? 'sm:mb-4' : 'sm:mb-8'}`}>
          <h1 className={`font-bold mb-2 ${isContador ? 'text-2xl' : 'text-2xl sm:text-3xl'}`}>
            Contador de Cajas de Medicamentos
          </h1>
          <p className={`text-muted-foreground ${isContador ? 'text-sm' : 'text-sm sm:text-base'}`}>
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
              {canManageRecords && (
                <>
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

                  <div className="space-y-2">
                    <Label htmlFor="purchase-order">No. Orden de Compra</Label>
                    <Input
                      id="purchase-order"
                      type="text"
                      placeholder="Ej: OC_CITIO_25_05 o CPED25-24"
                      value={purchaseOrderNumber}
                      onChange={(e) => setPurchaseOrderNumber(e.target.value.toUpperCase())}
                      className={isContador ? 'text-base h-12' : ''}
                    />
                    <p className="text-xs text-muted-foreground">
                      Formato alfanumérico (ej: OC_CITIO_25_05, CPED25-24)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expected-quantity">Cantidad Esperada (Cajas)</Label>
                    <Input
                      id="expected-quantity"
                      type="number"
                      min="1"
                      placeholder="Ej: 20"
                      value={expectedQuantity}
                      onChange={(e) => setExpectedQuantity(e.target.value)}
                      className={isContador ? 'text-base h-12' : ''}
                    />
                    <p className="text-xs text-muted-foreground">
                      Número de cajas que debe entregar según la orden de compra
                    </p>
                  </div>
                </>
              )}

              <div className={`grid gap-3 ${isContador ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                <Button
                  onClick={openCamera}
                  disabled={isAnalyzing || (canManageRecords && !selectedSupplier)}
                  variant="outline"
                  className={`w-full flex flex-col items-center justify-center gap-2 ${
                    isContador ? 'h-28 text-lg' : 'h-20 sm:h-24'
                  }`}
                >
                  <Camera className={isContador ? 'h-10 w-10' : 'h-6 w-6 sm:h-8 sm:w-8'} />
                  <span className={isContador ? 'text-base font-semibold' : 'text-sm sm:text-base'}>
                    Tomar Foto
                  </span>
                </Button>
                
                <Label
                  htmlFor="image-upload"
                  className="cursor-pointer"
                >
                  <div className={`w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md hover:bg-accent transition-colors ${
                    isContador ? 'h-28' : 'h-20 sm:h-24'
                  }`}>
                    <Upload className={isContador ? 'h-10 w-10' : 'h-6 w-6 sm:h-8 sm:w-8'} />
                    <span className={isContador ? 'text-base font-semibold' : 'text-sm sm:text-base'}>
                      Subir Imagen
                    </span>
                  </div>
                  <Input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    disabled={isAnalyzing || (canManageRecords && !selectedSupplier)}
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
                    <div className="text-center space-y-3">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-2">Total de Cajas Detectadas</p>
                      <p className="text-4xl sm:text-5xl font-bold text-primary">{result.count}</p>
                      
                      {/* Mostrar diferencia si hay cantidad esperada */}
                      {expectedQuantity && parseInt(expectedQuantity) > 0 && (
                        <div className="mt-3 pt-3 border-t border-primary/20">
                          <div className="flex justify-center gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Esperadas</p>
                              <p className="font-semibold">{expectedQuantity}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Entregadas</p>
                              <p className="font-semibold">{result.count}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Pendientes</p>
                              <p className={`font-semibold ${
                                parseInt(expectedQuantity) > result.count ? 'text-yellow-600' : 'text-green-600'
                              }`}>
                                {Math.max(0, parseInt(expectedQuantity) - result.count)}
                              </p>
                            </div>
                          </div>
                          {parseInt(expectedQuantity) > result.count && (
                            <Badge variant="secondary" className="mt-2">
                              ⚠️ Entrega Parcial
                            </Badge>
                          )}
                        </div>
                      )}
                      
                      {/* Badges de calidad y confianza */}
                      <div className="flex justify-center gap-2 flex-wrap mt-3">
                        {result.confidence && (
                          <Badge 
                            variant={
                              result.confidence === 'Alto' ? 'default' : 
                              result.confidence === 'Medio' ? 'secondary' : 
                              'destructive'
                            }
                            className="text-xs"
                          >
                            Confianza: {result.confidence}
                          </Badge>
                        )}
                        {result.imageQuality && (
                          <Badge 
                            variant={
                              result.imageQuality === 'Excelente' || result.imageQuality === 'Buena' ? 'default' : 
                              result.imageQuality === 'Regular' ? 'secondary' : 
                              'outline'
                            }
                            className="text-xs"
                          >
                            Calidad: {result.imageQuality}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Advertencias si existen */}
                {result.warnings && result.warnings.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm sm:text-base text-yellow-600">Advertencias</Label>
                    <div className="p-3 sm:p-4 rounded-lg bg-yellow-50 border border-yellow-200 space-y-1">
                      {result.warnings.map((warning, idx) => (
                        <p key={idx} className="text-xs sm:text-sm text-yellow-800">{warning}</p>
                      ))}
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
                    <div className="space-y-4 border-t pt-4">
                      <Label className="text-base font-semibold">Documento de Entrega</Label>
                      <p className="text-sm text-muted-foreground">
                        Captura la hoja firmada de quien recibe el medicamento
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Button
                          onClick={openDeliveryCamera}
                          variant="outline"
                          className="w-full h-20 flex flex-col items-center justify-center gap-2"
                        >
                          <Camera className="h-6 w-6" />
                          <span className="text-sm">Tomar Foto del Documento</span>
                        </Button>
                        
                        <Label htmlFor="delivery-doc-upload" className="cursor-pointer">
                          <div className="w-full h-20 flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md hover:bg-accent transition-colors">
                            <Upload className="h-6 w-6" />
                            <span className="text-sm">Subir Documento</span>
                          </div>
                          <Input
                            id="delivery-doc-upload"
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleDeliveryDocSelect}
                            className="hidden"
                          />
                        </Label>
                      </div>

                      {deliveryDocPreview && (
                        <div className="relative rounded-lg overflow-hidden border bg-muted">
                          <img
                            src={deliveryDocPreview}
                            alt="Documento de entrega"
                            className="w-full h-auto max-h-[300px] object-contain"
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2"
                            onClick={() => {
                              setDeliveryDocPreview(null);
                              setDeliveryDocFile(null);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

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

          {canManageRecords && countHistory && countHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  <History className="h-5 w-5" />
                  Historial de Conteos
                </CardTitle>
                <CardDescription>Todos los registros guardados</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Input
                    placeholder="Buscar por proveedor..."
                    value={supplierFilter}
                    onChange={(e) => setSupplierFilter(e.target.value)}
                    className="max-w-md"
                  />
                </div>
                <div className="space-y-3">
                  {countHistory.map((record: any) => (
                    <Collapsible key={record.id} className="border rounded-lg">
                      <div className="flex items-start justify-between p-3 sm:p-4">
                        <div className="flex-1 space-y-2">
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
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              Cajas contadas: <span className="font-semibold text-primary">{record.count}</span>
                            </p>
                            {record.expected_quantity && (
                              <>
                                <span className="text-xs text-muted-foreground">
                                  / Esperadas: <span className="font-semibold">{record.expected_quantity}</span>
                                </span>
                                {record.expected_quantity > record.count && (
                                  <span className="text-xs text-yellow-600">
                                    (Pendientes: {record.expected_quantity - record.count})
                                  </span>
                                )}
                              </>
                            )}
                            {record.is_partial_delivery && (
                              <Badge variant="secondary" className="text-xs">
                                ⚠️ Entrega Parcial
                              </Badge>
                            )}
                            {record.purchase_order_number && (
                              <Badge variant="outline" className="text-xs">
                                OC: {record.purchase_order_number}
                              </Badge>
                            )}
                            {record.analysis && (
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                  Ver análisis completo
                                  <ChevronDown className="h-3 w-3 ml-1" />
                                </Button>
                              </CollapsibleTrigger>
                            )}
                          </div>
                          {record.notes && (
                            <p className="text-xs text-muted-foreground italic">{record.notes}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <ImageViewer
                            fileUrl={record.image_url}
                            fileName={'Foto de cajas - ' + (record.supplier?.company_name || record.supplier?.full_name)}
                            triggerText="Ver cajas"
                            triggerSize="sm"
                            triggerVariant="ghost"
                            bucket="documents"
                          />
                          {record.delivery_document_url && (
                            <ImageViewer
                              fileUrl={record.delivery_document_url}
                              fileName={'Documento de entrega - ' + (record.supplier?.company_name || record.supplier?.full_name)}
                              triggerText="Ver documento"
                              triggerSize="sm"
                              triggerVariant="ghost"
                              bucket="documents"
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm('¿Estás seguro de eliminar este registro?')) {
                                deleteMutation.mutate(record.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      
                      {record.analysis && (
                        <CollapsibleContent className="px-3 sm:px-4 pb-3 sm:pb-4">
                          <div className="border-t pt-3 space-y-2">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Análisis Detallado</h4>
                            <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-3 rounded-md">
                              {record.analysis}
                            </pre>
                          </div>
                        </CollapsibleContent>
                      )}
                    </Collapsible>
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
                <span>Capturar Foto de Cajas</span>
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

        <Dialog open={showDeliveryCamera} onOpenChange={(open) => !open && closeDeliveryCamera()}>
          <DialogContent className="max-w-[95vw] sm:max-w-3xl p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between text-base sm:text-lg">
                <span>Capturar Documento de Entrega</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeDeliveryCamera}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                <video
                  ref={deliveryVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <Button
                onClick={captureDeliveryDoc}
                className="w-full"
                size="lg"
              >
                <Camera className="mr-2 h-4 w-4" />
                Capturar Documento
              </Button>
            </div>
            <canvas ref={deliveryCanvasRef} className="hidden" />
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
};

export default MedicineCounter;
