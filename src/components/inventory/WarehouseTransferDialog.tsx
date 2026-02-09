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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowRightLeft, 
  ScanBarcode, 
  Trash2, 
  Package, 
  Tag as TagIcon,
  Warehouse,
  Plus
} from "lucide-react";
import { logActivity } from "@/lib/activityLogger";

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

interface ManualTransferItem {
  productId: string;
  productName: string;
  quantity: number;
  maxStock: number;
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
  
  const [fromWarehouseId, setFromWarehouseId] = useState<string>("");
  const [toWarehouseId, setToWarehouseId] = useState<string>("");
  const [scannedTags, setScannedTags] = useState<ScannedTag[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [manualItems, setManualItems] = useState<ManualTransferItem[]>([]);
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
    enabled: !!fromWarehouseId,
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
    if (open) {
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  }, [open]);

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

  // Add manual transfer item
  const addManualItem = () => {
    if (!selectedProductId || manualQuantity <= 0) return;
    
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    // Check if already added
    const existing = manualItems.find(i => i.productId === selectedProductId);
    if (existing) {
      toast({
        title: "Producto ya agregado",
        description: "Elimínalo primero si deseas cambiar la cantidad.",
        variant: "destructive",
      });
      return;
    }

    if (manualQuantity > product.current_stock) {
      toast({
        title: "Stock insuficiente",
        description: `Solo hay ${product.current_stock} disponibles.`,
        variant: "destructive",
      });
      return;
    }

    setManualItems(prev => [...prev, {
      productId: product.id,
      productName: product.name,
      quantity: manualQuantity,
      maxStock: product.current_stock,
    }]);

    setSelectedProductId("");
    setManualQuantity(1);
  };

  // Remove manual item
  const removeManualItem = (productId: string) => {
    setManualItems(prev => prev.filter(i => i.productId !== productId));
  };

  // Transfer mutation
  const transferMutation = useMutation({
    mutationFn: async () => {
      const results = { rfidCount: 0, manualCount: 0 };

      // Transfer RFID tags
      if (scannedTags.length > 0) {
        const tagIds = scannedTags.map(t => t.id);
        
        const { error: tagError } = await supabase
          .from("rfid_tags")
          .update({ 
            warehouse_id: toWarehouseId,
            last_location: warehouses.find(w => w.id === toWarehouseId)?.name || null,
            last_read_at: new Date().toISOString()
          })
          .in("id", tagIds);

        if (tagError) throw tagError;

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
        results.rfidCount = scannedTags.length;
      }

      // Transfer manual items
      for (const item of manualItems) {
        const { data: product, error: productError } = await supabase
          .from("products")
          .select("id, name, current_stock")
          .eq("id", item.productId)
          .single();

        if (productError || !product) continue;

        // Update source product stock
        await supabase
          .from("products")
          .update({ 
            current_stock: product.current_stock - item.quantity,
            updated_at: new Date().toISOString()
          })
          .eq("id", item.productId);

        // Check if product exists in destination or create reference
        const { data: destProduct } = await supabase
          .from("products")
          .select("id, current_stock")
          .eq("warehouse_id", toWarehouseId)
          .eq("name", product.name)
          .maybeSingle();

        if (destProduct) {
          await supabase
            .from("products")
            .update({ 
              current_stock: destProduct.current_stock + item.quantity,
              updated_at: new Date().toISOString()
            })
            .eq("id", destProduct.id);
        }

        // Record transfer
        await supabase
          .from("warehouse_transfers")
          .insert({
            from_warehouse_id: fromWarehouseId,
            to_warehouse_id: toWarehouseId,
            product_id: item.productId,
            quantity: item.quantity,
            transfer_type: "manual",
            notes: notes || null,
          });

        results.manualCount += item.quantity;
      }

      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers"] });
      
      const fromName = warehouses.find(w => w.id === fromWarehouseId)?.name || "";
      const toName = warehouses.find(w => w.id === toWarehouseId)?.name || "";
      const parts = [];
      if (data.rfidCount > 0) parts.push(`${data.rfidCount} tag(s)`);
      if (data.manualCount > 0) parts.push(`${data.manualCount} unidades`);
      
      logActivity({
        section: "inventario",
        action: "transferencia",
        entityType: "Transferencia Almacén",
        entityName: `${fromName} → ${toName}`,
        details: { items_count: data.rfidCount + data.manualCount, note: notes || undefined },
      });
      
      toast({
        title: "Transferencia completada",
        description: `${parts.join(" y ")} transferido(s) exitosamente.`,
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
    setManualItems([]);
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
    setManualItems([]);
  };

  const canTransfer = (scannedTags.length > 0 || manualItems.length > 0) && fromWarehouseId && toWarehouseId;
  const selectedProduct = products.find(p => p.id === selectedProductId);
  const totalItems = scannedTags.length + manualItems.reduce((sum, i) => sum + i.quantity, 0);

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
                setManualItems([]);
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

          {/* RFID Scanning Section */}
          <div className="space-y-3 p-4 border rounded-lg">
            <div className="flex items-center gap-2">
              <TagIcon className="h-4 w-4 text-primary" />
              <Label className="font-medium">Escanear Tags RFID</Label>
            </div>
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
            
            {scannedTags.length > 0 && (
              <ScrollArea className="h-24 border rounded-lg p-2">
                <div className="space-y-1">
                  {scannedTags.map((tag) => (
                    <div 
                      key={tag.epc}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                    >
                      <div className="flex-1">
                        <span className="font-mono">{tag.epc}</span>
                        <span className="text-muted-foreground ml-2">• {tag.productName}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeScannedTag(tag.epc)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Manual Transfer Section */}
          <div className="space-y-3 p-4 border rounded-lg">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <Label className="font-medium">Transferir por Cantidad</Label>
            </div>
            
            <div className="flex gap-2">
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Seleccionar producto..." />
                </SelectTrigger>
                <SelectContent>
                  {products.filter(p => !manualItems.some(i => i.productId === p.id)).map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="truncate">{p.name}</span>
                        <Badge variant="secondary" className="ml-2">{p.current_stock}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Input
                type="number"
                min={1}
                max={selectedProduct?.current_stock || 1}
                value={manualQuantity}
                onChange={(e) => setManualQuantity(parseInt(e.target.value) || 1)}
                className="w-20"
                placeholder="Cant."
              />
              
              <Button 
                variant="outline" 
                size="icon"
                onClick={addManualItem}
                disabled={!selectedProductId}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {selectedProduct && (
              <p className="text-xs text-muted-foreground">
                Stock disponible: {selectedProduct.current_stock}
              </p>
            )}

            {manualItems.length > 0 && (
              <ScrollArea className="h-24 border rounded-lg p-2">
                <div className="space-y-1">
                  {manualItems.map((item) => (
                    <div 
                      key={item.productId}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                    >
                      <div className="flex-1">
                        <span>{item.productName}</span>
                        <Badge variant="secondary" className="ml-2">{item.quantity} uds</Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeManualItem(item.productId)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

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
            onClick={() => transferMutation.mutate()}
            disabled={!canTransfer || transferMutation.isPending}
          >
            {transferMutation.isPending 
              ? "Transfiriendo..." 
              : `Transferir ${totalItems > 0 ? `(${totalItems})` : ""}`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}