import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Package, TrendingDown } from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string;
  current_stock: number | null;
  minimum_stock: number | null;
  category: string | null;
  unit: string | null;
}

export const LowStockCard = () => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, current_stock, minimum_stock, category, unit")
        .eq("is_active", true)
        .order("current_stock", { ascending: true });

      if (error) throw error;
      return data as Product[];
    }
  });

  const lowStockProducts = products.filter(
    (p) => (p.current_stock ?? 0) <= (p.minimum_stock ?? 0)
  );

  const criticalProducts = lowStockProducts.filter(
    (p) => (p.current_stock ?? 0) === 0
  );

  const getStockPercentage = (current: number, minimum: number) => {
    if (minimum === 0) return 100;
    return Math.min(100, Math.max(0, (current / minimum) * 100));
  };

  const getStockColor = (current: number, minimum: number) => {
    const percentage = getStockPercentage(current, minimum);
    if (percentage === 0) return "bg-destructive";
    if (percentage <= 50) return "bg-warning";
    return "bg-success";
  };

  return (
    <>
      <Card 
        className="shadow-md hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-warning hover:scale-[1.02]"
        onClick={() => setDialogOpen(true)}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
          <CardTitle className="text-xs md:text-sm font-medium">
            Stock Bajo
          </CardTitle>
          <AlertTriangle className="h-4 w-4 text-warning" />
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <div className="text-xl md:text-2xl font-bold">
            {isLoading ? "..." : lowStockProducts.length}
          </div>
          <p className="text-[10px] md:text-xs text-muted-foreground line-clamp-1">
            {criticalProducts.length > 0 
              ? `${criticalProducts.length} sin stock` 
              : "Productos por reabastecer"}
          </p>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-warning" />
              Productos con Stock Bajo
            </DialogTitle>
            <DialogDescription>
              {lowStockProducts.length} productos requieren reabastecimiento
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-destructive">{criticalProducts.length}</p>
              <p className="text-xs text-muted-foreground">Sin stock</p>
            </div>
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-center">
              <p className="text-2xl font-bold text-warning">{lowStockProducts.length - criticalProducts.length}</p>
              <p className="text-xs text-muted-foreground">Stock bajo</p>
            </div>
          </div>

          <ScrollArea className="max-h-[50vh] pr-2">
            <div className="space-y-2">
              {lowStockProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingDown className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No hay productos con stock bajo</p>
                </div>
              ) : (
                lowStockProducts.map((product) => {
                  const current = product.current_stock ?? 0;
                  const minimum = product.minimum_stock ?? 0;
                  const percentage = getStockPercentage(current, minimum);
                  
                  return (
                    <div
                      key={product.id}
                      className="p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                        </div>
                        <Badge 
                          variant={current === 0 ? "destructive" : "secondary"}
                          className="shrink-0"
                        >
                          {current === 0 ? "Agotado" : "Bajo"}
                        </Badge>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>Stock actual: <strong>{current}</strong> {product.unit || "uds"}</span>
                          <span className="text-muted-foreground">Mín: {minimum}</span>
                        </div>
                        <Progress 
                          value={percentage} 
                          className="h-2"
                          indicatorClassName={getStockColor(current, minimum)}
                        />
                      </div>

                      {product.category && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Categoría: {product.category}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};
