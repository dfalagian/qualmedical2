import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  searchTerm: string;
  canEdit: boolean;
  isAdmin: boolean;
  products: Product[];
}

export function BatchManagement({ searchTerm: externalSearchTerm, canEdit, isAdmin, products }: BatchManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
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
    notes: ""
  });

  // Combine external and local search terms
  const searchTerm = localSearchTerm || externalSearchTerm;

  // Fetch batches
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["product_batches"],
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

  // Fetch warehouse stock breakdown per product
  const { data: warehouseStockMap = {} } = useQuery({
    queryKey: ["warehouse_stock_by_product"],
    queryFn: async () => {
      const { data: warehouses, error: whErr } = await supabase
        .from("warehouses")
        .select("id, name, code")
        .eq("is_active", true);
      if (whErr) throw whErr;

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
    }
  });

  // Create/Update batch
  const batchMutation = useMutation({
    mutationFn: async (batch: typeof batchForm & { id?: string }) => {
      if (batch.id) {
        // Obtener el lote actual para calcular la diferencia de stock
        const { data: currentBatch, error: fetchError } = await supabase
          .from("product_batches")
          .select("initial_quantity, product_id")
          .eq("id", batch.id)
          .single();
        
        if (fetchError) throw fetchError;
        
        const quantityDifference = batch.initial_quantity - (currentBatch?.initial_quantity || 0);
        
        const { error } = await supabase
          .from("product_batches")
          .update({
            product_id: batch.product_id,
            batch_number: batch.batch_number,
            barcode: batch.barcode,
            expiration_date: batch.expiration_date,
            initial_quantity: batch.initial_quantity,
            current_quantity: batch.initial_quantity,
            notes: batch.notes || null
          })
          .eq("id", batch.id);
        if (error) throw error;

        // Si cambió la cantidad, actualizar el stock del producto
        if (quantityDifference !== 0) {
          const { data: product, error: productFetchError } = await supabase
            .from("products")
            .select("current_stock")
            .eq("id", batch.product_id)
            .single();
          
          if (productFetchError) throw productFetchError;
          
          const newStock = Math.max(0, (product?.current_stock || 0) + quantityDifference);
          
          const { error: productError } = await supabase
            .from("products")
            .update({ 
              current_stock: newStock,
              updated_at: new Date().toISOString()
            })
            .eq("id", batch.product_id);
          
          if (productError) throw productError;
        }
      } else {
        // Crear nuevo lote
        const { error } = await supabase
          .from("product_batches")
          .insert({
            product_id: batch.product_id,
            batch_number: batch.batch_number,
            barcode: batch.barcode,
            expiration_date: batch.expiration_date,
            initial_quantity: batch.initial_quantity,
            current_quantity: batch.initial_quantity,
            notes: batch.notes || null
          });
        if (error) throw error;

        // Actualizar el stock del producto sumando la cantidad del nuevo lote
        const { data: product, error: productFetchError } = await supabase
          .from("products")
          .select("current_stock")
          .eq("id", batch.product_id)
          .single();
        
        if (productFetchError) throw productFetchError;
        
        const newStock = (product?.current_stock || 0) + batch.initial_quantity;
        
        const { error: productError } = await supabase
          .from("products")
          .update({ 
            current_stock: newStock,
            updated_at: new Date().toISOString()
          })
          .eq("id", batch.product_id);
        
        if (productError) throw productError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product_batches"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDialogOpen(false);
      setEditingBatch(null);
      resetForm();
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
      const { error } = await supabase
        .from("product_batches")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product_batches"] });
      toast({
        title: "Lote eliminado",
        description: "El lote fue eliminado correctamente."
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
      notes: ""
    });
  };

  const handleEdit = (batch: ProductBatch) => {
    setEditingBatch(batch);
    setBatchForm({
      product_id: batch.product_id,
      batch_number: batch.batch_number,
      barcode: batch.barcode,
      expiration_date: batch.expiration_date,
      initial_quantity: batch.initial_quantity,
      notes: batch.notes || ""
    });
    setDialogOpen(true);
  };

  const getExpirationStatus = (expirationDate: string) => {
    const days = differenceInDays(parseISO(expirationDate), new Date());
    if (days < 0) return { status: "expired", label: "Caducado", variant: "destructive" as const };
    if (days <= 30) return { status: "critical", label: `${days} días`, variant: "destructive" as const };
    if (days <= 90) return { status: "warning", label: `${days} días`, variant: "secondary" as const };
    return { status: "ok", label: `${days} días`, variant: "outline" as const };
  };

  const filteredBatches = batches.filter(b =>
    b.batch_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.products?.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (b.products?.sku?.toLowerCase() || "").includes(searchTerm.toLowerCase())
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
              }
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Lote
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-md">
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

                <div className="grid grid-cols-2 gap-4">
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
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button 
                  onClick={() => batchMutation.mutate({ 
                    ...batchForm, 
                    id: editingBatch?.id 
                  })}
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
                    No hay lotes registrados
                  </TableCell>
                </TableRow>
              ) : (
                filteredBatches.map((batch) => {
                  const expStatus = getExpirationStatus(batch.expiration_date);
                  const tagCount = tagsPerBatch[batch.id] || 0;
                  const whBreakdown = warehouseStockMap[batch.product_id] || [];
                  
                  return (
                    <Fragment key={batch.id}>
                      <TableRow 
                        className={expStatus.status === "expired" ? "bg-destructive/5" : ""}
                      >
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Barcode className="h-3 w-3 text-muted-foreground" />
                            <span className="font-mono text-sm">{batch.barcode}</span>
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
                      {whBreakdown.length > 1 && (
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={canEdit ? 7 : 6} className="py-1 px-6">
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              {whBreakdown.map((wb) => (
                                <span key={wb.code} className="inline-flex items-center gap-1">
                                  <Warehouse className="h-3 w-3" />
                                  {wb.name}: <span className="font-mono font-medium text-foreground">{wb.stock}</span>
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
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
