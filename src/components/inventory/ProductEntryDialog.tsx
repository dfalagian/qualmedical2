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
import { Trash2, Plus, ChevronsUpDown, Check, Link2, CalendarIcon, FileText, Printer } from "lucide-react";
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

  // Estado del reporte post-guardado
  const [showReport, setShowReport] = useState(false);
  const [savedReport, setSavedReport] = useState<{
    fecha: string;
    ordenCompra: string;
    numeroFactura: string;
    proveedor: string;
    almacen: string;
    items: EntryItem[];
  } | null>(null);

  const handleGeneratePDF = () => {
    if (!savedReport) return;
    const totalUnidades = savedReport.items.reduce((s, i) => s + i.cantidad, 0);
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Informe de Ingreso</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 32px; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          .subtitle { font-size: 12px; color: #555; margin-bottom: 20px; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 20px; }
          .meta-item { display: flex; gap: 6px; }
          .meta-label { font-weight: bold; color: #555; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th { background: #f3f4f6; text-align: left; padding: 6px 8px; border-bottom: 2px solid #ddd; font-size: 11px; }
          td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
          tr:last-child td { border-bottom: none; }
          .total { text-align: right; font-weight: bold; font-size: 13px; margin-top: 8px; }
          .footer { margin-top: 32px; font-size: 10px; color: #999; text-align: center; }
          @media print { body { padding: 16px; } }
        </style>
      </head>
      <body>
        <h1>Informe de Ingreso de Productos</h1>
        <p class="subtitle">QualMedical — Generado el ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}</p>
        <div class="meta">
          <div class="meta-item"><span class="meta-label">Fecha de ingreso:</span><span>${savedReport.fecha}</span></div>
          <div class="meta-item"><span class="meta-label">Almacén:</span><span>${savedReport.almacen}</span></div>
          <div class="meta-item"><span class="meta-label">Nº Factura:</span><span>${savedReport.numeroFactura || "—"}</span></div>
          <div class="meta-item"><span class="meta-label">Proveedor:</span><span>${savedReport.proveedor || "—"}</span></div>
          <div class="meta-item"><span class="meta-label">Orden de Compra:</span><span>${savedReport.ordenCompra || "—"}</span></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th>Lote</th>
              <th>Caducidad</th>
              <th style="text-align:right">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            ${savedReport.items.map(item => `
              <tr>
                <td style="font-family:monospace">${item.codigo}</td>
                <td>${item.producto}</td>
                <td style="font-family:monospace">${item.lote}</td>
                <td>${item.caducidad}</td>
                <td style="text-align:right;font-weight:bold">${item.cantidad}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <p class="total">Total unidades ingresadas: ${totalUnidades}</p>
        <p class="footer">Este documento es un comprobante de movimiento de inventario.</p>
        <script>window.onload = () => { window.print(); }</script>
      </body>
      </html>
    `);
    win.document.close();
  };

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

          // Sincronizar vía batch_warehouse_stock (el trigger se encarga de warehouse_stock, product_batches y products)
          if (item.batchId) {
            const { data: existingBws } = await (supabase as any)
              .from("batch_warehouse_stock")
              .select("id, quantity")
              .eq("batch_id", item.batchId)
              .eq("warehouse_id", formData.almacenId)
              .maybeSingle();

            if (existingBws) {
              await (supabase as any)
                .from("batch_warehouse_stock")
                .update({ quantity: existingBws.quantity + item.cantidad })
                .eq("id", existingBws.id);
            } else {
              await (supabase as any)
                .from("batch_warehouse_stock")
                .insert({
                  batch_id: item.batchId,
                  warehouse_id: formData.almacenId,
                  quantity: item.cantidad,
                });
            }
          }
        }

        // Registrar movimiento de inventario
        const { data: { user } } = await supabase.auth.getUser();
        
        // Determine location: use selected warehouse, fallback to product's warehouse
        let movementLocation = formData.almacenId || null;
        if (!movementLocation) {
          const { data: productData } = await supabase
            .from("products")
            .select("warehouse_id")
            .eq("id", item.productId)
            .single();
          movementLocation = productData?.warehouse_id || null;
        }
        // Final fallback: find "Almacén Principal"
        if (!movementLocation && almacenes.length > 0) {
          const principal = almacenes.find((a: any) => a.name.toLowerCase().includes("principal"));
          movementLocation = principal?.id || almacenes[0]?.id || null;
        }
        
        const { error: movError } = await supabase
          .from("inventory_movements")
          .insert({
            product_id: item.productId,
            batch_id: item.batchId || null,
            movement_type: "entrada",
            quantity: item.cantidad,
            reference_id: formData.ordenCompraId || null,
            reference_type: formData.ordenCompraId ? "purchase_order" : null,
            location: movementLocation,
            created_by: user?.id || null,
            created_at: entryDate.toISOString(),
            notes: formData.numeroFactura ? `Factura: ${formData.numeroFactura}` : `Ingreso de producto - Lote: ${item.lote}`
          });

        if (movError) {
          // El stock ya fue actualizado por el trigger SSOT al escribir en batch_warehouse_stock arriba.
          // Aquí solo registramos el fallo del movimiento de auditoría sin tocar products.current_stock
          // (hacerlo causaría doble suma).
          console.error("Error creating inventory_movement (stock ya aplicado vía SSOT):", movError);
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
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["product-batches"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock-map"] });
      queryClient.invalidateQueries({ queryKey: ["stock-by-warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders-for-entry"] });

      // Construir reporte antes de limpiar el estado
      const almacenNombre = almacenes.find(a => a.id === formData.almacenId)?.name || formData.almacenId;
      const proveedorNombre = proveedores.find(p => p.id === formData.proveedor)?.label || formData.proveedor;
      const ocNumero = formData.ordenCompraId === "sin_orden" ? "Sin orden"
        : ordenesCompra.find((oc: any) => oc.id === formData.ordenCompraId)?.order_number || formData.ordenCompraId;

      setSavedReport({
        fecha: format(entryDate, "dd/MM/yyyy", { locale: es }),
        ordenCompra: ocNumero || "",
        numeroFactura: formData.numeroFactura,
        proveedor: proveedorNombre || "",
        almacen: almacenNombre,
        items: [...items],
      });
      setShowReport(true);
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
    setShowReport(false);
    setSavedReport(null);
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

          {/* Reporte post-guardado */}
          {showReport && savedReport ? (
            <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
              <div className="flex items-center gap-2 text-green-700 font-semibold">
                <FileText className="h-5 w-5" />
                Ingreso guardado correctamente
              </div>

              {/* Datos del movimiento */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div><span className="text-muted-foreground">Fecha:</span> <span className="font-medium">{savedReport.fecha}</span></div>
                <div><span className="text-muted-foreground">Almacén:</span> <span className="font-medium">{savedReport.almacen}</span></div>
                <div><span className="text-muted-foreground">Nº Factura:</span> <span className="font-medium">{savedReport.numeroFactura || "—"}</span></div>
                <div><span className="text-muted-foreground">Proveedor:</span> <span className="font-medium">{savedReport.proveedor || "—"}</span></div>
                <div><span className="text-muted-foreground">Orden de Compra:</span> <span className="font-medium">{savedReport.ordenCompra || "—"}</span></div>
              </div>

              {/* Tabla resumen */}
              <div className="border rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Código</TableHead>
                      <TableHead className="text-xs">Producto</TableHead>
                      <TableHead className="text-xs">Lote</TableHead>
                      <TableHead className="text-xs">Caducidad</TableHead>
                      <TableHead className="text-xs text-right">Cantidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {savedReport.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.codigo}</TableCell>
                        <TableCell className="text-xs">{item.producto}</TableCell>
                        <TableCell className="font-mono text-xs">{item.lote}</TableCell>
                        <TableCell className="text-xs">{item.caducidad}</TableCell>
                        <TableCell className="text-xs text-right font-bold">{item.cantidad}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="text-sm text-right text-muted-foreground">
                Total unidades ingresadas: <span className="font-bold text-foreground">{savedReport.items.reduce((s, i) => s + i.cantidad, 0)}</span>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={handleGeneratePDF} className="gap-2">
                  <Printer className="h-4 w-4" />
                  Generar PDF
                </Button>
                <Button onClick={handleClose}>
                  Cerrar
                </Button>
              </div>
            </div>
          ) : (
            /* Botón Guardar normal */
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
          )}
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
