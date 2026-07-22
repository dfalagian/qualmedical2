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
  CalendarIcon,
  Search,
  ChevronsUpDown,
  Check
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

export interface EditTransferGroup {
  transferGroupId: string | null;
  transferNumber: number | null;
  itemIds: string[];
  fromWarehouseId: string;
  toWarehouseId: string;
  notes: string | null;
  createdAt: string;
  manualItems: ManualTransferItem[];
  scannedTags: ScannedTag[];
}

interface WarehouseTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editGroup?: EditTransferGroup | null;
}

export function WarehouseTransferDialog({
  open,
  onOpenChange,
  editGroup,
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
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

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
        .select("product_id, current_stock, products:product_id(id, name, sku, barcode, brand, unit, warehouse_id)")
        .eq("warehouse_id", fromWarehouseId)
        .gt("current_stock", 0);
      if (error) throw error;
      // Flatten to match expected shape
      return (data || []).map((ws: any) => ({
        id: ws.products?.id,
        name: ws.products?.name,
        sku: ws.products?.sku,
        barcode: ws.products?.barcode,
        brand: ws.products?.brand,
        unit: ws.products?.unit,
        warehouse_id: ws.warehouse_id,
        current_stock: ws.current_stock,
      })).filter(p => p.id).sort((a: any, b: any) => a.name?.localeCompare(b.name));
    },
    enabled: !!fromWarehouseId,
  });

  // Coincidencias por nombre / SKU / código de barras en el almacén de origen.
  // Búsqueda por subcadena exacta (NO difusa como cmdk, que confundía 7501010
  // con el código 7501041990013 de otro producto por subsecuencia).
  const productSearchTerm = productSearch.trim().toLowerCase();
  const productMatches = productSearchTerm
    ? products.filter((p: any) =>
        `${p.name} ${p.sku || ""} ${p.barcode || ""} ${p.brand || ""}`.toLowerCase().includes(productSearchTerm))
    : products;

  // Si no hay coincidencias en el almacén de origen, buscar en OTROS almacenes
  // para explicar dónde está el stock (evita el confuso "No se encontró producto").
  const { data: elsewhereMatches = [] } = useQuery({
    queryKey: ["transfer_dialog_elsewhere", fromWarehouseId, productSearchTerm],
    queryFn: async () => {
      const term = productSearch.trim();
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, barcode, warehouse_stock(current_stock, warehouse_id, warehouses(name))")
        .or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`)
        .limit(5);
      if (error) throw error;
      return (data || [])
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          stocks: (p.warehouse_stock || [])
            .filter((ws: any) => Number(ws.current_stock) > 0 && ws.warehouse_id !== fromWarehouseId)
            .map((ws: any) => ({ warehouse: ws.warehouses?.name || "—", qty: ws.current_stock })),
        }))
        .filter((p: any) => p.stocks.length > 0);
    },
    enabled: !!fromWarehouseId && productSearchTerm.length >= 2 && productMatches.length === 0,
  });

  // Fetch batches for selected product filtered by source warehouse
  const { data: productBatches = [] } = useQuery({
    queryKey: ["batches_for_transfer", selectedProductId, fromWarehouseId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("batch_warehouse_stock")
        .select("quantity, product_batches!inner(id, batch_number, expiration_date, product_id, is_active)")
        .eq("warehouse_id", fromWarehouseId)
        .eq("product_batches.product_id", selectedProductId)
        .eq("product_batches.is_active", true)
        .gt("quantity", 0);
      if (error) throw error;
      return (data || [])
        .map((bws: any) => ({
          id: bws.product_batches.id,
          batch_number: bws.product_batches.batch_number,
          expiration_date: bws.product_batches.expiration_date,
          current_quantity: bws.quantity,
        }))
        .sort((a: any, b: any) =>
          new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime()
        );
    },
    enabled: !!selectedProductId && !!fromWarehouseId,
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

  // Modo edición: precargar los datos de la transferencia al abrir
  useEffect(() => {
    if (open && editGroup) {
      setFromWarehouseId(editGroup.fromWarehouseId);
      setToWarehouseId(editGroup.toWarehouseId);
      setNotes(editGroup.notes || "");
      setTransferDate(editGroup.createdAt ? new Date(editGroup.createdAt) : new Date());
      setManualItems(editGroup.manualItems);
      setScannedTags(editGroup.scannedTags);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editGroup]);

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

    // Lote obligatorio (regla del sistema: ninguna transacción de inventario sin lote)
    if (!selectedBatchId) {
      toast({
        title: "Lote obligatorio",
        description: "Debes seleccionar un lote antes de agregar el producto a la transferencia.",
        variant: "destructive",
      });
      return;
    }

    // Check if already added (same product + same batch)
    const batchKey = selectedBatchId || "no-batch";
    const existing = manualItems.find(i => i.productId === selectedProductId && (i.batchId || "no-batch") === batchKey);
    if (existing) {
      toast({
        title: "Producto/lote ya agregado",
        description: "Puedes editar la cantidad directamente en la lista de abajo.",
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

  // Editar la cantidad de un producto ya agregado (sin tener que borrarlo).
  const updateManualItemQuantity = (productId: string, batchId: string | undefined, value: number) => {
    setManualItems(prev => prev.map(i => {
      if (i.productId === productId && (i.batchId || undefined) === batchId) {
        const max = i.maxStock ?? value;
        const q = Math.max(1, Math.min(value || 1, max));
        if (value > max) {
          toast({
            title: "Cantidad mayor al stock",
            description: `Disponible: ${max}. Se ajustó al máximo.`,
            variant: "destructive",
          });
        }
        return { ...i, quantity: q };
      }
      return i;
    }));
  };

  // Transfer mutation - now saves as "pendiente" without moving stock
  const transferMutation = useMutation({
    mutationFn: async () => {
      const results = { rfidCount: 0, manualCount: 0 };

      let groupId: string;
      let transferNumber: number;
      if (editGroup) {
        // Edición: conservar grupo/número y reemplazar renglones.
        // Es seguro porque la transferencia está pendiente (el stock aún no se movió).
        groupId = editGroup.transferGroupId || crypto.randomUUID();
        if (editGroup.transferNumber != null) {
          transferNumber = editGroup.transferNumber;
        } else {
          const { data: nn, error: ne } = await (supabase as any).rpc("get_next_transfer_number");
          if (ne) throw ne;
          transferNumber = nn;
        }
        if (editGroup.itemIds.length > 0) {
          const { error: delErr } = await supabase
            .from("warehouse_transfers")
            .delete()
            .in("id", editGroup.itemIds);
          if (delErr) throw delErr;
        }
      } else {
        groupId = crypto.randomUUID();
        const { data: nextNum, error: numError } = await (supabase as any).rpc("get_next_transfer_number");
        if (numError) throw numError;
        transferNumber = nextNum;
      }

      // Save RFID tags as pending transfers (NO stock movement)
      if (scannedTags.length > 0) {
        const transfers = scannedTags.map(tag => ({
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          rfid_tag_id: tag.id,
          transfer_type: "rfid",
          notes: notes || null,
          created_at: transferDate.toISOString(),
          status: "pendiente",
          transfer_group_id: groupId,
          transfer_number: transferNumber,
        }));

        const { error: transferError } = await supabase
          .from("warehouse_transfers")
          .insert(transfers);

        if (transferError) throw transferError;
        results.rfidCount = scannedTags.length;
      }

      // Save manual items as pending transfers (NO stock movement)
      for (const item of manualItems) {
        if (!item.batchId) {
          throw new Error(`El producto "${item.productName}" no tiene lote asignado. Las transferencias manuales requieren lote.`);
        }
        await supabase
          .from("warehouse_transfers")
          .insert({
            from_warehouse_id: fromWarehouseId,
            to_warehouse_id: toWarehouseId,
            product_id: item.productId,
            batch_id: item.batchId,
            quantity: item.quantity,
            transfer_type: "manual",
            notes: notes || null,
            created_at: transferDate.toISOString(),
            status: "pendiente",
            transfer_group_id: groupId,
            transfer_number: transferNumber,
          });

        results.manualCount += item.quantity;
      }

      return results;
    },
    onSuccess: (data) => {
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
        entityName: `${fromName} → ${toName} (pendiente)`,
        details: { items_count: data.rfidCount + data.manualCount, note: notes || undefined },
      });
      
      toast({
        title: editGroup ? "Transferencia actualizada" : "Transferencia creada como pendiente",
        description: editGroup
          ? `${parts.join(" y ")} guardados. Sigue pendiente de aprobación.`
          : `${parts.join(" y ")} listos para aprobar. El stock no se moverá hasta que se apruebe.`,
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
            {editGroup ? "Editar Transferencia" : "Transferencia entre Almacenes"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Warehouse Selection */}
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Origen</Label>
              <Select disabled={!!editGroup} value={fromWarehouseId} onValueChange={(v) => {
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
              disabled={!!editGroup}
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>

            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Destino</Label>
              <Select disabled={!!editGroup} value={toWarehouseId} onValueChange={setToWarehouseId}>
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
                <Popover modal={true} open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={productSearchOpen}
                      className="flex-1 justify-between font-normal"
                    >
                      {selectedProductId
                        ? (() => {
                            const p = products.find(p => p.id === selectedProductId);
                            return p ? `${p.name}${p.brand ? ` (${p.brand})` : ''} — ${p.current_stock}` : "Seleccionar producto...";
                          })()
                        : "Seleccionar producto..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[450px] p-0 z-[9999]" align="start">
                    <div className="p-2">
                      <Input
                        autoFocus
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Buscar por nombre, SKU o código de barras..."
                        className="h-9"
                        onKeyDown={(e) => {
                          // Enter del lector de códigos: si hay 1 sola coincidencia, seleccionarla
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (productMatches.length === 1) {
                              setSelectedProductId(productMatches[0].id);
                              setSelectedBatchId("");
                              setProductSearch("");
                              setProductSearchOpen(false);
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {productMatches.length === 0 ? (
                        elsewhereMatches.length > 0 ? (
                          <div className="p-2 space-y-2">
                            {elsewhereMatches.map((p: any) => (
                              <div key={p.id} className="text-xs">
                                <span className="font-medium">{p.name}</span>
                                <p className="text-amber-700">
                                  Sin stock en el almacén de origen. Disponible en:{" "}
                                  {p.stocks.map((s: any) => `${s.warehouse} (${s.qty})`).join(", ")}.
                                </p>
                                <p className="text-muted-foreground">
                                  Cambia el almacén de origen a ese para poder transferirlo.
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm p-3 text-muted-foreground">No se encontró producto.</p>
                        )
                      ) : (
                        productMatches.map((p: any) => (
                          <button
                            key={p.id}
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              setSelectedProductId(p.id);
                              setSelectedBatchId("");
                              setProductSearch("");
                              setProductSearchOpen(false);
                            }}
                          >
                            <Check className={cn("h-4 w-4 shrink-0", selectedProductId === p.id ? "opacity-100" : "opacity-0")} />
                            <span className="truncate flex-1">
                              {p.name}
                              {(p.sku || p.barcode) && (
                                <span className="text-xs text-muted-foreground"> · {p.sku || p.barcode}</span>
                              )}
                            </span>
                            {p.brand && <span className="text-xs text-muted-foreground mx-1">{p.brand}</span>}
                            <Badge variant="secondary" className="ml-1 shrink-0">{p.current_stock}</Badge>
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
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
                          <div className="flex items-center gap-1 shrink-0">
                            <Input
                              type="number"
                              min={1}
                              max={item.maxStock}
                              value={item.quantity}
                              onChange={(e) => updateManualItemQuantity(item.productId, item.batchId, parseInt(e.target.value) || 1)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-7 w-16 text-center px-1"
                            />
                            <span className="text-xs text-muted-foreground">uds</span>
                          </div>
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
              ? "Guardando..."
              : editGroup
                ? `Guardar Cambios ${totalItems > 0 ? `(${totalItems})` : ""}`
                : `Crear Pendiente ${totalItems > 0 ? `(${totalItems})` : ""}`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}