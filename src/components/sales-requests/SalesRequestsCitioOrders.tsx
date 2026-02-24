import { useState, useMemo, useCallback } from "react";
import { todayLocalStr } from "@/lib/formatters";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { Search, AlertCircle, ShoppingCart, ChevronDown, ChevronUp, FileText, User, Package, ArrowRightCircle, Loader2, Trash2, Plus, Link2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ExternalOrderItem {
  id: string;
  medication_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  is_sub_product?: boolean;
  parent_medication_id?: string | null;
  medication_id?: string;
  medications?: {
    brand?: string;
    precio_type_1?: number;
    [key: string]: any;
  };
  // Local editing fields
  _linked_product_id?: string | null;
  _linked_product_name?: string | null;
  _linked_brand?: string | null;
}

interface ExternalOrder {
  id: string;
  order_number: string;
  supplier_name?: string;
  total_amount: number;
  subtotal?: number;
  iva?: number;
  status?: string;
  created_at: string;
  order_date?: string;
  notes?: string;
  items?: ExternalOrderItem[];
  patients?: { first_name?: string; first_lastname?: string; second_lastname?: string; second_name?: string };
  quotations?: { folio?: string; cycle?: number; application_date?: string };
  profiles?: { full_name?: string; company_name?: string };
  suppliers?: { id: string; name: string; rfc?: string };
}

interface LocalProduct {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  citio_id: string | null;
  current_stock: number | null;
  price_type_1: number | null;
  unit_price: number | null;
}

// Extracted outside the main component to prevent re-creation on re-renders
// which was causing the search input to lose focus after each keystroke.
const ProductSearchPopover = ({ 
  open, 
  onOpenChange, 
  search, 
  onSearchChange, 
  onSelect,
  triggerLabel,
  triggerVariant = "outline" as const,
  triggerSize = "sm" as const,
  triggerIcon,
  filteredProducts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (s: string) => void;
  onSelect: (product: LocalProduct) => void;
  triggerLabel: string;
  triggerVariant?: "outline" | "ghost" | "default";
  triggerSize?: "sm" | "icon" | "default";
  triggerIcon: React.ReactNode;
  filteredProducts: LocalProduct[];
}) => (
  <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <Button variant={triggerVariant} size={triggerSize} className="gap-1 text-xs h-7">
        {triggerIcon}
        <span className="hidden sm:inline">{triggerLabel}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-[400px] p-0" align="start">
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Buscar por nombre, SKU o marca..."
          value={search}
          onValueChange={onSearchChange}
        />
        <CommandList>
          <CommandEmpty>No se encontraron productos.</CommandEmpty>
          <CommandGroup>
            {filteredProducts.map((product) => (
              <CommandItem
                key={product.id}
                value={product.id}
                onSelect={() => onSelect(product)}
                className="flex items-center justify-between py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    SKU: {product.sku} · {product.brand || "Sin marca"} · Stock: {product.current_stock || 0}
                  </p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
);

export function SalesRequestsCitioOrders() {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  // Local edits state: orderId -> modified items array
  const [editedOrders, setEditedOrders] = useState<Map<string, ExternalOrderItem[]>>(new Map());
  // Product linking popover state
  const [linkingItemId, setLinkingItemId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  // Add product popover state
  const [addingToOrderId, setAddingToOrderId] = useState<string | null>(null);
  const [addProductSearch, setAddProductSearch] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["sales-requests-citio-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-external-purchase-orders");
      if (error) throw error;
      const result = data?.data;
      if (result?.orders && Array.isArray(result.orders)) return result.orders as ExternalOrder[];
      if (result?.purchase_orders && Array.isArray(result.purchase_orders)) return result.purchase_orders as ExternalOrder[];
      if (Array.isArray(result)) return result as ExternalOrder[];
      return [] as ExternalOrder[];
    },
  });

  // Fetch local products for linking
  const { data: localProducts = [] } = useQuery({
    queryKey: ["local-products-for-citio-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, brand, citio_id, current_stock, price_type_1, unit_price")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as LocalProduct[];
    },
  });

  const qualmedicalOrders = useMemo(() => {
    return orders.filter((order) => {
      const supplier = (
        order.suppliers?.name || order.supplier_name || order.profiles?.company_name || order.profiles?.full_name || ""
      ).toLowerCase();
      return supplier.includes("qualmedical") || supplier.includes("qual medical");
    });
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return qualmedicalOrders;
    const term = searchTerm.toLowerCase();
    return qualmedicalOrders.filter(
      (o) =>
        o.order_number?.toLowerCase().includes(term) ||
        o.status?.toLowerCase().includes(term) ||
        getPatientName(o)?.toLowerCase().includes(term)
    );
  }, [qualmedicalOrders, searchTerm]);

  // Get the effective items for an order (edited or original)
  const getOrderItems = useCallback((order: ExternalOrder): ExternalOrderItem[] => {
    return editedOrders.get(order.id) || order.items || [];
  }, [editedOrders]);

  // Initialize edits for an order if not already done
  const ensureEditable = useCallback((order: ExternalOrder): ExternalOrderItem[] => {
    if (editedOrders.has(order.id)) return editedOrders.get(order.id)!;
    const items = [...(order.items || [])].map(i => ({ ...i }));
    setEditedOrders(prev => new Map(prev).set(order.id, items));
    return items;
  }, [editedOrders]);

  // Update quantity of an item
  const handleUpdateItemQuantity = useCallback((orderId: string, itemId: string, newQty: number, order: ExternalOrder) => {
    const items = ensureEditable(order);
    const updated = items.map(i => 
      i.id === itemId ? { ...i, quantity: Math.max(1, newQty), subtotal: i.unit_price * Math.max(1, newQty) } : i
    );
    setEditedOrders(prev => new Map(prev).set(orderId, updated));
  }, [ensureEditable]);

  // Delete an item
  const handleDeleteItem = useCallback((orderId: string, itemId: string, order: ExternalOrder) => {
    const items = ensureEditable(order);
    const updated = items.filter(i => i.id !== itemId);
    setEditedOrders(prev => new Map(prev).set(orderId, updated));
    toast.success("Producto eliminado de la orden");
  }, [ensureEditable]);

  // Link an item to a local product
  const handleLinkProduct = useCallback((orderId: string, itemId: string, product: LocalProduct, order: ExternalOrder) => {
    const items = ensureEditable(order);
    const updated = items.map(i => 
      i.id === itemId ? { 
        ...i, 
        _linked_product_id: product.id, 
        _linked_product_name: product.name,
        _linked_brand: product.brand,
        medication_id: product.citio_id || i.medication_id,
      } : i
    );
    setEditedOrders(prev => new Map(prev).set(orderId, updated));
    setLinkingItemId(null);
    setLinkSearch("");
    toast.success(`Vinculado a: ${product.name}`);
  }, [ensureEditable]);

  // Add a product from catalog to the order
  const handleAddProduct = useCallback((orderId: string, product: LocalProduct, order: ExternalOrder) => {
    const items = ensureEditable(order);
    const newItem: ExternalOrderItem = {
      id: crypto.randomUUID(),
      medication_name: product.name,
      quantity: 1,
      unit_price: product.price_type_1 || product.unit_price || 0,
      subtotal: product.price_type_1 || product.unit_price || 0,
      is_sub_product: false,
      medication_id: product.citio_id || undefined,
      medications: { brand: product.brand || undefined },
      _linked_product_id: product.id,
      _linked_product_name: product.name,
      _linked_brand: product.brand,
    };
    setEditedOrders(prev => new Map(prev).set(orderId, [...items, newItem]));
    setAddingToOrderId(null);
    setAddProductSearch("");
    toast.success(`${product.name} agregado a la orden`);
  }, [ensureEditable]);

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("es-MX"); } catch { return d; }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

  const getPatientName = (order: ExternalOrder) => {
    if (!order.patients) return null;
    const p = order.patients;
    return [p.first_name, p.second_name, p.first_lastname, p.second_lastname].filter(Boolean).join(" ");
  };

  const statusLabels: Record<string, string> = {
    pending: "Pendiente",
    approved: "Aprobada",
    completed: "Completada",
    cancelled: "Cancelada",
  };

  const toggleParentExpand = useCallback((parentId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);

  /** Group items: parent items + their sub-products */
  const getGroupedItems = useCallback((items: ExternalOrderItem[]) => {
    const parentItems = items.filter(i => !i.is_sub_product);
    const subItems = items.filter(i => i.is_sub_product);
    const subMap = new Map<string, ExternalOrderItem[]>();
    for (const sub of subItems) {
      const key = sub.parent_medication_id || "_orphan";
      if (!subMap.has(key)) subMap.set(key, []);
      subMap.get(key)!.push(sub);
    }
    return { parentItems, subMap };
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedOrderId(prev => prev === id ? null : id);
  };

  // Filtered products for linking/adding
  const getFilteredProducts = useCallback((search: string) => {
    if (!search.trim()) return localProducts.slice(0, 30);
    const term = search.toLowerCase();
    return localProducts.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.sku.toLowerCase().includes(term) ||
      p.brand?.toLowerCase().includes(term)
    ).slice(0, 30);
  }, [localProducts]);

  // Compute effective totals for an order
  const getOrderTotal = useCallback((order: ExternalOrder) => {
    const items = getOrderItems(order);
    return items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0);
  }, [getOrderItems]);

  const handleConvertToQuote = async (order: ExternalOrder) => {
    setConvertingId(order.id);
    try {
      const effectiveItems = getOrderItems(order);
      
      const { data: folio, error: folioError } = await supabase.rpc("generate_quote_folio");
      if (folioError) throw folioError;

      const { data: clients } = await supabase
        .from("clients")
        .select("id, nombre_cliente")
        .eq("is_active", true)
        .limit(1);

      if (!clients || clients.length === 0) {
        toast.error("No hay clientes registrados. Crea un cliente primero en la sección de Cotizaciones.");
        return;
      }

      const patientName = getPatientName(order);
      let clientId = clients[0].id;
      if (patientName) {
        const { data: matchingClients } = await supabase
          .from("clients")
          .select("id")
          .eq("is_active", true)
          .ilike("nombre_cliente", `%${patientName.split(" ")[0]}%`)
          .limit(1);
        if (matchingClients && matchingClients.length > 0) {
          clientId = matchingClients[0].id;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      const effectiveTotal = getOrderTotal(order);
      const quoteData = {
        folio,
        client_id: clientId,
        fecha_cotizacion: order.order_date || todayLocalStr(),
        concepto: `Orden CITIO ${order.order_number}${patientName ? ` - Paciente: ${patientName}` : ""}${order.quotations?.folio ? ` - Cotización: ${order.quotations.folio}` : ""}`,
        subtotal: effectiveTotal,
        total: effectiveTotal,
        status: "borrador",
        created_by: user?.id,
        notes: order.notes || null,
      };

      const { data: newQuote, error: quoteError } = await supabase
        .from("quotes")
        .insert(quoteData)
        .select("id")
        .single();

      if (quoteError) throw quoteError;

      if (effectiveItems.length > 0) {
        // Collect all medication_ids
        const allMedicationIds = effectiveItems
          .map(i => i.medication_id)
          .filter(Boolean) as string[];

        // Fetch local products matching by citio_id
        const { data: matchedProducts } = await supabase
          .from("products")
          .select("id, name, sku, brand, citio_id, price_type_1, price_type_2, price_type_3, price_type_4, price_type_5, unit_price")
          .eq("is_active", true)
          .in("citio_id", allMedicationIds.length > 0 ? allMedicationIds : ["__none__"]);

        const citioProductMap = new Map<string, typeof matchedProducts extends (infer T)[] | null ? T : never>();
        if (matchedProducts) {
          for (const p of matchedProducts) {
            if (p.citio_id) citioProductMap.set(p.citio_id, p);
          }
        }

        const findLocalProduct = (item: ExternalOrderItem) => {
          // First check if user manually linked a product
          if (item._linked_product_id) return { id: item._linked_product_id } as any;
          if (!item.medication_id) return null;
          return citioProductMap.get(item.medication_id) || null;
        };

        const parentItems = effectiveItems.filter(i => !i.is_sub_product);
        const subItems = effectiveItems.filter(i => i.is_sub_product);
        let unmatchedCount = 0;

        const parentQuoteItems = parentItems.map(item => {
          const localProduct = findLocalProduct(item);
          if (!localProduct) unmatchedCount++;
          const precio = localProduct?.price_type_1 || item.unit_price || 0;
          return {
            quote_id: newQuote.id,
            product_id: localProduct?.id || null,
            nombre_producto: item._linked_product_name || item.medication_name,
            marca: item._linked_brand || item.medications?.brand || localProduct?.brand || null,
            cantidad: item.quantity,
            precio_unitario: precio,
            importe: precio * item.quantity,
            tipo_precio: "1",
            is_sub_product: false,
          };
        });

        const { data: insertedParents, error: parentError } = await supabase
          .from("quote_items")
          .insert(parentQuoteItems)
          .select("id, nombre_producto");

        if (parentError) throw parentError;

        const parentMap = new Map<string, string>();
        parentItems.forEach((item, idx) => {
          const key = item.medication_id || item.id;
          if (insertedParents && insertedParents[idx]) {
            parentMap.set(key, insertedParents[idx].id);
          }
        });

        if (subItems.length > 0) {
          const subMedicationIds = subItems
            .map(i => i.medication_id)
            .filter(id => id && !citioProductMap.has(id)) as string[];

          if (subMedicationIds.length > 0) {
            const { data: subLocalProducts } = await supabase
              .from("products")
              .select("id, name, sku, brand, citio_id, price_type_1, unit_price")
              .eq("is_active", true)
              .in("citio_id", subMedicationIds);
            if (subLocalProducts) {
              for (const p of subLocalProducts) {
                if (p.citio_id) citioProductMap.set(p.citio_id, p as any);
              }
            }
          }

          const subQuoteItems = subItems.map(item => {
            const localProduct = findLocalProduct(item);
            if (!localProduct) unmatchedCount++;
            const precio = localProduct?.price_type_1 || item.unit_price || 0;
            return {
              quote_id: newQuote.id,
              product_id: localProduct?.id || null,
              nombre_producto: item._linked_product_name || item.medication_name,
              marca: item._linked_brand || item.medications?.brand || localProduct?.brand || null,
              cantidad: item.quantity,
              precio_unitario: precio,
              importe: precio * item.quantity,
              tipo_precio: "1",
              is_sub_product: true,
              parent_item_id: item.parent_medication_id ? (parentMap.get(item.parent_medication_id) || null) : null,
            };
          });

          const { error: subError } = await supabase
            .from("quote_items")
            .insert(subQuoteItems);

          if (subError) throw subError;
        }

        if (unmatchedCount > 0) {
          toast.warning(
            `${unmatchedCount} producto(s) no se encontraron en el inventario local. Vincúlalos manualmente antes de aprobar.`,
            { duration: 8000 }
          );
        }
      }

      toast.success(`Cotización ${folio} creada exitosamente`);
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      navigate("/dashboard/quotes");
    } catch (err: any) {
      console.error("Error converting to quote:", err);
      toast.error(err.message || "Error al convertir en cotización");
    } finally {
      setConvertingId(null);
    }
  };

  // ProductSearchPopover is now extracted outside the component to prevent
  // re-creation on every render which causes the search input to lose focus.

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          Órdenes de Compra CITIO
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, paciente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>Solo se muestran órdenes de compra con proveedor QualMedical. Puede editar antes de convertir.</span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive text-center py-4">Error al cargar órdenes</p>
        ) : filteredOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No se encontraron órdenes de compra
          </p>
        ) : (
          <div>
            <div className="space-y-2">
              {filteredOrders.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                const patientName = getPatientName(order);
                const effectiveItems = getOrderItems(order);
                const isEdited = editedOrders.has(order.id);
                const effectiveTotal = isEdited ? getOrderTotal(order) : order.total_amount;

                return (
                  <div
                    key={order.id}
                    className={cn(
                      "rounded-lg border overflow-hidden transition-colors",
                      isEdited && "border-primary/50"
                    )}
                  >
                    {/* Header - clickable */}
                    <div
                      className="flex items-center justify-between p-3 hover:bg-accent/10 cursor-pointer"
                      onClick={() => toggleExpand(order.id)}
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{order.order_number}</p>
                          {order.quotations?.folio && (
                            <Badge variant="outline" className="text-xs">
                              {order.quotations.folio}
                            </Badge>
                          )}
                          {isEdited && (
                            <Badge variant="secondary" className="text-xs">Editada</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {order.suppliers?.name || order.supplier_name || "QualMedical"} • {formatDate(order.order_date || order.created_at)}
                          {patientName && ` • ${patientName}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-semibold">{formatCurrency(effectiveTotal)}</span>
                        {order.status && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {statusLabels[order.status] || order.status}
                          </Badge>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t bg-muted/30 p-4 space-y-4">
                        {/* Summary info */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Subtotal</p>
                            <p className="font-medium">{formatCurrency(isEdited ? effectiveTotal : (order.subtotal || 0))}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">IVA</p>
                            <p className="font-medium">{formatCurrency(order.iva || 0)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Total</p>
                            <p className="font-semibold">{formatCurrency(effectiveTotal)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Fecha</p>
                            <p className="font-medium">{formatDate(order.order_date || order.created_at)}</p>
                          </div>
                        </div>

                        {/* Patient */}
                        {patientName && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Paciente:</span>
                            <span className="font-medium">{patientName}</span>
                          </div>
                        )}

                        {/* Quotation reference */}
                        {order.quotations && (
                          <div className="flex items-center gap-2 text-sm">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Cotización CITIO:</span>
                            <span className="font-medium">{order.quotations.folio}</span>
                            {order.quotations.cycle && (
                              <Badge variant="secondary" className="text-xs">Ciclo {order.quotations.cycle}</Badge>
                            )}
                          </div>
                        )}

                        {order.notes && (
                          <p className="text-sm text-muted-foreground italic">{order.notes}</p>
                        )}

                        {/* Items table - editable */}
                        {effectiveItems.length > 0 && (() => {
                          const { parentItems, subMap } = getGroupedItems(effectiveItems);
                          const hasAnySubs = subMap.size > 0;
                          const displayItems = hasAnySubs ? parentItems : effectiveItems;

                          return (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{effectiveItems.length} producto(s)</span>
                              </div>
                              <ProductSearchPopover
                                open={addingToOrderId === order.id}
                                onOpenChange={(open) => {
                                  setAddingToOrderId(open ? order.id : null);
                                  if (!open) setAddProductSearch("");
                                }}
                                search={addProductSearch}
                                onSearchChange={setAddProductSearch}
                                onSelect={(product) => handleAddProduct(order.id, product, order)}
                                triggerLabel="Agregar Producto"
                                triggerVariant="outline"
                                triggerIcon={<Plus className="h-3 w-3" />}
                                filteredProducts={getFilteredProducts(addProductSearch)}
                              />
                            </div>
                            <div className="rounded border overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-muted/50">
                                    <th className="text-left p-2 font-medium">Producto</th>
                                    <th className="text-left p-2 font-medium">Marca</th>
                                    <th className="text-center p-2 font-medium">Cant.</th>
                                    <th className="text-right p-2 font-medium">P. Unit.</th>
                                    <th className="text-right p-2 font-medium">Subtotal</th>
                                    <th className="text-center p-2 font-medium w-20">Acciones</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {displayItems.map((item) => {
                                    const itemKey = item.medication_id || item.id;
                                    const children = hasAnySubs ? (subMap.get(itemKey) || []) : [];
                                    const hasChildren = children.length > 0;
                                    const isParentExpanded = expandedParents.has(itemKey);
                                    const isLinked = !!item._linked_product_id;

                                    return (
                                      <>
                                        <tr
                                          key={item.id}
                                          className={cn(
                                            "border-t",
                                            hasChildren ? "cursor-pointer hover:bg-accent/10" : "",
                                            isLinked && "bg-emerald-50/50 dark:bg-emerald-950/20"
                                          )}
                                        >
                                          <td className="p-2" onClick={hasChildren ? () => toggleParentExpand(itemKey) : undefined}>
                                            <div className="flex items-center gap-1">
                                              {hasChildren && (
                                                isParentExpanded
                                                  ? <ChevronUp className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                                  : <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                              )}
                                              <span className={hasChildren ? "font-semibold" : ""}>
                                                {item._linked_product_name || item.medication_name}
                                              </span>
                                              {hasChildren && (
                                                <Badge variant="secondary" className="text-[10px] ml-1">
                                                  {children.length} comp.
                                                </Badge>
                                              )}
                                              {isLinked && (
                                                <Badge variant="default" className="text-[10px] ml-1 bg-emerald-600">
                                                  Vinculado
                                                </Badge>
                                              )}
                                            </div>
                                          </td>
                                          <td className="p-2 text-muted-foreground">{item._linked_brand || item.medications?.brand || "—"}</td>
                                          <td className="p-2 text-center">
                                            <Input
                                              type="number"
                                              min={1}
                                              value={item.quantity}
                                              onChange={(e) => handleUpdateItemQuantity(order.id, item.id, parseInt(e.target.value) || 1, order)}
                                              className="w-14 h-7 text-center text-xs"
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                          </td>
                                          <td className="p-2 text-right">{formatCurrency(item.unit_price)}</td>
                                          <td className="p-2 text-right font-medium">{formatCurrency(item.unit_price * item.quantity)}</td>
                                          <td className="p-2 text-center">
                                            <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                              <ProductSearchPopover
                                                open={linkingItemId === item.id}
                                                onOpenChange={(open) => {
                                                  setLinkingItemId(open ? item.id : null);
                                                  if (!open) setLinkSearch("");
                                                }}
                                                search={linkSearch}
                                                onSearchChange={setLinkSearch}
                                                onSelect={(product) => handleLinkProduct(order.id, item.id, product, order)}
                                                filteredProducts={getFilteredProducts(linkSearch)}
                                                triggerLabel="Vincular"
                                                triggerVariant="ghost"
                                                triggerIcon={<Link2 className="h-3 w-3" />}
                                              />
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => handleDeleteItem(order.id, item.id, order)}
                                              >
                                                <Trash2 className="h-3 w-3 text-destructive" />
                                              </Button>
                                            </div>
                                          </td>
                                        </tr>
                                        {hasChildren && isParentExpanded && children.map((sub) => {
                                          const subIsLinked = !!sub._linked_product_id;
                                          return (
                                            <tr key={sub.id} className={cn(
                                              "border-t bg-muted/20",
                                              subIsLinked && "bg-emerald-50/30 dark:bg-emerald-950/10"
                                            )}>
                                              <td className="p-2 pl-7 text-muted-foreground italic">
                                                <div className="flex items-center gap-1">
                                                  <span>↳ {sub._linked_product_name || sub.medication_name}</span>
                                                  {subIsLinked && (
                                                    <Badge variant="default" className="text-[10px] ml-1 bg-emerald-600">
                                                      Vinculado
                                                    </Badge>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="p-2 text-muted-foreground">{sub._linked_brand || sub.medications?.brand || "—"}</td>
                                              <td className="p-2 text-center">
                                                <Input
                                                  type="number"
                                                  min={1}
                                                  value={sub.quantity}
                                                  onChange={(e) => handleUpdateItemQuantity(order.id, sub.id, parseInt(e.target.value) || 1, order)}
                                                  className="w-14 h-7 text-center text-xs"
                                                />
                                              </td>
                                              <td className="p-2 text-right text-muted-foreground">{formatCurrency(sub.unit_price)}</td>
                                              <td className="p-2 text-right text-muted-foreground">{formatCurrency(sub.unit_price * sub.quantity)}</td>
                                              <td className="p-2 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                  <ProductSearchPopover
                                                    open={linkingItemId === sub.id}
                                                    onOpenChange={(open) => {
                                                      setLinkingItemId(open ? sub.id : null);
                                                      if (!open) setLinkSearch("");
                                                    }}
                                                    search={linkSearch}
                                                    onSearchChange={setLinkSearch}
                                                    onSelect={(product) => handleLinkProduct(order.id, sub.id, product, order)}
                                                    filteredProducts={getFilteredProducts(linkSearch)}
                                                    triggerLabel="Vincular"
                                                    triggerVariant="ghost"
                                                    triggerIcon={<Link2 className="h-3 w-3" />}
                                                  />
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => handleDeleteItem(order.id, sub.id, order)}
                                                  >
                                                    <Trash2 className="h-3 w-3 text-destructive" />
                                                  </Button>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          );
                        })()}

                        {/* Convert to Quote button */}
                        <div className="flex justify-end pt-2 gap-2">
                          {isEdited && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditedOrders(prev => {
                                  const next = new Map(prev);
                                  next.delete(order.id);
                                  return next;
                                });
                                toast.info("Cambios descartados");
                              }}
                            >
                              Descartar cambios
                            </Button>
                          )}
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConvertToQuote(order);
                            }}
                            disabled={convertingId === order.id}
                            className="gap-2"
                          >
                            {convertingId === order.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowRightCircle className="h-4 w-4" />
                            )}
                            Convertir en Cotización
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
