import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, History, Trash2, Camera, Package, Calendar, FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageViewer } from "@/components/admin/ImageViewer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MultiPhasePhotoCapture, PhasePhotos } from "@/components/medicine-counter/MultiPhasePhotoCapture";

const MedicineCounter = () => {
  // Estados para el nuevo sistema de fotos en fases
  const [phasePhotos, setPhasePhotos] = useState<PhasePhotos>({
    brand: [],
    lot_expiry: [],
    receipt: null,
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<{ 
    count: number | null; 
    analysis: string;
    confidence?: string;
    imageQuality?: string;
    warnings?: string[];
  } | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState<string>("");
  const [expectedQuantity, setExpectedQuantity] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const { toast } = useToast();
  const { isAdmin, isContador, isContadorProveedor, parentSupplierId, user } = useAuth();
  const queryClient = useQueryClient();
  const [isSupplierDrawerOpen, setIsSupplierDrawerOpen] = useState(false);
  
  // Contador proveedor o admin/contador interno pueden gestionar
  const canManageRecords = isAdmin || isContador || isContadorProveedor;
  
  // Para contador_proveedor, auto-seleccionar su proveedor padre
  useEffect(() => {
    if (isContadorProveedor && parentSupplierId) {
      setSelectedSupplier(parentSupplierId);
    }
  }, [isContadorProveedor, parentSupplierId]);
  
  // Verificar si hay al menos una foto de marca para poder analizar
  const canAnalyze = phasePhotos.brand.length > 0;
  
  // Verificar si todas las fases están completas para poder guardar
  const allPhasesComplete = phasePhotos.brand.length > 0 && 
                           phasePhotos.lot_expiry.length > 0 && 
                           phasePhotos.receipt !== null;

  // Fetch parent supplier name for contador_proveedor
  const { data: parentSupplier } = useQuery({
    queryKey: ["parent_supplier", parentSupplierId],
    enabled: isContadorProveedor && !!parentSupplierId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, company_name")
        .eq("id", parentSupplierId!)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

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

  // Helper function to upload photos to storage
  const uploadPhotoToStorage = async (base64Photo: string, prefix: string): Promise<string> => {
    const fileName = `${selectedSupplier}_${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const blob = await fetch(base64Photo).then(r => r.blob());
    
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(`medicine-counts/${fileName}`, blob);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from("documents")
      .getPublicUrl(`medicine-counts/${fileName}`);

    return publicUrl;
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!result || !selectedSupplier || !allPhasesComplete) {
        throw new Error("Faltan datos requeridos");
      }

      // Verify session is active and refresh if needed
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error("Tu sesión ha expirado. Por favor, vuelve a iniciar sesión.");
      }

      // Verify user is authenticated
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

      // Upload all brand photos
      const brandUrls = await Promise.all(
        phasePhotos.brand.map((photo, idx) => uploadPhotoToStorage(photo, `brand_${idx}`))
      );

      // Upload all lot/expiry photos
      const lotExpiryUrls = await Promise.all(
        phasePhotos.lot_expiry.map((photo, idx) => uploadPhotoToStorage(photo, `lot_${idx}`))
      );

      // Upload receipt acknowledgment
      const receiptUrl = phasePhotos.receipt 
        ? await uploadPhotoToStorage(phasePhotos.receipt, 'receipt')
        : null;

      // Calculate if it's a partial delivery
      const countValue = result.count || 0;
      const expectedValue = expectedQuantity ? parseInt(expectedQuantity) : null;
      const isPartialDelivery = expectedValue ? countValue < expectedValue : false;

      // Use first brand photo as main image_url for backward compatibility
      const mainImageUrl = brandUrls[0];

      // Save record
      const { error: insertError } = await supabase
        .from("medicine_counts")
        .insert({
          supplier_id: selectedSupplier,
          count: countValue,
          analysis: result.analysis,
          image_url: mainImageUrl,
          brand_image_urls: brandUrls,
          lot_expiry_image_urls: lotExpiryUrls,
          receipt_acknowledgment_url: receiptUrl,
          delivery_document_url: receiptUrl, // backward compatibility
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
        description: "El conteo se guardó correctamente con todas las fotos",
      });
      queryClient.invalidateQueries({ queryKey: ["medicine_counts"] });
      
      // Reset form
      setPhasePhotos({ brand: [], lot_expiry: [], receipt: null });
      setResult(null);
      if (!isContadorProveedor) {
        setSelectedSupplier("");
      }
      setPurchaseOrderNumber("");
      setExpectedQuantity("");
      setNotes("");
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

  const analyzeImage = async () => {
    if (!canAnalyze) return;

    setIsAnalyzing(true);
    setResult(null);

    try {
      // Use the first brand photo for analysis
      const { data, error } = await supabase.functions.invoke('count-medicine-boxes', {
        body: { imageBase64: phasePhotos.brand[0] }
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

  const selectedSupplierName = suppliers?.find(s => s.id === selectedSupplier)?.company_name 
    || suppliers?.find(s => s.id === selectedSupplier)?.full_name 
    || "Selecciona un proveedor";

  return (
    <DashboardLayout>
      <div className="w-full h-full overflow-x-hidden">
        <div className="flex flex-col md:max-w-4xl md:mx-auto md:py-6 md:px-4 lg:px-6 md:gap-6">
          
          {/* Header - Solo visible en desktop */}
          <div className="hidden md:block mb-6">
            <h1 className="text-2xl lg:text-3xl font-bold mb-2">
              Contador de Cajas de Medicamentos
            </h1>
            <p className="text-base text-muted-foreground">
              Captura fotos en 3 fases: marca, lote/caducidad y acuse de recibo
            </p>
          </div>

          {/* Banner para contador_proveedor */}
          {isContadorProveedor && parentSupplier && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mx-4 md:mx-0 mb-4">
              <p className="text-sm font-medium text-primary">
                Usuario asociado al proveedor: <span className="font-bold">{parentSupplier.company_name || parentSupplier.full_name}</span>
              </p>
            </div>
          )}

          {/* Mobile version */}
          <div className="md:hidden bg-background">
            <div className="p-4 space-y-4 border-b">
              <div>
                <h2 className="text-xl font-bold mb-1">Contador de Medicamentos</h2>
                <p className="text-sm text-muted-foreground">Captura fotos en 3 fases</p>
              </div>

              {canManageRecords && (
                <div className="space-y-4">
                  {/* Selector de proveedor */}
                  {!isContadorProveedor && (
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
                  )}

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

              {/* Multi-phase photo capture */}
              {selectedSupplier && (
                <MultiPhasePhotoCapture
                  photos={phasePhotos}
                  onPhotosChange={setPhasePhotos}
                  disabled={isAnalyzing || saveMutation.isPending}
                />
              )}

              {/* Analyze button */}
              {canAnalyze && !result && (
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
                      <Camera className="mr-2 h-5 w-5" />
                      Analizar Fotos de Marca
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
          
          {/* Desktop version with Card */}
          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl lg:text-2xl">
                <Camera className="h-6 w-6" />
                Captura de Fotos
              </CardTitle>
              <CardDescription>Captura fotos en 3 fases para documentar la recepción</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {canManageRecords && (
                <div className="space-y-4">
                  {/* Selector de proveedor */}
                  {!isContadorProveedor && (
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
                  )}

                  <div className="grid grid-cols-2 gap-4">
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
                </div>
              )}

              {/* Multi-phase photo capture */}
              {selectedSupplier && (
                <MultiPhasePhotoCapture
                  photos={phasePhotos}
                  onPhotosChange={setPhasePhotos}
                  disabled={isAnalyzing || saveMutation.isPending}
                />
              )}

              {/* Analyze button */}
              {canAnalyze && !result && (
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
                      <Camera className="mr-2 h-5 w-5" />
                      Analizar Fotos de Marca
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Results section */}
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

                  {/* Resumen de fotos capturadas */}
                  <div className="p-4 rounded-lg bg-muted space-y-2">
                    <h3 className="font-semibold text-sm">Fotos Capturadas</h3>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 rounded bg-blue-500/10">
                        <Package className="h-4 w-4 mx-auto mb-1 text-blue-500" />
                        <span className="font-medium">{phasePhotos.brand.length}/4</span>
                        <p className="text-muted-foreground">Marca</p>
                      </div>
                      <div className="p-2 rounded bg-green-500/10">
                        <Calendar className="h-4 w-4 mx-auto mb-1 text-green-500" />
                        <span className="font-medium">{phasePhotos.lot_expiry.length}/4</span>
                        <p className="text-muted-foreground">Lote</p>
                      </div>
                      <div className="p-2 rounded bg-purple-500/10">
                        <FileText className="h-4 w-4 mx-auto mb-1 text-purple-500" />
                        <span className="font-medium">{phasePhotos.receipt ? 1 : 0}/1</span>
                        <p className="text-muted-foreground">Acuse</p>
                      </div>
                    </div>
                  </div>

                  {canManageRecords && allPhasesComplete ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="notes" className="font-semibold">Notas Adicionales (Opcional)</Label>
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
                  ) : !allPhasesComplete && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                      ⚠️ Completa las 3 fases de fotos para poder guardar el registro
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

                  {/* Resumen de fotos capturadas */}
                  <div className="p-4 rounded-lg bg-muted space-y-3">
                    <h3 className="font-semibold">Resumen de Fotos Capturadas</h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <Package className="h-5 w-5 mx-auto mb-2 text-blue-500" />
                        <span className="text-lg font-bold">{phasePhotos.brand.length}/4</span>
                        <p className="text-sm text-muted-foreground">Fotos de Marca</p>
                      </div>
                      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <Calendar className="h-5 w-5 mx-auto mb-2 text-green-500" />
                        <span className="text-lg font-bold">{phasePhotos.lot_expiry.length}/4</span>
                        <p className="text-sm text-muted-foreground">Fotos Lote/Caducidad</p>
                      </div>
                      <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                        <FileText className="h-5 w-5 mx-auto mb-2 text-purple-500" />
                        <span className="text-lg font-bold">{phasePhotos.receipt ? 1 : 0}/1</span>
                        <p className="text-sm text-muted-foreground">Acuse de Recibo</p>
                      </div>
                    </div>
                  </div>

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

                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" className="w-full">
                        Ver Análisis Detallado
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4">
                      <div className="p-4 rounded-lg bg-muted whitespace-pre-wrap text-sm">
                        {result.analysis}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {canManageRecords && allPhasesComplete ? (
                    <div className="space-y-6">
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
                  ) : !allPhasesComplete && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                      ⚠️ Completa las 3 fases de fotos para poder guardar el registro
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* History section */}
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
                        
                        <div className="flex gap-2 flex-wrap">
                          {/* Mostrar fotos de marca */}
                          {(record.brand_image_urls?.length > 0 || record.image_url) && (
                            <ImageViewer
                              fileUrl={record.brand_image_urls?.[0] || record.image_url}
                              fileName={'Foto de marca'}
                              triggerText="Ver marca"
                              triggerSize="sm"
                              triggerVariant="outline"
                              bucket="documents"
                            />
                          )}
                          {/* Mostrar fotos de lote */}
                          {record.lot_expiry_image_urls?.length > 0 && (
                            <ImageViewer
                              fileUrl={record.lot_expiry_image_urls[0]}
                              fileName={'Foto lote/caducidad'}
                              triggerText="Ver lote"
                              triggerSize="sm"
                              triggerVariant="outline"
                              bucket="documents"
                            />
                          )}
                          {/* Mostrar acuse de recibo */}
                          {(record.receipt_acknowledgment_url || record.delivery_document_url) && (
                            <ImageViewer
                              fileUrl={record.receipt_acknowledgment_url || record.delivery_document_url}
                              fileName={'Acuse de recibo'}
                              triggerText="Ver acuse"
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
                            </div>
                            {record.notes && (
                              <p className="text-sm text-muted-foreground italic">{record.notes}</p>
                            )}
                            <div className="flex gap-2 flex-wrap pt-2">
                              {/* Mostrar fotos de marca */}
                              {(record.brand_image_urls?.length > 0 || record.image_url) && (
                                <ImageViewer
                                  fileUrl={record.brand_image_urls?.[0] || record.image_url}
                                  fileName={'Foto de marca - ' + (record.supplier?.company_name || record.supplier?.full_name)}
                                  triggerText={`Ver marca (${record.brand_image_urls?.length || 1})`}
                                  triggerSize="sm"
                                  triggerVariant="ghost"
                                  bucket="documents"
                                />
                              )}
                              {/* Mostrar fotos de lote */}
                              {record.lot_expiry_image_urls?.length > 0 && (
                                <ImageViewer
                                  fileUrl={record.lot_expiry_image_urls[0]}
                                  fileName={'Foto lote/caducidad - ' + (record.supplier?.company_name || record.supplier?.full_name)}
                                  triggerText={`Ver lote (${record.lot_expiry_image_urls.length})`}
                                  triggerSize="sm"
                                  triggerVariant="ghost"
                                  bucket="documents"
                                />
                              )}
                              {/* Mostrar acuse de recibo */}
                              {(record.receipt_acknowledgment_url || record.delivery_document_url) && (
                                <ImageViewer
                                  fileUrl={record.receipt_acknowledgment_url || record.delivery_document_url}
                                  fileName={'Acuse de recibo - ' + (record.supplier?.company_name || record.supplier?.full_name)}
                                  triggerText="Ver acuse"
                                  triggerSize="sm"
                                  triggerVariant="ghost"
                                  bucket="documents"
                                />
                              )}
                              {record.analysis && (
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    Ver análisis completo
                                    <ChevronDown className="h-4 w-4 ml-1" />
                                  </Button>
                                </CollapsibleTrigger>
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
      </div>
    </DashboardLayout>
  );
};

export default MedicineCounter;
