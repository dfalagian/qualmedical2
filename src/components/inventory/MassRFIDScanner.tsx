import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Radio, 
  CheckCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  Scan,
  X,
  Package,
  AlertTriangle,
  Clock,
  FileText,
  StopCircle
} from "lucide-react";

export type MassScanMode = "inventario" | "entrada" | "salida" | "registro" | null;

interface ScannedTag {
  epc: string;
  timestamp: Date;
  productName: string | null;
  productSku: string | null;
  batchNumber: string | null;
  expirationDate: string | null;
  status: "found" | "not_found" | "no_product" | "registered" | "unauthorized_exit";
  tagId: string | null;
  productId: string | null;
  batchId: string | null;
  // Info de autorización de salida
  authorizedQuoteFolio?: string | null;
}

interface MassRFIDScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (scannedTags: ScannedTag[], mode: MassScanMode) => void;
}

// Helper to register virgin tags - always trim EPC to prevent whitespace issues
const registerVirginTag = async (epc: string): Promise<{ id: string; isNew: boolean }> => {
  const cleanEpc = epc.trim();
  
  // Check if tag already exists
  const { data: existing, error: checkError } = await supabase
    .from("rfid_tags")
    .select("id")
    .eq("epc", cleanEpc)
    .maybeSingle();

  if (checkError) throw checkError;

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  // Insert new virgin tag with cleaned EPC
  const { data: newTag, error: insertError } = await supabase
    .from("rfid_tags")
    .insert({
      epc: cleanEpc,
      status: "disponible",
      notes: `Registrado masivamente el ${new Date().toLocaleString()}`
    })
    .select("id")
    .single();

  if (insertError) throw insertError;

  return { id: newTag.id, isNew: true };
};

