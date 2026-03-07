import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart } from "lucide-react";

export function SupplierPendingPOCard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: count = 0 } = useQuery({
    queryKey: ["supplier-pending-po-count", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("supplier_id", user!.id)
        .in("status", ["pendiente", "en_proceso"]);
      if (error) throw error;
      return count || 0;
    },
  });

  const hasActive = count > 0;

  return (
    <Card
      className={`shadow-md cursor-pointer transition-all hover:shadow-lg border-2 ${
        hasActive
          ? "border-orange-400 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 animate-[pulse-orange_2s_ease-in-out_infinite]"
          : "border-border"
      }`}
      onClick={() => navigate("/dashboard/invoices")}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
        <CardTitle className="text-xs md:text-sm font-medium">
          Órdenes de Compra
        </CardTitle>
        <div className="relative">
          <ShoppingCart className={`h-4 w-4 ${hasActive ? "text-orange-500" : "text-muted-foreground"}`} />
          {hasActive && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-orange-500 animate-pulse" />
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
        <div className="text-xl md:text-2xl font-bold">
          {hasActive ? (
            <span className="text-orange-600">{count}</span>
          ) : (
            <span className="text-muted-foreground">0</span>
          )}
        </div>
        <p className="text-[10px] md:text-xs text-muted-foreground line-clamp-1">
          {hasActive ? "OC pendientes" : "Sin órdenes pendientes"}
        </p>
      </CardContent>
    </Card>
  );
}
