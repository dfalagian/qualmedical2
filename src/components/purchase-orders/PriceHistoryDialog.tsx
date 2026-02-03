import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, Minus, History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PriceHistoryDialogProps {
  productId: string;
  supplierId: string;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PriceHistoryDialog({
  productId,
  supplierId,
  productName,
  open,
  onOpenChange,
}: PriceHistoryDialogProps) {
  const { data: priceHistory, isLoading } = useQuery({
    queryKey: ["price_history", productId, supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_price_history")
        .select(`
          id,
          price,
          previous_price,
          price_change_percentage,
          notes,
          created_at,
          purchase_orders (
            order_number
          )
        `)
        .eq("product_id", productId)
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const getPriceChangeIndicator = (percentage: number | null) => {
    if (percentage === null) return null;
    
    if (percentage > 0) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          +{percentage.toFixed(2)}%
        </Badge>
      );
    } else if (percentage < 0) {
      return (
        <Badge className="bg-success flex items-center gap-1">
          <TrendingDown className="h-3 w-3" />
          {percentage.toFixed(2)}%
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <Minus className="h-3 w-3" />
        Sin cambio
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Precios
          </DialogTitle>
          <DialogDescription className="truncate">
            {productName}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : priceHistory && priceHistory.length > 0 ? (
            <div className="space-y-3">
              {priceHistory.map((record, index) => (
                <div
                  key={record.id}
                  className={`p-4 rounded-lg border ${
                    index === 0 ? "bg-primary/5 border-primary/20" : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-primary">
                          ${record.price.toLocaleString("es-MX", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                        {getPriceChangeIndicator(record.price_change_percentage)}
                      </div>
                      {record.previous_price && (
                        <p className="text-sm text-muted-foreground">
                          Precio anterior: $
                          {record.previous_price.toLocaleString("es-MX", {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>
                        {new Date(record.created_at).toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <p>
                        {new Date(record.created_at).toLocaleTimeString("es-MX", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  {record.purchase_orders?.order_number && (
                    <p className="text-xs text-muted-foreground mt-2">
                      OC: {record.purchase_orders.order_number}
                    </p>
                  )}
                  {record.notes && (
                    <p className="text-sm mt-2 italic">{record.notes}</p>
                  )}
                  {index === 0 && (
                    <Badge variant="outline" className="mt-2 text-xs">
                      Precio actual
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">No hay histórico de precios registrado</p>
              <p className="text-xs">El histórico se creará cuando se actualice el precio</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
