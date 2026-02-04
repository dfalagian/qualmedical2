import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  CheckCircle2,
  Package,
  Radio,
  Scan,
  X,
  AlertCircle,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SaleItem {
  id: string;
  product_id: string;
  batch_id: string;
  nombre_producto: string;
  cantidad: number;
  rfid_required: boolean;
}

interface ScannedItem {
  epc: string;
  product_id: string;
  batch_id: string;
  product_name: string;
  scanned_at: Date;
}

interface PendingProduct {
  product_id: string;
  batch_id: string;
  nombre_producto: string;
  cantidad_requerida: number;
  cantidad_escaneada: number;
  rfid_required: boolean;
  epcs_escaneados: string[];
  confirmado_manual: boolean;
}

interface InventoryExitScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  quoteItems: SaleItem[];
  onComplete: () => void;
}

export const InventoryExitScanDialog = ({
  open,
  onOpenChange,
  quoteId,
  quoteItems,
  onComplete,
}: InventoryExitScanDialogProps) => {
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [epcInput, setEpcInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const processedEpcsRef = useRef<Set<string>>(new Set());

  // Fetch RFID tags for all batches in the sale
  const batchIds = useMemo(() => 
    quoteItems.filter(i => i.batch_id).map(i => i.batch_id),
    [quoteItems]
  );

  const { data: rfidTags = [] } = useQuery({
    queryKey: ["rfid-tags-for-sale", batchIds],
    queryFn: async () => {
      if (batchIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from("rfid_tags")
        .select("id, epc, product_id, batch_id, status")
        .in("batch_id", batchIds)
        .eq("status", "asignado");
      
      if (error) throw error;
      return data || [];
    },
    enabled: open && batchIds.length > 0,
  });

  // Initialize pending products when dialog opens
  useEffect(() => {
    if (open && quoteItems.length > 0) {
      const grouped: Record<string, PendingProduct> = {};
      
      quoteItems.forEach(item => {
        const key = `${item.product_id}-${item.batch_id}`;
        if (!grouped[key]) {
          grouped[key] = {
            product_id: item.product_id,
            batch_id: item.batch_id,
            nombre_producto: item.nombre_producto,
            cantidad_requerida: 0,
            cantidad_escaneada: 0,
            rfid_required: item.rfid_required,
            epcs_escaneados: [],
            confirmado_manual: false,
          };
        }
        grouped[key].cantidad_requerida += item.cantidad;
      });
      
      setPendingProducts(Object.values(grouped));
      setScannedItems([]);
      processedEpcsRef.current.clear();
      setIsScanning(true);
    }
  }, [open, quoteItems]);

  // Auto-focus input when scanning
  useEffect(() => {
    if (isScanning && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isScanning]);

  // Periodically refocus input
  useEffect(() => {
    if (!isScanning) return;
    
    const interval = setInterval(() => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [isScanning]);

  // Process scanned EPC
  const processEpc = useCallback((epc: string) => {
    const cleanEpc = epc.trim().toUpperCase();
    if (!cleanEpc) return;

    // Check if already processed in this session
    if (processedEpcsRef.current.has(cleanEpc)) {
      toast.info(`EPC ya escaneado: ${cleanEpc}`);
      setEpcInput("");
      return;
    }

    // Find the tag in our expected tags
    const tag = rfidTags.find(t => t.epc.toUpperCase() === cleanEpc);
    
    if (!tag) {
      toast.error(`EPC no encontrado en esta venta: ${cleanEpc}`);
      setEpcInput("");
      return;
    }

    // Find the pending product
    const productIndex = pendingProducts.findIndex(
      p => p.product_id === tag.product_id && p.batch_id === tag.batch_id
    );

    if (productIndex === -1) {
      toast.error(`Producto no corresponde a esta venta`);
      setEpcInput("");
      return;
    }

    const product = pendingProducts[productIndex];
    
    // Check if we already have enough for this product
    if (product.cantidad_escaneada >= product.cantidad_requerida) {
      toast.warning(`Ya se escanearon suficientes unidades de ${product.nombre_producto}`);
      setEpcInput("");
      return;
    }

    // Mark as processed immediately
    processedEpcsRef.current.add(cleanEpc);

    // Add to scanned items
    const newScannedItem: ScannedItem = {
      epc: cleanEpc,
      product_id: tag.product_id!,
      batch_id: tag.batch_id!,
      product_name: product.nombre_producto,
      scanned_at: new Date(),
    };

    setScannedItems(prev => [...prev, newScannedItem]);

    // Update pending products
    setPendingProducts(prev => prev.map((p, idx) => {
      if (idx === productIndex) {
        return {
          ...p,
          cantidad_escaneada: p.cantidad_escaneada + 1,
          epcs_escaneados: [...p.epcs_escaneados, cleanEpc],
        };
      }
      return p;
    }));

    toast.success(`✓ ${product.nombre_producto} - EPC: ${cleanEpc.substring(0, 12)}...`);
    setEpcInput("");
  }, [rfidTags, pendingProducts]);

  // Handle input key down
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      processEpc(epcInput);
    }
  };

  // Handle manual confirmation for non-RFID products
  const handleManualConfirm = (productId: string, batchId: string) => {
    setPendingProducts(prev => prev.map(p => {
      if (p.product_id === productId && p.batch_id === batchId) {
        return {
          ...p,
          confirmado_manual: true,
          cantidad_escaneada: p.cantidad_requerida,
        };
      }
      return p;
    }));
    toast.success("Confirmado manualmente");
  };

  // Check if all products are complete
  const allComplete = pendingProducts.every(p => 
    p.cantidad_escaneada >= p.cantidad_requerida || 
    (!p.rfid_required && p.confirmado_manual)
  );

  // Calculate progress
  const totalRequired = pendingProducts.reduce((sum, p) => sum + p.cantidad_requerida, 0);
  const totalScanned = pendingProducts.reduce((sum, p) => sum + p.cantidad_escaneada, 0);
  const progressPercent = totalRequired > 0 ? (totalScanned / totalRequired) * 100 : 0;

  // Handle complete
  const handleComplete = async () => {
    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Update RFID tags to mark them as "salida" (exit)
      for (const item of scannedItems) {
        // Update tag status
        await supabase
          .from("rfid_tags")
          .update({
            status: "disponible",
            product_id: null,
            batch_id: null,
            last_location: "salida_venta",
            last_read_at: new Date().toISOString(),
          })
          .eq("epc", item.epc);

        // Create movement record for RFID
        await supabase
          .from("inventory_movements")
          .insert({
            product_id: item.product_id,
            rfid_tag_id: rfidTags.find(t => t.epc.toUpperCase() === item.epc)?.id,
            movement_type: "salida",
            quantity: 1,
            reference_type: "venta_rfid",
            reference_id: quoteId,
            location: "salida_venta",
            notes: `Venta RFID - EPC: ${item.epc}`,
            created_by: user.id,
          });
      }

      // Update quote inventory_exit_status to 'completed'
      await supabase
        .from("quotes")
        .update({ inventory_exit_status: "completed" })
        .eq("id", quoteId);

      toast.success("¡Salida de inventario completada!");
      onComplete();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Error al procesar salida: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle close without completing - update to partial if some items scanned
  const handleClose = async () => {
    if (scannedItems.length > 0 && !allComplete) {
      if (!confirm("Hay productos pendientes de escanear. ¿Desea cerrar de todos modos? El progreso parcial se guardará.")) {
        return;
      }
      
      // Update status to partial
      await supabase
        .from("quotes")
        .update({ inventory_exit_status: "partial" })
        .eq("id", quoteId);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Escaneo de Salida de Inventario
          </DialogTitle>
          <DialogDescription>
            Escanee cada producto para registrar la salida del inventario. 
            Los productos sin RFID requieren confirmación manual.
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progreso de escaneo</span>
            <span className="font-medium">{totalScanned} / {totalRequired} unidades</span>
          </div>
          <Progress value={progressPercent} className="h-3" />
        </div>

        {/* Scanner input */}
        {isScanning && (
          <div className="p-4 bg-orange-500 rounded-lg text-white">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Scan className="h-6 w-6 animate-pulse" />
              <span className="text-xl font-bold">ESCANEO ACTIVO</span>
            </div>
            <Input
              ref={inputRef}
              value={epcInput}
              onChange={(e) => setEpcInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Esperando lectura RFID..."
              className="font-mono text-center text-lg h-12 bg-white/90 text-black"
              autoFocus
              autoComplete="off"
            />
          </div>
        )}

        {/* Products table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-center">Requerido</TableHead>
                <TableHead className="text-center">Escaneado</TableHead>
                <TableHead>EPCs</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingProducts.map((product) => {
                const isComplete = product.cantidad_escaneada >= product.cantidad_requerida || 
                  (!product.rfid_required && product.confirmado_manual);
                const needsRfid = product.rfid_required;
                
                return (
                  <TableRow key={`${product.product_id}-${product.batch_id}`}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{product.nombre_producto}</div>
                        <div className="text-xs text-muted-foreground">
                          {needsRfid ? (
                            <Badge variant="outline" className="text-xs">
                              <Radio className="h-3 w-3 mr-1" />
                              RFID
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              <Package className="h-3 w-3 mr-1" />
                              Sin RFID
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {product.cantidad_requerida}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-medium",
                        isComplete ? "text-emerald-600" : "text-amber-600"
                      )}>
                        {product.cantidad_escaneada}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {product.epcs_escaneados.map((epc, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs font-mono">
                            {epc.substring(0, 8)}...
                          </Badge>
                        ))}
                        {product.confirmado_manual && (
                          <Badge variant="secondary" className="text-xs">
                            Manual
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {isComplete ? (
                        <Badge className="bg-emerald-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Completo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-400">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Pendiente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!needsRfid && !product.confirmado_manual && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleManualConfirm(product.product_id, product.batch_id)}
                          className="text-xs"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Confirmar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Recent scans */}
        {scannedItems.length > 0 && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-medium mb-2">Últimos escaneos:</h4>
            <div className="flex flex-wrap gap-2">
              {scannedItems.slice(-5).reverse().map((item, idx) => (
                <Badge key={idx} variant="secondary" className="font-mono text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />
                  {item.product_name.substring(0, 15)}... - {item.epc.substring(0, 8)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            <X className="h-4 w-4 mr-2" />
            Cerrar
          </Button>
          <Button
            onClick={handleComplete}
            disabled={!allComplete || isProcessing}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isProcessing ? (
              "Procesando..."
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Completar Salida
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
