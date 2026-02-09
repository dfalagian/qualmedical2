import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { formatSupplierName } from "@/lib/formatters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShoppingCart, Plus, DollarSign, Download, Package, Trash2, Eye, ArrowRight, Search, X, CalendarIcon, FileText, Link2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PurchaseOrderImportDialog } from "@/components/purchase-orders/PurchaseOrderImportDialog";
import { CreateSupplierOrderDialog } from "@/components/purchase-orders/CreateSupplierOrderDialog";
import { ConvertToQualOrderDialog } from "@/components/purchase-orders/ConvertToQualOrderDialog";
import { PurchaseOrderDetailDialog } from "@/components/purchase-orders/PurchaseOrderDetailDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { openPurchaseOrderPrint } from "@/components/purchase-orders/purchaseOrderHtmlPrint";
import { LinkInvoiceDialog } from "@/components/purchase-orders/LinkInvoiceDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PurchaseOrders = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [createOrderDialogOpen, setCreateOrderDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<any>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [orderToConvert, setOrderToConvert] = useState<any>(null);
  const [linkInvoiceDialogOpen, setLinkInvoiceDialogOpen] = useState(false);
  const [orderToLink, setOrderToLink] = useState<any>(null);
  
  // Search/filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["purchase_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          profiles!purchase_orders_supplier_id_fkey(full_name, company_name, rfc),
          purchase_order_items(
            id, product_id, quantity_ordered, quantity_received, unit_price, original_price,
            products(id, name, sku)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers_for_orders"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name, email");

      if (error) throw error;
      return data;
    },
  });

  // Get existing order numbers to prevent duplicate imports
  const existingOrderNumbers = orders?.map(o => o.order_number) || [];

  // Filter orders based on search criteria
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    
    return orders.filter((order: any) => {
      // Filter by order number search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const orderNumberMatch = order.order_number?.toLowerCase().includes(query);
        if (!orderNumberMatch) return false;
      }
      
      // Filter by supplier
      if (selectedSupplierFilter && selectedSupplierFilter !== "all") {
        if (order.supplier_id !== selectedSupplierFilter) return false;
      }
      
      // Filter by date
      if (selectedDate) {
        const orderDate = new Date(order.created_at);
        const filterDate = selectedDate;
        if (
          orderDate.getFullYear() !== filterDate.getFullYear() ||
          orderDate.getMonth() !== filterDate.getMonth() ||
          orderDate.getDate() !== filterDate.getDate()
        ) {
          return false;
        }
      }
      
      return true;
    });
  }, [orders, searchQuery, selectedSupplierFilter, selectedDate]);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedSupplierFilter("all");
    setSelectedDate(undefined);
  };

  const hasActiveFilters = searchQuery || selectedSupplierFilter !== "all" || selectedDate;

  // Import mutation for external orders
  const importOrdersMutation = useMutation({
    mutationFn: async (externalOrders: any[]) => {
      if (!user) throw new Error("Usuario no autenticado");
      if (!suppliers || suppliers.length === 0) throw new Error("No hay proveedores disponibles");
      
      for (const extOrder of externalOrders) {
        // Always search for local supplier by name - external IDs don't match local IDs
        const externalSupplierName = (extOrder.suppliers?.name || extOrder.supplier_name || '').toLowerCase().trim();
        
        if (!externalSupplierName) {
          throw new Error(`La orden ${extOrder.order_number} no tiene nombre de proveedor`);
        }
        
        const matchingSupplier = suppliers.find((s: any) => {
          const companyName = (s.company_name || '').toLowerCase().trim();
          const fullName = (s.full_name || '').toLowerCase().trim();
          
          // Only match if there's actual content to compare
          if (companyName && companyName.includes(externalSupplierName)) return true;
          if (companyName && externalSupplierName.includes(companyName)) return true;
          if (fullName && fullName.includes(externalSupplierName)) return true;
          if (fullName && externalSupplierName.includes(fullName)) return true;
          
          return false;
        });
        
        const supplierId = matchingSupplier?.id;

        if (!supplierId) {
          throw new Error(`No se encontró proveedor local para "${extOrder.suppliers?.name || extOrder.supplier_name}". Orden: ${extOrder.order_number}`);
        }

        // Insert (or reuse) the purchase order. Some orders may already exist (unique by order_number).
        let orderId: string;

        const { data: existingOrder, error: existingOrderError } = await supabase
          .from("purchase_orders")
          .select("id")
          .eq("order_number", extOrder.order_number)
          .maybeSingle();

        if (existingOrderError) throw existingOrderError;

        if (existingOrder?.id) {
          orderId = existingOrder.id;
        } else {
          const { data: newOrder, error: orderError } = await supabase
            .from("purchase_orders")
            .insert({
              order_number: extOrder.order_number,
              supplier_id: supplierId,
              amount: extOrder.total_amount || 0,
              description: `Importado desde CITIO`,
              created_by: user.id,
              status: extOrder.status || 'pendiente',
            })
            .select("id")
            .single();

          if (orderError) {
            // If a concurrent import created it, reuse it
            if ((orderError as any)?.code === "23505") {
              const { data: concurrentOrder, error: concurrentError } = await supabase
                .from("purchase_orders")
                .select("id")
                .eq("order_number", extOrder.order_number)
                .maybeSingle();
              if (concurrentError) throw concurrentError;
              if (!concurrentOrder?.id) throw orderError;
              orderId = concurrentOrder.id;
            } else {
              throw orderError;
            }
          } else {
            orderId = newOrder.id;
          }
        }

        // Insert order items. CITIO uses medication_id; we align by ensuring local products.id = medication_id.
        if (extOrder.items && extOrder.items.length > 0) {
          const itemsToInsert = extOrder.items
            .filter((item: any) => item.medication_id || item.product_id)
            .map((item: any) => ({
              purchase_order_id: orderId,
              product_id: String(item.medication_id || item.product_id),
              quantity_ordered: item.quantity,
              unit_price: item.unit_price,
            }));

          if (itemsToInsert.length === 0) continue;

          // Ensure referenced products exist locally by citio_id (not by id)
          // First, check which products already exist by citio_id
          const citioIds: string[] = Array.from(
            new Set(itemsToInsert.map((i) => String(i.product_id)))
          );
          
          const { data: existingProducts, error: existingProductsError } = await supabase
            .from("products")
            .select("id, citio_id")
            .in("citio_id", citioIds);

          if (existingProductsError) throw existingProductsError;

          // Create a map of citio_id -> local product id
          const citioToLocalId = new Map<string, string>();
          for (const p of existingProducts || []) {
            if (p.citio_id) {
              citioToLocalId.set(p.citio_id, p.id);
            }
          }

          const missingCitioIds = citioIds.filter((id) => !citioToLocalId.has(id));

          if (missingCitioIds.length > 0) {
            // Build products from external item payload for missing ones
            const productPayloadById = new Map<string, any>();
            for (const item of extOrder.items) {
              const citioId = item.medication_id || item.product_id;
              const citioIdStr = citioId ? String(citioId) : "";
              if (!citioIdStr || productPayloadById.has(citioIdStr) || citioToLocalId.has(citioIdStr)) continue;

              const name =
                item.medications?.name ||
                item.medication_name ||
                item.products?.name ||
                "Medicamento";

              const satCode = item.medications?.codigo_sat || item.products?.codigo_sat;
              const sku = satCode
                ? `SAT-${satCode}-${citioIdStr.slice(0, 6)}`
                : `CITIO-${citioIdStr.slice(0, 8).toUpperCase()}`;

              productPayloadById.set(citioIdStr, {
                // Let Supabase auto-generate the id (don't use citio_id as id)
                name,
                sku,
                citio_id: citioIdStr,
                supplier_id: supplierId,
                unit_price: item.unit_price ?? null,
                is_active: true,
              });
            }

            const productsToInsert = missingCitioIds
              .map((id) => productPayloadById.get(id))
              .filter(Boolean);

            if (productsToInsert.length > 0) {
              const { data: newProducts, error: insertError } = await supabase
                .from("products")
                .insert(productsToInsert)
                .select("id, citio_id");

              if (insertError) throw insertError;
              
              // Add new products to the map
              for (const p of newProducts || []) {
                if (p.citio_id) {
                  citioToLocalId.set(p.citio_id, p.id);
                }
              }
            }
          }
          
          // Update itemsToInsert to use local product IDs instead of citio_ids
          for (const item of itemsToInsert) {
            const citioId = String(item.product_id);
            const localId = citioToLocalId.get(citioId);
            if (localId) {
              item.product_id = localId;
            }
          }

          // Replace items on re-import to avoid duplicates
          const { error: deleteExistingItemsError } = await supabase
            .from("purchase_order_items")
            .delete()
            .eq("purchase_order_id", orderId);
          if (deleteExistingItemsError) throw deleteExistingItemsError;

          const { error: itemsError } = await supabase
            .from("purchase_order_items")
            .insert(itemsToInsert);

          if (itemsError) {
            console.error("Error inserting items:", itemsError);
            // Don't throw - order was created, just items failed
          }
        }
      }
    },
    onSuccess: (_, variables) => {
      toast.success(`${variables.length} orden(es) importada(s) correctamente`);
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      setImportDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al importar órdenes");
    },
  });


  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ status })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado actualizado");
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar");
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from("purchase_orders")
        .delete()
        .eq("id", orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden eliminada correctamente");
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar orden");
    },
  });

  const handleViewDetail = (order: any) => {
    setSelectedOrder(order);
    setDetailDialogOpen(true);
  };

  const handleDeleteClick = (order: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setOrderToDelete(order);
    setDeleteDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completada":
        return <Badge className="bg-success">Completada</Badge>;
      case "cancelada":
        return <Badge variant="destructive">Cancelada</Badge>;
      case "en_proceso":
        return <Badge className="bg-warning">En Proceso</Badge>;
      default:
        return <Badge variant="secondary">Pendiente</Badge>;
    }
  };

  if (!isAdmin && orders && orders.length === 0) {
    return (
      <DashboardLayout>
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Órdenes de Compra
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center py-8 text-muted-foreground">
              No tienes órdenes de compra asignadas
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Órdenes de Compra</h2>
            <p className="text-muted-foreground">
              {isAdmin ? "Gestiona las órdenes de compra" : "Consulta tus órdenes de compra"}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button onClick={() => setCreateOrderDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Orden a Proveedor
              </Button>
              <Button onClick={() => setImportDialogOpen(true)} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Importar desde CITIO
              </Button>
            </div>
          )}
        </div>


        {/* Search and Filters */}
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Order Number Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por número de orden..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              {/* Supplier Filter */}
              <div className="w-full md:w-[250px]">
                <Select value={selectedSupplierFilter} onValueChange={setSelectedSupplierFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los proveedores</SelectItem>
                    {suppliers?.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.company_name || supplier.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Date Filter */}
              <div className="w-full md:w-[200px]">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: es }) : "Filtrar por fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button variant="ghost" onClick={clearFilters} className="gap-2">
                  <X className="h-4 w-4" />
                  Limpiar
                </Button>
              )}
            </div>
            
            {hasActiveFilters && (
              <p className="text-sm text-muted-foreground mt-3">
                Mostrando {filteredOrders.length} de {orders?.length || 0} órdenes
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Órdenes de Compra
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando órdenes...</p>
            ) : filteredOrders && filteredOrders.length > 0 ? (
              <div className="space-y-4">
                {filteredOrders.map((order: any) => {
                  const isCitioOrder = order.description?.includes('CITIO');
                  return (
                  <div
                    key={order.id}
                    onClick={() => handleViewDetail(order)}
                    className={`p-4 border-l-4 rounded-lg hover:bg-accent/5 transition-colors cursor-pointer group ${
                      isCitioOrder 
                        ? 'bg-citio-soft border-l-citio' 
                        : 'bg-qual-soft border-l-qual'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className={`text-xs font-semibold mb-1 ${
                          isCitioOrder ? 'text-citio' : 'text-qual'
                        }`}>
                          {isCitioOrder ? 'Orden de Compra CITIO' : 'Orden de Compra QualMedical'}
                        </p>
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold text-lg">{order.order_number}</h4>
                          {getStatusBadge(order.status)}
                          {order.invoice_id && (
                            <Badge variant="outline" className="gap-1 text-xs border-primary/30 text-primary">
                              <Link2 className="h-3 w-3" />
                              Factura vinculada
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Proveedor: {formatSupplierName(order.profiles)}
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary flex items-center gap-1">
                            <DollarSign className="h-5 w-5" />
                            {order.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-muted-foreground">{order.currency}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDetail(order);
                            }}
                            title="Ver detalle"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Calcular totales de los items
                              const items = order.purchase_order_items?.map((item: any) => {
                                const unitPrice = item.unit_price || 0;
                                const quantity = item.quantity_ordered || 0;
                                // Asumimos IVA 16% si el monto total lo sugiere
                                const subtotalItem = unitPrice * quantity;
                                const hasIva = false; // Por defecto sin IVA individual
                                const ivaAmount = 0;
                                const total = subtotalItem + ivaAmount;
                                return {
                                  name: item.products?.name || 'Producto',
                                  sku: item.products?.sku || '-',
                                  quantity,
                                  unitPrice,
                                  hasIva,
                                  ivaAmount,
                                  total,
                                };
                              }) || [];
                              
                              const subtotal = items.reduce((sum: number, i: any) => sum + i.unitPrice * i.quantity, 0);
                              const totalIva = items.reduce((sum: number, i: any) => sum + i.ivaAmount, 0);
                              const total = order.amount || subtotal + totalIva;

                              openPurchaseOrderPrint({
                                orderNumber: order.order_number,
                                supplierName: formatSupplierName(order.profiles),
                                supplierRfc: order.profiles?.rfc,
                                createdAt: new Date(order.created_at),
                                items,
                                subtotal,
                                totalIva,
                                total,
                                description: order.description,
                              });
                            }}
                            title="Ver PDF"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity ${
                                order.invoice_id ? 'text-primary' : 'text-muted-foreground'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOrderToLink(order);
                                setLinkInvoiceDialogOpen(true);
                              }}
                              title={order.invoice_id ? "Factura vinculada" : "Vincular factura"}
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && isCitioOrder && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-qual hover:text-qual/90 hover:bg-qual-soft"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOrderToConvert(order);
                                setConvertDialogOpen(true);
                              }}
                              title="Convertir a Orden QualMedical"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                              onClick={(e) => handleDeleteClick(order, e)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Show order items if available */}
                    {order.purchase_order_items && order.purchase_order_items.length > 0 && (
                      <div className="mb-3 p-2 bg-muted/30 rounded-md">
                        <div className="flex items-center gap-2 mb-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {order.purchase_order_items.length} producto(s)
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {order.purchase_order_items.slice(0, 4).map((item: any) => (
                            <Badge key={item.id} variant="outline" className="text-xs">
                              {item.products?.name || 'Producto'} 
                              <span className="ml-1 text-muted-foreground">
                                ({item.quantity_received || 0}/{item.quantity_ordered})
                              </span>
                            </Badge>
                          ))}
                          {order.purchase_order_items.length > 4 && (
                            <Badge variant="secondary" className="text-xs">
                              +{order.purchase_order_items.length - 4} más
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {order.description && (
                      <p className="text-sm mb-2 text-muted-foreground">{order.description}</p>
                    )}

                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground">
                        Creada: {new Date(order.created_at).toLocaleDateString('es-MX')}
                      </p>

                      {isAdmin && (
                        <Select
                          value={order.status}
                          onValueChange={(value) =>
                            updateStatusMutation.mutate({ id: order.id, status: value })
                          }
                        >
                          <SelectTrigger className="w-36" onClick={(e) => e.stopPropagation()}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendiente">Pendiente</SelectItem>
                            <SelectItem value="en_proceso">En Proceso</SelectItem>
                            <SelectItem value="completada">Completada</SelectItem>
                            <SelectItem value="cancelada">Cancelada</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {hasActiveFilters ? (
                  <div>
                    <p>No se encontraron órdenes con los filtros seleccionados</p>
                    <Button variant="link" onClick={clearFilters} className="mt-2">
                      Limpiar filtros
                    </Button>
                  </div>
                ) : (
                  <p>No hay órdenes de compra</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Import Dialog */}
      <PurchaseOrderImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={(orders) => importOrdersMutation.mutate(orders)}
        existingOrderNumbers={existingOrderNumbers}
      />

      {/* Detail Dialog */}
      <PurchaseOrderDetailDialog
        order={selectedOrder}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar orden de compra?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar la orden <strong>{orderToDelete?.order_number}</strong>. 
              Esta acción no se puede deshacer y también eliminará todos los items asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => orderToDelete && deleteOrderMutation.mutate(orderToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateSupplierOrderDialog
        open={createOrderDialogOpen}
        onOpenChange={setCreateOrderDialogOpen}
      />

      <ConvertToQualOrderDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        citioOrder={orderToConvert}
      />

      <LinkInvoiceDialog
        open={linkInvoiceDialogOpen}
        onOpenChange={setLinkInvoiceDialogOpen}
        order={orderToLink}
      />
    </DashboardLayout>
  );
};

export default PurchaseOrders;
