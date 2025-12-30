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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageViewer } from "@/components/admin/ImageViewer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const { isAdmin, isContador, isContadorProveedor, parentSupplierId, user } = useAuth();
  const queryClient = useQueryClient();
  const [isSupplierDrawerOpen, setIsSupplierDrawerOpen] = useState(false);
  
  // Contador proveedor o admin/contador interno pueden gestionar
  const canManageRecords = isAdmin || isContador || isContadorProveedor;
  
  // Debug log para verificar roles
  console.log('MedicineCounter - Roles:', { isAdmin, isContador, canManageRecords });


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

      if (!roleData || (roleData.role !== 'admin' && roleData.role !== 'contador' && roleData.role !== 'contador_proveedor')) {
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

  const selectedSupplierName = suppliers?.find(s => s.id === selectedSupplier)?.company_name 
    || suppliers?.find(s => s.id === selectedSupplier)?.full_name 
    || "Selecciona un proveedor";

  return (
    <DashboardLayout>
      <div className="w-full h-full overflow-x-hidden">
        {/* Mobile: Stack vertical sin gaps, Desktop: Grid con gaps */}
        <div className="flex flex-col md:max-w-4xl md:mx-auto md:py-6 md:px-4 lg:px-6 md:gap-6">
          
          {/* Header - Solo visible en desktop, en móvil está integrado en cada sección */}
          <div className="hidden md:block mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold mb-2">
              Contador de Cajas de Medicamentos
            </h1>
            <p className="text-base text-muted-foreground">
              Toma una foto o sube una imagen para contar automáticamente las cajas
            </p>
          </div>
          {/* Card principal - Sin bordes en móvil, con card en desktop */}
          <div className="md:hidden bg-background">
            <div className="p-4 space-y-4 border-b">
              <div>
                <h2 className="text-xl font-bold mb-1">Contador de Medicamentos</h2>
                <p className="text-sm text-muted-foreground">Selecciona una opción para comenzar</p>
              </div>
              {canManageRecords && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="supplier-select" className="font-semibold">Proveedor *</Label>
                    <Drawer open={isSupplierDrawerOpen} onOpenChange={setIsSupplierDrawerOpen}>
                      <DrawerTrigger asChild>
                        <Button 
                          variant="outline" 
                          className="w-full justify-start text-left font-normal h-12 border-2 hover:border-primary"
                        >
                          <span className={selectedSupplier ? "text-foreground" : "text-muted-foreground"}>
                            {selectedSupplierName}
                          </span>
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent className="h-[90vh]">
                        <DrawerHeader className="border-b pb-4 px-4">
                          <DrawerTitle className="text-xl md:text-2xl">Seleccionar Proveedor</DrawerTitle>
                          <DrawerDescription className="text-sm md:text-base mt-1">Toca para seleccionar el proveedor</DrawerDescription>
                        </DrawerHeader>
                        <ScrollArea className="flex-1 px-4">
                          <div className="space-y-2 py-4">
                            {suppliers?.map((supplier) => (
                              <Button
                                key={supplier.id}
                                variant={selectedSupplier === supplier.id ? "default" : "outline"}
                                className="w-full justify-start h-14 text-base font-medium border-2"
                                onClick={() => {
                                  setSelectedSupplier(supplier.id);
                                  setIsSupplierDrawerOpen(false);
                                }}
                              >
                                {supplier.company_name || supplier.full_name}
                              </Button>
                            ))}
                          </div>
                        </ScrollArea>
                        <DrawerFooter className="border-t pt-4 px-4">
                          <DrawerClose asChild>
                            <Button variant="outline" className="h-12 text-base">Cancelar</Button>
                          </DrawerClose>
                        </DrawerFooter>
                      </DrawerContent>
                    </Drawer>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="purchase-order" className="font-semibold">No. Orden de Compra</Label>
                    <Input
                      id="purchase-order"
                      type="text"
                      placeholder="Ej: OC_CITIO_25_05"
                      value={purchaseOrderNumber}
                      onChange={(e) => setPurchaseOrderNumber(e.target.value.toUpperCase())}
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expected-quantity" className="font-semibold">Cantidad Esperada (Cajas)</Label>
                    <Input
                      id="expected-quantity"
                      type="number"
                      min="1"
                      placeholder="Ej: 20"
                      value={expectedQuantity}
                      onChange={(e) => setExpectedQuantity(e.target.value)}
                      className="h-12"
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-3 grid-cols-2">
                <Button
                  onClick={openCamera}
                  disabled={isAnalyzing || (canManageRecords && !selectedSupplier)}
                  variant="outline"
                  className="h-24 flex flex-col items-center justify-center gap-2 border-2"
                >
                  <Camera className="h-8 w-8" />
                  <span className="font-semibold text-sm">Tomar Foto</span>
                </Button>
                
                <Label
                  htmlFor="image-upload"
                  className={`cursor-pointer ${(isAnalyzing || (canManageRecords && !selectedSupplier)) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                >
                  <div className="h-24 flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md hover:bg-accent transition-colors">
                    <Upload className="h-8 w-8" />
                    <span className="font-semibold text-sm">Subir Imagen</span>
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
                <div className="space-y-3">
                  <div className="relative rounded-lg overflow-hidden border bg-muted">
                    <img
                      src={preview}
                      alt="Vista previa"
                      className="w-full h-auto max-h-[200px] object-contain"
                    />
                  </div>

                  <Button
                    onClick={analyzeImage}
                    disabled={isAnalyzing}
                    className="w-full h-12 font-semibold"
                    size="lg"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Analizando...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-5 w-5" />
                        Analizar Imagen
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
          
          {/* Desktop version with Card */}
          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl lg:text-2xl">
                <Camera className="h-6 w-6" />
                Cargar Imagen
              </CardTitle>
              <CardDescription>Selecciona una opción para comenzar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {canManageRecords && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="supplier-select-desktop" className="font-semibold">Proveedor *</Label>
                    <Drawer open={isSupplierDrawerOpen} onOpenChange={setIsSupplierDrawerOpen}>
                      <DrawerTrigger asChild>
                        <Button 
                          variant="outline" 
                          className="w-full justify-start text-left font-normal h-12 border-2 hover:border-primary"
                        >
                          <span className={selectedSupplier ? "text-foreground" : "text-muted-foreground"}>
                            {selectedSupplierName}
                          </span>
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent className="h-[90vh]">
                        <DrawerHeader className="border-b pb-4 px-4">
                          <DrawerTitle className="text-2xl">Seleccionar Proveedor</DrawerTitle>
                          <DrawerDescription className="mt-1">Toca para seleccionar el proveedor</DrawerDescription>
                        </DrawerHeader>
                        <ScrollArea className="flex-1 px-4">
                          <div className="space-y-2 py-4">
                            {suppliers?.map((supplier) => (
                              <Button
                                key={supplier.id}
                                variant={selectedSupplier === supplier.id ? "default" : "outline"}
                                className="w-full justify-start h-14 text-base font-medium border-2"
                                onClick={() => {
                                  setSelectedSupplier(supplier.id);
                                  setIsSupplierDrawerOpen(false);
                                }}
                              >
                                {supplier.company_name || supplier.full_name}
                              </Button>
                            ))}
                          </div>
                        </ScrollArea>
                        <DrawerFooter className="border-t pt-4 px-4">
                          <DrawerClose asChild>
                            <Button variant="outline" className="h-12">Cancelar</Button>
                          </DrawerClose>
                        </DrawerFooter>
                      </DrawerContent>
                    </Drawer>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="purchase-order-desktop">No. Orden de Compra</Label>
                    <Input
                      id="purchase-order-desktop"
                      type="text"
                      placeholder="Ej: OC_CITIO_25_05"
                      value={purchaseOrderNumber}
                      onChange={(e) => setPurchaseOrderNumber(e.target.value.toUpperCase())}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expected-quantity-desktop">Cantidad Esperada (Cajas)</Label>
                    <Input
                      id="expected-quantity-desktop"
                      type="number"
                      min="1"
                      placeholder="Ej: 20"
                      value={expectedQuantity}
                      onChange={(e) => setExpectedQuantity(e.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-4 grid-cols-2">
                <Button
                  onClick={openCamera}
                  disabled={isAnalyzing || (canManageRecords && !selectedSupplier)}
                  variant="outline"
                  className="h-28 flex flex-col items-center justify-center gap-2 border-2"
                >
                  <Camera className="h-10 w-10" />
                  <span className="font-semibold">Tomar Foto</span>
                </Button>
                
                <Label
                  htmlFor="image-upload-desktop"
                  className={`cursor-pointer ${(isAnalyzing || (canManageRecords && !selectedSupplier)) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                >
                  <div className="h-28 flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md hover:bg-accent transition-colors">
                    <Upload className="h-10 w-10" />
                    <span className="font-semibold">Subir Imagen</span>
                  </div>
                  <Input
                    id="image-upload-desktop"
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
                      className="w-full h-auto max-h-96 object-contain"
                    />
                  </div>

                  <Button
                    onClick={analyzeImage}
                    disabled={isAnalyzing}
                    className="w-full h-12 font-semibold"
                    size="lg"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Analizando imagen...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-5 w-5" />
                        Analizar Imagen
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {result && (
            <>
              {/* Mobile version */}
              <div className="md:hidden bg-background">
                <div className="p-4 space-y-4 border-b">
                  <h2 className="text-xl font-bold">Resultados</h2>
                  {result.count !== null && (
                    <div className="p-6 rounded-lg bg-primary/10 border-2 border-primary">
                      <div className="text-center space-y-2">
                        <p className="text-sm text-muted-foreground">Total de Cajas</p>
                        <p className="text-5xl font-bold text-primary">{result.count}</p>
                        
                        {expectedQuantity && parseInt(expectedQuantity) > 0 && (
                          <div className="mt-4 pt-4 border-t border-primary/20">
                            <div className="flex justify-center gap-6">
                              <div>
                                <p className="text-xs text-muted-foreground">Esperadas</p>
                                <p className="text-lg font-semibold">{expectedQuantity}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Entregadas</p>
                                <p className="text-lg font-semibold">{result.count}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Pendientes</p>
                                <p className={`text-lg font-semibold ${
                                  parseInt(expectedQuantity) > result.count ? 'text-yellow-600' : 'text-green-600'
                                }`}>
                                  {Math.max(0, parseInt(expectedQuantity) - result.count)}
                                </p>
                              </div>
                            </div>
                            {parseInt(expectedQuantity) > result.count && (
                              <Badge variant="secondary" className="mt-3">
                                ⚠️ Entrega Parcial
                              </Badge>
                            )}
                          </div>
                        )}
                        
                        <div className="flex justify-center gap-2 flex-wrap mt-3">
                          {result.confidence && (
                            <Badge 
                              variant={
                                result.confidence === 'Alto' ? 'default' : 
                                result.confidence === 'Medio' ? 'secondary' : 
                                'destructive'
                              }
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
                            >
                              Calidad: {result.imageQuality}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {result.warnings && result.warnings.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-yellow-600 font-semibold">Advertencias</Label>
                      <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 space-y-1">
                        {result.warnings.map((warning, idx) => (
                          <p key={idx} className="text-sm text-yellow-800">{warning}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="font-semibold">Análisis Detallado</Label>
                    <div className="p-3 rounded-lg bg-muted whitespace-pre-wrap text-sm">
                      {result.analysis}
                    </div>
                  </div>

                  {canManageRecords ? (
                    <div className="space-y-4">
                      <div className="space-y-3 border-t pt-4">
                        <Label className="font-semibold">Documento de Entrega</Label>
                        <p className="text-sm text-muted-foreground">
                          Captura la hoja firmada de quien recibe el medicamento
                        </p>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            onClick={openDeliveryCamera}
                            variant="outline"
                            className="h-20 flex flex-col items-center justify-center gap-2"
                          >
                            <Camera className="h-6 w-6" />
                            <span className="text-xs font-semibold">Tomar Foto</span>
                          </Button>
                          
                          <Label htmlFor="delivery-doc-upload" className="cursor-pointer">
                            <div className="h-20 flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md hover:bg-accent transition-colors">
                              <Upload className="h-6 w-6" />
                              <span className="text-xs font-semibold">Subir Documento</span>
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
                              className="w-full h-auto max-h-[250px] object-contain"
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
                        className="w-full h-12 font-semibold"
                        size="lg"
                      >
                        {saveMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Guardando...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-5 w-5" />
                            Guardar Registro
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                      ⚠️ No tienes permisos para guardar registros
                    </div>
                  )}
                </div>
              </div>
              
              {/* Desktop version */}
              <Card className="hidden md:block">
                <CardHeader>
                  <CardTitle className="text-xl lg:text-2xl">Resultados del Análisis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {result.count !== null && (
                    <div className="p-8 rounded-lg bg-primary/10 border-2 border-primary">
                      <div className="text-center space-y-3">
                        <p className="text-sm text-muted-foreground">Total de Cajas Detectadas</p>
                        <p className="text-6xl font-bold text-primary">{result.count}</p>
                        
                        {expectedQuantity && parseInt(expectedQuantity) > 0 && (
                          <div className="mt-4 pt-4 border-t border-primary/20">
                            <div className="flex justify-center gap-8 text-base">
                              <div>
                                <p className="text-muted-foreground">Esperadas</p>
                                <p className="text-xl font-semibold">{expectedQuantity}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Entregadas</p>
                                <p className="text-xl font-semibold">{result.count}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Pendientes</p>
                                <p className={`text-xl font-semibold ${
                                  parseInt(expectedQuantity) > result.count ? 'text-yellow-600' : 'text-green-600'
                                }`}>
                                  {Math.max(0, parseInt(expectedQuantity) - result.count)}
                                </p>
                              </div>
                            </div>
                            {parseInt(expectedQuantity) > result.count && (
                              <Badge variant="secondary" className="mt-3">
                                ⚠️ Entrega Parcial
                              </Badge>
                            )}
                          </div>
                        )}
                        
                        <div className="flex justify-center gap-2 flex-wrap mt-4">
                          {result.confidence && (
                            <Badge 
                              variant={
                                result.confidence === 'Alto' ? 'default' : 
                                result.confidence === 'Medio' ? 'secondary' : 
                                'destructive'
                              }
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
                            >
                              Calidad: {result.imageQuality}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {result.warnings && result.warnings.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-yellow-600 font-semibold">Advertencias</Label>
                      <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 space-y-1">
                        {result.warnings.map((warning, idx) => (
                          <p key={idx} className="text-sm text-yellow-800">{warning}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Análisis Detallado</Label>
                    <div className="p-4 rounded-lg bg-muted whitespace-pre-wrap text-sm">
                      {result.analysis}
                    </div>
                  </div>

                  {canManageRecords ? (
                    <div className="space-y-6">
                      <div className="space-y-4 border-t pt-6">
                        <Label className="font-semibold">Documento de Entrega</Label>
                        <p className="text-sm text-muted-foreground">
                          Captura la hoja firmada de quien recibe el medicamento
                        </p>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <Button
                            onClick={openDeliveryCamera}
                            variant="outline"
                            className="h-24 flex flex-col items-center justify-center gap-2"
                          >
                            <Camera className="h-8 w-8" />
                            <span className="text-sm font-semibold">Tomar Foto del Documento</span>
                          </Button>
                          
                          <Label htmlFor="delivery-doc-upload-desktop" className="cursor-pointer">
                            <div className="h-24 flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md hover:bg-accent transition-colors">
                              <Upload className="h-8 w-8" />
                              <span className="text-sm font-semibold">Subir Documento</span>
                            </div>
                            <Input
                              id="delivery-doc-upload-desktop"
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
                        <Label htmlFor="notes-desktop">Notas Adicionales (Opcional)</Label>
                        <Textarea
                          id="notes-desktop"
                          placeholder="Agrega cualquier observación adicional..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                        />
                      </div>

                      <Button
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending || !selectedSupplier}
                        className="w-full h-12 font-semibold"
                        size="lg"
                      >
                        {saveMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Guardando...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-5 w-5" />
                            Guardar Registro
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                      ⚠️ No tienes permisos para guardar registros. Roles: Admin={isAdmin ? 'Sí' : 'No'}, Contador={isContador ? 'Sí' : 'No'}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {canManageRecords && countHistory && countHistory.length > 0 && (
            <>
              {/* Mobile version */}
              <div className="md:hidden bg-background">
                <div className="p-4 space-y-4 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="h-5 w-5" />
                      <h2 className="text-xl font-bold">Historial</h2>
                    </div>
                    <Badge variant="secondary">{countHistory.length}</Badge>
                  </div>
                  <Input
                    placeholder="Buscar por proveedor..."
                    value={supplierFilter}
                    onChange={(e) => setSupplierFilter(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="divide-y">
                  {countHistory.map((record: any) => (
                    <Collapsible key={record.id}>
                      <div className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2 min-w-0">
                            <p className="font-semibold truncate">
                              {record.supplier?.company_name || record.supplier?.full_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(record.created_at).toLocaleDateString('es-MX', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="default" className="text-sm">
                                {record.count} cajas
                              </Badge>
                              {record.expected_quantity && (
                                <Badge variant="outline" className="text-xs">
                                  Esperadas: {record.expected_quantity}
                                </Badge>
                              )}
                              {record.is_partial_delivery && (
                                <Badge variant="secondary" className="text-xs">
                                  ⚠️ Parcial
                                </Badge>
                              )}
                              {record.purchase_order_number && (
                                <Badge variant="outline" className="text-xs">
                                  {record.purchase_order_number}
                                </Badge>
                              )}
                            </div>
                            {record.notes && (
                              <p className="text-xs text-muted-foreground italic line-clamp-2">{record.notes}</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm('¿Eliminar este registro?')) {
                                deleteMutation.mutate(record.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="shrink-0"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        
                        <div className="flex gap-2">
                          <ImageViewer
                            fileUrl={record.image_url}
                            fileName={'Foto de cajas'}
                            triggerText="Ver cajas"
                            triggerSize="sm"
                            triggerVariant="outline"
                            bucket="documents"
                          />
                          {record.delivery_document_url && (
                            <ImageViewer
                              fileUrl={record.delivery_document_url}
                              fileName={'Documento de entrega'}
                              triggerText="Ver documento"
                              triggerSize="sm"
                              triggerVariant="outline"
                              bucket="documents"
                            />
                          )}
                          {record.analysis && (
                            <CollapsibleTrigger asChild>
                              <Button variant="outline" size="sm" className="text-xs">
                                Ver análisis
                                <ChevronDown className="h-3 w-3 ml-1" />
                              </Button>
                            </CollapsibleTrigger>
                          )}
                        </div>
                      </div>
                      
                      {record.analysis && (
                        <CollapsibleContent className="px-4 pb-4">
                          <div className="border-t pt-3 space-y-2">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Análisis Detallado</h4>
                            <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-3 rounded-md">
                              {record.analysis}
                            </pre>
                          </div>
                        </CollapsibleContent>
                      )}
                    </Collapsible>
                  ))}
                </div>
              </div>
              
              {/* Desktop version */}
              <Card className="hidden md:block">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
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
                      className="max-w-md h-10"
                    />
                  </div>
                  <div className="space-y-3">
                    {countHistory.map((record: any) => (
                      <Collapsible key={record.id} className="border rounded-lg">
                        <div className="flex items-start justify-between p-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">
                                {record.supplier?.company_name || record.supplier?.full_name}
                              </span>
                              <span className="text-sm text-muted-foreground">
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
                              <p className="text-sm text-muted-foreground">
                                Cajas contadas: <span className="font-semibold text-primary">{record.count}</span>
                              </p>
                              {record.expected_quantity && (
                                <>
                                  <span className="text-sm text-muted-foreground">
                                    / Esperadas: <span className="font-semibold">{record.expected_quantity}</span>
                                  </span>
                                  {record.expected_quantity > record.count && (
                                    <span className="text-sm text-yellow-600">
                                      (Pendientes: {record.expected_quantity - record.count})
                                    </span>
                                  )}
                                </>
                              )}
                              {record.is_partial_delivery && (
                                <Badge variant="secondary">
                                  ⚠️ Entrega Parcial
                                </Badge>
                              )}
                              {record.purchase_order_number && (
                                <Badge variant="outline">
                                  OC: {record.purchase_order_number}
                                </Badge>
                              )}
                              {record.analysis && (
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    Ver análisis completo
                                    <ChevronDown className="h-4 w-4 ml-1" />
                                  </Button>
                                </CollapsibleTrigger>
                              )}
                            </div>
                            {record.notes && (
                              <p className="text-sm text-muted-foreground italic">{record.notes}</p>
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
                          <CollapsibleContent className="px-4 pb-4">
                            <div className="border-t pt-3 space-y-2">
                              <h4 className="text-sm font-semibold text-muted-foreground uppercase">Análisis Detallado</h4>
                              <pre className="text-sm whitespace-pre-wrap font-mono bg-muted/50 p-3 rounded-md">
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
            </>
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
