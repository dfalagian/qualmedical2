import React, { useState, useMemo, useEffect, useRef } from "react";
import { logActivity } from "@/lib/activityLogger";
import { parseXmlContent } from "@/lib/cfdiParser";
import { useAuth } from "@/hooks/useAuth";
import { isIvaExempt } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Trash2, FileText, History, Building2, User, CalendarIcon, Check, ChevronsUpDown, Upload, Plus } from "lucide-react";
import { ProductCombobox } from "./ProductCombobox";
import { openPurchaseOrderPrint } from "./purchaseOrderHtmlPrint";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface SelectedProduct {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  savedPrice: number;
  manualPrice: number | null;
  total: number;
  category: string | null;
  notes: string;
  unitsPerBox: number | null;
}

const IVA_RATE = 0.16;

// Renglón del XML pendiente de vincular con un producto del catálogo
interface XmlRow {
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  matchedProductId: string | null;
}

interface CreateSupplierOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateSupplierOrderDialog = ({
  open,
  onOpenChange,
}: CreateSupplierOrderDialogProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [supplierType, setSupplierType] = useState<"registered" | "general" | "">("");
  const [orderNumber, setOrderNumber] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [xmlRows, setXmlRows] = useState<XmlRow[]>([]);
  const [productosLocales, setProductosLocales] = useState<any[]>([]);
  const [crearIdx, setCrearIdx] = useState<number | null>(null);
  const [nuevoProd, setNuevoProd] = useState({ name: "", sku: "", category: "Insumos", tax_rate: 16, price: 0 });
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
  const [supplierPopoverOpen, setSupplierPopoverOpen] = useState(false);

  // Generate next order number automatically
  const { data: nextOrderNumber } = useQuery({
    queryKey: ["next_qual_order_number"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("order_number")
        .ilike("order_number", "QUAL%")
        .order("order_number", { ascending: false })
        .limit(1);
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        return "QUAL2026-001";
      }
      
      // Extract the number from the last order (e.g., QUAL2026-005 -> 5)
      const lastOrder = data[0].order_number;
      const match = lastOrder.match(/QUAL(\d{4})-(\d+)/);
      
      if (match) {
        const year = match[1];
        const lastNum = parseInt(match[2], 10);
        const nextNum = String(lastNum + 1).padStart(3, "0");
        return `QUAL${year}-${nextNum}`;
      }
      
      return "QUAL2026-001";
    },
    enabled: open,
  });

  // Set order number when dialog opens or next number is fetched
  useEffect(() => {
    if (open && nextOrderNumber && !orderNumber) {
      setOrderNumber(nextOrderNumber);
    }
  }, [open, nextOrderNumber]);

  // Fetch registered suppliers (profiles)
  const { data: registeredSuppliers } = useQuery({
    queryKey: ["suppliers_for_order_dialog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name, rfc");
      if (error) throw error;
      return data;
    },
  });

  // Fetch general suppliers
  const { data: generalSuppliers } = useQuery({
    queryKey: ["general_suppliers_for_order"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("general_suppliers")
        .select("id, rfc, razon_social, nombre_comercial")
        .eq("is_active", true)
        .order("razon_social");
      if (error) throw error;
      return data;
    },
  });

  // Fetch products from inventory
  const { data: products } = useQuery({
    queryKey: ["products_for_order"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, unit_price, current_stock, price_type_1, brand, category")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Catálogo + productos creados al vuelo (para que aparezcan de inmediato)
  const allProducts = useMemo(
    () => [...(products || []), ...productosLocales],
    [products, productosLocales]
  );

  // Crear un producto nuevo desde un renglón del XML y vincularlo
  const crearProducto = async () => {
    if (!nuevoProd.name.trim() || !nuevoProd.sku.trim()) {
      toast.error("Nombre y SKU son obligatorios."); return;
    }
    const { data, error } = await supabase.from("products").insert({
      sku: nuevoProd.sku.trim().toUpperCase(),
      name: nuevoProd.name.trim(),
      category: nuevoProd.category || null,
      unit: "pieza",
      price_type_1: nuevoProd.price || null,
      tax_rate: nuevoProd.tax_rate ?? 16,
      minimum_stock: 0,
      current_stock: 0,
      is_active: true,
      catalog_only: false,
      rfid_required: false,
    }).select("id, name, sku, unit_price, current_stock, price_type_1, brand, category").single();
    if (error) { toast.error("No se pudo crear: " + error.message); return; }
    setProductosLocales((p) => [...p, data]);
    if (crearIdx != null) setXmlRowProduct(crearIdx, data.id);
    queryClient.invalidateQueries({ queryKey: ["products_for_order"] });
    toast.success(`Producto "${data.name}" creado y vinculado.`);
    setCrearIdx(null);
  };

  const handleAddProduct = (
    product: { id: string; name: string; sku: string; unit_price: number | null; category?: string | null },
    quantity: number,
    savedPrice: number,
    manualPrice: number | null
  ) => {
    const exists = selectedProducts.find((p) => p.id === product.id);
    if (exists) {
      toast.error("Este producto ya está en la lista");
      return;
    }

    const effectivePrice = manualPrice ?? savedPrice;
    const total = effectivePrice * quantity;

    setSelectedProducts([
      ...selectedProducts,
      {
        id: product.id,
        name: product.name,
        sku: product.sku,
        quantity,
        unitPrice: effectivePrice,
        savedPrice,
        manualPrice,
        total,
        category: product.category || null,
        notes: "Pieza",
        unitsPerBox: null,
      },
    ]);
  };

  // ---- Cargar orden desde un XML (CFDI) ----------------------------------
  const xmlInputRef = useRef<HTMLInputElement>(null);

  const normalizeMatch = (s: string) =>
    (s || "").toLowerCase().replace(/\s+/g, "").replace(/\./g, "").replace(/\//g, "").trim();

  const handleXmlFile = async (file: File) => {
    try {
      const text = await file.text();
      const cfdi = parseXmlContent(text);

      const rfc = (cfdi.emisor_rfc || "").toUpperCase().trim();
      const reg = registeredSuppliers?.find((s: any) => (s.rfc || "").toUpperCase().trim() === rfc);
      const gen = generalSuppliers?.find((s: any) => (s.rfc || "").toUpperCase().trim() === rfc);
      if (reg) { setSelectedSupplier(reg.id); setSupplierType("registered"); }
      else if (gen) { setSelectedSupplier(gen.id); setSupplierType("general"); }
      else {
        toast.warning(`Proveedor no encontrado (RFC ${rfc} · ${cfdi.emisor_nombre}). Selecciónalo o créalo manualmente.`);
      }

      // TODOS los conceptos van a la lista de emparejado (auto-match por nombre)
      const catalog = allProducts;
      const rows: XmlRow[] = cfdi.items.map((it) => {
        const target = normalizeMatch(it.descripcion);
        const prod = catalog.find((p: any) => normalizeMatch(p.name) === target);
        return {
          descripcion: it.descripcion,
          cantidad: it.cantidad || 1,
          valor_unitario: Number(it.valor_unitario) || 0,
          matchedProductId: prod?.id ?? null,
        };
      });
      setXmlRows(rows);
      setDescription(`Importado de XML — Factura ${cfdi.folio} · UUID ${cfdi.uuid}`);

      const auto = rows.filter((r) => r.matchedProductId).length;
      toast.success(`XML cargado: ${cfdi.items.length} concepto(s), ${auto} emparejado(s) automáticamente. Vincula los faltantes y agrégalos a la orden.`);
    } catch (e: any) {
      toast.error("No se pudo leer el XML: " + (e.message || "archivo inválido"));
    }
  };

  // Vincular un renglón del XML a un producto del catálogo
  const setXmlRowProduct = (index: number, productId: string) => {
    setXmlRows((rows) => rows.map((r, i) => (i === index ? { ...r, matchedProductId: productId } : r)));
  };

  // Pasar a la orden los renglones ya vinculados (consolidando por producto)
  const agregarXmlAlaOrden = () => {
    const catalog = allProducts;
    const matched = xmlRows.filter((r) => r.matchedProductId);
    if (matched.length === 0) { toast.error("Vincula al menos un producto con el catálogo."); return; }
    const map = new Map<string, SelectedProduct>();
    for (const p of selectedProducts) map.set(p.id, { ...p });
    for (const r of matched) {
      const prod = catalog.find((p: any) => p.id === r.matchedProductId);
      if (!prod) continue;
      const savedPrice = prod.price_type_1 != null ? Number(prod.price_type_1) : (prod.unit_price ?? 0);
      const manualPrice = r.valor_unitario || 0;
      const ex = map.get(prod.id);
      if (ex) {
        ex.quantity += r.cantidad;
        ex.total = (ex.manualPrice ?? ex.savedPrice) * ex.quantity;
      } else {
        const effective = manualPrice || savedPrice;
        map.set(prod.id, {
          id: prod.id, name: prod.name, sku: prod.sku,
          quantity: r.cantidad,
          unitPrice: effective, savedPrice, manualPrice,
          total: effective * r.cantidad,
          category: prod.category || null,
          notes: "Pieza", unitsPerBox: null,
        });
      }
    }
    setSelectedProducts(Array.from(map.values()));
    const restantes = xmlRows.filter((r) => !r.matchedProductId);
    setXmlRows(restantes);
    toast.success(`${matched.length} producto(s) agregado(s) a la orden.` + (restantes.length ? ` Quedan ${restantes.length} sin vincular.` : ""));
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter((p) => p.id !== productId));
  };

  const updateProductQuantity = (productId: string, quantity: number) => {
    setSelectedProducts(
      selectedProducts.map((p) => {
        if (p.id === productId) {
          const effectivePrice = p.manualPrice ?? p.savedPrice;
          const total = effectivePrice * quantity;
          return { ...p, quantity, total };
        }
        return p;
      })
    );
  };

  const updateProductManualPrice = (productId: string, manualPriceStr: string) => {
    const manualPrice = manualPriceStr.trim() === "" ? null : parseFloat(manualPriceStr) || 0;
    setSelectedProducts(
      selectedProducts.map((p) => {
        if (p.id === productId) {
          const effectivePrice = manualPrice ?? p.savedPrice;
          const total = effectivePrice * p.quantity;
          return { ...p, manualPrice, unitPrice: effectivePrice, total };
        }
        return p;
      })
    );
  };

  const updateProductNotes = (productId: string, notes: string) => {
    setSelectedProducts(
      selectedProducts.map((p) => p.id === productId ? { ...p, notes, unitsPerBox: notes === "Pieza" ? null : p.unitsPerBox } : p)
    );
  };

  const updateProductUnitsPerBox = (productId: string, value: string) => {
    const units = value.trim() === "" ? null : Math.max(1, parseInt(value) || 1);
    setSelectedProducts(
      selectedProducts.map((p) => p.id === productId ? { ...p, unitsPerBox: units } : p)
    );
  };

  const subtotal = useMemo(() => {
    return selectedProducts.reduce((sum, p) => {
      const effectivePrice = p.manualPrice ?? p.savedPrice;
      return sum + effectivePrice * p.quantity;
    }, 0);
  }, [selectedProducts]);

  const ivaTotal = useMemo(() => {
    return selectedProducts.reduce((sum, p) => {
      if (isIvaExempt(p.category)) return sum;
      const effectivePrice = p.manualPrice ?? p.savedPrice;
      return sum + effectivePrice * p.quantity * IVA_RATE;
    }, 0);
  }, [selectedProducts]);

  const total = subtotal + ivaTotal;

  const selectedSupplierData = useMemo(() => {
    if (supplierType === "registered") {
      const supplier = registeredSuppliers?.find((s) => s.id === selectedSupplier);
      return supplier ? {
        name: supplier.company_name || supplier.full_name,
        rfc: supplier.rfc
      } : null;
    } else if (supplierType === "general") {
      const supplier = generalSuppliers?.find((s) => s.id === selectedSupplier);
      return supplier ? {
        name: supplier.nombre_comercial || supplier.razon_social,
        rfc: supplier.rfc
      } : null;
    }
    return null;
  }, [registeredSuppliers, generalSuppliers, selectedSupplier, supplierType]);

  const handleSupplierChange = (value: string) => {
    // Check if it's a registered or general supplier
    const isRegistered = registeredSuppliers?.some((s) => s.id === value);
    const isGeneral = generalSuppliers?.some((s) => s.id === value);
    
    setSelectedSupplier(value);
    if (isRegistered) {
      setSupplierType("registered");
    } else if (isGeneral) {
      setSupplierType("general");
    }
  };

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Usuario no autenticado");
      if (!selectedSupplier) throw new Error("Selecciona un proveedor");
      if (!orderNumber) throw new Error("Ingresa el número de orden");
      if (selectedProducts.length === 0)
        throw new Error("Selecciona al menos un producto");

      // Create the order
      const { data: order, error: orderError } = await supabase
        .from("purchase_orders")
        .insert({
          order_number: orderNumber,
          supplier_id: selectedSupplier,
          supplier_type: supplierType || "registered",
          amount: total,
          description: description || null,
          delivery_date: deliveryDate ? format(deliveryDate, "yyyy-MM-dd") : null,
          created_by: user.id,
          status: "pendiente",
        } as any)
        .select("id")
        .single();

      if (orderError) throw orderError;

      // Create order items
      const items = selectedProducts.map((p) => ({
        purchase_order_id: order.id,
        product_id: p.id,
        quantity_ordered: p.quantity,
        unit_price: p.unitPrice,
        original_price: p.savedPrice,
        notes: p.notes || null,
        units_per_box: p.notes === "Caja" ? (p.unitsPerBox || null) : null,
        price_updated_at:
          p.manualPrice !== null && p.manualPrice !== p.savedPrice
            ? new Date().toISOString()
            : null,
        price_updated_by:
          p.manualPrice !== null && p.manualPrice !== p.savedPrice ? user.id : null,
      }));

      const { error: itemsError } = await supabase
        .from("purchase_order_items")
        .insert(items);

      if (itemsError) throw itemsError;

      // Registrar histórico SOLO cuando el usuario capturó un precio manual y es proveedor registrado
      // (Los proveedores generales no tienen perfil en profiles, así que no pueden registrar histórico)
      const manualPriceItems = selectedProducts.filter((p) => p.manualPrice !== null);
      if (manualPriceItems.length > 0 && supplierType === "registered") {
        await Promise.all(
          manualPriceItems.map(async (p) => {
            const { data: lastRows, error: lastError } = await supabase
              .from("product_price_history")
              .select("price")
              .eq("product_id", p.id)
              .eq("supplier_id", selectedSupplier)
              .order("created_at", { ascending: false })
              .limit(1);

            if (lastError) throw lastError;

            const previousPrice = lastRows?.[0]?.price ?? null;

            const { error: historyError } = await supabase
              .from("product_price_history")
              .insert({
                product_id: p.id,
                supplier_id: selectedSupplier,
                purchase_order_id: order.id,
                price: p.unitPrice,
                previous_price: previousPrice,
                created_by: user.id,
                notes: `Precio manual en OC ${orderNumber}`,
              } as any);

            if (historyError) throw historyError;
          })
        );
      }

      return order;
    },
    onSuccess: (order) => {
      toast.success("Orden de compra creada correctamente");
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      logActivity({
        section: "ordenes_compra",
        action: "crear",
        entityType: "orden_compra",
        entityId: order?.id,
        entityName: orderNumber,
        details: { amount: total, items_count: selectedProducts.length, supplier: selectedSupplierData?.name },
      });
      queryClient.invalidateQueries({ queryKey: ["next_qual_order_number"] });

      // Abrir PDF con el patrón HTML nativo + window.print()
      openPurchaseOrderPrint({
        orderNumber,
        supplierName: selectedSupplierData?.name || "",
        supplierRfc: selectedSupplierData?.rfc ?? undefined,
        createdAt: new Date(),
        deliveryDate: deliveryDate || undefined,
        items: selectedProducts,
        total,
        description,
      });

      handleClose();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al crear la orden");
    },
  });

  const handleCreateAndViewPdf = () => {
    createOrderMutation.mutate();
  };

  const resetForm = () => {
    setSelectedSupplier("");
    setSupplierType("");
    setOrderNumber("");
    setDescription("");
    setSelectedProducts([]);
    setDeliveryDate(undefined);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Nueva Orden de Compra a Proveedor
            </DialogTitle>
            <DialogDescription>
              Selecciona productos y genera la orden de compra, o cárgala desde un XML (CFDI).
            </DialogDescription>
            <input
              ref={xmlInputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleXmlFile(f); e.target.value = ""; }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 w-fit mt-1"
              onClick={() => xmlInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> Cargar desde XML (CFDI)
            </Button>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto flex flex-col gap-4">
            {/* Top row - Supplier and Order Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Proveedor *</Label>
                <Popover modal={true} open={supplierPopoverOpen} onOpenChange={setSupplierPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between h-10 text-left font-normal"
                    >
                      {selectedSupplier ? (
                        supplierType === "registered"
                          ? registeredSuppliers?.find(s => s.id === selectedSupplier)?.company_name || registeredSuppliers?.find(s => s.id === selectedSupplier)?.full_name
                          : (() => { const gs = generalSuppliers?.find(s => s.id === selectedSupplier); return gs?.nombre_comercial || gs?.razon_social; })()
                      ) : "Selecciona proveedor"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[9999]">
                    <Command>
                      <CommandInput placeholder="Buscar proveedor..." />
                      <CommandList>
                        <CommandEmpty>Sin resultados</CommandEmpty>
                        {registeredSuppliers && registeredSuppliers.length > 0 && (
                          <CommandGroup heading={
                            <span className="flex items-center gap-1"><User className="h-3 w-3" /> Proveedores Registrados</span>
                          }>
                            {registeredSuppliers.map((s) => (
                              <CommandItem
                                key={s.id}
                                value={`${s.company_name || ''} ${s.full_name} ${s.rfc || ''}`}
                                onSelect={() => {
                                  handleSupplierChange(s.id);
                                  setSupplierPopoverOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedSupplier === s.id ? "opacity-100" : "opacity-0")} />
                                {s.company_name || s.full_name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {generalSuppliers && generalSuppliers.length > 0 && (
                          <CommandGroup heading={
                            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> Proveedores Oficiales</span>
                          }>
                            {generalSuppliers.map((s) => (
                              <CommandItem
                                key={s.id}
                                value={`${s.nombre_comercial || ''} ${s.razon_social} ${s.rfc || ''}`}
                                onSelect={() => {
                                  handleSupplierChange(s.id);
                                  setSupplierPopoverOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedSupplier === s.id ? "opacity-100" : "opacity-0")} />
                                <span className="flex items-center gap-2">
                                  {s.nombre_comercial || s.razon_social}
                                  <Badge variant="outline" className="text-xs ml-1">General</Badge>
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Número de Orden *</Label>
                <Input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="OC-2026-001"
                />
              </div>

              <div className="space-y-2">
                <Label>Fecha de Entrega</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !deliveryDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {deliveryDate ? format(deliveryDate, "dd/MM/yyyy", { locale: es }) : "Seleccionar fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={deliveryDate}
                      onSelect={setDeliveryDate}
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Descripción</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Notas adicionales..."
                />
              </div>
            </div>

            {/* Product Combobox */}
            <ProductCombobox
              products={allProducts}
              onAddProduct={handleAddProduct}
            />

            {/* Panel de emparejado del XML */}
            {xmlRows.length > 0 && (
              <div className="border rounded-lg p-3 space-y-2 bg-amber-50/50 dark:bg-amber-950/20">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold">
                    Conceptos del XML — vincula con tu catálogo ({xmlRows.length})
                  </Label>
                  <Button type="button" size="sm" onClick={agregarXmlAlaOrden} className="gap-1 shrink-0">
                    <Plus className="h-4 w-4" /> Agregar a la orden
                  </Button>
                </div>
                <div className="max-h-64 overflow-auto space-y-1">
                  {xmlRows.map((row, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded",
                        row.matchedProductId ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{row.descripcion}</p>
                        <p className="text-xs text-muted-foreground">
                          Cant: {row.cantidad} · P.Unit: ${row.valor_unitario.toFixed(2)}
                        </p>
                      </div>
                      <XmlRowPicker
                        products={allProducts}
                        valueId={row.matchedProductId}
                        onPick={(id) => setXmlRowProduct(i, id)}
                      />
                      {!row.matchedProductId && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-9 text-xs gap-1"
                          onClick={() => {
                            setNuevoProd({ name: row.descripcion, sku: "", category: "Insumos", tax_rate: 16, price: row.valor_unitario });
                            setCrearIdx(i);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" /> Crear
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Los renglones en <span className="text-red-600 font-medium">rojo</span> no coinciden — selecciónales el producto.
                  Al dar “Agregar a la orden”, los vinculados pasan abajo. (Crear producto nuevo: próximamente.)
                </p>
              </div>
            )}

            {/* Products Table */}
            <div className="border rounded-lg bg-background">
              <div className="h-[280px] overflow-auto">
                {selectedProducts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[32%]">Producto</TableHead>
                        <TableHead className="w-[10%] text-center">Cant.</TableHead>
                        <TableHead className="w-[12%] text-center">Presentación</TableHead>
                        <TableHead className="w-[13%] text-right">P. Guardado</TableHead>
                        <TableHead className="w-[13%] text-center">P. Manual</TableHead>
                        <TableHead className="w-[15%] text-right">Importe</TableHead>
                        <TableHead className="w-[5%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{product.name}</p>
                              <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={1}
                              value={product.quantity}
                              onChange={(e) =>
                                updateProductQuantity(
                                  product.id,
                                  Math.max(1, parseInt(e.target.value) || 1)
                                )
                              }
                              className="w-16 h-8 text-center mx-auto"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              <Select value={product.notes} onValueChange={(v) => updateProductNotes(product.id, v)}>
                                <SelectTrigger className="w-24 h-8 mx-auto">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Pieza">Pieza</SelectItem>
                                  <SelectItem value="Caja">Caja</SelectItem>
                                </SelectContent>
                              </Select>
                              {product.notes === "Caja" && (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={product.unitsPerBox ?? ""}
                                    onChange={(e) => updateProductUnitsPerBox(product.id, e.target.value)}
                                    placeholder="Pzas"
                                    className="w-16 h-7 text-xs text-center"
                                  />
                                  <span className="text-xs text-muted-foreground">pzas</span>
                                </div>
                              )}
                              {product.notes === "Caja" && product.unitsPerBox && product.quantity > 0 && (
                                <span className="text-xs text-primary font-medium">
                                  = {product.quantity * product.unitsPerBox} pzas
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <History className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                ${(product.savedPrice ?? product.unitPrice ?? 0).toFixed(2)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={product.manualPrice ?? ""}
                              onChange={(e) =>
                                updateProductManualPrice(product.id, e.target.value)
                              }
                              placeholder="—"
                              className="w-24 h-8 text-center mx-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            ${product.total.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => removeProduct(product.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Package className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-sm">No hay productos agregados</p>
                    <p className="text-xs">Usa el buscador para agregar productos</p>
                  </div>
                )}
              </div>
            </div>

            {/* Totals */}
            {selectedProducts.length > 0 && (
              <div className="flex justify-end">
                <div className="w-72 bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  {ivaTotal > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>IVA (16%):</span>
                      <span>${ivaTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Total:</span>
                    <span className="text-primary">${total.toFixed(2)} MXN</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between gap-2 pt-4 border-t mt-4">
            <div className="text-sm text-muted-foreground">
              {selectedProducts.length} producto(s) agregado(s)
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreateAndViewPdf}
                disabled={createOrderMutation.isPending || selectedProducts.length === 0}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                {createOrderMutation.isPending ? "Creando..." : "Crear y Ver PDF"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mini-form: crear producto desde un renglón del XML */}
      <Dialog open={crearIdx !== null} onOpenChange={(o) => { if (!o) setCrearIdx(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear producto</DialogTitle>
            <DialogDescription>Se agrega al catálogo y queda vinculado a este renglón del XML.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={nuevoProd.name} onChange={(e) => setNuevoProd({ ...nuevoProd, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SKU *</Label>
                <Input value={nuevoProd.sku} onChange={(e) => setNuevoProd({ ...nuevoProd, sku: e.target.value })} placeholder="Clave única" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>IVA</Label>
                <Select value={String(nuevoProd.tax_rate)} onValueChange={(v) => setNuevoProd({ ...nuevoProd, tax_rate: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16">16%</SelectItem>
                    <SelectItem value="0">0% (exento)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={nuevoProd.category} onValueChange={(v) => setNuevoProd({ ...nuevoProd, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Medicamentos">Medicamentos</SelectItem>
                    <SelectItem value="Oncológicos">Oncológicos</SelectItem>
                    <SelectItem value="Inmunoterapia">Inmunoterapia</SelectItem>
                    <SelectItem value="Insumos">Insumos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Precio de venta</Label>
                <Input type="number" step="0.01" value={nuevoProd.price} onChange={(e) => setNuevoProd({ ...nuevoProd, price: Number(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCrearIdx(null)}>Cancelar</Button>
              <Button onClick={crearProducto}>Crear y vincular</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
};

// Selector de producto del catálogo para un renglón del XML.
function XmlRowPicker({
  products,
  valueId,
  onPick,
}: {
  products: any[];
  valueId: string | null;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const selected = products.find((p) => p.id === valueId);
  const filtered = !term
    ? products
    : products.filter(
        (p) =>
          p.name.toLowerCase().includes(term.toLowerCase()) ||
          (p.sku || "").toLowerCase().includes(term.toLowerCase())
      );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "w-56 justify-between shrink-0 h-9 font-normal",
            !selected && "text-destructive border-destructive/40"
          )}
        >
          <span className="truncate">{selected ? selected.name : "Seleccionar producto…"}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar por nombre o SKU…" value={term} onValueChange={setTerm} />
          <CommandList>
            <CommandEmpty>No se encontraron productos.</CommandEmpty>
            <CommandGroup>
              {filtered.slice(0, 50).map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => { onPick(p.id); setOpen(false); }}
                  className="flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>
                  </div>
                  <Check className={cn("h-4 w-4 shrink-0", valueId === p.id ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
