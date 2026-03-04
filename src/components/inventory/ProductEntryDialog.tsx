import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Trash2, Plus, ChevronsUpDown, Check, Link2, CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activityLogger";
import { NewBatchModal } from "./NewBatchModal";
import { QuickTagAssignment } from "./QuickTagAssignment";
interface EntryItem {
  id: string;
  productId: string;
  batchId?: string; // Si es lote existente
  codigo: string;
  producto: string;
  lote: string;
  caducidad: string;
  cantidad: number;
  isExistingBatch: boolean;
  assignedTagsCount?: number; // Contador de tags asignados
}

interface ProductEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductEntryDialog({ open, onOpenChange }: ProductEntryDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [entryDate, setEntryDate] = useState<Date>(new Date());

  // Form state para la línea de ingreso
  const [formData, setFormData] = useState({
    selectedProductId: "",
    selectedBatchId: "",
    codigo: "",
    producto: "",
    lote: "",
    caducidad: "",
    cantidad: 1,
    numeroFactura: "",
    proveedor: "",
    almacenId: "",
    ordenCompraId: "",
    isExistingBatch: false
  });

  // Estado para el combobox de productos
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  // Estado para el combobox de lotes
  const [batchSearchOpen, setBatchSearchOpen] = useState(false);

  // Estado para el combobox de proveedores
  const [proveedorSearchOpen, setProveedorSearchOpen] = useState(false);
  const [proveedorSearch, setProveedorSearch] = useState("");

  // Estado para el modal de nuevo lote
  const [newBatchModalOpen, setNewBatchModalOpen] = useState(false);

  // Estado para el modal de asignación de tag
  const [tagAssignmentOpen, setTagAssignmentOpen] = useState(false);
  const [tagAssignmentItem, setTagAssignmentItem] = useState<EntryItem | null>(null);

  // Lista de items ingresados
  const [items, setItems] = useState<EntryItem[]>([]);

  // Fetch proveedores (profiles + general_suppliers)
  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores-list-combined"],
    queryFn: async () => {
      const [profilesRes, generalRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, company_name").order("company_name"),
        supabase.from("general_suppliers").select("id, razon_social, nombre_comercial").eq("is_active", true).order("razon_social"),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (generalRes.error) throw generalRes.error;

      const registered = (profilesRes.data || []).map((p) => ({
        id: p.id,
        label: p.company_name || p.full_name,
        type: "registered" as const,
      }));
      const general = (generalRes.data || []).map((g) => ({
        id: g.id,
        label: g.nombre_comercial || g.razon_social,
        type: "general" as const,
      }));

      return [...registered, ...general].sort((a, b) => a.label.localeCompare(b.label));
    }
  });

  // Fetch almacenes
  const { data: almacenes = [] } = useQuery({
    queryKey: ["warehouses-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, code, name")
        .eq("is_active", true)
        .order("name");
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch órdenes de compra pendientes/en proceso (excluyendo las ya usadas en ingresos)
  const { data: ordenesCompra = [] } = useQuery({
    queryKey: ["purchase-orders-for-entry"],
    queryFn: async () => {
      // Fetch all potentially available purchase orders
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, status, supplier_id, supplier_type")
        .order("created_at", { ascending: false });
      
      if (error) throw error;

      // Filter out orders that already have inventory movements linked
      const { data: movementsData } = await supabase
        .from("inventory_movements")
        .select("reference_id")
        .eq("reference_type", "purchase_order")
        .not("reference_id", "is", null);
      
      const usedOrderIds = new Set((movementsData || []).map((m: any) => m.reference_id));
      const filtered = data.filter((o: any) => !usedOrderIds.has(o.id));

      // Fetch supplier names for each order
      const registeredIds = filtered.filter((o: any) => o.supplier_type !== "general").map((o: any) => o.supplier_id);
      const generalIds = filtered.filter((o: any) => o.supplier_type === "general").map((o: any) => o.supplier_id);

      let profilesMap: Record<string, any> = {};
      let generalMap: Record<string, any> = {};

      if (registeredIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, company_name")
          .in("id", registeredIds);
        for (const p of profiles || []) profilesMap[p.id] = p;
      }
      if (generalIds.length > 0) {
        const { data: gs } = await supabase
          .from("general_suppliers")
          .select("id, razon_social, nombre_comercial")
          .in("id", generalIds);
        for (const g of gs || []) generalMap[g.id] = g;
      }

      return filtered.map((o: any) => {
        const isGeneral = o.supplier_type === "general";
        const supplier = isGeneral ? generalMap[o.supplier_id] : profilesMap[o.supplier_id];
        return {
          ...o,
          profiles: isGeneral
            ? { full_name: supplier?.nombre_comercial || supplier?.razon_social || "", company_name: supplier?.nombre_comercial || supplier?.razon_social || "" }
            : { full_name: supplier?.full_name || "", company_name: supplier?.company_name || "" },
        };
      });
    }
  });

  // Set default warehouse to "Almacén Principal" when data loads
  useEffect(() => {
    if (almacenes.length > 0 && !formData.almacenId) {
      const principal = almacenes.find(a => a.name.toLowerCase().includes("principal") || a.code === "PRINCIPAL");
      if (principal) {
        setFormData(prev => ({ ...prev, almacenId: principal.id }));
      } else {
        // If no "principal" found, use first warehouse
        setFormData(prev => ({ ...prev, almacenId: almacenes[0].id }));
      }
    }
  }, [almacenes]);

  // Fetch productos existentes
  const { data: productos = [] } = useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, barcode")
        .eq("is_active", true)
        .order("name");
      
      if (error) throw error;
      return data;
    }
  });

  // Filtrar productos según búsqueda
  const filteredProducts = useMemo(() => {
    if (!productSearch) return productos;
    const search = productSearch.toLowerCase();
    return productos.filter(p => 
      p.name.toLowerCase().includes(search) ||
      p.sku.toLowerCase().includes(search) ||
      (p.barcode && p.barcode.toLowerCase().includes(search))
    );
  }, [productos, productSearch]);

  // Fetch lotes del producto seleccionado
  const { data: productBatches = [] } = useQuery({
    queryKey: ["product-batches", formData.selectedProductId],
    queryFn: async () => {
      if (!formData.selectedProductId) return [];
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, batch_number, expiration_date, current_quantity")
        .eq("product_id", formData.selectedProductId)
        .eq("is_active", true)
        .order("expiration_date", { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!formData.selectedProductId
  });

  // Manejar selección de producto
  const handleSelectProduct = (productId: string) => {
    const product = productos.find(p => p.id === productId);
    if (product) {
      setFormData(prev => ({
        ...prev,
        selectedProductId: product.id,
        selectedBatchId: "",
        codigo: product.barcode || product.sku,
        producto: product.name,
        lote: "",
        caducidad: "",
        isExistingBatch: false
      }));
    }
    setProductSearchOpen(false);
    setProductSearch("");
  };

  // Manejar selección de lote existente
  const handleSelectBatch = (batchId: string) => {
    if (batchId === "new") {
      // Abrir modal para crear nuevo lote
      setBatchSearchOpen(false);
      setNewBatchModalOpen(true);
    } else {
      const batch = productBatches.find(b => b.id === batchId);
      if (batch) {
        setFormData(prev => ({
          ...prev,
          selectedBatchId: batch.id,
          lote: batch.batch_number,
          caducidad: batch.expiration_date,
          isExistingBatch: true
        }));
      }
      setBatchSearchOpen(false);
    }
  };

  // Manejar confirmación del nuevo lote desde el modal
  const handleNewBatchConfirm = (batchNumber: string, expirationDate: string) => {
    setFormData(prev => ({
      ...prev,
      selectedBatchId: "",
      lote: batchNumber,
      caducidad: expirationDate,
      isExistingBatch: false
    }));
  };

  const handleAddItem = () => {
    if (!formData.selectedProductId || !formData.lote || !formData.caducidad || formData.cantidad <= 0) {
      toast({
        title: "Campos incompletos",
        description: "Por favor selecciona un Producto y completa Lote, Caducidad y Cantidad",
        variant: "destructive"
      });
      return;
    }

    const newItem: EntryItem = {
      id: crypto.randomUUID(),
      productId: formData.selectedProductId,
      batchId: formData.isExistingBatch ? formData.selectedBatchId : undefined,
      codigo: formData.codigo,
      producto: formData.producto,
      lote: formData.lote,
      caducidad: formData.caducidad,
      cantidad: formData.cantidad,
      isExistingBatch: formData.isExistingBatch
    };

    setItems([...items, newItem]);

    // Limpiar campos de producto pero mantener factura y proveedor
    setFormData(prev => ({
      ...prev,
      selectedProductId: "",
      selectedBatchId: "",
      codigo: "",
      producto: "",
      lote: "",
      caducidad: "",
      cantidad: 1,
      isExistingBatch: false
    }));

    toast({
      title: "Producto agregado",
      description: `${newItem.producto} x${newItem.cantidad} agregado a la lista`
    });
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  // Mutation para guardar todo el ingreso
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (items.length === 0) {
        throw new Error("No hay productos para guardar");
      }

      for (const item of items) {
        if (item.isExistingBatch && item.batchId) {
          // Si es lote existente, solo actualizar cantidad
          const { data: currentBatch } = await supabase
            .from("product_batches")
            .select("current_quantity, initial_quantity")
            .eq("id", item.batchId)
            .single();

          await supabase
            .from("product_batches")
            .update({
              current_quantity: (currentBatch?.current_quantity || 0) + item.cantidad,
              initial_quantity: (currentBatch?.initial_quantity || 0) + item.cantidad
            })
            .eq("id", item.batchId);
        } else {
          // Crear nuevo lote
          const { data: newBatch, error: batchError } = await supabase
            .from("product_batches")
            .insert({
              product_id: item.productId,
              batch_number: item.lote,
              barcode: item.codigo,
              expiration_date: item.caducidad,
              initial_quantity: item.cantidad,
              current_quantity: item.cantidad,
              notes: formData.numeroFactura ? `Factura: ${formData.numeroFactura}` : null
            })
            .select("id")
            .single();

          if (batchError) throw batchError;
          // Store the new batch ID for the movement record
          item.batchId = newBatch?.id;
        }

        // Actualizar warehouse_id del producto al almacén seleccionado
        if (formData.almacenId) {
          await supabase
            .from("products")
            .update({ warehouse_id: formData.almacenId })
            .eq("id", item.productId);

          // Sincronizar warehouse_stock (upsert)
          const { data: existingWs } = await supabase
            .from("warehouse_stock")
            .select("id, current_stock")
            .eq("product_id", item.productId)
            .eq("warehouse_id", formData.almacenId)
            .maybeSingle();

          if (existingWs) {
            await supabase
              .from("warehouse_stock")
              .update({ current_stock: existingWs.current_stock + item.cantidad })
              .eq("id", existingWs.id);
          } else {
            await supabase
              .from("warehouse_stock")
              .insert({
                product_id: item.productId,
                warehouse_id: formData.almacenId,
                current_stock: item.cantidad,
              });
          }
        }

        // Registrar movimiento de inventario
        const { data: { user } } = await supabase.auth.getUser();
        const { error: movError } = await supabase
          .from("inventory_movements")
          .insert({
            product_id: item.productId,
            batch_id: item.batchId || null,
            movement_type: "entrada",
            quantity: item.cantidad,
            reference_id: formData.ordenCompraId || null,
            reference_type: formData.ordenCompraId ? "purchase_order" : null,
            location: formData.almacenId || null,
            created_by: user?.id || null,
            created_at: entryDate.toISOString(),
            notes: formData.numeroFactura ? `Factura: ${formData.numeroFactura}` : `Ingreso de producto - Lote: ${item.lote}`
          });

        if (movError) {
          console.error("Error creating inventory_movement:", movError);
          const { data: currentProduct } = await supabase
            .from("products")
            .select("current_stock")
            .eq("id", item.productId)
            .single();

          await supabase
            .from("products")
            .update({
              current_stock: (currentProduct?.current_stock || 0) + item.cantidad
            })
            .eq("id", item.productId);
        }

        // Si hay OC vinculada, actualizar quantity_received en purchase_order_items
        if (formData.ordenCompraId) {
          const { data: poItem } = await supabase
            .from("purchase_order_items")
            .select("id, quantity_received")
            .eq("purchase_order_id", formData.ordenCompraId)
            .eq("product_id", item.productId)
            .maybeSingle();

          if (poItem) {
            await supabase
              .from("purchase_order_items")
              .update({
                quantity_received: (poItem.quantity_received || 0) + item.cantidad
              })
              .eq("id", poItem.id);
          }
        }
      }
    },
    onSuccess: () => {
      for (const item of items) {
        logActivity({
          section: "inventario",
          action: "ingreso",
          entityType: "Producto",
          entityName: item.producto,
          details: { items_count: item.cantidad, note: `Lote: ${item.lote}` },
        });
      }
      toast({
        title: "Ingreso guardado",
        description: `Se guardaron ${items.length} productos correctamente`
      });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["product-batches"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock-map"] });
      queryClient.invalidateQueries({ queryKey: ["stock-by-warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders-for-entry"] });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error al guardar",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleClose = () => {
    setFormData({
      selectedProductId: "",
      selectedBatchId: "",
      codigo: "",
      producto: "",
      lote: "",
      caducidad: "",
      cantidad: 1,
      numeroFactura: "",
      proveedor: "",
      almacenId: "",
      ordenCompraId: "",
      isExistingBatch: false
    });
    setItems([]);
    setEntryDate(new Date());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-bold">Ingreso Producto</DialogTitle>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-sm font-normal">
                <CalendarIcon className="h-4 w-4" />
                Fecha: {format(entryDate, "dd/MM/yyyy", { locale: es })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={entryDate}
                onSelect={(d) => d && setEntryDate(d)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </DialogHeader>

        <div className="space-y-4">
          {/* Primera fila: Producto (combobox), Código (readonly), Lote, Caducidad, Cantidad */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* Selector de Producto con búsqueda */}
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Producto</Label>
              <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={productSearchOpen}
                    className="w-full h-9 justify-between font-normal"
                  >
                    {formData.producto || "Buscar producto..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="Buscar por nombre, código o SKU..." 
                      value={productSearch}
                      onValueChange={setProductSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No se encontraron productos.</CommandEmpty>
                      <CommandGroup className="max-h-[200px] overflow-auto">
                        {filteredProducts.map((product) => (
                          <CommandItem
                            key={product.id}
                            value={product.id}
                            onSelect={handleSelectProduct}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.selectedProductId === product.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{product.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {product.barcode || product.sku}
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

            {/* Código - solo lectura, se llena automáticamente */}
            <div className="space-y-1">
              <Label className="text-xs">Código</Label>
              <Input
                value={formData.codigo}
                readOnly
                placeholder="Código"
                className="h-9 bg-muted"
              />
            </div>

            {/* Selector de Lote con opción de nuevo o existente */}
            <div className="space-y-1">
              <Label className="text-xs">Lote</Label>
              <Popover open={batchSearchOpen} onOpenChange={setBatchSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={batchSearchOpen}
                    className="w-full h-9 justify-between font-normal"
                    disabled={!formData.selectedProductId}
                  >
                    {formData.lote || "Seleccionar lote..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0 bg-popover" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar lote..." />
                    <CommandList>
                      <CommandEmpty>No se encontraron lotes</CommandEmpty>
                      <CommandGroup heading="Lotes existentes">
                        {productBatches.map((batch) => (
                          <CommandItem
                            key={batch.id}
                            value={batch.id}
                            onSelect={handleSelectBatch}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.selectedBatchId === batch.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col flex-1">
                              <span className="font-medium">{batch.batch_number}</span>
                              <span className="text-xs text-muted-foreground">
                                Cad: {batch.expiration_date} | Stock: {batch.current_quantity}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <CommandGroup>
                        <CommandItem
                          value="new"
                          onSelect={handleSelectBatch}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Crear lote nuevo
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Caducidad</Label>
              <Input
                type="date"
                value={formData.caducidad}
                onChange={(e) => setFormData({ ...formData, caducidad: e.target.value })}
                className="h-9"
                disabled={formData.isExistingBatch}
              />
            </div>
          </div>

          {/* Segunda fila: Cantidad, Nº Factura, Proveedor, botón Ingresar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Cantidad</Label>
              <Input
                type="number"
                min="1"
                value={formData.cantidad}
                onChange={(e) => setFormData({ ...formData, cantidad: parseInt(e.target.value) || 1 })}
                className="h-9"
              />
            </div>
          </div>

          {/* Tercera fila: Orden de Compra, Nº Factura, Proveedor, Almacén, botón Ingresar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Orden de Compra</Label>
              <Popover modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="h-9 w-full justify-between text-xs font-normal"
                  >
                    <span className="truncate">
                      {formData.ordenCompraId === "sin_orden"
                        ? "Sin orden"
                        : (() => {
                            const selected = ordenesCompra.find((oc: any) => oc.id === formData.ordenCompraId);
                            if (!selected) return "Seleccionar OC...";
                            return selected.order_number;
                          })()}
                    </span>
                    <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[340px] p-0 z-[9999]" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar OC..." />
                    <CommandList>
                      <CommandEmpty>No se encontró ninguna OC.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="sin_orden"
                          onSelect={() => setFormData({ ...formData, ordenCompraId: "sin_orden" })}
                        >
                          <Check className={cn("mr-2 h-3 w-3", formData.ordenCompraId === "sin_orden" ? "opacity-100" : "opacity-0")} />
                          Sin orden
                        </CommandItem>
                        {ordenesCompra.map((oc: any) => (
                            <CommandItem
                              key={oc.id}
                              value={oc.order_number}
                              onSelect={() => setFormData({ ...formData, ordenCompraId: oc.id })}
                            >
                              <Check className={cn("mr-2 h-3 w-3", formData.ordenCompraId === oc.id ? "opacity-100" : "opacity-0")} />
                              <span className="text-xs">{oc.order_number}</span>
                            </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nº Factura</Label>
              <Input
                value={formData.numeroFactura}
                onChange={(e) => setFormData({ ...formData, numeroFactura: e.target.value.toUpperCase() })}
                placeholder="Número de factura"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Proveedor</Label>
              <Popover open={proveedorSearchOpen} onOpenChange={setProveedorSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={proveedorSearchOpen}
                    className="w-full h-9 justify-between font-normal"
                  >
                    <span className="truncate">
                      {formData.proveedor
                        ? proveedores.find((p) => p.id === formData.proveedor)?.label || "Seleccionar..."
                        : "Buscar proveedor..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar proveedor..."
                      value={proveedorSearch}
                      onValueChange={setProveedorSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No se encontró proveedor.</CommandEmpty>
                      <CommandGroup className="max-h-[200px] overflow-auto">
                        {proveedores
                          .filter((p) =>
                            !proveedorSearch || p.label.toLowerCase().includes(proveedorSearch.toLowerCase())
                          )
                          .map((p) => (
                            <CommandItem
                              key={`${p.type}-${p.id}`}
                              value={p.id}
                              onSelect={(val) => {
                                setFormData((prev) => ({ ...prev, proveedor: val }));
                                setProveedorSearchOpen(false);
                                setProveedorSearch("");
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  formData.proveedor === p.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="truncate">{p.label}</span>
                              {p.type === "general" && (
                                <span className="ml-auto text-[10px] text-muted-foreground">Oficial</span>
                              )}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Almacén</Label>
              <Select
                value={formData.almacenId}
                onValueChange={(value) => setFormData({ ...formData, almacenId: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar almacén..." />
                </SelectTrigger>
                <SelectContent>
                  {almacenes.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Button onClick={handleAddItem} className="w-full h-9">
                <Plus className="h-4 w-4 mr-1" />
                Ingresar
              </Button>
            </div>
          </div>

          {/* Tabla de productos ingresados */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Código</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-[100px]">Lote</TableHead>
                  <TableHead className="w-[110px]">Caducidad</TableHead>
                  <TableHead className="w-[80px] text-right">Cantidad</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No hay productos ingresados. Usa el formulario de arriba para agregar.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.codigo}</TableCell>
                      <TableCell>{item.producto}</TableCell>
                      <TableCell className="font-mono text-xs">{item.lote}</TableCell>
                      <TableCell>{item.caducidad}</TableCell>
                      <TableCell className="text-right font-medium">{item.cantidad}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Asignar Tag RFID"
                            onClick={() => {
                              setTagAssignmentItem(item);
                              setTagAssignmentOpen(true);
                            }}
                          >
                            <Link2 className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Botón Guardar */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button 
              onClick={() => saveMutation.mutate()}
              disabled={items.length === 0 || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Modal para crear nuevo lote */}
      <NewBatchModal
        open={newBatchModalOpen}
        onOpenChange={setNewBatchModalOpen}
        productName={formData.producto}
        onConfirm={handleNewBatchConfirm}
      />

      {/* Modal para asignar tag RFID */}
      {tagAssignmentItem && (
        <QuickTagAssignment
          open={tagAssignmentOpen}
          onOpenChange={(open) => {
            setTagAssignmentOpen(open);
            if (!open) setTagAssignmentItem(null);
          }}
          productId={tagAssignmentItem.productId}
          productName={tagAssignmentItem.producto}
          batchId={tagAssignmentItem.batchId}
          batchNumber={tagAssignmentItem.lote}
          mode="product-entry"
          quantity={tagAssignmentItem.cantidad}
        />
      )}
    </Dialog>
  );
}