export function MassRFIDScanner({ open, onOpenChange, onComplete }: MassRFIDScannerProps) {
  const { toast } = useToast();
  const [scanMode, setScanMode] = useState<MassScanMode>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedTags, setScannedTags] = useState<ScannedTag[]>([]);
  const [epcInput, setEpcInput] = useState("");
  const [scanStartTime, setScanStartTime] = useState<Date | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const processedEpcsRef = useRef<Set<string>>(new Set());

  // Focus input when scanning starts
  useEffect(() => {
    if (isScanning && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isScanning]);

  // Auto-focus input periodically when scanning
  useEffect(() => {
    if (!isScanning) return;
    
    const focusInterval = setInterval(() => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    }, 300);
    
    return () => clearInterval(focusInterval);
  }, [isScanning]);

  // Check if tag is authorized for exit (assigned to an approved quote with pending exit)
  const checkExitAuthorization = useCallback(async (tag: {
    product_id: string | null;
    batch_id: string | null;
  }): Promise<{ authorized: boolean; quoteFolio: string | null }> => {
    if (!tag.product_id || !tag.batch_id) {
      return { authorized: false, quoteFolio: null };
    }

    // Look for approved quotes with pending inventory exit that include this product/batch
    const { data: authorizedItems, error } = await supabase
      .from("quote_items")
      .select(`
        quote_id,
        quotes!inner (
          id,
          folio,
          status,
          inventory_exit_status
        )
      `)
      .eq("product_id", tag.product_id)
      .eq("batch_id", tag.batch_id)
      .eq("quotes.status", "aprobada")
      .in("quotes.inventory_exit_status", ["pending", "partial"]);

    if (error) {
      console.error("Error checking exit authorization:", error);
      return { authorized: false, quoteFolio: null };
    }

    if (authorizedItems && authorizedItems.length > 0) {
      const quote = authorizedItems[0].quotes as unknown as { folio: string };
      return { authorized: true, quoteFolio: quote?.folio || null };
    }

    return { authorized: false, quoteFolio: null };
  }, []);

  const lookupTag = useCallback(async (epc: string, checkAuthorization: boolean = false): Promise<ScannedTag> => {
    const cleanEpc = epc.trim().toUpperCase();
    
    try {
      // Buscar tag en la base de datos con información del lote
      const { data: tag, error } = await supabase
        .from("rfid_tags")
        .select(`
          id,
          epc,
          product_id,
          batch_id,
          status,
          products:product_id (name, sku),
          product_batches:batch_id (
            batch_number, 
            expiration_date,
            products:product_id (name, sku)
          )
        `)
        .eq("epc", cleanEpc)
        .maybeSingle();

      if (error) throw error;

      if (!tag) {
        return {
          epc: cleanEpc,
          timestamp: new Date(),
          productName: null,
          productSku: null,
          batchNumber: null,
          expirationDate: null,
          status: "not_found",
          tagId: null,
          productId: null,
          batchId: null,
          authorizedQuoteFolio: null
        };
      }

      // Tag encontrado pero sin producto asignado
      if (!tag.product_id) {
        return {
          epc: cleanEpc,
          timestamp: new Date(),
          productName: null,
          productSku: null,
          batchNumber: tag.product_batches?.batch_number || null,
          expirationDate: tag.product_batches?.expiration_date || null,
          status: "no_product",
          tagId: tag.id,
          productId: null,
          batchId: tag.batch_id,
          authorizedQuoteFolio: null
        };
      }

      // Tag con producto (puede venir de lote o directo)
      const productInfo = tag.product_batches?.products || tag.products;
      
      // Si estamos en modo salida, verificar autorización
      if (checkAuthorization) {
        const authResult = await checkExitAuthorization({
          product_id: tag.product_id,
          batch_id: tag.batch_id
        });

        if (!authResult.authorized) {
          return {
            epc: cleanEpc,
            timestamp: new Date(),
            productName: productInfo?.name || null,
            productSku: productInfo?.sku || null,
            batchNumber: tag.product_batches?.batch_number || null,
            expirationDate: tag.product_batches?.expiration_date || null,
            status: "unauthorized_exit",
            tagId: tag.id,
            productId: tag.product_id,
            batchId: tag.batch_id,
            authorizedQuoteFolio: null
          };
        }

        return {
          epc: cleanEpc,
          timestamp: new Date(),
          productName: productInfo?.name || null,
          productSku: productInfo?.sku || null,
          batchNumber: tag.product_batches?.batch_number || null,
          expirationDate: tag.product_batches?.expiration_date || null,
          status: "found",
          tagId: tag.id,
          productId: tag.product_id,
          batchId: tag.batch_id,
          authorizedQuoteFolio: authResult.quoteFolio
        };
      }
      
      return {
        epc: cleanEpc,
        timestamp: new Date(),
        productName: productInfo?.name || null,
        productSku: productInfo?.sku || null,
        batchNumber: tag.product_batches?.batch_number || null,
        expirationDate: tag.product_batches?.expiration_date || null,
        status: "found",
        tagId: tag.id,
        productId: tag.product_id,
        batchId: tag.batch_id,
        authorizedQuoteFolio: null
      };
    } catch (error) {
      console.error("Error looking up tag:", error);
      return {
        epc: cleanEpc,
        timestamp: new Date(),
        productName: null,
        productSku: null,
        batchNumber: null,
        expirationDate: null,
        status: "not_found",
        tagId: null,
        productId: null,
        batchId: null,
        authorizedQuoteFolio: null
      };
    }
  }, [checkExitAuthorization]);

  // Ref adicional para bloquear procesamiento mientras se está procesando un EPC
  const isProcessingRef = useRef<boolean>(false);

  const processEpc = useCallback(async (epc: string) => {
    const cleanEpc = epc.trim().toUpperCase();
    if (!cleanEpc || !isScanning) return;

    // Verificar si ya fue procesado en esta sesión - ANTES de cualquier async
    if (processedEpcsRef.current.has(cleanEpc)) {
      console.log(`⏳ EPC duplicado ignorado: ${cleanEpc}`);
      setEpcInput("");
      return;
    }

    // Marcar como procesado INMEDIATAMENTE para evitar race conditions
    processedEpcsRef.current.add(cleanEpc);
    
    // Limpiar input inmediatamente para preparar siguiente lectura
    setEpcInput("");

    let tagInfo: ScannedTag;

    // Si estamos en modo registro, registrar el tag virgen en la BD
    if (scanMode === "registro") {
      try {
        const result = await registerVirginTag(cleanEpc);
        tagInfo = {
          epc: cleanEpc,
          timestamp: new Date(),
          productName: null,
          productSku: null,
          batchNumber: null,
          expirationDate: null,
          status: "registered",
          tagId: result.id,
          productId: null,
          batchId: null,
          authorizedQuoteFolio: null
        };
        console.log(`✅ Tag ${result.isNew ? 'registrado' : 'ya existía'}: ${cleanEpc}`);
      } catch (error) {
        console.error("Error registering virgin tag:", error);
        tagInfo = {
          epc: cleanEpc,
          timestamp: new Date(),
          productName: null,
          productSku: null,
          batchNumber: null,
          expirationDate: null,
          status: "not_found",
          tagId: null,
          productId: null,
          batchId: null,
          authorizedQuoteFolio: null
        };
      }
    } else {
      // Buscar información del tag - en modo salida, verificar autorización
      const checkAuth = scanMode === "salida";
      tagInfo = await lookupTag(cleanEpc, checkAuth);
    }

    // Agregar a la lista
    setScannedTags(prev => [tagInfo, ...prev]);

    // Mostrar alerta sonora/visual si es salida no autorizada
    if (tagInfo.status === "unauthorized_exit") {
      toast({
        title: "⚠️ SALIDA NO AUTORIZADA",
        description: `El producto "${tagInfo.productName}" no está asignado a ninguna venta aprobada.`,
        variant: "destructive",
      });
      // Reproducir sonido de alerta (beep)
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 400; // Frecuencia baja para error
        oscillator.type = 'square';
        gainNode.gain.value = 0.3;
        oscillator.start();
        setTimeout(() => {
          oscillator.stop();
          audioContext.close();
        }, 500);
      } catch (e) {
        // Audio no disponible
      }
    }

    console.log(`📦 Tag único escaneado: ${cleanEpc} - Status: ${tagInfo.status}`);
  }, [isScanning, lookupTag, scanMode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      processEpc(epcInput);
    }
  };

  const handleStartScan = (mode: MassScanMode) => {
    setScanMode(mode);
    setIsScanning(true);
    setScannedTags([]);
    processedEpcsRef.current = new Set();
    setScanStartTime(new Date());
    console.log(`🔄 Escaneo masivo iniciado: ${mode}`);
  };

  const handleStopScan = () => {
    setIsScanning(false);
    console.log(`🛑 Escaneo masivo detenido. Tags escaneados: ${scannedTags.length}`);
  };

  const handleFinalize = () => {
    onComplete(scannedTags, scanMode);
    handleReset();
  };

  const handleReset = () => {
    setScanMode(null);
    setIsScanning(false);
    setScannedTags([]);
    processedEpcsRef.current = new Set();
    setScanStartTime(null);
    setEpcInput("");
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  const getModeLabel = (mode: MassScanMode) => {
    if (mode === "entrada") return "ENTRADA MASIVA";
    if (mode === "salida") return "SALIDA MASIVA";
    if (mode === "inventario") return "INVENTARIO/AUDITORÍA";
    if (mode === "registro") return "REGISTRO DE TAGS VÍRGENES";
    return "";
  };

  const getModeIcon = (mode: MassScanMode) => {
    if (mode === "entrada") return <ArrowDownToLine className="h-5 w-5" />;
    if (mode === "salida") return <ArrowUpFromLine className="h-5 w-5" />;
    if (mode === "inventario") return <ClipboardCheck className="h-5 w-5" />;
    if (mode === "registro") return <Radio className="h-5 w-5" />;
    return null;
  };

  const getModeColor = (mode: MassScanMode) => {
    if (mode === "entrada") return "bg-green-600";
    if (mode === "salida") return "bg-orange-600";
    if (mode === "inventario") return "bg-blue-600";
    if (mode === "registro") return "bg-purple-600";
    return "";
  };

  const getStatusBadge = (status: ScannedTag["status"]) => {
    switch (status) {
      case "found":
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Encontrado</Badge>;
      case "not_found":
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />No registrado</Badge>;
      case "no_product":
        return <Badge variant="secondary"><Package className="h-3 w-3 mr-1" />Sin producto</Badge>;
      case "registered":
        return <Badge className="bg-purple-500"><CheckCircle className="h-3 w-3 mr-1" />Registrado</Badge>;
      case "unauthorized_exit":
        return <Badge variant="destructive" className="bg-red-600 animate-pulse"><AlertTriangle className="h-3 w-3 mr-1" />NO AUTORIZADO</Badge>;
    }
  };

  const formatExpirationDate = (date: string | null) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    const formatted = d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
    
    if (diffDays < 0) {
      return <span className="text-red-500 font-medium">⚠️ {formatted} (VENCIDO)</span>;
    } else if (diffDays <= 90) {
      return <span className="text-orange-500">{formatted} ({diffDays} días)</span>;
    }
    return <span className="text-muted-foreground">{formatted}</span>;
  };

  // Stats
  const foundTags = scannedTags.filter(t => t.status === "found").length;
  const notFoundTags = scannedTags.filter(t => t.status === "not_found").length;
  const noProductTags = scannedTags.filter(t => t.status === "no_product").length;
  const registeredTags = scannedTags.filter(t => t.status === "registered").length;
  const unauthorizedTags = scannedTags.filter(t => t.status === "unauthorized_exit").length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            Escaneo Masivo RFID
          </DialogTitle>
          <DialogDescription>
            Escanee múltiples tags RFID para operaciones masivas de inventario.
          </DialogDescription>
        </DialogHeader>

        {!scanMode ? (
          // Selección de modo
          <div className="py-6 space-y-4">
            <p className="text-center text-muted-foreground mb-4">Seleccione el tipo de operación:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button 
                onClick={() => handleStartScan("registro")}
                className="h-24 flex flex-col gap-2 bg-purple-600 hover:bg-purple-700"
                size="lg"
              >
                <Radio className="h-8 w-8" />
                <span className="text-lg font-bold">REGISTRO</span>
                <span className="text-xs opacity-80">Tags vírgenes</span>
              </Button>
              
              <Button 
                onClick={() => handleStartScan("inventario")}
                className="h-24 flex flex-col gap-2 bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                <ClipboardCheck className="h-8 w-8" />
                <span className="text-lg font-bold">INVENTARIO</span>
                <span className="text-xs opacity-80">Auditoría de stock</span>
              </Button>
              
              <Button 
                onClick={() => handleStartScan("entrada")}
                className="h-24 flex flex-col gap-2 bg-green-600 hover:bg-green-700"
                size="lg"
              >
                <ArrowDownToLine className="h-8 w-8" />
                <span className="text-lg font-bold">ENTRADA</span>
                <span className="text-xs opacity-80">Recepción masiva</span>
              </Button>
              
              <Button 
                onClick={() => handleStartScan("salida")}
                className="h-24 flex flex-col gap-2 bg-orange-600 hover:bg-orange-700"
                size="lg"
              >
                <ArrowUpFromLine className="h-8 w-8" />
                <span className="text-lg font-bold">SALIDA</span>
                <span className="text-xs opacity-80">Despacho masivo</span>
              </Button>
            </div>
          </div>
        ) : (
          // Vista de escaneo
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            {/* Header del modo */}
            <div className={`p-4 rounded-lg text-white ${getModeColor(scanMode)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getModeIcon(scanMode)}
                  <span className="text-xl font-bold">{getModeLabel(scanMode)}</span>
                </div>
                {isScanning && (
                  <div className="flex items-center gap-2 animate-pulse">
                    <div className="relative">
                      <Scan className="h-5 w-5" />
                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-white rounded-full animate-ping" />
                    </div>
                    <span>Escaneando...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Input de escaneo */}
            {isScanning && (
              <div className="relative">
                <Input
                  ref={inputRef}
                  value={epcInput}
                  onChange={(e) => setEpcInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Esperando lectura RFID... (el lector escribirá aquí)"
                  className="font-mono text-center text-lg h-12 bg-background/80"
                  autoFocus
                  autoComplete="off"
                />
                {epcInput && (
                  <Badge variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2">
                    {epcInput.length} chars
                  </Badge>
                )}
              </div>
            )}

            {/* Stats rápidas - mostrar contador de no autorizados en modo salida */}
            <div className={`grid gap-2 ${scanMode === "salida" ? "grid-cols-5" : "grid-cols-4"}`}>
              <Card className="bg-muted/50">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold">{scannedTags.length}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </CardContent>
              </Card>
              <Card className="bg-green-50 dark:bg-green-950/30">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{foundTags}</p>
                  <p className="text-xs text-muted-foreground">
                    {scanMode === "salida" ? "Autorizados" : "Encontrados"}
                  </p>
                </CardContent>
              </Card>
              {scanMode === "salida" && (
                <Card className={`${unauthorizedTags > 0 ? "bg-red-100 dark:bg-red-950/50 border-red-400 animate-pulse" : "bg-red-50 dark:bg-red-950/30"}`}>
                  <CardContent className="p-3 text-center">
                    <p className={`text-2xl font-bold text-red-600 ${unauthorizedTags > 0 ? "animate-bounce" : ""}`}>
                      {unauthorizedTags}
                    </p>
                    <p className="text-xs text-red-600 font-medium">⚠️ NO AUTORIZADOS</p>
                  </CardContent>
                </Card>
              )}
              <Card className="bg-red-50 dark:bg-red-950/30">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{notFoundTags}</p>
                  <p className="text-xs text-muted-foreground">No registrados</p>
                </CardContent>
              </Card>
              <Card className="bg-orange-50 dark:bg-orange-950/30">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">{noProductTags}</p>
                  <p className="text-xs text-muted-foreground">Sin producto</p>
                </CardContent>
              </Card>
            </div>

            {/* Lista de tags escaneados */}
            <div className="flex-1 min-h-0">
              <ScrollArea className="h-[300px] border rounded-lg">
                {scannedTags.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <Radio className="h-12 w-12 mb-2 opacity-50" />
                    <p>No hay tags escaneados</p>
                    <p className="text-sm">Pase los tags por el lector RFID</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-2">
                    {scannedTags.map((tag, index) => (
                      <div 
                        key={`${tag.epc}-${index}`} 
                        className={`p-3 rounded-lg border ${
                          tag.status === "found" ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" :
                          tag.status === "not_found" ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" :
                          tag.status === "unauthorized_exit" ? "bg-red-100 dark:bg-red-950/40 border-red-400 dark:border-red-600 ring-2 ring-red-500" :
                          "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getStatusBadge(tag.status)}
                              <span className="text-xs text-muted-foreground">
                                <Clock className="h-3 w-3 inline mr-1" />
                                {tag.timestamp.toLocaleTimeString()}
                              </span>
                              {tag.authorizedQuoteFolio && (
                                <Badge variant="outline" className="text-xs bg-green-100 border-green-400 text-green-700">
                                  📋 {tag.authorizedQuoteFolio}
                                </Badge>
                              )}
                            </div>
                            <p className="font-mono text-sm truncate" title={tag.epc}>
                              EPC: {tag.epc}
                            </p>
                            {tag.productName && (
                              <p className="font-medium mt-1">
                                <Package className="h-4 w-4 inline mr-1" />
                                {tag.productName}
                                {tag.productSku && (
                                  <span className="text-muted-foreground text-sm ml-2">({tag.productSku})</span>
                                )}
                              </p>
                            )}
                            {tag.batchNumber && (
                              <p className="text-sm text-muted-foreground">
                                Lote: {tag.batchNumber}
                                {tag.expirationDate && (
                                  <span className="ml-2">| Cad: {formatExpirationDate(tag.expirationDate)}</span>
                                )}
                              </p>
                            )}
                            {tag.status === "unauthorized_exit" && (
                              <p className="text-sm text-red-600 font-medium mt-1">
                                ⚠️ Este medicamento NO está asignado a ninguna venta aprobada
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Tiempo de escaneo */}
            {scanStartTime && (
              <p className="text-sm text-center text-muted-foreground">
                <Clock className="h-4 w-4 inline mr-1" />
                Sesión iniciada: {scanStartTime.toLocaleTimeString()}
              </p>
            )}
          </div>
        )}

        <Separator />

        <DialogFooter className="flex-shrink-0">
          {!scanMode ? (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          ) : (
            <div className="flex gap-2 w-full">
              {isScanning ? (
                <Button 
                  onClick={handleStopScan} 
                  variant="destructive"
                  className="flex-1 gap-2"
                  size="lg"
                >
                  <StopCircle className="h-5 w-5" />
                  Detener Escaneo
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleReset} className="gap-2">
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button 
                    onClick={() => setIsScanning(true)} 
                    variant="secondary"
                    className="gap-2"
                  >
                    <Scan className="h-4 w-4" />
                    Continuar Escaneo
                  </Button>
                  <Button 
                    onClick={handleFinalize} 
                    className={`flex-1 gap-2 ${getModeColor(scanMode)} hover:opacity-90`}
                    disabled={scannedTags.length === 0}
                  >
                    <FileText className="h-4 w-4" />
                    Procesar {scannedTags.length} Tags
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
