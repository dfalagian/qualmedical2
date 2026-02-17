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
  Plus,
  CalendarIcon
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activityLogger";
import { openWarehouseTransferPrint, TransferPrintItem, TransferPrintData } from "./warehouseTransferPrint";
import { format } from "date-fns";

interface Warehouse {
  id: string;
  code: string;
  name: string;
}

interface ScannedTag {
  id: string;
  epc: string;
  productName: string;
  brand?: string;
  unit?: string;
  batchNumber?: string;
  expirationDate?: string;
}

interface ManualTransferItem {
  productId: string;
  productName: string;
  brand: string;
  unit: string;
  batchId?: string;
  batchNumber: string;
  expirationDate: string;
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
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [manualQuantity, setManualQuantity] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [transferDate, setTransferDate] = useState<Date>(new Date());

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

  // Fetch products for manual transfer - usando warehouse_stock
  const { data: products = [] } = useQuery({
    queryKey: ["products_for_transfer", fromWarehouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("product_id, current_stock, products:product_id(id, name, sku, brand, unit, warehouse_id)")
        .eq("warehouse_id", fromWarehouseId)
        .gt("current_stock", 0);
      if (error) throw error;
      // Flatten to match expected shape
      return (data || []).map((ws: any) => ({
        id: ws.products?.id,
        name: ws.products?.name,
        sku: ws.products?.sku,
        brand: ws.products?.brand,
        unit: ws.products?.unit,
        warehouse_id: ws.warehouse_id,
        current_stock: ws.current_stock,
      })).filter(p => p.id).sort((a: any, b: any) => a.name?.localeCompare(b.name));
    },
    enabled: !!fromWarehouseId,
  });

  // Fetch batches for selected product
  const { data: productBatches = [] } = useQuery({
    queryKey: ["batches_for_transfer", selectedProductId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, batch_number, expiration_date, current_quantity")
        .eq("product_id", selectedProductId)
        .eq("is_active", true)
        .gt("current_quantity", 0)
        .order("expiration_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedProductId,
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
        products:product_id (name, brand, unit),
        product_batches:batch_id (batch_number, expiration_date)
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
      brand: (tag.products as any)?.brand || "",
      unit: (tag.products as any)?.unit || "pieza",
      batchNumber: (tag.product_batches as any)?.batch_number,
      expirationDate: (tag.product_batches as any)?.expiration_date,
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

    // Check if already added (same product + same batch)
    const batchKey = selectedBatchId || "no-batch";
    const existing = manualItems.find(i => i.productId === selectedProductId && (i.batchId || "no-batch") === batchKey);
    if (existing) {
      toast({
        title: "Producto/lote ya agregado",
        description: "Elimínalo primero si deseas cambiar la cantidad.",
        variant: "destructive",
      });
      return;
    }

    // Validate against batch stock if batch selected
    const selectedBatch = productBatches.find(b => b.id === selectedBatchId);
    if (selectedBatch && manualQuantity > selectedBatch.current_quantity) {
      toast({
        title: "Stock insuficiente en lote",
        description: `El lote ${selectedBatch.batch_number} solo tiene ${selectedBatch.current_quantity} disponibles.`,
        variant: "destructive",
      });
      return;
    }

    if (manualQuantity > (product as any).current_stock) {
      toast({
        title: "Stock insuficiente",
        description: `Solo hay ${(product as any).current_stock} disponibles.`,
        variant: "destructive",
      });
      return;
    }

    setManualItems(prev => [...prev, {
      productId: product.id,
      productName: (product as any).name,
      brand: (product as any).brand || "",
      unit: (product as any).unit || "pieza",
      batchId: selectedBatch?.id || undefined,
      batchNumber: selectedBatch?.batch_number || "",
      expirationDate: selectedBatch?.expiration_date
        ? format(new Date(selectedBatch.expiration_date + "T00:00:00"), "dd/MM/yyyy")
        : "",
      quantity: manualQuantity,
      maxStock: selectedBatch?.current_quantity || (product as any).current_stock,
    }]);

    setSelectedProductId("");
    setSelectedBatchId("");
    setManualQuantity(1);
  };

  // Remove manual item
  const removeManualItem = (productId: string, batchId?: string) => {
    setManualItems(prev => prev.filter(i => !(i.productId === productId && (i.batchId || undefined) === batchId)));
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
          created_at: transferDate.toISOString(),
        }));

        const { error: transferError } = await supabase
          .from("warehouse_transfers")
          .insert(transfers);

        if (transferError) throw transferError;
        results.rfidCount = scannedTags.length;
      }

