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
  PackageCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TransferItem {
  id: string;
  product_id: string | null;
  rfid_tag_id: string | null;
  batch_id: string | null;
  quantity: number | null;
  transfer_type: string;
  products?: { name: string; brand: string | null; unit: string | null } | null;
  product_batches?: { batch_number: string; expiration_date: string } | null;
  rfid_tags?: {
    epc: string;
    product_id?: string | null;
    products?: { name: string; brand: string | null; unit: string | null } | null;
    product_batches?: { batch_number: string; expiration_date: string } | null;
  } | null;
}

interface PendingReceptionItem {
  key: string;
  product_name: string;
  product_id: string | null;
  batch_id: string | null;
  cantidad_requerida: number;
  cantidad_confirmada: number;
  has_rfid: boolean;
  epcs_esperados: string[];
  epcs_confirmados: string[];
  confirmado_manual: boolean;
  transfer_ids: string[];
}

interface TransferReceptionScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string | null;
  transferItems: TransferItem[];
  fromWarehouse: string;
  toWarehouse: string;
  onComplete: () => void;
}

export function TransferReceptionScanDialog({
  open,
  onOpenChange,
  groupId,
  transferItems,
  fromWarehouse,
  toWarehouse,
  onComplete,
}: TransferReceptionScanDialogProps) {
  const [pendingItems, setPendingItems] = useState<PendingReceptionItem[]>([]);
  const [epcInput, setEpcInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const processedEpcsRef = useRef<Set<string>>(new Set());

  // Collect all expected EPCs from RFID transfer items
  const expectedEpcs = useMemo(() => {
    const epcs: string[] = [];
    transferItems.forEach(item => {
      if (item.transfer_type === "rfid" && item.rfid_tags?.epc) {
        epcs.push(item.rfid_tags.epc.toUpperCase());
      }
    });
    return epcs;
  }, [transferItems]);

  // Also fetch RFID tags for manual items that might have RFID tags assigned
  const manualProductIds = useMemo(() => 
    transferItems
      .filter(i => i.transfer_type === "manual" && i.product_id)
      .map(i => i.product_id!)
  , [transferItems]);

  const { data: productRfidInfo = {} } = useQuery({
    queryKey: ["product-rfid-info-transfer", manualProductIds],
    queryFn: async () => {
      if (manualProductIds.length === 0) return {};
      const { data } = await supabase
        .from("products")
        .select("id, rfid_required")
        .in("id", manualProductIds);
      const map: Record<string, boolean> = {};
      (data || []).forEach(p => { map[p.id] = p.rfid_required; });
      return map;
    },
    enabled: open && manualProductIds.length > 0,
  });

  // Initialize pending items
  useEffect(() => {
    if (!open || transferItems.length === 0) return;

    const items: PendingReceptionItem[] = [];

    // Group manual items by product+batch
    const manualMap: Record<string, PendingReceptionItem> = {};

    transferItems.forEach(item => {
      if (item.transfer_type === "rfid" && item.rfid_tags) {
        const tag = item.rfid_tags as any;
        const productName = tag.products?.name || "Sin producto";
        const productId = tag.product_id;
        const key = `rfid-${item.id}`;
        items.push({
          key,
          product_name: productName,
          product_id: productId,
          batch_id: null,
          cantidad_requerida: 1,
          cantidad_confirmada: 0,
          has_rfid: true,
          epcs_esperados: [tag.epc.toUpperCase()],
          epcs_confirmados: [],
          confirmado_manual: false,
          transfer_ids: [item.id],
        });
      } else if (item.transfer_type === "manual" && item.product_id) {
        const prod = item.products as any;
        const productName = prod?.name || "Sin producto";
        const batchId = item.batch_id || "no-batch";
        const mapKey = `${item.product_id}-${batchId}`;
        
        if (!manualMap[mapKey]) {
          const rfidRequired = productRfidInfo[item.product_id] || false;
          manualMap[mapKey] = {
            key: `manual-${mapKey}`,
            product_name: productName,
            product_id: item.product_id,
            batch_id: item.batch_id,
            cantidad_requerida: 0,
            cantidad_confirmada: 0,
            has_rfid: rfidRequired,
            epcs_esperados: [],
            epcs_confirmados: [],
            confirmado_manual: false,
            transfer_ids: [],
          };
        }
        manualMap[mapKey].cantidad_requerida += item.quantity || 1;
        manualMap[mapKey].transfer_ids.push(item.id);
      }
    });

    items.push(...Object.values(manualMap));
    setPendingItems(items);
    processedEpcsRef.current.clear();
    setIsScanning(true);
  }, [open, transferItems, productRfidInfo]);

  // Auto-focus & re-focus
  useEffect(() => {
    if (isScanning && inputRef.current) inputRef.current.focus();
  }, [isScanning]);

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

    if (processedEpcsRef.current.has(cleanEpc)) {
      toast.info(`EPC ya escaneado: ${cleanEpc}`);
      setEpcInput("");
      return;
    }

    // Find which pending item expects this EPC
    const itemIndex = pendingItems.findIndex(p =>
      p.has_rfid && p.epcs_esperados.includes(cleanEpc)
    );

    if (itemIndex === -1) {
      // Try matching by product/batch via DB lookup
      toast.error(`EPC no corresponde a esta transferencia: ${cleanEpc}`);
      setEpcInput("");
      return;
    }

    const item = pendingItems[itemIndex];
    if (item.cantidad_confirmada >= item.cantidad_requerida) {
      toast.warning(`Ya se confirmaron todas las unidades de ${item.product_name}`);
      setEpcInput("");
      return;
    }

    processedEpcsRef.current.add(cleanEpc);

    setPendingItems(prev => prev.map((p, idx) => {
      if (idx === itemIndex) {
        return {
          ...p,
          cantidad_confirmada: p.cantidad_confirmada + 1,
          epcs_confirmados: [...p.epcs_confirmados, cleanEpc],
        };
      }
      return p;
    }));

    toast.success(`✓ ${item.product_name} - EPC: ${cleanEpc.substring(0, 12)}...`);
    setEpcInput("");
  }, [pendingItems]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      processEpc(epcInput);
    }
  };

  // Manual confirmation for non-RFID products
  const handleManualConfirm = (key: string) => {
    setPendingItems(prev => prev.map(p => {
      if (p.key === key) {
        return {
          ...p,
          confirmado_manual: true,
          cantidad_confirmada: p.cantidad_requerida,
        };
      }
      return p;
    }));
    toast.success("Confirmado manualmente");
  };

  // Check completion
  const allComplete = pendingItems.every(p =>
    p.cantidad_confirmada >= p.cantidad_requerida || (!p.has_rfid && p.confirmado_manual)
  );

  const totalRequired = pendingItems.reduce((sum, p) => sum + p.cantidad_requerida, 0);
  const totalConfirmed = pendingItems.reduce((sum, p) => sum + p.cantidad_confirmada, 0);
  const progressPercent = totalRequired > 0 ? (totalConfirmed / totalRequired) * 100 : 0;

  // Complete reception - triggers the actual stock movement
  const handleComplete = async () => {
    setIsProcessing(true);
    try {
      // Signal completion by calling onComplete which will trigger the existing confirmMutation
      onComplete();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Error al confirmar recepción: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (totalConfirmed > 0 && !allComplete) {
      if (!confirm("Hay productos pendientes de confirmar. ¿Desea cerrar de todos modos?")) {
        return;
      }
    }
    onOpenChange(false);
  };

  const hasAnyRfid = pendingItems.some(p => p.has_rfid);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" />
            Recepción de Transferencia
          </DialogTitle>
          <DialogDescription>
            Confirme la llegada de cada producto al almacén destino.
            {hasAnyRfid && " Los productos con RFID se confirman escaneando el tag."}
            {" "}Los productos sin RFID requieren confirmación manual.
          </DialogDescription>
        </DialogHeader>

        {/* Transfer info */}
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm">
          <span className="font-medium">{fromWarehouse}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-medium">{toWarehouse}</span>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progreso de recepción</span>
            <span className="font-medium">{totalConfirmed} / {totalRequired} unidades</span>
          </div>
          <Progress value={progressPercent} className="h-3" />
        </div>

        {/* Scanner */}
        {isScanning && hasAnyRfid && (
          <div className="p-4 bg-primary rounded-lg text-primary-foreground">
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
              className="font-mono text-center text-lg h-12 bg-background/90 text-foreground"
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
                <TableHead className="text-center">Confirmado</TableHead>
                <TableHead>EPCs</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingItems.map((item) => {
                const isComplete = item.cantidad_confirmada >= item.cantidad_requerida ||
                  (!item.has_rfid && item.confirmado_manual);

                return (
                  <TableRow key={item.key}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.has_rfid ? (
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
                      {item.cantidad_requerida}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-medium",
                        isComplete ? "text-emerald-600" : "text-amber-600"
                      )}>
                        {item.cantidad_confirmada}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {item.epcs_confirmados.map((epc, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs font-mono">
                            {epc.substring(0, 8)}...
                          </Badge>
                        ))}
                        {item.confirmado_manual && (
                          <Badge variant="secondary" className="text-xs">
                            Manual
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {isComplete ? (
                        <Badge className="bg-emerald-500 text-white">
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
                      {!item.has_rfid && !item.confirmado_manual && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleManualConfirm(item.key)}
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
        {pendingItems.some(p => p.epcs_confirmados.length > 0) && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-medium mb-2">Últimos escaneos:</h4>
            <div className="flex flex-wrap gap-2">
              {pendingItems
                .flatMap(p => p.epcs_confirmados.map(epc => ({ epc, name: p.product_name })))
                .slice(-5)
                .reverse()
                .map((item, idx) => (
                  <Badge key={idx} variant="secondary" className="font-mono text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />
                    {item.name.substring(0, 15)}... - {item.epc.substring(0, 8)}
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
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isProcessing ? (
              "Procesando..."
            ) : (
              <>
                <PackageCheck className="h-4 w-4 mr-2" />
                Confirmar Recepción Completa
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
