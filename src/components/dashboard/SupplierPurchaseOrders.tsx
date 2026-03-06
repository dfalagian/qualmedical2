import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, Calendar, DollarSign, Package, ChevronRight, Receipt } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface PurchaseOrder {
  id: string;
  order_number: string;
  description: string | null;
  amount: number;
  currency: string | null;
  status: string | null;
  delivery_date: string | null;
  created_at: string | null;
}

interface OrderItem {
  id: string;
  quantity_ordered: number;
  quantity_received: number | null;
  unit_price: number | null;
  products: {
    name: string;
    sku: string;
    unit: string | null;
  } | null;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-amber-100 text-amber-800 border-amber-300" },
  en_proceso: { label: "En Proceso", className: "bg-blue-100 text-blue-800 border-blue-300" },
  completada: { label: "Completada", className: "bg-green-100 text-green-800 border-green-300" },
  cancelada: { label: "Cancelada", className: "bg-red-100 text-red-800 border-red-300" },
};

export function SupplierPurchaseOrders() {
  const { user } = useAuth();
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);

  const { data: orders = [] } = useQuery({
    queryKey: ["supplier-purchase-orders", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, description, amount, currency, status, delivery_date, created_at")
        .eq("supplier_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PurchaseOrder[];
    },
  });

  const { data: orderItems = [] } = useQuery({
    queryKey: ["supplier-order-items", selectedOrder?.id],
    enabled: !!selectedOrder?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("id, quantity_ordered, quantity_received, unit_price, products:product_id(name, sku, unit)")
        .eq("purchase_order_id", selectedOrder!.id);
      if (error) throw error;
      return (data || []) as OrderItem[];
    },
  });

  const activeOrders = orders.filter((o) => o.status !== "completada" && o.status !== "cancelada");
  const hasActive = activeOrders.length > 0;

  if (orders.length === 0) return null;

  const formatCurrency = (val: number, currency?: string | null) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: currency || "MXN" }).format(val);

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return format(new Date(d), "dd MMM yyyy", { locale: es });
    } catch {
      return d;
    }
  };

  return (
    <>
      {/* Blinking card */}
      <Card
        className={`shadow-md cursor-pointer border-2 transition-all hover:shadow-xl ${
          hasActive
            ? "border-orange-400 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20"
            : "border-border"
        }`}
        onClick={() => hasActive && setSelectedOrder(activeOrders[0])}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
          <CardTitle className="text-xs md:text-sm font-medium">Órdenes de Compra</CardTitle>
          <div className="relative">
            <ShoppingCart className={`h-5 w-5 ${hasActive ? "text-orange-500" : "text-muted-foreground"}`} />
            {hasActive && (
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-orange-500 animate-pulse" />
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <div className="text-xl md:text-2xl font-bold">
            {hasActive ? (
              <span className="text-orange-600 animate-pulse">{activeOrders.length}</span>
            ) : (
              <span className="text-muted-foreground">{orders.length}</span>
            )}
          </div>
          <p className="text-[10px] md:text-xs text-muted-foreground line-clamp-1">
            {hasActive ? "Órdenes activas pendientes" : "Total de órdenes"}
          </p>
        </CardContent>
      </Card>

      {/* Orders list section below stats */}
      {hasActive && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-orange-500" />
            Tus Órdenes de Compra Activas
          </h3>
          <div className="grid gap-2 md:grid-cols-2">
            {activeOrders.map((order) => {
              const st = statusLabels[order.status || "pendiente"] || statusLabels.pendiente;
              return (
                <Card
                  key={order.id}
                  className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-orange-400"
                  onClick={() => setSelectedOrder(order)}
                >
                  <CardContent className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm truncate">{order.order_number}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${st.className}`}>
                          {st.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {order.description || "Sin descripción"}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {formatCurrency(order.amount, order.currency)}
                        </span>
                        {order.delivery_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(order.delivery_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-500" />
              Orden {selectedOrder?.order_number}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <ScrollArea className="flex-1">
              <div className="space-y-4 pr-2">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground block text-xs">Estado</span>
                    <Badge
                      variant="outline"
                      className={
                        statusLabels[selectedOrder.status || "pendiente"]?.className ||
                        statusLabels.pendiente.className
                      }
                    >
                      {statusLabels[selectedOrder.status || "pendiente"]?.label || selectedOrder.status}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Monto Total</span>
                    <span className="font-bold">
                      {formatCurrency(selectedOrder.amount, selectedOrder.currency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Fecha de Entrega</span>
                    <span>{formatDate(selectedOrder.delivery_date)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Fecha Creación</span>
                    <span>{formatDate(selectedOrder.created_at)}</span>
                  </div>
                </div>

                {selectedOrder.description && (
                  <div>
                    <span className="text-muted-foreground text-xs block mb-1">Descripción</span>
                    <p className="text-sm bg-muted/50 p-2 rounded">{selectedOrder.description}</p>
                  </div>
                )}

                <Separator />

                {/* Items */}
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <Package className="h-4 w-4" />
                    Productos ({orderItems.length})
                  </h4>
                  {orderItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Sin productos registrados
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {orderItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between gap-2 p-2 rounded bg-muted/30 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">
                              {item.products?.name || "Producto desconocido"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              SKU: {item.products?.sku || "—"} · {item.products?.unit || "pza"}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-mono text-xs">
                              {item.quantity_ordered} solicitadas
                            </p>
                            {item.quantity_received != null && item.quantity_received > 0 && (
                              <p className="text-xs text-green-600">
                                {item.quantity_received} recibidas
                              </p>
                            )}
                            {item.unit_price != null && (
                              <p className="text-xs text-muted-foreground">
                                {formatCurrency(item.unit_price, selectedOrder.currency)} c/u
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
