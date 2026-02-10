import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, AlertCircle, ShoppingCart } from "lucide-react";

interface ExternalOrder {
  id: string;
  order_number: string;
  supplier_name?: string;
  total_amount: number;
  status?: string;
  created_at: string;
  items?: any[];
  profiles?: { full_name?: string; company_name?: string };
  suppliers?: { id: string; name: string; rfc?: string };
}

export function SalesRequestsCitioOrders() {
  const [searchTerm, setSearchTerm] = useState("");

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
        o.status?.toLowerCase().includes(term)
    );
  }, [qualmedicalOrders, searchTerm]);

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("es-MX"); } catch { return d; }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

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
            placeholder="Buscar por número de orden..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>Solo se muestran órdenes de compra con proveedor QualMedical</span>
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
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/10 transition-colors"
                >
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.suppliers?.name || order.supplier_name || "QualMedical"} • {formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{formatCurrency(order.total_amount)}</span>
                    {order.status && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {order.status}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