      // Transfer manual items - usando warehouse_stock (stock por almacén independiente)
      for (const item of manualItems) {
        // 1. Verificar stock disponible en almacén origen
        const { data: sourceStock, error: sourceError } = await supabase
          .from("warehouse_stock")
          .select("current_stock")
          .eq("product_id", item.productId)
          .eq("warehouse_id", fromWarehouseId)
          .maybeSingle();

        if (sourceError || !sourceStock || sourceStock.current_stock < item.quantity) {
          throw new Error(`Stock insuficiente para ${item.productName} en almacén origen`);
        }

        // 2. Decrementar stock en almacén ORIGEN
        const { error: decrementError } = await supabase
          .from("warehouse_stock")
          .update({ current_stock: sourceStock.current_stock - item.quantity })
          .eq("product_id", item.productId)
          .eq("warehouse_id", fromWarehouseId);

        if (decrementError) throw decrementError;

        // 3. Incrementar (o crear) stock en almacén DESTINO
        const { data: destStock } = await supabase
          .from("warehouse_stock")
          .select("current_stock")
          .eq("product_id", item.productId)
          .eq("warehouse_id", toWarehouseId)
          .maybeSingle();

        if (destStock) {
          // Ya existe el registro en destino, incrementar
          const { error: incrementError } = await supabase
            .from("warehouse_stock")
            .update({ current_stock: destStock.current_stock + item.quantity })
            .eq("product_id", item.productId)
            .eq("warehouse_id", toWarehouseId);
          if (incrementError) throw incrementError;
        } else {
          // Crear nuevo registro de stock en almacén destino
          const { error: insertError } = await supabase
            .from("warehouse_stock")
            .insert({
              product_id: item.productId,
              warehouse_id: toWarehouseId,
              current_stock: item.quantity,
            });
          if (insertError) throw insertError;
        }

        // 4. Actualizar products.current_stock como total global (suma de todos los almacenes)
        const { data: allStocks } = await supabase
          .from("warehouse_stock")
          .select("current_stock")
          .eq("product_id", item.productId);

        const totalStock = (allStocks || []).reduce((sum: number, ws: any) => sum + (ws.current_stock || 0), 0);
        await supabase
          .from("products")
          .update({ current_stock: totalStock, updated_at: new Date().toISOString() })
          .eq("id", item.productId);

        // 5. Registrar la transferencia en el historial
        await supabase
          .from("warehouse_transfers")
          .insert({
            from_warehouse_id: fromWarehouseId,
            to_warehouse_id: toWarehouseId,
            product_id: item.productId,
            batch_id: item.batchId || null,
            quantity: item.quantity,
            transfer_type: "manual",
            notes: notes || null,
            created_at: transferDate.toISOString(),
          });

        results.manualCount += item.quantity;
      }

      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse_transfers_history"] });
      
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

      // Generate PDF report
      const printItems: TransferPrintItem[] = [];
      
      for (const tag of scannedTags) {
        printItems.push({
          index: printItems.length + 1,
          productName: tag.productName,
          brand: tag.brand || "",
          batchNumber: tag.batchNumber || "",
          expirationDate: tag.expirationDate ? format(new Date(tag.expirationDate + "T00:00:00"), "dd/MM/yyyy") : "",
          quantity: 1,
          unit: tag.unit || "pieza",
          epc: tag.epc,
          type: "rfid",
        });
      }
      
