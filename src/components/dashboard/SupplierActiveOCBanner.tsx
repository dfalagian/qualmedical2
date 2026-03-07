import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Calendar, DollarSign, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ActivePO {
  id: string;
  order_number: string;
  description: string | null;
  amount: number;
  currency: string | null;
  status: string | null;
  delivery_date: string | null;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-amber-100 text-amber-800 border-amber-300" },
  en_proceso: { label: "En Proceso", className: "bg-blue-100 text-blue-800 border-blue-300" },
};

export function SupplierActiveOCBanner({ onSelectPO }: { onSelectPO?: (poId: string) => void }) {
  const { user } = useAuth();

  const { data: activeOrders = [] } = useQuery({
    queryKey: ["supplier-active-pos", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, description, amount, currency, status, delivery_date")
        .eq("supplier_id", user!.id)
        .in("status", ["pendiente", "en_proceso"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ActivePO[];
    },
  });

  if (activeOrders.length === 0) return null;

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
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <ShoppingCart className="h-4 w-4 text-orange-500" />
        Tus Órdenes de Compra Activas — Selecciona una para comparar con tu factura
      </h3>
      <div className="grid gap-2 md:grid-cols-2">
        {activeOrders.map((order) => {
          const st = statusLabels[order.status || "pendiente"] || statusLabels.pendiente;
          return (
            <Card
              key={order.id}
              className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-orange-400"
              onClick={() => onSelectPO?.(order.id)}
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
  );
}
