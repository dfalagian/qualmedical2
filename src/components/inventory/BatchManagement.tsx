import { useState, Fragment, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { syncWarehouseStockFromBatches } from "@/lib/syncWarehouseStock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { OldBatchesWarningModal } from "./OldBatchesWarningModal";
import { BatchTraceabilityModal } from "./BatchTraceabilityModal";
import { BatchTagsDialog } from "./BatchTagsDialog";

import { 
  Plus, 
  Edit, 
  Trash2, 
  Package,
  Barcode,
  Calendar,
  Boxes,
  AlertTriangle,
  Tag,
  Search,
  ChevronsUpDown,
  Check,
  Warehouse
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string | null;
}

interface ProductBatch {
  id: string;
  product_id: string;
  batch_number: string;
  barcode: string;
  expiration_date: string;
  initial_quantity: number;
  current_quantity: number;
  received_at: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  products?: { name: string; sku: string; category: string | null } | null;
}

interface RfidTag {
  id: string;
  epc: string;
  batch_id: string | null;
  product_id: string | null;
  status: string;
}

interface BatchManagementProps {
  canEdit: boolean;
  isAdmin: boolean;
  products: Product[];
}

export function BatchManagement({ canEdit, isAdmin, products }: BatchManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollPositionRef = useRef<number>(0);
  const restoreScrollPosition = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: "auto" });
      });
    });
  }, []);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<ProductBatch | null>(null);
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  const [productComboOpen, setProductComboOpen] = useState(false);
  const [selectedBatchForTags, setSelectedBatchForTags] = useState<{
    id: string;
    batchNumber: string;
    productName: string;
  } | null>(null);
  
  const [batchForm, setBatchForm] = useState({
    product_id: "",
    batch_number: "",
    barcode: "",
    expiration_date: "",
    initial_quantity: 0,
    current_quantity: 0,
    notes: ""
  });
  // warehouseQty[warehouseId] = quantity for batch-warehouse assignment
  const [warehouseQty, setWarehouseQty] = useState<Record<string, number>>({});

  const normalizedSearchTerm = localSearchTerm.trim().toLowerCase();

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["batch-management-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select(`
          *,
          products:product_id (name, sku, category)
        `)
        .order("expiration_date", { ascending: true });

      if (error) throw error;
      return data as ProductBatch[];
    }
  });

  // Fetch tags count per batch
  const { data: tagsPerBatch = {} } = useQuery({
    queryKey: ["tags_per_batch"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfid_tags")
        .select("batch_id")
        .not("batch_id", "is", null);

      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach(tag => {
        if (tag.batch_id) {
          counts[tag.batch_id] = (counts[tag.batch_id] || 0) + 1;
        }
      });
      return counts;
    }
  });

  // Fetch warehouses
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, code")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch warehouse stock breakdown per product
  const { data: warehouseStockMap = {} } = useQuery({
    queryKey: ["warehouse_stock_by_product"],
    queryFn: async () => {
      const { data: wsData, error: wsErr } = await supabase
        .from("warehouse_stock")
        .select("product_id, warehouse_id, current_stock")
        .gt("current_stock", 0);
      if (wsErr) throw wsErr;

      const map: Record<string, { name: string; code: string; stock: number }[]> = {};
      for (const ws of wsData || []) {
        const wh = warehouses?.find(w => w.id === ws.warehouse_id);
        if (!wh) continue;
        if (!map[ws.product_id]) map[ws.product_id] = [];
        map[ws.product_id].push({ name: wh.name, code: wh.code, stock: ws.current_stock });
      }
      return map;
    },
    enabled: warehouses.length > 0,
  });

  // Fetch batch_warehouse_stock for display
  const { data: batchWarehouseStockMap = {} } = useQuery({
    queryKey: ["batch-warehouse-stock-display"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("batch_warehouse_stock")
        .select("batch_id, warehouse_id, quantity")
        .gt("quantity", 0);
      if (error) throw error;
      const map: Record<string, { warehouseId: string; warehouseName: string; quantity: number }[]> = {};
      for (const row of data || []) {
        const wh = warehouses.find((w: any) => w.id === row.warehouse_id);
        if (!wh) continue;
        if (!map[row.batch_id]) map[row.batch_id] = [];
        map[row.batch_id].push({ warehouseId: row.warehouse_id, warehouseName: wh.name, quantity: row.quantity });
      }
      return map;
    },
    enabled: warehouses.length > 0,
  });

  // Create/Update batch
  // Helper to save warehouse assignments for a batch
  const saveWarehouseAssignments = async (batchId: string) => {
    const whEntries = Object.entries(warehouseQty).filter(([, qty]) => qty > 0);

    // Delete existing assignments for this batch
    await (supabase as any)
      .from("batch_warehouse_stock")
      .delete()
      .eq("batch_id", batchId);

    if (whEntries.length === 0) return;

    // Insert new assignments
    const rows = whEntries.map(([warehouseId, quantity]) => ({
      batch_id: batchId,
      warehouse_id: warehouseId,
      quantity,
    }));
    const { error } = await (supabase as any)
      .from("batch_warehouse_stock")
      .insert(rows);
    if (error) throw error;
  };

  const batchMutation = useMutation({
    mutationFn: async (batch: typeof batchForm & { id?: string }) => {
      if (batch.id) {
        // Obtener el lote actual para calcular la diferencia de stock
        const { data: currentBatch, error: fetchError } = await supabase
          .from("product_batches")
          .select("initial_quantity, current_quantity, product_id")
          .eq("id", batch.id)
          .single();
        
        if (fetchError) throw fetchError;
        
        const oldCurrentQty = currentBatch?.current_quantity || 0;
        const newCurrentQty = batch.current_quantity;
        const stockDifference = newCurrentQty - oldCurrentQty;
        
        const { error } = await supabase
          .from("product_batches")
          .update({
            product_id: batch.product_id,
            batch_number: batch.batch_number,
            barcode: batch.barcode,
            expiration_date: batch.expiration_date,
            initial_quantity: batch.initial_quantity,
            current_quantity: newCurrentQty,
            notes: batch.notes || null
          })
          .eq("id", batch.id);
        if (error) throw error;

        // Save warehouse assignments
        await saveWarehouseAssignments(batch.id);
        
        // El trigger sync_stock_from_batch_warehouse se encarga automáticamente de sincronizar
        // product_batches.current_quantity, warehouse_stock y products.current_stock
      } else {
        // Crear nuevo lote
        const { data: newBatch, error } = await supabase
          .from("product_batches")
          .insert({
            product_id: batch.product_id,
            batch_number: batch.batch_number,
            barcode: batch.barcode,
            expiration_date: batch.expiration_date,
            initial_quantity: batch.initial_quantity,
            current_quantity: batch.initial_quantity,
            notes: batch.notes || null
          })
          .select("id")
          .single();
        if (error) throw error;

        // Save warehouse assignments for the new batch
        if (newBatch) {
          await saveWarehouseAssignments(newBatch.id);
          // El trigger sync_stock_from_batch_warehouse se encarga de la sincronización
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batch-management-list"] });
      queryClient.invalidateQueries({ queryKey: ["product_batches"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["batch-warehouse-stock-display"] });
      queryClient.invalidateQueries({ queryKey: ["batch-warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["product-warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse_stock_by_product"] });
      setDialogOpen(false);
      setEditingBatch(null);
      resetForm();
      // Restore scroll position after re-render
      restoreScrollPosition();
      toast({
        title: editingBatch ? "Lote actualizado" : "Lote creado",
        description: editingBatch 
          ? "Los cambios se guardaron correctamente."
          : "El lote fue creado y el stock del producto fue actualizado."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Delete batch
  const deleteBatchMutation = useMutation({
    mutationFn: async (id: string) => {
      // Get batch info before deletion to recalculate stock
      const { data: batchToDelete, error: fetchErr } = await supabase
        .from("product_batches")
        .select("product_id, current_quantity")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      const productIdToSync = batchToDelete.product_id;

      // Delete batch_warehouse_stock entries for this batch
      await (supabase as any)
        .from("batch_warehouse_stock")
        .delete()
        .eq("batch_id", id);

      // Delete the batch
      const { error } = await supabase
        .from("product_batches")
        .delete()
        .eq("id", id);
      if (error) throw error;

      // Recalculate product stock from remaining active batches
      const { data: remainingBatches, error: rbErr } = await supabase
        .from("product_batches")
        .select("current_quantity")
        .eq("product_id", productIdToSync)
        .eq("is_active", true);
      if (rbErr) throw rbErr;

      const correctStock = (remainingBatches || []).reduce((sum, b) => sum + (b.current_quantity || 0), 0);
      await supabase
        .from("products")
        .update({ current_stock: correctStock, updated_at: new Date().toISOString() })
        .eq("id", productIdToSync);

      // Sync warehouse_stock from remaining batch_warehouse_stock
      await syncWarehouseStockFromBatches(productIdToSync);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batch-management-list"] });
      queryClient.invalidateQueries({ queryKey: ["product_batches"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["batch-warehouse-stock-display"] });
      queryClient.invalidateQueries({ queryKey: ["batch-warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["product-warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse_stock_by_product"] });
      toast({
        title: "Lote eliminado",
        description: "El lote fue eliminado y el stock fue recalculado correctamente."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setBatchForm({
      product_id: "",
      batch_number: "",
      barcode: "",
      expiration_date: "",
      initial_quantity: 0,
      current_quantity: 0,
      notes: ""
    });
    setWarehouseQty({});
  };

  const handleEdit = async (batch: ProductBatch) => {
    scrollPositionRef.current = window.scrollY;
    setBatchForm({
      product_id: batch.product_id,
      batch_number: batch.batch_number,
      barcode: batch.barcode,
      expiration_date: batch.expiration_date,
      initial_quantity: batch.initial_quantity,
      current_quantity: batch.current_quantity,
      notes: batch.notes || ""
    });
    // Load existing warehouse assignments
    const { data: existing } = await (supabase as any)
      .from("batch_warehouse_stock")
      .select("warehouse_id, quantity")
      .eq("batch_id", batch.id);
    const qty: Record<string, number> = {};
    for (const r of existing || []) {
      if (r.quantity > 0) qty[r.warehouse_id] = r.quantity;
    }
    setWarehouseQty(qty);
    setEditingBatch(batch);
    setDialogOpen(true);
  };

  const getExpirationStatus = (expirationDate: string) => {
    const days = differenceInDays(parseISO(expirationDate), new Date());
    if (days < 0) return { status: "expired", label: "Caducado", variant: "destructive" as const };
    if (days <= 30) return { status: "critical", label: `${days} días`, variant: "destructive" as const };
    if (days <= 90) return { status: "warning", label: `${days} días`, variant: "secondary" as const };
    return { status: "ok", label: `${days} días`, variant: "outline" as const };
  };

  const filteredBatches = !normalizedSearchTerm
    ? batches
    : batches.filter((b) =>
        b.batch_number.toLowerCase().includes(normalizedSearchTerm) ||
        b.barcode.toLowerCase().includes(normalizedSearchTerm) ||
        (b.products?.name?.toLowerCase() || "").includes(normalizedSearchTerm) ||
        (b.products?.sku?.toLowerCase() || "").includes(normalizedSearchTerm)
      );

  // Stats
  const expiredBatches = batches.filter(b => differenceInDays(parseISO(b.expiration_date), new Date()) < 0);
  const nearExpiryBatches = batches.filter(b => {
    const days = differenceInDays(parseISO(b.expiration_date), new Date());
    return days >= 0 && days <= 90;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex-1 w-full sm:w-auto">
          <h2 className="text-lg font-semibold">Lotes de Medicamentos</h2>
          <p className="text-sm text-muted-foreground">
            Gestión por número de lote, código de barras y fecha de caducidad
          </p>
          <div className="relative mt-2 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por producto, lote o código..."
              value={localSearchTerm}
              onChange={(e) => setLocalSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <OldBatchesWarningModal />
          <BatchTraceabilityModal />
          
          {canEdit && (
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setEditingBatch(null);
                resetForm();
                 restoreScrollPosition();
              }
            }}>
              <DialogTrigger asChild>
                <Button onClick={() => { scrollPositionRef.current = window.scrollY; }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Lote
                </Button>
              </DialogTrigger>
            <DialogContent
              className="max-w-lg"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                restoreScrollPosition();
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {editingBatch ? "Editar Lote" : "Nuevo Lote"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Producto *</Label>
                  <Popover open={productComboOpen} onOpenChange={setProductComboOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={productComboOpen}
                        className="w-full justify-between font-normal"
                      >
                        {batchForm.product_id
                          ? (() => {
                              const p = products.find(p => p.id === batchForm.product_id);
                              return p ? `${p.sku} - ${p.name}` : "Seleccionar producto...";
                            })()
                          : "Seleccionar producto..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[380px] p-0 z-[9999]" align="start">
                      <Command shouldFilter={true}>
                        <CommandInput placeholder="Buscar por nombre, SKU o código..." />
                        <CommandList>
                          <CommandEmpty>No se encontraron productos</CommandEmpty>
                          <CommandGroup className="max-h-[200px] overflow-auto">
                            {products.map((product) => (
                              <CommandItem
                                key={product.id}
                                value={`${product.sku} ${product.name} ${product.barcode || ""}`}
                                onSelect={() => {
                                  setBatchForm({
                                    ...batchForm,
                                    product_id: product.id,
                                    barcode: product.barcode || product.sku || batchForm.barcode
                                  });
                                  setProductComboOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    batchForm.product_id === product.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">{product.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {product.sku}{product.category ? ` • ${product.category}` : ""}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Número de Lote *</Label>
                    <Input
                      value={batchForm.batch_number}
                      onChange={(e) => setBatchForm({ ...batchForm, batch_number: e.target.value })}
                      placeholder="LOT-2024-001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Código de Barras *</Label>
                    <Input
                      value={batchForm.barcode}
                      onChange={(e) => setBatchForm({ ...batchForm, barcode: e.target.value })}
                      placeholder="7501234567890"
                    />
                  </div>
                </div>

                <div className={cn("grid gap-4", editingBatch ? "grid-cols-3" : "grid-cols-2")}>
                  <div className="space-y-2">
                    <Label>Fecha de Caducidad *</Label>
                    <Input
                      type="date"
                      value={batchForm.expiration_date}
                      onChange={(e) => setBatchForm({ ...batchForm, expiration_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cantidad Inicial *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={batchForm.initial_quantity}
                      onChange={(e) => setBatchForm({ ...batchForm, initial_quantity: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  {editingBatch && (
                    <div className="space-y-2">
                      <Label>Stock Actual *</Label>
                      <Input
                        type="number"
                        min="0"
                        value={batchForm.current_quantity}
                        onChange={(e) => setBatchForm({ ...batchForm, current_quantity: Math.max(0, parseInt(e.target.value) || 0) })}
                      />
                      {batchForm.current_quantity !== editingBatch.current_quantity && (
                        <p className="text-xs text-amber-600">
                          Antes: {editingBatch.current_quantity} → Nuevo: {batchForm.current_quantity}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Notas</Label>
                  <Textarea
                    value={batchForm.notes}
                    onChange={(e) => setBatchForm({ ...batchForm, notes: e.target.value })}
                    placeholder="Observaciones del lote..."
                    rows={2}
                  />
                </div>

                {/* Warehouse assignment section */}
                {batchForm.initial_quantity > 0 && warehouses.length > 0 && (() => {
                  // When editing, use the form's current_quantity; when creating, use initial_quantity
                  const maxDistributable = editingBatch ? batchForm.current_quantity : batchForm.initial_quantity;
                  return (
                  <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Warehouse className="h-4 w-4 text-primary" />
                      <Label className="text-sm font-semibold">Distribución por almacén</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Indica cuántas unidades de este lote van a cada almacén.
                      {editingBatch && maxDistributable !== batchForm.initial_quantity && (
                        <span className="block mt-0.5">Stock actual del lote: <strong>{maxDistributable}</strong> (de {batchForm.initial_quantity} iniciales)</span>
                      )}
                    </p>
                    <div className="space-y-2">
                      {warehouses.map((wh: any) => (
                        <div key={wh.id} className="flex items-center gap-2">
                          <span className="text-sm flex-1 truncate">{wh.name}</span>
                          <Input
                            type="number"
                            min={0}
                            value={warehouseQty[wh.id] || 0}
                            onChange={(e) => setWarehouseQty(prev => ({
                              ...prev,
                              [wh.id]: Math.max(0, parseInt(e.target.value) || 0)
                            }))}
                            className="h-8 w-24 text-sm text-center"
                          />
                        </div>
                      ))}
                      {(() => {
                        const total = Object.values(warehouseQty).reduce((s, v) => s + (v || 0), 0);
                        const over = total > maxDistributable;
                        const unassigned = maxDistributable - total;
                        return (
                          <div className="space-y-1 pt-1 border-t">
                            <div className={cn("flex justify-between text-xs", over ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                              <span>Total asignado:</span>
                              <span>{total} / {maxDistributable} {over && "⚠️ Se actualizará el stock del lote"}</span>
                            </div>
                            {!over && unassigned > 0 && (
                              <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span><strong>{unassigned}</strong> unidades sin asignar a ningún almacén</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  );
                })()}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button 
                  onClick={() => {
                    const totalWh = Object.values(warehouseQty).reduce((s, v) => s + (v || 0), 0);
                    const maxQty = editingBatch ? batchForm.current_quantity : batchForm.initial_quantity;
                    // If distribution exceeds current stock, auto-update current_quantity
                    const finalForm = { ...batchForm, id: editingBatch?.id };
                    if (totalWh > maxQty) {
                      finalForm.current_quantity = totalWh;
                      toast({ 
                        title: "Stock del lote actualizado", 
                        description: `Se actualizará el stock actual del lote de ${maxQty} a ${totalWh} para coincidir con la distribución.`,
                      });
                    }
                    batchMutation.mutate(finalForm);
                  }}
                  disabled={
                    !batchForm.product_id || 
                    !batchForm.batch_number || 
                    !batchForm.barcode || 
                    !batchForm.expiration_date ||
                    batchForm.initial_quantity <= 0 ||
                    batchMutation.isPending
                  }
                >
                  {batchMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Boxes className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{batches.length}</p>
                <p className="text-sm text-muted-foreground">Lotes totales</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={expiredBatches.length > 0 ? "border-l-4 border-l-destructive" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{expiredBatches.length}</p>
                <p className="text-sm text-muted-foreground">Caducados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={nearExpiryBatches.length > 0 ? "border-l-4 border-l-warning" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{nearExpiryBatches.length}</p>
                <p className="text-sm text-muted-foreground">Próx. a caducar</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Tag className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {Object.values(tagsPerBatch).reduce((a, b) => a + b, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Tags asignados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Batches Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código Barras</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Nº Lote</TableHead>
                <TableHead className="text-center">Caducidad</TableHead>
                <TableHead className="text-center">Cantidad</TableHead>
                <TableHead className="text-center">Tags</TableHead>
                {canEdit && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Cargando...
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredBatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {normalizedSearchTerm ? "Sin resultados para la búsqueda" : "No hay lotes registrados"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredBatches.map((batch) => {
                  const expStatus = getExpirationStatus(batch.expiration_date);
                  const tagCount = tagsPerBatch[batch.id] || 0;
                  
                  return (
                    <Fragment key={batch.id}>
                      <TableRow 
                        className={expStatus.status === "expired" ? "bg-destructive/5" : ""}
                      >
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Barcode className="h-3 w-3 text-muted-foreground" />
                            <span className="font-mono text-sm">{batch.barcode}</span>
                            {/^[a-f0-9]{8}-/.test(batch.barcode) && (
                              <Badge variant="destructive" className="text-[10px] px-1 py-0 ml-1">AUTO</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{batch.products?.name}</span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {batch.products?.sku}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{batch.batch_number}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm">
                              {format(parseISO(batch.expiration_date), "dd MMM yyyy", { locale: es })}
                            </span>
                            <Badge variant={expStatus.variant}>
                              {expStatus.label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={batch.current_quantity === 0 ? "destructive" : "default"}>
                            {batch.current_quantity} / {batch.initial_quantity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            variant="secondary" 
                            className="cursor-pointer hover:bg-secondary/80 transition-colors"
                            onClick={() => setSelectedBatchForTags({
                              id: batch.id,
                              batchNumber: batch.batch_number,
                              productName: batch.products?.name || "Producto"
                            })}
                          >
                            <Tag className="h-3 w-3 mr-1" />
                            {tagCount}
                          </Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => handleEdit(batch)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {isAdmin && (
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => deleteBatchMutation.mutate(batch.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                      {(() => {
                        const batchData = batchWarehouseStockMap[batch.id];
                        if (!batchData || batchData.length === 0 || batch.current_quantity <= 0) return null;
                        
                        return (
                          <TableRow className="bg-muted/20">
                            <TableCell colSpan={canEdit ? 7 : 6} className="py-1 px-6">
                              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                {batchData.map((bd) => (
                                  <span key={bd.warehouseId} className="inline-flex items-center gap-1">
                                    <Warehouse className="h-3 w-3" />
                                    {bd.warehouseName}: <span className="font-mono font-medium text-foreground">{bd.quantity}</span>
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })()}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog para ver tags del lote */}
      {selectedBatchForTags && (
        <BatchTagsDialog
          open={!!selectedBatchForTags}
          onOpenChange={(open) => !open && setSelectedBatchForTags(null)}
          batchId={selectedBatchForTags.id}
          batchNumber={selectedBatchForTags.batchNumber}
          productName={selectedBatchForTags.productName}
        />
      )}
    </div>
  );
}