      for (const item of manualItems) {
        printItems.push({
          index: printItems.length + 1,
          productName: item.productName,
          brand: item.brand,
          batchNumber: item.batchNumber,
          expirationDate: item.expirationDate,
          quantity: item.quantity,
          unit: item.unit,
          type: "manual",
        });
      }

      const printData: TransferPrintData = {
        transferDate: transferDate,
        fromWarehouse: fromName,
        toWarehouse: toName,
        items: printItems,
        notes: notes || undefined,
      };

      openWarehouseTransferPrint(printData);
      
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
    setSelectedBatchId("");
    setManualQuantity(1);
    setNotes("");
    setTransferDate(new Date());
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <Label className="font-medium">Transferir Productos por Cantidad</Label>
              </div>
              {manualItems.length > 0 && (
                <Badge variant="default" className="text-xs">
                  {manualItems.length} producto{manualItems.length !== 1 ? "s" : ""} agregado{manualItems.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Seleccione un producto, elija el lote, indique la cantidad y presione <strong>+</strong> para agregarlo.
            </p>
            
            <div className="space-y-2">
              <div className="flex gap-2">
                <Select value={selectedProductId} onValueChange={(v) => {
                  setSelectedProductId(v);
                  setSelectedBatchId("");
                }}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Seleccionar producto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center justify-between gap-2 w-full">
                          <span className="truncate">{p.name}</span>
                          {p.brand && <span className="text-xs text-muted-foreground shrink-0">{p.brand}</span>}
                          <Badge variant="secondary" className="ml-2">{p.current_stock}</Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProductId && (
                <div className="flex gap-2">
                  <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={productBatches.length > 0 ? "Seleccionar lote..." : "Sin lotes disponibles"} />
                    </SelectTrigger>
                    <SelectContent>
                      {productBatches.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          <div className="flex items-center gap-2 w-full">
                            <span className="font-mono text-xs">{b.batch_number}</span>
                            <span className="text-xs text-muted-foreground">
                              Cad: {format(new Date(b.expiration_date + "T00:00:00"), "dd/MM/yyyy")}
                            </span>
                            <Badge variant="secondary" className="text-xs">{b.current_quantity} uds</Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Input
                    type="number"
                    min={1}
                    max={selectedBatchId 
                      ? productBatches.find(b => b.id === selectedBatchId)?.current_quantity || 1 
                      : selectedProduct?.current_stock || 1
                    }
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
                    title="Agregar producto a la lista"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {selectedProduct && selectedBatchId && (() => {
                const batch = productBatches.find(b => b.id === selectedBatchId);
                return batch ? (
                  <p className="text-xs text-muted-foreground">
                    Stock en lote <strong>{batch.batch_number}</strong>: {batch.current_quantity} uds
                  </p>
                ) : null;
              })()}
            </div>

            {manualItems.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Productos a transferir:</Label>
                <ScrollArea className={manualItems.length > 3 ? "h-32" : ""}>
                  <div className="space-y-1 border rounded-lg p-2">
                    {manualItems.map((item, index) => (
                      <div 
                        key={`${item.productId}-${item.batchId || 'no-batch'}`}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">{index + 1}.</span>
                          <span className="truncate">{item.productName}</span>
                          {item.brand && (
                            <span className="text-xs text-muted-foreground shrink-0">{item.brand}</span>
                          )}
                          {item.batchNumber && (
                            <span className="text-xs text-muted-foreground shrink-0">Lote: {item.batchNumber}</span>
                          )}
                          {item.expirationDate && (
                            <span className="text-xs text-muted-foreground shrink-0">Cad: {item.expirationDate}</span>
                          )}
                          <Badge variant="secondary" className="shrink-0">{item.quantity} uds</Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => removeManualItem(item.productId, item.batchId)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Date & Notes */}
          <div className="space-y-2">
            <Label>Fecha del movimiento</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !transferDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {transferDate ? format(transferDate, "dd/MM/yyyy") : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={transferDate}
                  onSelect={(d) => d && setTransferDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

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