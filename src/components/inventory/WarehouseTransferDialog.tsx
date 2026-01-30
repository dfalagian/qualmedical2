import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowRightLeft, 
  ScanBarcode, 
  Hash, 
  Trash2, 
  Package, 
  Tag as TagIcon,
  Warehouse
} from "lucide-react";

interface Warehouse {
  id: string;
  code: string;
  name: string;
}

interface ScannedTag {
  id: string;
  epc: string;
  productName: string;
  batchNumber?: string;
}

interface WarehouseTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WarehouseTransferDialog({ 
  open, 
  onOpenChange 
}: WarehouseTransferDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scanInputRef = useRef<HTMLInputElement>(null);
  
  const [transferMode, setTransferMode] = useState<"rfid" | "manual">("rfid");
  const [fromWarehouseId, setFromWarehouseId] = useState<string>("");
  const [toWarehouseId, setToWarehouseId] = useState<string>("");
  const [scannedTags, setScannedTags] = useState<ScannedTag[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [manualQuantity, setManualQuantity] = useState<number>(1);
  const [notes, setNotes] = useState("");

  // Fetch warehouses
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Warehouse[];
    },
  });

  // Fetch products for manual transfer
  const { data: products = [] } = useQuery({
    queryKey: ["products_for_transfer", fromWarehouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, current_stock, warehouse_id")
        .eq("warehouse_id", fromWarehouseId)
        .gt("current_stock", 0)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!fromWarehouseId && transferMode === "manual",
  });

  // Set default warehouses when loaded
  useEffect(() => {
    if (warehouses.length >= 2 && !fromWarehouseId) {
      const principal = warehouses.find(w => w.code === "PRINCIPAL");
      const citio = warehouses.find(w => w.code === "CITIO");
      if (principal) setFromWarehouseId(principal.id);
      if (citio) setToWarehouseId(citio.id);
    }
  }, [warehouses, fromWarehouseId]);

  // Focus scan input when dialog opens
  useEffect(() => {
    if (open && transferMode === "rfid") {
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  }, [open, transferMode]);

  // Handle RFID scan
  const handleScan = async (epc: string) => {
    const cleanEpc = epc.trim().toUpperCase();
    if (!cleanEpc) return;

    // Check if already scanned
    if (scannedTags.some(t => t.epc === cleanEpc)) {
      toast({
        title: "Tag ya escaneado",
        description: "Este tag ya está en la lista de transferencia.",
        variant: "destructive",
      });
      setScanInput("");
      return;
    }

    // Lookup tag in database
    const { data: tag, error } = await supabase
      .from("rfid_tags")
      .select(`
        id, epc, warehouse_id,
        products:product_id (name),
        product_batches:batch_id (batch_number)
      `)
      .eq("epc", cleanEpc)
      .maybeSingle();

    if (error || !tag) {
      toast({
        title: "Tag no encontrado",
        description: `El EPC ${cleanEpc} no está registrado.`,
        variant: "destructive",
      });
      setScanInput("");
      return;
    }

    // Verify tag is in the source warehouse
    if (tag.warehouse_id !== fromWarehouseId) {
      const sourceWarehouse = warehouses.find(w => w.id === fromWarehouseId);
      toast({
        title: "Tag en otro almacén",
        description: `Este tag no está en ${sourceWarehouse?.name || "el almacén origen"}.`,
        variant: "destructive",
      });
      setScanInput("");
      return;
    }

    // Add to scanned list
    setScannedTags(prev => [...prev, {
      id: tag.id,
      epc: tag.epc,
      productName: (tag.products as any)?.name || "Sin producto",
      batchNumber: (tag.product_batches as any)?.batch_number,
    }]);

    setScanInput("");
    toast({
      title: "Tag agregado",
      description: `${cleanEpc} listo para transferir.`,
    });
  };

  // Handle key press in scan input
  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(scanInput);
    }
  };

  // Remove scanned tag
  const removeScannedTag = (epc: string) => {
    setScannedTags(prev => prev.filter(t => t.epc !== epc));
  };

  // Transfer mutation for RFID mode
  const transferRfidMutation = useMutation({
    mutationFn: async () => {
      const tagIds = scannedTags.map(t => t.id);
      
      // Update all tags to new warehouse
      const { error: tagError } = await supabase
        .from("rfid_tags")
        .update({ 
          warehouse_id: toWarehouseId,
          last_location: warehouses.find(w => w.id === toWarehouseId)?.name || null,
          last_read_at: new Date().toISOString()
        })
        .in("id", tagIds);

      if (tagError) throw tagError;

      // Record transfers
      const transfers = scannedTags.map(tag => ({
        from_warehouse_id: fromWarehouseId,
        to_warehouse_id: toWarehouseId,
        rfid_tag_id: tag.id,
        transfer_type: "rfid",
        notes: notes || null,
      }));

      const { error: transferError } = await supabase
        .from("warehouse_transfers")
        .insert(transfers);

      if (transferError) throw transferError;

      return { count: scannedTags.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers"] });
      toast({
        title: "Transferencia completada",
        description: `${data.count} tag(s) transferido(s) exitosamente.`,
      });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error en transferencia",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Transfer mutation for manual mode
  const transferManualMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProductId || manualQuantity <= 0) {
        throw new Error("Seleccione un producto y cantidad válida");
      }

      // Get product info
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, name, current_stock")
        .eq("id", selectedProductId)
        .single();

      if (productError || !product) throw new Error("Producto no encontrado");

      if (product.current_stock < manualQuantity) {
        throw new Error(`Stock insuficiente. Disponible: ${product.current_stock}`);
      }

      // Update source product stock
      const { error: updateError } = await supabase
        .from("products")
        .update({ 
          current_stock: product.current_stock - manualQuantity,
          updated_at: new Date().toISOString()
        })
        .eq("id", selectedProductId);

      if (updateError) throw updateError;

      // Check if product exists in destination warehouse or create it
      const { data: destProduct, error: destError } = await supabase
        .from("products")
        .select("id, current_stock")
        .eq("warehouse_id", toWarehouseId)
        .eq("name", product.name)
        .maybeSingle();

      if (destError) throw destError;

      if (destProduct) {
        // Update destination product stock
        const { error: destUpdateError } = await supabase
          .from("products")
          .update({ 
            current_stock: destProduct.current_stock + manualQuantity,
            updated_at: new Date().toISOString()
          })
          .eq("id", destProduct.id);

        if (destUpdateError) throw destUpdateError;
      }

      // Record transfer
      const { error: transferError } = await supabase
        .from("warehouse_transfers")
        .insert({
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          product_id: selectedProductId,
          quantity: manualQuantity,
          transfer_type: "manual",
          notes: notes || null,
        });

      if (transferError) throw transferError;

      return { productName: product.name, quantity: manualQuantity };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers"] });
      toast({
        title: "Transferencia completada",
        description: `${data.quantity} unidades de "${data.productName}" transferidas.`,
      });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error en transferencia",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setScannedTags([]);
    setScanInput("");
    setSelectedProductId("");
    setManualQuantity(1);
    setNotes("");
  };

  const swapWarehouses = () => {
    const temp = fromWarehouseId;
    setFromWarehouseId(toWarehouseId);
    setToWarehouseId(temp);
    setScannedTags([]);
    setSelectedProductId("");
  };

  const canTransfer = transferMode === "rfid" 
    ? scannedTags.length > 0 && fromWarehouseId && toWarehouseId
    : selectedProductId && manualQuantity > 0 && fromWarehouseId && toWarehouseId;

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Transferencia entre Almacenes
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Warehouse Selection */}
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Origen</Label>
              <Select value={fromWarehouseId} onValueChange={(v) => {
                setFromWarehouseId(v);
                setScannedTags([]);
                setSelectedProductId("");
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Almacén origen" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.filter(w => w.id !== toWarehouseId).map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      <div className="flex items-center gap-2">
                        <Warehouse className="h-4 w-4" />
                        {w.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              variant="outline" 
              size="icon"
              onClick={swapWarehouses}
              className="mt-5"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>

            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Destino</Label>
              <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Almacén destino" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.filter(w => w.id !== fromWarehouseId).map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      <div className="flex items-center gap-2">
                        <Warehouse className="h-4 w-4" />
                        {w.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Transfer Mode Tabs */}
          <Tabs value={transferMode} onValueChange={(v) => setTransferMode(v as "rfid" | "manual")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="rfid" className="gap-2">
                <TagIcon className="h-4 w-4" />
                Por Tag RFID
              </TabsTrigger>
              <TabsTrigger value="manual" className="gap-2">
                <Hash className="h-4 w-4" />
                Por Cantidad
              </TabsTrigger>
            </TabsList>

            {/* RFID Mode */}
            <TabsContent value="rfid" className="space-y-4">
              <div className="space-y-2">
                <Label>Escanear Tags</Label>
                <div className="relative">
                  <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={scanInputRef}
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value.toUpperCase())}
                    onKeyDown={handleScanKeyDown}
                    placeholder="Escanee o ingrese EPC..."
                    className="pl-9 font-mono"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  El lector RFID USB ingresará automáticamente los EPCs
                </p>
              </div>

              {/* Scanned Tags List */}
              {scannedTags.length > 0 && (
                <div className="space-y-2">
                  <Label>Tags para transferir ({scannedTags.length})</Label>
                  <ScrollArea className="h-40 border rounded-lg p-2">
                    <div className="space-y-2">
                      {scannedTags.map((tag) => (
                        <div 
                          key={tag.epc}
                          className="flex items-center justify-between p-2 bg-muted/50 rounded"
                        >
                          <div className="flex-1">
                            <p className="font-mono text-sm">{tag.epc}</p>
                            <p className="text-xs text-muted-foreground">
                              {tag.productName}
                              {tag.batchNumber && ` • Lote: ${tag.batchNumber}`}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeScannedTag(tag.epc)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </TabsContent>

            {/* Manual Mode */}
            <TabsContent value="manual" className="space-y-4">
              <div className="space-y-2">
                <Label>Producto</Label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar producto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span>{p.name}</span>
                          <Badge variant="secondary">{p.current_stock} disp.</Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cantidad a transferir</Label>
                <Input
                  type="number"
                  min={1}
                  max={selectedProduct?.current_stock || 1}
                  value={manualQuantity}
                  onChange={(e) => setManualQuantity(parseInt(e.target.value) || 1)}
                />
                {selectedProduct && (
                  <p className="text-xs text-muted-foreground">
                    Stock disponible: {selectedProduct.current_stock}
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo de la transferencia..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            onClick={() => {
              if (transferMode === "rfid") {
                transferRfidMutation.mutate();
              } else {
                transferManualMutation.mutate();
              }
            }}
            disabled={!canTransfer || transferRfidMutation.isPending || transferManualMutation.isPending}
          >
            {transferRfidMutation.isPending || transferManualMutation.isPending 
              ? "Transfiriendo..." 
              : `Transferir ${transferMode === "rfid" ? `${scannedTags.length} tag(s)` : `${manualQuantity} unidades`}`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
